import { defineHook, getWorkflowMetadata, fetch } from "workflow";
import { generateText } from "ai";
import { db } from "@/lib/db";
import { employees, tasks, deliverables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

  // Event loop: process evaluation requests
  for await (const event of receiveEvaluation) {
    try {
      console.log(`[Manager ${managerId}] Received event:`, event);

      switch (event.type) {
        case "evaluateDeliverable":
          await handleEvaluateDeliverable(managerId, event.deliverableId, event.taskId);
          break;
        case "evaluateTask":
          await handleEvaluateTask(managerId, event.taskId);
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

      // Update last active (state is stored in DB, no need to update here)
    } catch (err) {
      console.error(`[Manager ${managerId}] Error processing event:`, err);
      // Continue processing events even if one fails
    }
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

    // Update task status based on evaluation
    if (evaluation.score >= 7) {
      // High score - mark task as reviewed/approved
      await db
        .update(tasks)
        .set({
          status: "reviewed",
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));
      console.log(
        `[Manager ${managerId}] High score (${evaluation.score}/10) - task marked as reviewed`
      );
    } else {
      // Low score - keep as completed but may need revision
      // In full implementation, could create a revision task
      console.log(
        `[Manager ${managerId}] Low score (${evaluation.score}/10) - may need revision`
      );
    }

    // State is stored in database, no need to update in-memory state

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

