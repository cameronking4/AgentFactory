import { defineHook, getWorkflowMetadata, fetch, sleep } from "workflow";
import { generateText } from "ai";
import { db } from "@/lib/db";
import { employees, reports, reportResponses, memories } from "@/lib/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { managerEvaluationHook } from "@/workflows/employees/manager-workflow";
import { trackAICost } from "@/lib/ai/cost-tracking";
import { get as redisGet, set as redisSet } from "@/lib/redis";
import "dotenv/config";

// CEO Workflow State
export interface CEOState {
  ceoId: string; // workflowRunId
  name: string;
  role: "ceo";
  managers: string[]; // Manager IDs that report to CEO
  reviewedReports: string[]; // Report IDs reviewed
  createdAt: string;
  lastActive: string;
}

// Events that CEO workflow can receive
export type CEOEvent =
  | { type: "reviewReport"; reportId: string } // Review a manager's report
  | { type: "respondToReport"; reportId: string; response: string } // Respond to a report
  | { type: "getStatus" };

// Define hooks for type safety
export const ceoHook = defineHook<CEOEvent>();

// Initial state factory
export function createInitialCEOState(ceoId: string, name: string): CEOState {
  return {
    ceoId,
    name,
    role: "ceo",
    managers: [],
    reviewedReports: [],
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  };
}

/**
 * CEO Workflow - Handles reviewing and responding to manager reports
 */
export async function ceoWorkflow(initialState: CEOState) {
  "use workflow";

  // Set up fetch for AI SDK (required for workflows)
  globalThis.fetch = fetch;

  // Use CEO ID from initial state
  const ceoId = initialState.ceoId;
  const workflowRunId = getWorkflowMetadata().workflowRunId;

  console.log(
    `[CEO ${ceoId}] Starting CEO workflow (workflow: ${workflowRunId})`
  );

  // Initialize state
  const existingState = await getCEOState(ceoId);
  if (!existingState) {
    await setCEOState(ceoId, initialState);
  }

  // Create hook for receiving events
  const receiveEvent = ceoHook.create({
    token: `ceo:${ceoId}`,
  });

  console.log(`[CEO ${ceoId}] Hook created`);

  // Main loop: process events and proactively check for new reports
  while (true) {
    // Proactive: Check for new reports that need review
    await checkForNewReports(ceoId);

    // Reactive: Process events
    const eventPromise = (async () => {
      for await (const event of receiveEvent) {
        return event;
      }
    })();

    // Wait for event or timeout (check every 30 seconds)
    const timeoutPromise = sleep("30s").then(() => ({ type: "timeout" as const }));
    const result = await Promise.race([
      eventPromise.then((event) => ({ type: "event" as const, event })),
      timeoutPromise,
    ]);

    if (result.type === "event") {
      const event = result.event as CEOEvent;
      try {
        console.log(`[CEO ${ceoId}] Received event:`, event);

        switch (event.type) {
          case "reviewReport":
            await handleReviewReport(ceoId, event.reportId);
            break;
          case "respondToReport":
            await handleRespondToReport(ceoId, event.reportId, event.response);
            break;
          case "getStatus":
            // Just return current state
            break;
        }
      } catch (err) {
        console.error(`[CEO ${ceoId}] Error processing event:`, err);
        // Continue processing events even if one fails
      }
    }
  }
}

/**
 * Proactively checks for new reports that need review
 */
async function checkForNewReports(ceoId: string) {
  "use step";

  try {
    // Only check occasionally (not every loop) - 10% chance per loop
    if (Math.random() > 0.1) return;

    const state = await getCEOState(ceoId);
    if (!state) return;

    // Get new reports submitted to this CEO that haven't been reviewed
    const newReports = await db
      .select()
      .from(reports)
      .where(
        and(
          eq(reports.ceoId, ceoId),
          eq(reports.status, "submitted"),
          isNull(reports.acknowledgedAt)
        )
      )
      .orderBy(desc(reports.submittedAt))
      .limit(5); // Review up to 5 reports at a time

    // Auto-review and respond to new reports
    for (const report of newReports) {
      await handleReviewReport(ceoId, report.id);
    }
  } catch (error) {
    console.error(`[CEO ${ceoId}] Error checking for new reports:`, error);
  }
}

/**
 * Reviews a manager's report and generates a response
 */
async function handleReviewReport(ceoId: string, reportId: string) {
  "use step";

  console.log(`[CEO ${ceoId}] Reviewing report: ${reportId}`);

  try {
    // Get the report
    const [report] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1);

    if (!report) {
      console.error(`[CEO ${ceoId}] Report ${reportId} not found`);
      return;
    }

    // Get manager information
    const [manager] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, report.managerId))
      .limit(1);

    if (!manager) {
      console.error(`[CEO ${ceoId}] Manager ${report.managerId} not found`);
      return;
    }

    // Get CEO information
    const [ceo] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, ceoId))
      .limit(1);

    if (!ceo) {
      console.error(`[CEO ${ceoId}] CEO not found`);
      return;
    }

    // Generate CEO response using AI
    const response = await generateCEOResponse(
      ceoId,
      ceo.name,
      ceo.persona || "",
      report,
      manager.name
    );

    // Store response
    await db.insert(reportResponses).values({
      reportId: reportId,
      ceoId: ceoId,
      response: response,
    });

    // Update report status
    await db
      .update(reports)
      .set({
        status: "responded",
        acknowledgedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reports.id, reportId));

    // Store review in CEO memory
    await db.insert(memories).values({
      employeeId: ceoId,
      type: "interaction",
      content: `Reviewed and responded to report from ${manager.name}: ${report.title}`,
      importance: "0.9",
    });

    // Notify manager about the response
    try {
      await managerEvaluationHook.resume(`manager:${report.managerId}`, {
        type: "ceoResponse",
        reportId: reportId,
        response: response,
      });
      console.log(
        `[CEO ${ceoId}] Notified manager ${report.managerId} about response`
      );
    } catch (hookError) {
      console.warn(
        `[CEO ${ceoId}] Could not notify manager about response:`,
        hookError
      );
    }

    console.log(`[CEO ${ceoId}] Reviewed and responded to report ${reportId}`);
  } catch (error) {
    console.error(`[CEO ${ceoId}] Error reviewing report:`, error);
  }
}

/**
 * Manually responds to a report (for API calls)
 */
async function handleRespondToReport(
  ceoId: string,
  reportId: string,
  response: string
) {
  "use step";

  console.log(`[CEO ${ceoId}] Manually responding to report: ${reportId}`);

  try {
    // Get the report
    const [report] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1);

    if (!report || report.ceoId !== ceoId) {
      console.error(
        `[CEO ${ceoId}] Report ${reportId} not found or not assigned to this CEO`
      );
      return;
    }

    // Store response
    await db.insert(reportResponses).values({
      reportId: reportId,
      ceoId: ceoId,
      response: response,
    });

    // Update report status
    await db
      .update(reports)
      .set({
        status: "responded",
        acknowledgedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reports.id, reportId));

    // Notify manager about the response
    try {
      await managerEvaluationHook.resume(`manager:${report.managerId}`, {
        type: "ceoResponse",
        reportId: reportId,
        response: response,
      });
    } catch (hookError) {
      console.warn(
        `[CEO ${ceoId}] Could not notify manager about response:`,
        hookError
      );
    }

    console.log(`[CEO ${ceoId}] Responded to report ${reportId}`);
  } catch (error) {
    console.error(`[CEO ${ceoId}] Error responding to report:`, error);
  }
}

/**
 * Generates CEO response to a report using AI
 */
async function generateCEOResponse(
  ceoId: string,
  ceoName: string,
  ceoPersona: string,
  report: { id: string; title: string; content: string; managerId: string },
  managerName: string
): Promise<string> {
  "use step";

  try {
    const prompt = `You are the CEO (${ceoName}) reviewing a status report from a manager.

${ceoPersona ? `Your Persona: ${ceoPersona}\n\n` : ""}

Report Title: ${report.title}
Report Content:
${report.content.substring(0, 3000)}${report.content.length > 3000 ? '...' : ''}

Manager: ${managerName}

As the CEO, provide a response that:
1. Acknowledges the work completed
2. Provides guidance or feedback on priorities
3. Answers any questions raised in the report
4. Offers strategic direction or alternate directives if needed
5. Encourages the team

Be concise but comprehensive. Focus on actionable feedback and strategic alignment.`;

    const result = await generateText({
      model: 'openai/gpt-4.1' as never,
      prompt,
    });

    // Track cost
    await trackAICost(result, {
      employeeId: ceoId,
      taskId: null,
      model: "openai/gpt-4.1",
      operation: "ceo_report_response",
    });

    return result.text;
  } catch (error) {
    console.error(`[CEO ${ceoId}] Error generating response:`, error);
    return `Thank you for the report. I've reviewed it and will provide more detailed feedback soon.`;
  }
}

// State management functions
async function getCEOState(ceoId: string): Promise<CEOState | null> {
  "use step";

  try {
    // Try to get from Redis cache first
    try {
      const cachedState = await redisGet(`ceo:state:${ceoId}`);
      if (cachedState) {
        const parsed = JSON.parse(cachedState) as CEOState;
        // Validate the cached state is still valid by checking if CEO exists
        const [employee] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, ceoId))
          .limit(1);
        
        if (employee && employee.role === "ceo") {
          // Update lastActive and return cached state
          parsed.lastActive = new Date().toISOString();
          return parsed;
        }
      }
    } catch (redisError) {
      // If Redis fails, fall back to database
      console.warn(`[CEO ${ceoId}] Redis cache miss or error, falling back to database:`, redisError);
    }

    // Get CEO from database
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, ceoId))
      .limit(1);

    if (!employee || employee.role !== "ceo") {
      return null;
    }

    // Get managers (employees with role "manager" and no managerId, or managers reporting to CEO)
    const managerEmployees = await db
      .select()
      .from(employees)
      .where(eq(employees.role, "manager"));

    const managers = managerEmployees.map((e) => e.id);

    // Get reviewed reports
    const reviewed = await db
      .select()
      .from(reports)
      .where(
        and(eq(reports.ceoId, ceoId), eq(reports.status, "responded"))
      );

    const state: CEOState = {
      ceoId,
      name: employee.name,
      role: "ceo",
      managers,
      reviewedReports: reviewed.map((r) => r.id),
      createdAt: employee.createdAt.toISOString(),
      lastActive: new Date().toISOString(),
    };

    // Cache in Redis (expires in 1 hour)
    try {
      await redisSet(`ceo:state:${ceoId}`, JSON.stringify(state), { ex: 3600 });
    } catch (redisError) {
      // Non-fatal - continue even if Redis caching fails
      console.warn(`[CEO ${ceoId}] Failed to cache state in Redis:`, redisError);
    }

    return state;
  } catch (error) {
    console.error(`Error getting CEO state:`, error);
    return null;
  }
}

async function setCEOState(ceoId: string, state: CEOState): Promise<void> {
  "use step";

  try {
    // Update lastActive timestamp
    const updatedState: CEOState = {
      ...state,
      lastActive: new Date().toISOString(),
    };

    // Store in Redis cache (expires in 1 hour)
    try {
      await redisSet(`ceo:state:${ceoId}`, JSON.stringify(updatedState), { ex: 3600 });
    } catch (redisError) {
      // Non-fatal - continue even if Redis caching fails
      console.warn(`[CEO ${ceoId}] Failed to cache state in Redis:`, redisError);
    }

    // State is also stored in database (employees, reports tables)
    // The database is the source of truth, Redis is just for fast access
    // Managers and reviewed reports are stored in the database tables
  } catch (error) {
    console.error(`[CEO ${ceoId}] Error setting CEO state:`, error);
    // Don't throw - state management should be resilient
  }
}

