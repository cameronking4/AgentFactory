import { defineHook, getWorkflowMetadata, fetch } from "workflow";
import { generateText } from "ai";
import { db } from "@/lib/db";
import { employees, tasks, deliverables, memories } from "@/lib/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { icTaskHook } from "@/workflows/employees/ic-workflow";
import "dotenv/config";

// Manager Workflow State
export interface ManagerState {
  managerId: string; // workflowRunId
  name: string;
  role: "manager";
  directReports: string[]; // Employee IDs that report to this manager
  evaluatedDeliverables: string[]; // Deliverable IDs evaluated
  createdAt: string;
  lastActive: string;
}

// Events that Manager workflow can receive
export type ManagerEvent =
  | { type: "evaluateDeliverable"; deliverableId: string; taskId: string }
  | { type: "evaluateTask"; taskId: string }
  | { type: "requestRevision"; taskId: string; deliverableId: string; feedback: string } // Request IC to revise work
  | { type: "markReviewed"; taskId: string } // Manually mark task as reviewed
  | { type: "assignIC"; icId: string } // Assign an IC to this manager
  | { type: "unassignIC"; icId: string } // Unassign an IC from this manager
  | { type: "getStatus" };

// Define hooks for type safety
export const managerEvaluationHook = defineHook<ManagerEvent>();

// Initial state factory
export function createInitialManagerState(
  managerId: string,
  name: string
): ManagerState {
  return {
    managerId,
    name,
    role: "manager",
    directReports: [],
    evaluatedDeliverables: [],
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  };
}

/**
 * Manager Workflow - Handles QA and deliverable evaluation
 */
export async function managerWorkflow(initialState: ManagerState) {
  "use workflow";

  // Set up fetch for AI SDK (required for workflows)
  globalThis.fetch = fetch;

  // Use manager ID from initial state
  const managerId = initialState.managerId;
  const workflowRunId = getWorkflowMetadata().workflowRunId;

  console.log(
    `[Manager ${managerId}] Starting manager workflow (workflow: ${workflowRunId})`
  );

  // Initialize state
  const existingState = await getManagerState(managerId);
  if (!existingState) {
    await setManagerState(managerId, initialState);
  }

  // Create hook for receiving evaluation requests
  const receiveEvaluation = managerEvaluationHook.create({
    token: `manager:${managerId}`,
  });

  console.log(`[Manager ${managerId}] Hook created`);

  // Main loop: process events and proactively check for completed tasks
  while (true) {
    // Proactive: Check for completed tasks from direct reports that need review
    await checkForCompletedTasks(managerId);

    // Proactive: Build memory from evaluations and feedback
    await buildManagerMemory(managerId);

    // Reactive: Process evaluation requests
    const eventPromise = (async () => {
      for await (const event of receiveEvaluation) {
        return event;
      }
    })();

    // Wait for event or timeout (check every 10 seconds)
    const result = await Promise.race([
      eventPromise,
      new Promise<{ type: "timeout" }>((resolve) =>
        setTimeout(() => resolve({ type: "timeout" }), 10000)
      ),
    ]);

    if (result && result.type !== "timeout") {
      const event = result as ManagerEvent;
      try {
        console.log(`[Manager ${managerId}] Received event:`, event);

        switch (event.type) {
          case "evaluateDeliverable":
            await handleEvaluateDeliverable(managerId, event.deliverableId, event.taskId);
            break;
          case "evaluateTask":
            await handleEvaluateTask(managerId, event.taskId);
            break;
          case "requestRevision":
            await handleRequestRevision(managerId, event.taskId, event.deliverableId, event.feedback);
            break;
          case "markReviewed":
            await handleMarkReviewed(managerId, event.taskId);
            break;
          case "assignIC":
            await handleAssignIC(managerId, event.icId);
            break;
          case "unassignIC":
            await handleUnassignIC(managerId, event.icId);
            break;
          case "getStatus":
            // Just return current state
            break;
        }
      } catch (err) {
        console.error(`[Manager ${managerId}] Error processing event:`, err);
        // Continue processing events even if one fails
      }
    }
  }
}

/**
 * Proactively checks for completed tasks from direct reports that need review
 */
async function checkForCompletedTasks(managerId: string) {
  "use step";

  try {
    const state = await getManagerState(managerId);
    if (!state || state.directReports.length === 0) return;

    // Get all completed tasks from direct reports that haven't been reviewed
    const completedTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, "completed"),
          // Tasks assigned to direct reports
          sql`${tasks.assignedTo} = ANY(${state.directReports})`
        )
      );

    // Auto-evaluate tasks that have deliverables
    for (const task of completedTasks) {
      const taskDeliverables = await db
        .select()
        .from(deliverables)
        .where(eq(deliverables.taskId, task.id));

      // If there are deliverables and none have been evaluated, auto-evaluate
      if (taskDeliverables.length > 0 && !taskDeliverables.some((d) => d.evaluatedBy)) {
        const latestDeliverable = taskDeliverables[taskDeliverables.length - 1];
        await handleEvaluateDeliverable(managerId, latestDeliverable.id, task.id);
      }
    }
  } catch (error) {
    console.error(`[Manager ${managerId}] Error checking for completed tasks:`, error);
  }
}

/**
 * Evaluates a deliverable and provides a score
 */
async function handleEvaluateDeliverable(
  managerId: string,
  deliverableId: string,
  taskId: string
) {
  "use step";

  console.log(
    `[Manager ${managerId}] Evaluating deliverable: ${deliverableId}`
  );

  try {
    // Get deliverable from database
    const [deliverable] = await db
      .select()
      .from(deliverables)
      .where(eq(deliverables.id, deliverableId))
      .limit(1);

    if (!deliverable) {
      console.error(`[Manager ${managerId}] Deliverable ${deliverableId} not found`);
      return;
    }

    // Get task context
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) {
      console.error(`[Manager ${managerId}] Task ${taskId} not found`);
      return;
    }

    // Evaluate deliverable using AI
    const evaluation = await evaluateDeliverable(
      managerId,
      deliverable,
      task
    );

    // Update deliverable with evaluation
    await db
      .update(deliverables)
      .set({
        evaluatedBy: managerId,
        evaluationScore: evaluation.score,
        updatedAt: new Date(),
      })
      .where(eq(deliverables.id, deliverableId));

    // Store evaluation in memory
    await db.insert(memories).values({
      employeeId: managerId,
      type: "learning", // Use "learning" type for evaluations
      content: `Evaluated deliverable for task "${task.title}" by IC ${task.assignedTo || "unknown"}. Score: ${evaluation.score}/10. Feedback: ${evaluation.feedback.substring(0, 500)}`,
      importance: evaluation.score >= 8 ? "0.7" : evaluation.score >= 6 ? "0.8" : "0.9", // Higher importance for low scores (learning opportunity)
    });

    // Update task status based on evaluation
    // Auto-approve only if score is very high (>= 8)
    // For scores 7-8, manager can manually review
    // For scores < 7, manager should request revision
    if (evaluation.score >= 8) {
      // Very high score - auto-approve
      await db
        .update(tasks)
        .set({
          status: "reviewed",
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));
      console.log(
        `[Manager ${managerId}] Very high score (${evaluation.score}/10) - task auto-approved as reviewed`
      );
    } else {
      // Score < 8 - keep as completed, manager can review manually or request revision
      console.log(
        `[Manager ${managerId}] Score (${evaluation.score}/10) - task ready for manual review or revision`
      );
    }

    console.log(
      `[Manager ${managerId}] Evaluated deliverable ${deliverableId} - Score: ${evaluation.score}/10`
    );
  } catch (error) {
    console.error(`[Manager ${managerId}] Error evaluating deliverable:`, error);
  }
}

/**
 * Evaluates all deliverables for a task
 */
async function handleEvaluateTask(managerId: string, taskId: string) {
  "use step";

  console.log(`[Manager ${managerId}] Evaluating all deliverables for task: ${taskId}`);

  try {
    // Get all deliverables for this task
    const taskDeliverables = await db
      .select()
      .from(deliverables)
      .where(eq(deliverables.taskId, taskId));

    // Evaluate each deliverable
    for (const deliverable of taskDeliverables) {
      if (!deliverable.evaluatedBy) {
        // Only evaluate if not already evaluated
        await handleEvaluateDeliverable(managerId, deliverable.id, taskId);
      }
    }
  } catch (error) {
    console.error(`[Manager ${managerId}] Error evaluating task:`, error);
  }
}

/**
 * Requests revision from IC with feedback
 */
async function handleRequestRevision(
  managerId: string,
  taskId: string,
  deliverableId: string,
  feedback: string
) {
  "use step";

  console.log(`[Manager ${managerId}] Requesting revision for task: ${taskId}`);

  try {
    // Get task to find assigned IC
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task || !task.assignedTo) {
      console.error(`[Manager ${managerId}] Task ${taskId} not found or not assigned`);
      return;
    }

    // Update deliverable with feedback
    await db
      .update(deliverables)
      .set({
        feedback: feedback,
        updatedAt: new Date(),
      })
      .where(eq(deliverables.id, deliverableId));

    // Change task status back to in-progress for revision
    await db
      .update(tasks)
      .set({
        status: "in-progress",
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    // Store revision request in memory
    await db.insert(memories).values({
      employeeId: managerId,
      type: "learning", // Use "learning" type for feedback
      content: `Requested revision for task "${task.title}" from IC ${task.assignedTo}. Feedback: ${feedback.substring(0, 500)}`,
      importance: "0.8",
    });

    // Notify IC about revision request
    try {
      await icTaskHook.resume(`ic:${task.assignedTo}:tasks`, {
        type: "revisionRequested",
        taskId: taskId,
        feedback: feedback,
      });
      console.log(
        `[Manager ${managerId}] Notified IC ${task.assignedTo} about revision request`
      );
    } catch (hookError) {
      console.warn(
        `[Manager ${managerId}] Could not notify IC about revision:`,
        hookError
      );
    }

    console.log(`[Manager ${managerId}] Revision requested for task ${taskId}`);
  } catch (error) {
    console.error(`[Manager ${managerId}] Error requesting revision:`, error);
  }
}

/**
 * Manually marks a task as reviewed/approved
 */
async function handleMarkReviewed(managerId: string, taskId: string) {
  "use step";

  console.log(`[Manager ${managerId}] Marking task as reviewed: ${taskId}`);

  try {
    // Get task to verify it belongs to a direct report
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) {
      console.error(`[Manager ${managerId}] Task ${taskId} not found`);
      return;
    }

    // Verify task is assigned to a direct report
    const state = await getManagerState(managerId);
    if (!state || !state.directReports.includes(task.assignedTo || "")) {
      console.warn(
        `[Manager ${managerId}] Task ${taskId} is not assigned to a direct report`
      );
      return;
    }

    // Mark task as reviewed
    await db
      .update(tasks)
      .set({
        status: "reviewed",
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    console.log(`[Manager ${managerId}] Task ${taskId} marked as reviewed`);
  } catch (error) {
    console.error(`[Manager ${managerId}] Error marking task as reviewed:`, error);
  }
}

/**
 * Uses AI to evaluate a deliverable quality
 */
async function evaluateDeliverable(
  managerId: string,
  deliverable: { id: string; type: string; content: string },
  task: { id: string; title: string; description: string }
): Promise<{ score: number; feedback: string }> {
  "use step";

  try {
    const prompt = `You are a QA manager evaluating a deliverable. Your job is to assess quality and provide a score from 1-10.

Task: ${task.title}
Task Description: ${task.description}

Deliverable Type: ${deliverable.type}
Deliverable Content:
${deliverable.content.substring(0, 2000)}${deliverable.content.length > 2000 ? '...' : ''}

Evaluate this deliverable based on:
1. Completeness - Does it fully address the task requirements?
2. Quality - Is the work well-done and professional?
3. Correctness - Is it technically correct?
4. Usability - Is it ready for use/production?

Respond in JSON format:
{
  "score": number (1-10),
  "feedback": "detailed feedback explaining the score"
}`;

    const result = await generateText({
      model: 'openai/gpt-4.1' as never,
      prompt,
    });

    // Parse evaluation
    const evaluation = JSON.parse(result.text) as {
      score: number;
      feedback: string;
    };

    // Ensure score is in valid range
    const score = Math.max(1, Math.min(10, Math.round(evaluation.score)));

    return {
      score,
      feedback: evaluation.feedback,
    };
  } catch (error) {
    console.error(`[Manager ${managerId}] Error in AI evaluation:`, error);
    // Return default evaluation on error
    return {
      score: 5,
      feedback: "Evaluation error - default score assigned",
    };
  }
}

/**
 * Assigns an IC to this manager
 */
async function handleAssignIC(managerId: string, icId: string) {
  "use step";

  console.log(`[Manager ${managerId}] Assigning IC ${icId} to manager`);

  try {
    // Verify the IC exists and is an IC
    const [ic] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, icId))
      .limit(1);

    if (!ic) {
      console.error(`[Manager ${managerId}] IC ${icId} not found`);
      return;
    }

    if (ic.role !== "ic") {
      console.error(`[Manager ${managerId}] Employee ${icId} is not an IC (role: ${ic.role})`);
      return;
    }

    // Verify the manager exists
    const [manager] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, managerId))
      .limit(1);

    if (!manager || manager.role !== "manager") {
      console.error(`[Manager ${managerId}] Manager not found or invalid role`);
      return;
    }

    // Update IC's managerId
    await db
      .update(employees)
      .set({
        managerId: managerId,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, icId));

    console.log(`[Manager ${managerId}] Successfully assigned IC ${icId} (${ic.name})`);
  } catch (error) {
    console.error(`[Manager ${managerId}] Error assigning IC:`, error);
  }
}

/**
 * Unassigns an IC from this manager
 */
async function handleUnassignIC(managerId: string, icId: string) {
  "use step";

  console.log(`[Manager ${managerId}] Unassigning IC ${icId} from manager`);

  try {
    // Verify the IC exists and is assigned to this manager
    const [ic] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, icId))
      .limit(1);

    if (!ic) {
      console.error(`[Manager ${managerId}] IC ${icId} not found`);
      return;
    }

    if (ic.managerId !== managerId) {
      console.warn(
        `[Manager ${managerId}] IC ${icId} is not assigned to this manager (assigned to: ${ic.managerId})`
      );
      return;
    }

    // Remove manager assignment
    await db
      .update(employees)
      .set({
        managerId: null,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, icId));

    console.log(`[Manager ${managerId}] Successfully unassigned IC ${icId} (${ic.name})`);
  } catch (error) {
    console.error(`[Manager ${managerId}] Error unassigning IC:`, error);
  }
}

// State management functions
async function getManagerState(managerId: string): Promise<ManagerState | null> {
  "use step";

  try {
    // Get manager from database
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, managerId))
      .limit(1);

    if (!employee || employee.role !== "manager") {
      return null;
    }

    // Get evaluated deliverables
    const evaluated = await db
      .select()
      .from(deliverables)
      .where(eq(deliverables.evaluatedBy, managerId));

    // Get direct reports (employees with this manager as managerId)
    const directReportEmployees = await db
      .select()
      .from(employees)
      .where(eq(employees.managerId, managerId));
    
    const directReports = directReportEmployees.map((e) => e.id);

    return {
      managerId,
      name: employee.name,
      role: "manager",
      directReports,
      evaluatedDeliverables: evaluated.map((d) => d.id),
      createdAt: employee.createdAt.toISOString(),
      lastActive: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Error getting manager state:`, error);
    return null;
  }
}

async function setManagerState(
  _managerId: string,
  _state: ManagerState
): Promise<void> {
  "use step";

  // State is primarily stored in database (employees, deliverables tables)
  // This function is mainly for in-memory caching if needed
  // For MVP, we'll rely on database queries
}

/**
 * Periodically builds memory from evaluations, feedback, and IC performance patterns
 */
async function buildManagerMemory(managerId: string) {
  "use step";

  try {
    const state = await getManagerState(managerId);
    if (!state || state.directReports.length === 0) return;

    // Only run periodically (not every loop) - 20% chance per loop
    if (Math.random() > 0.2) return;

    // Get recent evaluations and feedback
    const recentMemories = await db
      .select()
      .from(memories)
      .where(eq(memories.employeeId, managerId))
      .orderBy(desc(memories.createdAt))
      .limit(20);

    // Get recent deliverables evaluated by this manager
    const recentDeliverables = await db
      .select()
      .from(deliverables)
      .where(eq(deliverables.evaluatedBy, managerId))
      .orderBy(desc(deliverables.updatedAt))
      .limit(10);

    if (recentDeliverables.length === 0) return;

    // Get IC performance data
    const icPerformance: Array<{
      icId: string;
      icName: string;
      avgScore: number;
      totalEvaluated: number;
      revisionsRequested: number;
    }> = [];

    for (const icId of state.directReports) {
      const [ic] = await db
        .select()
        .from(employees)
        .where(eq(employees.id, icId))
        .limit(1);

      if (!ic) continue;

      // Get tasks assigned to this IC
      const icTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.assignedTo, icId));

      const icTaskIds = icTasks.map((t) => t.id);
      const icDeliverablesFiltered = recentDeliverables.filter((d) =>
        icTaskIds.includes(d.taskId)
      );

      if (icDeliverablesFiltered.length === 0) continue;

      const scores = icDeliverablesFiltered
        .map((d) => d.evaluationScore)
        .filter((s): s is number => s !== null);
      const avgScore =
        scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : 0;
      const revisionsRequested = icDeliverablesFiltered.filter(
        (d) => d.feedback !== null
      ).length;

      icPerformance.push({
        icId: ic.id,
        icName: ic.name,
        avgScore,
        totalEvaluated: icDeliverablesFiltered.length,
        revisionsRequested,
      });
    }

    // Use AI to analyze patterns and build insights
    const prompt = `You are a manager reflecting on your evaluation and feedback patterns to improve your management skills.

Recent Evaluations: ${recentDeliverables.length}
IC Performance Summary:
${icPerformance
  .map(
    (p) =>
      `- ${p.icName}: Avg score ${p.avgScore.toFixed(1)}/10, ${p.totalEvaluated} evaluated, ${p.revisionsRequested} revisions requested`
  )
  .join("\n")}

Recent Memory Context:
${recentMemories
  .slice(0, 10)
  .map((m) => m.content.substring(0, 200))
  .join("\n")}

Analyze patterns and extract insights about:
1. IC strengths and areas for improvement
2. Common issues found in deliverables
3. Effective feedback patterns
4. Best practices for quality assurance
5. How to better support your team

Respond in JSON:
{
  "insights": [
    {
      "type": "ic_performance" | "common_issues" | "feedback_patterns" | "best_practices",
      "content": "insight description",
      "importance": "0.7" | "0.8" | "0.9"
    }
  ],
  "summary": "overall summary of learnings"
}`;

    const result = await generateText({
      model: "openai/gpt-4.1" as never,
      prompt,
    });

    let text = result.text.trim();
    if (text.startsWith("```json")) {
      text = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (text.startsWith("```")) {
      text = text.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    const analysis = JSON.parse(text) as {
      insights: Array<{
        type: string;
        content: string;
        importance: string;
      }>;
      summary: string;
    };

    // Store insights as memories
    for (const insight of analysis.insights) {
      await db.insert(memories).values({
        employeeId: managerId,
        type: "learning",
        content: `[${insight.type}] ${insight.content}`,
        importance: insight.importance,
      });
    }

    // Store summary
    if (analysis.summary) {
      await db.insert(memories).values({
        employeeId: managerId,
        type: "learning",
        content: `Management Reflection: ${analysis.summary}`,
        importance: "0.9",
      });
    }

    console.log(
      `[Manager ${managerId}] Built memory with ${analysis.insights.length} insights`
    );
  } catch (error) {
    console.error(`[Manager ${managerId}] Error building memory:`, error);
  }
}

