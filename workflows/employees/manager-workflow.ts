import { defineHook, getWorkflowMetadata, fetch, sleep } from "workflow";
import { generateText } from "ai";
import { db } from "@/lib/db";
import { employees, tasks, deliverables, memories, reports, reportResponses, meetings } from "@/lib/db/schema";
import { eq, and, desc, inArray, isNull, or, gte, lte } from "drizzle-orm";
import { icTaskHook } from "@/workflows/employees/ic-workflow";
import { trackAICost } from "@/lib/ai/cost-tracking";
import { get as redisGet, set as redisSet } from "@/lib/redis";
import { createManagerTools } from "@/workflows/tools/manager-tools";
import { validateTools } from "@/workflows/tools/utils";
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
  | { type: "requestWork"; icId: string } // IC is requesting more work
  | { type: "generateReport" } // Generate report to CEO (every other day)
  | { type: "ceoResponse"; reportId: string; response: string } // CEO responded to a report
  | { type: "createTaskFromReport"; reportId: string } // Create tasks based on report/CEO feedback
  | { type: "getStatus" };

// Define hooks for type safety
export const managerEvaluationHook = defineHook<ManagerEvent>();

/**
 * Gets the AI model for a manager
 * Managers use "moonshotai/kimi-k2-thinking"
 */
function getModelForManager(_managerId: string): string {
  // All managers use the same model
  return "moonshotai/kimi-k2-thinking";
}

/**
 * Gets the AI model for an IC based on their ID
 * Uses a hash-based approach to consistently assign models:
 * - IC 1s use "openai/gpt-4.1"
 * - IC 2s use "openai/gpt-5"
 * - IC 3s use "anthropic/claude-sonnet-4"
 */
export function getModelForIC(employeeId: string): string {
  // Simple hash function to consistently assign models based on employee ID
  let hash = 0;
  for (let i = 0; i < employeeId.length; i++) {
    const char = employeeId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Use modulo to assign one of three models
  const modelIndex = Math.abs(hash) % 3;
  
  switch (modelIndex) {
    case 0:
      return "openai/gpt-4.1";
    case 1:
      return "openai/gpt-5";
    case 2:
      return "anthropic/claude-sonnet-4";
    default:
      return "openai/gpt-4.1"; // Fallback
  }
}

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
    // Proactive: Self-healing - Ensure IC workflows are running for direct reports with active tasks
    try {
      await ensureDirectReportWorkflowsRunning(managerId);
    } catch (err) {
      console.error(`[Manager ${managerId}] Error in ensureDirectReportWorkflowsRunning:`, err);
      // Continue loop even if check fails
    }

    // Proactive: Check for completed tasks from direct reports that need review
    await checkForCompletedTasks(managerId);

    // Proactive: Assign pending tasks to available ICs
    await assignPendingTasksToICs(managerId);

    // Proactive: Build memory from evaluations and feedback
    await buildManagerMemory(managerId);

    // Proactive: Check if it's time to generate report (every other day)
    await checkAndGenerateReport(managerId);

    // Reactive: Process evaluation requests
    const eventPromise = (async () => {
  for await (const event of receiveEvaluation) {
        return event;
      }
    })();

    // Wait for event or timeout (check every 10 seconds)
    const timeoutPromise = sleep("10s").then(() => ({ type: "timeout" as const }));
    const result = await Promise.race([
      eventPromise.then((event) => ({ type: "event" as const, event })),
      timeoutPromise,
    ]);

    if (result.type === "event") {
      const event = result.event as ManagerEvent;
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
          case "requestWork":
            await handleRequestWork(managerId, event.icId);
            break;
          case "generateReport":
            await handleGenerateReport(managerId);
            break;
          case "ceoResponse":
            await handleCEOResponse(managerId, event.reportId, event.response);
            break;
          case "createTaskFromReport":
            await handleCreateTaskFromReport(managerId, event.reportId);
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
    // Use inArray for proper Drizzle ORM syntax
    const completedTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, "completed"),
          // Tasks assigned to direct reports
          inArray(tasks.assignedTo, state.directReports)
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
      content: `Evaluated deliverable for task "${task.title}" by IC ${task.assignedTo || "unknown"}. Score: ${evaluation.score}/10. Feedback: ${evaluation.feedback?.substring(0, 500) || evaluation.feedback || "No feedback"}`,
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

// Manager tools are now in workflows/tools/manager-tools.ts
// Removed createManagerTools function - now imported from @/workflows/tools/manager-tools

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
    // Get manager employee record for persona
    const [manager] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, managerId))
      .limit(1);

    const persona = manager?.persona || "";

    // Create tools for manager
    const tools = createManagerTools(managerId);
    
    // Validate tools object (ensure all tools have inputSchema)
    if (!tools || typeof tools !== 'object') {
      console.error(`[Manager ${managerId}] Invalid tools object created`);
      throw new Error("Failed to create tools for deliverable evaluation");
    }
    
    // Validate tools using shared utility
    validateTools(tools, `Manager ${managerId}`);

    const prompt = `You are a QA manager evaluating a deliverable. Your job is to assess quality and provide a score from 1-10.

${persona ? `Your Persona: ${persona}\n\n` : ""}

Task: ${task.title}
Task Description: ${task.description}

Deliverable Type: ${deliverable.type}
Deliverable Content:
${deliverable.content.substring(0, 2000)}${deliverable.content.length > 2000 ? '...' : ''}

You have access to tools to search for similar deliverables, find employees, fetch memories, and search tasks. Use these tools if you need context or want to compare with similar work.

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

    // Get model for manager
    const model = getModelForManager(managerId);

    const result = await generateText({
      model: model as never,
      prompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: tools as any, // Type assertion to bypass tool type issues
    });

    // Track cost
    await trackAICost(result, {
      employeeId: managerId,
      taskId: task.id,
      model: model,
      operation: "deliverable_evaluation",
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

/**
 * Handles IC request for more work
 */
async function handleRequestWork(managerId: string, icId: string) {
  "use step";

  console.log(`[Manager ${managerId}] IC ${icId} requested work`);

  try {
    // Find pending tasks that can be assigned to this IC
    const pendingTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, "pending"),
          isNull(tasks.assignedTo)
        )
      )
      .limit(1);

    if (pendingTasks.length > 0) {
      const task = pendingTasks[0];
      // Assign task to IC
      await db
        .update(tasks)
        .set({
          assignedTo: icId,
          status: "in-progress",
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, task.id));

      // Notify IC about the new task
      try {
        await icTaskHook.resume(`ic:${icId}:tasks`, {
          type: "newTask",
          taskId: task.id,
        });
        console.log(`[Manager ${managerId}] Assigned task ${task.id} to IC ${icId}`);
      } catch (hookError) {
        console.warn(`[Manager ${managerId}] Could not notify IC:`, hookError);
      }
    } else {
      console.log(`[Manager ${managerId}] No pending tasks available for IC ${icId}`);
      // Could create a new task here if needed
    }
  } catch (error) {
    console.error(`[Manager ${managerId}] Error handling work request:`, error);
  }
}

/**
 * Assigns pending tasks to available ICs under this manager
 */
async function assignPendingTasksToICs(managerId: string) {
  "use step";

  try {
    const state = await getManagerState(managerId);
    if (!state || state.directReports.length === 0) return;

    // Only check occasionally (not every loop) - 10% chance per loop
    if (Math.random() > 0.1) return;

    // Get pending tasks without assignments
    const pendingTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, "pending"),
          isNull(tasks.assignedTo)
        )
      )
      .limit(5);

    if (pendingTasks.length === 0) return;

    // For each pending task, find an available IC
    for (const task of pendingTasks) {
      // Find available ICs (those with no in-progress tasks)
      const availableICs: string[] = [];

      for (const icId of state.directReports) {
        const icTasks = await db
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.assignedTo, icId),
              eq(tasks.status, "in-progress")
            )
          );

        if (icTasks.length === 0) {
          availableICs.push(icId);
        }
      }

      if (availableICs.length > 0) {
        // Assign to first available IC
        const assignedIC = availableICs[0];
        await db
          .update(tasks)
          .set({
            assignedTo: assignedIC,
            status: "in-progress",
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, task.id));

        // Notify IC
        try {
          await icTaskHook.resume(`ic:${assignedIC}:tasks`, {
            type: "newTask",
            taskId: task.id,
          });
          console.log(`[Manager ${managerId}] Assigned pending task ${task.id} to IC ${assignedIC}`);
        } catch (hookError) {
          console.warn(`[Manager ${managerId}] Could not notify IC:`, hookError);
        }
      }
    }
  } catch (error) {
    console.error(`[Manager ${managerId}] Error assigning pending tasks:`, error);
  }
}

// State management functions
async function getManagerState(managerId: string): Promise<ManagerState | null> {
  "use step";

  try {
    // Try to get from Redis cache first
    try {
      const cachedState = await redisGet(`manager:state:${managerId}`);
      if (cachedState) {
        const parsed = JSON.parse(cachedState) as ManagerState;
        // Validate the cached state is still valid by checking if manager exists
        const [employee] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, managerId))
          .limit(1);
        
        if (employee && employee.role === "manager") {
          // Update lastActive and return cached state
          parsed.lastActive = new Date().toISOString();
          return parsed;
        }
      }
    } catch (redisError) {
      // If Redis fails, fall back to database
      console.warn(`[Manager ${managerId}] Redis cache miss or error, falling back to database:`, redisError);
    }

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

    const state: ManagerState = {
      managerId,
      name: employee.name,
      role: "manager",
      directReports,
      evaluatedDeliverables: evaluated.map((d) => d.id),
      createdAt: employee.createdAt.toISOString(),
      lastActive: new Date().toISOString(),
    };

    // Cache in Redis (expires in 1 hour)
    try {
      await redisSet(`manager:state:${managerId}`, JSON.stringify(state), { ex: 3600 });
    } catch (redisError) {
      // Non-fatal - continue even if Redis caching fails
      console.warn(`[Manager ${managerId}] Failed to cache state in Redis:`, redisError);
    }

    return state;
  } catch (error) {
    console.error(`Error getting manager state:`, error);
    return null;
  }
}

async function setManagerState(
  managerId: string,
  state: ManagerState
): Promise<void> {
  "use step";

  try {
    // Update lastActive timestamp
    const updatedState: ManagerState = {
      ...state,
      lastActive: new Date().toISOString(),
    };

    // Store in Redis cache (expires in 1 hour)
    try {
      await redisSet(`manager:state:${managerId}`, JSON.stringify(updatedState), { ex: 3600 });
    } catch (redisError) {
      // Non-fatal - continue even if Redis caching fails
      console.warn(`[Manager ${managerId}] Failed to cache state in Redis:`, redisError);
    }

    // State is also stored in database (employees, deliverables tables)
    // The database is the source of truth, Redis is just for fast access
    // Direct reports and evaluated deliverables are stored in the database tables
  } catch (error) {
    console.error(`[Manager ${managerId}] Error setting manager state:`, error);
    // Don't throw - state management should be resilient
  }
}

/**
 * Self-healing: Ensures IC workflows are running for direct reports with active tasks
 * Managers proactively ensure their team members are working
 */
async function ensureDirectReportWorkflowsRunning(managerId: string) {
  "use step";

  try {
    // Only check occasionally (not every loop) - 15% chance per loop
    if (Math.random() > 0.15) return;

    const state = await getManagerState(managerId);
    if (!state || state.directReports.length === 0) return;

    // Get all direct reports with active tasks
    const directReportsWithTasks = await db
      .select({
        employeeId: tasks.assignedTo,
      })
      .from(tasks)
      .where(
        and(
          inArray(tasks.assignedTo, state.directReports),
          or(
            eq(tasks.status, "pending"),
            eq(tasks.status, "in-progress")
          )
        )
      )
      .groupBy(tasks.assignedTo);

    const icIdsWithTasks = new Set(
      directReportsWithTasks
        .map((t) => t.employeeId)
        .filter((id): id is string => id !== null)
    );

    // For each direct report with active tasks, ensure their workflow is running
    for (const icId of state.directReports) {
      if (!icIdsWithTasks.has(icId)) continue;

      // Check if employee has been active recently (indicates workflow might be running)
      const [icEmployee] = await db
        .select()
        .from(employees)
        .where(eq(employees.id, icId))
        .limit(1);

      if (!icEmployee) continue;

      // Check if employee has been updated recently (within last 2 minutes)
      const lastUpdated = icEmployee.updatedAt 
        ? new Date(icEmployee.updatedAt).getTime() 
        : 0;
      const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
      const shouldStartWorkflow = lastUpdated < twoMinutesAgo;

      if (shouldStartWorkflow) {
        console.log(
          `[Manager ${managerId}] Self-healing: Starting IC workflow for direct report ${icId} (${icEmployee.name}) with active tasks`
        );

        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
          const response = await fetch(`${baseUrl}/api/employees/${icId}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });

          if (response.ok) {
            const result = await response.json();
            console.log(
              `[Manager ${managerId}] Self-healing: Started IC workflow for ${icId}: ${result.workflowRunId}`
            );
          } else {
            console.warn(
              `[Manager ${managerId}] Self-healing: Failed to start IC workflow for ${icId}: ${response.status}`
            );
          }
        } catch (error) {
          console.error(
            `[Manager ${managerId}] Self-healing: Error starting IC workflow for ${icId}:`,
            error
          );
          // Continue - will retry on next check
        }
      }
    }
  } catch (error) {
    console.error(`[Manager ${managerId}] Error in ensureDirectReportWorkflowsRunning:`, error);
    // Don't throw - this is a self-healing mechanism
  }
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

    const model = getModelForManager(managerId);

    const result = await generateText({
      model: model as never,
      prompt,
    });

    // Track cost
    await trackAICost(result, {
      employeeId: managerId,
      taskId: null,
      model: model,
      operation: "manager_memory_building",
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

/**
 * Checks if it's time to generate a report (every other day) and generates it
 */
async function checkAndGenerateReport(managerId: string) {
  "use step";

  try {
    // Only check occasionally (not every loop) - 5% chance per loop
    if (Math.random() > 0.05) return;

    const state = await getManagerState(managerId);
    if (!state || state.directReports.length === 0) return;

    // Get the most recent report for this manager
    const recentReports = await db
      .select()
      .from(reports)
      .where(eq(reports.managerId, managerId))
      .orderBy(desc(reports.createdAt))
      .limit(1);

    const now = new Date();
    let shouldGenerate = false;

    if (recentReports.length === 0) {
      // No reports yet - generate first one
      shouldGenerate = true;
    } else {
      const lastReport = recentReports[0];
      const lastReportDate = new Date(lastReport.createdAt);
      const daysSinceLastReport = (now.getTime() - lastReportDate.getTime()) / (1000 * 60 * 60 * 24);
      
      // Generate report every other day (2 days)
      if (daysSinceLastReport >= 2) {
        shouldGenerate = true;
      }
    }

    if (shouldGenerate) {
      await handleGenerateReport(managerId);
    }
  } catch (error) {
    console.error(`[Manager ${managerId}] Error checking for report generation:`, error);
  }
}

/**
 * Generates a report to CEO based on scrums, completed work, and manager memories
 */
async function handleGenerateReport(managerId: string) {
  "use step";

  console.log(`[Manager ${managerId}] Generating report to CEO`);

  try {
    const state = await getManagerState(managerId);
    if (!state) {
      console.error(`[Manager ${managerId}] Manager state not found`);
      return;
    }

    // Get manager employee record
    const [manager] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, managerId))
      .limit(1);

    if (!manager) {
      console.error(`[Manager ${managerId}] Manager not found`);
      return;
    }

    // Get CEO (first CEO employee)
    const [ceo] = await db
      .select()
      .from(employees)
      .where(eq(employees.role, "ceo"))
      .limit(1);

    if (!ceo) {
      console.warn(`[Manager ${managerId}] No CEO found - skipping report generation`);
      return;
    }

    // Calculate report period (last 2 days)
    const now = new Date();
    const periodEnd = now;
    const periodStart = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

    // Get standup meetings from the last 2 days
    const recentStandups = await db
      .select()
      .from(meetings)
      .where(
        and(
          eq(meetings.type, "standup"),
          gte(meetings.createdAt, periodStart),
          lte(meetings.createdAt, periodEnd)
        )
      )
      .orderBy(desc(meetings.createdAt));

    // Filter standups that include this manager or their direct reports
    const relevantStandups = recentStandups.filter((meeting) => {
      const participants = meeting.participants || [];
      return participants.includes(managerId) || 
             state.directReports.some((dr) => participants.includes(dr));
    });

    // Get completed tasks from direct reports in the last 2 days
    const completedTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          inArray(tasks.assignedTo, state.directReports),
          eq(tasks.status, "completed"),
          gte(tasks.completedAt || tasks.updatedAt, periodStart),
          lte(tasks.completedAt || tasks.updatedAt, periodEnd)
        )
      );

    // Get manager memories from the last 2 days
    const recentMemories = await db
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.employeeId, managerId),
          gte(memories.createdAt, periodStart),
          lte(memories.createdAt, periodEnd)
        )
      )
      .orderBy(desc(memories.createdAt))
      .limit(50);

    // Get deliverables from completed tasks
    const taskIds = completedTasks.map((t) => t.id);
    const taskDeliverables = taskIds.length > 0
      ? await db
          .select()
          .from(deliverables)
          .where(inArray(deliverables.taskId, taskIds))
      : [];

    // Generate report using AI
    const reportContent = await generateReportContent(
      managerId,
      manager.name,
      state.directReports,
      relevantStandups,
      completedTasks,
      taskDeliverables,
      recentMemories,
      periodStart,
      periodEnd
    );

    // Create report in database
    const [report] = await db
      .insert(reports)
      .values({
        managerId: managerId,
        ceoId: ceo.id,
        title: `Team Status Report - ${periodStart.toLocaleDateString()} to ${periodEnd.toLocaleDateString()}`,
        content: reportContent,
        status: "submitted",
        periodStart,
        periodEnd,
        submittedAt: now,
      })
      .returning();

    // Store report generation in memory
    await db.insert(memories).values({
      employeeId: managerId,
      type: "interaction",
      content: `Generated and submitted report to CEO: ${report.id}`,
      importance: "0.8",
    });

    // Notify CEO workflow about the new report (if CEO workflow exists)
    // This will be handled by the CEO workflow hook

    console.log(`[Manager ${managerId}] Generated report ${report.id} to CEO`);
  } catch (error) {
    console.error(`[Manager ${managerId}] Error generating report:`, error);
  }
}

/**
 * Generates report content using AI
 */
async function generateReportContent(
  managerId: string,
  managerName: string,
  directReportIds: string[],
  standups: Array<{ id: string; transcript: string; createdAt: Date }>,
  completedTasks: Array<{ id: string; title: string; description: string; completedAt: Date | null }>,
  deliverables: Array<{ id: string; type: string; content: string }>,
  memories: Array<{ content: string; importance: string }>,
  periodStart: Date,
  periodEnd: Date
): Promise<string> {
  "use step";

  try {
    // Get direct report names
    const directReports = await db
      .select()
      .from(employees)
      .where(inArray(employees.id, directReportIds));

    const directReportNames = directReports.map((dr) => dr.name).join(", ");

    // Build context for report generation
    const standupSummary = standups.length > 0
      ? standups.map((s) => `- ${s.createdAt.toLocaleDateString()}: ${s.transcript.substring(0, 200)}...`).join("\n")
      : "No standup meetings in this period";

    const taskSummary = completedTasks.length > 0
      ? completedTasks.map((t) => `- ${t.title}: ${t.description.substring(0, 100)}...`).join("\n")
      : "No completed tasks in this period";

    const memorySummary = memories.length > 0
      ? memories.slice(0, 10).map((m) => `- ${m.content.substring(0, 150)}...`).join("\n")
      : "No significant memories in this period";

    const prompt = `You are a manager (${managerName}) generating a status report for the CEO.

Report Period: ${periodStart.toLocaleDateString()} to ${periodEnd.toLocaleDateString()}

Team Members: ${directReportNames}

Standup Meetings Summary:
${standupSummary}

Completed Work:
${taskSummary}

Key Memories/Insights:
${memorySummary}

Generate a comprehensive status report that includes:
1. Team Overview - Summary of team activity and progress
2. Completed Work - Key deliverables and accomplishments
3. Standup Highlights - Important points from daily standups
4. Challenges/Blockers - Any issues or blockers the team is facing
5. Next Steps - Plans for the upcoming period
6. Questions for CEO - Any questions or guidance needed

Format the report in a clear, professional manner suitable for executive review.`;

    const model = getModelForManager(managerId);

    const result = await generateText({
      model: model as never,
      prompt,
    });

    // Track cost
    await trackAICost(result, {
      employeeId: managerId,
      taskId: null,
      model: model,
      operation: "report_generation",
    });

    return result.text;
  } catch (error) {
    console.error(`[Manager ${managerId}] Error generating report content:`, error);
    return `Error generating report: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

/**
 * Handles CEO response to a report
 */
async function handleCEOResponse(managerId: string, reportId: string, response: string) {
  "use step";

  console.log(`[Manager ${managerId}] Received CEO response to report ${reportId}`);

  try {
    // Get the report
    const [report] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1);

    if (!report || report.managerId !== managerId) {
      console.error(`[Manager ${managerId}] Report ${reportId} not found or not owned by manager`);
      return;
    }

    // Store CEO response
    await db.insert(reportResponses).values({
      reportId: reportId,
      ceoId: report.ceoId || "",
      response: response,
    });

    // Update report status
    await db
      .update(reports)
      .set({
        status: "responded",
        updatedAt: new Date(),
      })
      .where(eq(reports.id, reportId));

    // Store CEO response in manager memory
    await db.insert(memories).values({
      employeeId: managerId,
      type: "interaction",
      content: `CEO responded to report ${reportId}: ${response.substring(0, 500)}`,
      importance: "0.9",
    });

    // Automatically create tasks from CEO response if needed
    await handleCreateTaskFromReport(managerId, reportId);

    console.log(`[Manager ${managerId}] Processed CEO response to report ${reportId}`);
  } catch (error) {
    console.error(`[Manager ${managerId}] Error handling CEO response:`, error);
  }
}

/**
 * Creates tasks based on report, scrums, and CEO feedback
 */
async function handleCreateTaskFromReport(managerId: string, reportId: string) {
  "use step";

  console.log(`[Manager ${managerId}] Creating tasks from report ${reportId}`);

  try {
    const state = await getManagerState(managerId);
    if (!state) {
      console.error(`[Manager ${managerId}] Manager state not found`);
      return;
    }

    // Get the report
    const [report] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1);

    if (!report || report.managerId !== managerId) {
      console.error(`[Manager ${managerId}] Report ${reportId} not found or not owned by manager`);
      return;
    }

    // Get CEO responses to this report
    const ceoResponses = await db
      .select()
      .from(reportResponses)
      .where(eq(reportResponses.reportId, reportId));

    // Get recent standups
    const recentStandups = await db
      .select()
      .from(meetings)
      .where(
        and(
          eq(meetings.type, "standup"),
          gte(meetings.createdAt, report.periodStart),
          lte(meetings.createdAt, report.periodEnd)
        )
      );

    // Use AI to extract actionable tasks from report, CEO responses, and standups
    const extractedTasks = await extractTasksFromReport(
      managerId,
      report,
      ceoResponses,
      recentStandups,
      state.directReports
    );

    // Create tasks in database
    for (const task of extractedTasks) {
      await db.insert(tasks).values({
        title: task.title,
        description: task.description,
        assignedTo: task.assignedTo || null,
        priority: task.priority,
        status: "pending",
      });

      // If assigned, notify IC
      if (task.assignedTo) {
        try {
          await icTaskHook.resume(`ic:${task.assignedTo}:tasks`, {
            type: "newTask",
            taskId: task.id || "",
          });
        } catch (hookError) {
          console.warn(`[Manager ${managerId}] Could not notify IC about new task:`, hookError);
        }
      }
    }

    // Store task creation in memory
    await db.insert(memories).values({
      employeeId: managerId,
      type: "task",
      content: `Created ${extractedTasks.length} tasks from report ${reportId} based on CEO feedback and standups`,
      importance: "0.8",
    });

    console.log(`[Manager ${managerId}] Created ${extractedTasks.length} tasks from report ${reportId}`);
  } catch (error) {
    console.error(`[Manager ${managerId}] Error creating tasks from report:`, error);
  }
}

/**
 * Extracts actionable tasks from report, CEO responses, and standups using AI
 */
async function extractTasksFromReport(
  managerId: string,
  report: { id: string; content: string; title: string },
  ceoResponses: Array<{ response: string }>,
  standups: Array<{ transcript: string }>,
  directReportIds: string[]
): Promise<Array<{ id?: string; title: string; description: string; assignedTo: string | null; priority: "low" | "medium" | "high" | "critical" }>> {
  "use step";

  try {
    // Get direct reports for assignment suggestions
    const directReports = await db
      .select()
      .from(employees)
      .where(inArray(employees.id, directReportIds));

    const directReportInfo = directReports.map((dr) => `${dr.id}: ${dr.name} (${dr.skills.join(", ")})`).join("\n");

    const ceoResponseText = ceoResponses.length > 0
      ? ceoResponses.map((r) => r.response).join("\n\n")
      : "No CEO responses yet";

    const standupText = standups.length > 0
      ? standups.map((s) => s.transcript.substring(0, 300)).join("\n\n---\n\n")
      : "No standup meetings";

    const prompt = `You are a manager analyzing a report, CEO feedback, and standup meetings to create actionable tasks.

Report Title: ${report.title}
Report Content:
${report.content.substring(0, 2000)}

CEO Responses:
${ceoResponseText.substring(0, 1000)}

Standup Meetings:
${standupText.substring(0, 1500)}

Available Team Members:
${directReportInfo}

Extract actionable tasks from:
1. CEO directives and questions
2. Action items mentioned in standups
3. Follow-up work needed from the report
4. Blockers that need to be addressed

For each task, determine:
- Clear title and description
- Priority (low, medium, high, critical)
- Which team member should be assigned (use their ID, or null if unassigned)

Return a JSON array:
[
  {
    "title": "task title",
    "description": "detailed description",
    "assignedTo": "employeeId or null",
    "priority": "low" | "medium" | "high" | "critical"
  }
]

Only create tasks that are truly actionable and necessary.`;

    const model = getModelForManager(managerId);

    const result = await generateText({
      model: model as never,
      prompt,
    });

    // Track cost
    await trackAICost(result, {
      employeeId: managerId,
      taskId: null,
      model: model,
      operation: "task_extraction_from_report",
    });

    // Parse JSON response
    let text = result.text.trim();
    if (text.startsWith("```json")) {
      text = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (text.startsWith("```")) {
      text = text.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    const extractedTasks = JSON.parse(text) as Array<{
      title: string;
      description: string;
      assignedTo: string | null;
      priority: "low" | "medium" | "high" | "critical";
    }>;

    return extractedTasks;
  } catch (error) {
    console.error(`[Manager ${managerId}] Error extracting tasks:`, error);
    return [];
  }
}

