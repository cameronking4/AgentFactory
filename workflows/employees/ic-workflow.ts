import { defineHook, getWorkflowMetadata, fetch, sleep } from "workflow";
import { generateText } from "ai";
import { db } from "@/lib/db";
import { employees, tasks, deliverables, memories } from "@/lib/db/schema";
import { eq, and, sql, or } from "drizzle-orm";
import { icMeetingHook, icPingHook } from "@/workflows/shared/hooks";
import { managerEvaluationHook, type ManagerEvent } from "@/workflows/employees/manager-workflow";
import { trackAICost } from "@/lib/ai/cost-tracking";
import "dotenv/config";

// IC Workflow State
export interface ICState {
  employeeId: string; // Employee ID from database
  name: string;
  role: "ic";
  skills: string[];
  managerId: string | null;
  currentTasks: string[]; // Task IDs currently being worked on
  completedTasks: string[]; // Task IDs completed
  learnedSkills: string[]; // Skills learned through work
  collaborationHistory: CollaborationEvent[]; // History of collaborations
  reflectionInsights: ReflectionInsight[]; // Cumulative insights from reflection
  createdAt: string;
  lastActive: string;
}

export interface CollaborationEvent {
  type: "helped" | "received_help" | "shared_knowledge" | "collaborated";
  with: string; // Other employee ID
  taskId: string;
  timestamp: string;
  details: string;
}

export interface ReflectionInsight {
  taskId: string;
  insight: string;
  learnedSkills: string[];
  improvements: string[];
  timestamp: string;
}

// Events that IC workflow can receive
export type ICEvent =
  | { type: "newTask"; taskId: string }
  | { type: "taskAssigned"; taskId: string }
  | { type: "revisionRequested"; taskId: string; feedback: string } // Manager requested revision
  | { type: "getStatus" };

// Define hook for IC task assignments
export const icTaskHook = defineHook<ICEvent>();

// Initial state factory
export function createInitialICState(
  employeeId: string,
  name: string,
  skills: string[],
  managerId: string | null
): ICState {
  return {
    employeeId,
    name,
    role: "ic",
    skills,
    managerId,
    currentTasks: [],
    completedTasks: [],
    learnedSkills: [],
    collaborationHistory: [],
    reflectionInsights: [],
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  };
}

/**
 * IC Employee Workflow - Autonomous, cumulative, reflective task execution
 */
export async function icEmployeeWorkflow(initialState: ICState) {
  "use workflow";

  // Set up fetch for AI SDK (required for workflows)
  globalThis.fetch = fetch;

  const metadata = getWorkflowMetadata();
  const workflowRunId = metadata.workflowRunId;
  const employeeId = initialState.employeeId;

  console.log(
    `[IC ${employeeId}] Starting IC workflow (workflow: ${workflowRunId})`
  );

  // Initialize state - always rebuild from database for durability
  // This ensures state is always in sync with database, even after restarts
  const existingState = await getICState(employeeId);
  if (!existingState) {
    await setICState(employeeId, initialState);
  } else {
    // Update lastActive to indicate workflow is running
    await setICState(employeeId, {
      ...existingState,
      lastActive: new Date().toISOString(),
    });
  }

  // Create hooks for different event types
  const receiveTask = icTaskHook.create({
    token: `ic:${employeeId}:tasks`,
  });
  const receiveMeeting = icMeetingHook.create({
    token: `ic:${employeeId}:meetings`,
  });
  const receivePing = icPingHook.create({
    token: `ic:${employeeId}:pings`,
  });

  console.log(`[IC ${employeeId}] Hooks created`);

  // Main autonomous loop - both reactive and proactive
  while (true) {
    // Update lastActive timestamp to indicate workflow is running (for self-healing detection)
    const currentState = await getICState(employeeId);
    if (currentState) {
      await setICState(employeeId, {
        ...currentState,
        lastActive: new Date().toISOString(),
      });
    }

    // Proactive: Check for new tasks assigned to this IC (run first to pick up new work)
    // This ensures tasks are picked up even if notifications were missed
    await checkForNewTasks(employeeId);

    // Proactive: Execute current tasks autonomously
    await executeCurrentTasks(employeeId);

    // Proactive: Request work from manager if no current tasks
    await requestWorkFromManager(employeeId);

    // Proactive: Help peers with blockers
    await checkAndHelpPeers(employeeId);

    // Proactive: Reflect on completed work and learn
    await reflectOnWork(employeeId);

    // Proactive: Identify and create improvement tasks
    await identifyImprovements(employeeId);

    // Reactive: Process one task event if available (non-blocking check)
    // Use a timeout to allow proactive checks to continue
    const taskEventPromise = (async () => {
      for await (const event of receiveTask) {
        return event; // Return first event
      }
    })();

    const meetingEventPromise = (async () => {
      for await (const meeting of receiveMeeting) {
        return meeting; // Return first meeting
      }
    })();

    const pingEventPromise = (async () => {
      for await (const ping of receivePing) {
        return ping; // Return first ping
      }
    })();

    // Wait for any reactive event or timeout (5 seconds)
    type ReactiveEventResult =
      | { type: "task"; event: ICEvent }
      | { type: "meeting"; meeting: import("@/workflows/shared/hooks").ICMeetingEvent }
      | { type: "ping"; ping: import("@/workflows/shared/hooks").ICPingEvent }
      | { type: "timeout" };

    // Use built-in sleep() from workflow package
    const timeoutPromise = sleep("5s").then(() => ({ type: "timeout" as const }));

    const result = (await Promise.race([
      taskEventPromise.then((event) => ({ type: "task" as const, event })),
      meetingEventPromise.then((meeting) => ({ type: "meeting" as const, meeting })),
      pingEventPromise.then((ping) => ({ type: "ping" as const, ping })),
      timeoutPromise,
    ])) as ReactiveEventResult;

    // Process the event if one was received
    if (result.type !== "timeout") {
      try {
        if (result.type === "task") {
          console.log(`[IC ${employeeId}] Received task event:`, result.event);
          if (result.event.type === "newTask" || result.event.type === "taskAssigned") {
            await handleNewTask(employeeId, result.event.taskId);
          } else if (result.event.type === "revisionRequested") {
            await handleRevisionRequest(employeeId, result.event.taskId, result.event.feedback);
          }
        } else if (result.type === "meeting") {
          await attendMeeting(employeeId, result.meeting);
        } else if (result.type === "ping") {
          await respondToPing(employeeId, result.ping);
        }
      } catch (err) {
        console.error(`[IC ${employeeId}] Error processing reactive event:`, err);
      }
    }
  }
}

/**
 * Handles a new task assigned to this IC
 */
async function handleNewTask(employeeId: string, taskId: string) {
  "use step";

  console.log(`[IC ${employeeId}] Handling new task: ${taskId}`);

  try {
    // Get task from database
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) {
      console.error(`[IC ${employeeId}] Task ${taskId} not found`);
      return;
    }

    // Check if this is a high-level task (no parent) that needs breakdown
    if (!task.parentTaskId) {
      // Check if subtasks already exist
      const existingSubtasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.parentTaskId, taskId));

      if (existingSubtasks.length === 0) {
        // Break down the high-level task
        await breakDownTask(employeeId, task);
      } else {
        console.log(
          `[IC ${employeeId}] Task ${taskId} already has ${existingSubtasks.length} subtasks`
        );
      }
    }

    // Add to current tasks
    const state = await getICState(employeeId);
    if (state && !state.currentTasks.includes(taskId)) {
      await setICState(employeeId, {
        ...state,
        currentTasks: [...state.currentTasks, taskId],
        lastActive: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error(`[IC ${employeeId}] Error handling new task:`, error);
  }
}

/**
 * Handles a revision request from manager
 */
async function handleRevisionRequest(
  employeeId: string,
  taskId: string,
  feedback: string
) {
  "use step";

  console.log(`[IC ${employeeId}] Handling revision request for task: ${taskId}`);

  try {
    // Get task from database
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) {
      console.error(`[IC ${employeeId}] Task ${taskId} not found`);
      return;
    }

    // Store revision feedback in memory
    const state = await getICState(employeeId);
    if (state) {
      await db.insert(memories).values({
        employeeId: employeeId,
        type: "task",
        content: `Revision requested for task "${task.title}". Manager feedback: ${feedback}`,
        importance: "0.8",
      });

      // Add task back to current tasks if not already there
      if (!state.currentTasks.includes(taskId)) {
        await setICState(employeeId, {
          ...state,
          currentTasks: [...state.currentTasks, taskId],
          lastActive: new Date().toISOString(),
        });
      }
    }

    // Task status should already be "in-progress" from manager workflow
    // IC will pick it up in the next execution cycle
    console.log(`[IC ${employeeId}] Revision request processed for task ${taskId}`);
  } catch (error) {
    console.error(`[IC ${employeeId}] Error handling revision request:`, error);
  }
}

/**
 * Breaks down a high-level task into subtasks using AI
 */
async function breakDownTask(
  employeeId: string,
  task: { id: string; title: string; description: string; parentTaskId: string | null }
) {
  "use step";

  console.log(`[IC ${employeeId}] Breaking down task: ${task.title}`);

  try {
    // Get IC's state and skills
    const state = await getICState(employeeId);
    if (!state) {
      console.error(`[IC ${employeeId}] State not found`);
      return;
    }

    // Get employee record for persona
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    const persona = employee?.persona || "";

    // Get all ICs working on this task (or available ICs)
    const allICs = await db
      .select()
      .from(employees)
      .where(and(eq(employees.role, "ic"), eq(employees.status, "active")));

    // Get ICs' memories for context
    const icMemories = await db
      .select()
      .from(memories)
      .where(eq(memories.employeeId, employeeId))
      .orderBy(sql`${memories.createdAt} DESC`)
      .limit(10);

    const recentContext = icMemories
      .map((m) => m.content)
      .join("\n")
      .substring(0, 1000);

    // Use AI to break down the task
    const prompt = `You are an autonomous IC employee breaking down a high-level task into actionable subtasks.

${persona ? `Your Persona: ${persona}\n\n` : ""}Your Skills: ${state.skills.join(", ")}
Your Learned Skills: ${state.learnedSkills.join(", ") || "None yet"}
Recent Context: ${recentContext || "No recent context"}

Task Title: ${task.title}
Task Description: ${task.description}

Available Team Members: ${allICs.map((ic) => `${ic.name} (${ic.skills.join(", ")})`).join(", ")}

Break down this task into detailed, actionable subtasks. Consider:
1. Dependencies between subtasks
2. Skills required for each subtask
3. Which team member would be best suited (based on skills)
4. Estimated complexity
5. Prerequisites

Respond in JSON format:
{
  "subtasks": [
    {
      "title": "subtask title",
      "description": "detailed description",
      "skills": ["skill1", "skill2"],
      "assignedTo": "employee-id or null for self-assignment",
      "priority": "low" | "medium" | "high" | "critical",
      "dependencies": ["subtask-title-1", "subtask-title-2"],
      "estimatedComplexity": "low" | "medium" | "high"
    }
  ],
  "reasoning": "explanation of breakdown strategy"
}`;

    const result = await generateText({
      model: "openai/gpt-4.1" as never,
      prompt,
    });

    // Track cost
    await trackAICost(result, {
      employeeId,
      taskId: task.id,
      model: "openai/gpt-4.1",
      operation: "task_breakdown",
    });

    // Parse breakdown
    let text = result.text.trim();
    if (text.startsWith("```json")) {
      text = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (text.startsWith("```")) {
      text = text.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    const breakdown = JSON.parse(text) as {
      subtasks: Array<{
        title: string;
        description: string;
        skills: string[];
        assignedTo: string | null;
        priority: "low" | "medium" | "high" | "critical";
        dependencies: string[];
        estimatedComplexity: "low" | "medium" | "high";
      }>;
      reasoning: string;
    };

    console.log(
      `[IC ${employeeId}] Generated ${breakdown.subtasks.length} subtasks. Reasoning: ${breakdown.reasoning}`
    );

    // Create subtasks in database
    const createdSubtasks: string[] = [];
    for (const subtask of breakdown.subtasks) {
      // Find employee to assign to (or use self)
      let assignedToId: string | null = null;
      if (subtask.assignedTo) {
        const [assignedIC] = allICs.filter((ic) => ic.id === subtask.assignedTo);
        if (assignedIC) {
          assignedToId = assignedIC.id;
        }
      }

      // If no assignment or assigned IC not found, assign to self
      if (!assignedToId) {
        assignedToId = employeeId;
      }

      const [createdSubtask] = await db
        .insert(tasks)
        .values({
          parentTaskId: task.id,
          title: subtask.title,
          description: subtask.description,
          assignedTo: assignedToId,
          status: "pending",
          priority: subtask.priority,
        })
        .returning();

      createdSubtasks.push(createdSubtask.id);

      // Notify assigned IC if different from current IC
      if (assignedToId !== employeeId) {
        try {
          await icTaskHook.resume(`ic:${assignedToId}:tasks`, {
            type: "taskAssigned",
            taskId: createdSubtask.id,
          });
        } catch (hookError) {
          console.warn(
            `[IC ${employeeId}] Could not notify IC ${assignedToId}:`,
            hookError
          );
        }
      }

      console.log(
        `[IC ${employeeId}] Created subtask: ${subtask.title} (assigned to: ${assignedToId})`
      );
    }

    // Store breakdown in memory
    await db.insert(memories).values({
      employeeId: employeeId,
      type: "task",
      content: `Broke down task "${task.title}" into ${breakdown.subtasks.length} subtasks. ${breakdown.reasoning}`,
      importance: "0.8",
    });

    console.log(
      `[IC ${employeeId}] Successfully broke down task into ${createdSubtasks.length} subtasks`
    );
  } catch (error) {
    console.error(`[IC ${employeeId}] Error breaking down task:`, error);
  }
}

/**
 * Proactively checks for new tasks assigned to this IC
 * This is the key autonomous behavior - ICs automatically pick up work assigned to them
 * even if they missed notifications or restarted
 */
async function checkForNewTasks(employeeId: string) {
  "use step";

  try {
    const state = await getICState(employeeId);
    if (!state) return;

    // Get ALL tasks assigned to this IC that are pending or in-progress
    // This ensures we pick up tasks even if they were assigned while workflow was down
    const assignedTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.assignedTo, employeeId),
          or(
            eq(tasks.status, "pending"),
            eq(tasks.status, "in-progress")
          )
        )
      );

    // Add any tasks not already in currentTasks
    for (const task of assignedTasks) {
      if (!state.currentTasks.includes(task.id)) {
        console.log(
          `[IC ${employeeId}] Autonomously discovered new task: ${task.id} - ${task.title} (status: ${task.status})`
        );
        await handleNewTask(employeeId, task.id);
      }
    }

    // Also check for tasks that are in currentTasks but might have been completed
    // and remove them from currentTasks if they're done
    const updatedState = await getICState(employeeId);
    if (updatedState) {
      const activeTaskIds = new Set(assignedTasks.map((t) => t.id));
      const tasksToRemove = updatedState.currentTasks.filter(
        (taskId) => !activeTaskIds.has(taskId)
      );

      if (tasksToRemove.length > 0) {
        await setICState(employeeId, {
          ...updatedState,
          currentTasks: updatedState.currentTasks.filter(
            (taskId) => !tasksToRemove.includes(taskId)
          ),
          lastActive: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    console.error(`[IC ${employeeId}] Error checking for new tasks:`, error);
  }
}

/**
 * Requests work from manager if IC has no current tasks
 */
async function requestWorkFromManager(employeeId: string) {
  "use step";

  try {
    const state = await getICState(employeeId);
    if (!state || !state.managerId) return;

    // Only check occasionally (not every loop) - 5% chance per loop
    if (Math.random() > 0.05) return;

    // Check if IC has any current tasks
    if (state.currentTasks.length > 0) return; // Already has work

    // Check database for any pending/in-progress tasks assigned to this IC
    const assignedTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.assignedTo, employeeId),
          or(eq(tasks.status, "pending"), eq(tasks.status, "in-progress"))
        )
      );

    if (assignedTasks.length > 0) return; // Has tasks in DB, will be picked up by checkForNewTasks

    // No current tasks - request work from manager
    console.log(`[IC ${employeeId}] No current tasks, requesting work from manager ${state.managerId}`);

    try {
      await managerEvaluationHook.resume(`manager:${state.managerId}`, {
        type: "requestWork",
        icId: employeeId,
      });
    } catch (hookError) {
      // Manager workflow might not be running, that's okay
      console.warn(`[IC ${employeeId}] Could not request work from manager:`, hookError);
    }
  } catch (error) {
    console.error(`[IC ${employeeId}] Error requesting work from manager:`, error);
  }
}

/**
 * Executes current tasks autonomously
 */
async function executeCurrentTasks(employeeId: string) {
  "use step";

  try {
    const state = await getICState(employeeId);
    if (!state) return;

    // Get tasks that are ready to execute (no dependencies or dependencies complete)
    for (const taskId of state.currentTasks) {
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

      if (!task) continue;

      // Skip if already completed
      if (task.status === "completed" || task.status === "reviewed") {
        continue;
      }

      // For now, allow parallel execution of subtasks
      // TODO: Implement proper dependency tracking based on task breakdown analysis
      // Subtasks can often be executed in parallel unless explicitly marked as dependent

      // Execute the task
      if (task.status === "pending") {
        await db
          .update(tasks)
          .set({
            status: "in-progress",
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, taskId));
      }

      await executeTask(employeeId, task);
    }
  } catch (error) {
    console.error(`[IC ${employeeId}] Error executing current tasks:`, error);
  }
}

/**
 * Executes a single task and creates deliverables
 */
async function executeTask(
  employeeId: string,
  task: { id: string; title: string; description: string; parentTaskId: string | null }
) {
  "use step";

  console.log(`[IC ${employeeId}] Executing task: ${task.title}`);

  try {
    const state = await getICState(employeeId);
    if (!state) return;

    // Get employee record for persona
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    const persona = employee?.persona || "";

    // Get context from memories
    const relevantMemories = await db
      .select()
      .from(memories)
      .where(eq(memories.employeeId, employeeId))
      .orderBy(sql`${memories.createdAt} DESC`)
      .limit(20);

    const context = relevantMemories
      .map((m) => m.content)
      .join("\n")
      .substring(0, 2000);

    // Get parent task context if this is a subtask
    let parentContext = "";
    if (task.parentTaskId) {
      const [parentTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, task.parentTaskId))
        .limit(1);
      if (parentTask) {
        parentContext = `Parent Task: ${parentTask.title}\n${parentTask.description}\n\n`;
      }
    }

    // Check if this is a revision (task was previously completed)
    const isRevision = state.completedTasks.includes(task.id);
    let revisionFeedback = "";
    if (isRevision) {
      // Get feedback from the latest deliverable
      const taskDeliverables = await db
        .select()
        .from(deliverables)
        .where(eq(deliverables.taskId, task.id))
        .orderBy(sql`${deliverables.createdAt} DESC`)
        .limit(1);
      
      if (taskDeliverables.length > 0 && taskDeliverables[0].feedback) {
        revisionFeedback = `\n\n⚠️ REVISION REQUESTED - Manager Feedback:\n${taskDeliverables[0].feedback}\n\nPlease address the feedback and improve the deliverable.`;
      }
    }

    // Use AI to execute the task
    const prompt = `You are an autonomous IC employee executing a task. Use your skills, learned knowledge, and context to complete this task.

${persona ? `Your Persona: ${persona}\n\n` : ""}Your Skills: ${state.skills.join(", ")}
Your Learned Skills: ${state.learnedSkills.join(", ") || "None yet"}
Your Reflection Insights: ${state.reflectionInsights.map((i) => i.insight).join("; ").substring(0, 500) || "None yet"}

${parentContext}Task: ${task.title}
Description: ${task.description}
${revisionFeedback}

Relevant Context from Past Work:
${context || "No relevant context yet"}

Execute this task and produce a deliverable. The deliverable should be:
- Complete and ready for use
- Well-documented
- Following best practices
- Aligned with the parent task goals
${isRevision ? "- Address all feedback from the manager" : ""}

Respond with a JSON object:
{
  "deliverable": {
    "type": "code" | "document" | "config" | "text",
    "content": "the actual deliverable content (code, documentation, etc.)"
  },
  "summary": "brief summary of what was accomplished",
  "learnedSkills": ["skill1", "skill2"],
  "improvements": ["improvement1", "improvement2"]
}`;

    const result = await generateText({
      model: "openai/gpt-4.1" as never,
      prompt,
    });

    // Track cost
    await trackAICost(result, {
      employeeId,
      taskId: task.id,
      model: "openai/gpt-4.1",
      operation: "task_execution",
    });

    // Parse execution result
    let text = result.text.trim();
    if (text.startsWith("```json")) {
      text = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (text.startsWith("```")) {
      text = text.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    const execution = JSON.parse(text) as {
      deliverable: {
        type: "code" | "document" | "config" | "text";
        content: string;
      };
      summary: string;
      learnedSkills: string[];
      improvements: string[];
    };

    // Create deliverable
    const [deliverable] = await db
      .insert(deliverables)
      .values({
        taskId: task.id,
        type: execution.deliverable.type,
        content: execution.deliverable.content,
        createdBy: employeeId,
      })
      .returning();

    console.log(
      `[IC ${employeeId}] Created deliverable ${deliverable.id} for task ${task.id}`
    );

    // Mark task as completed
    await db
      .update(tasks)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id));

    // Update learned skills
    const newSkills = execution.learnedSkills.filter(
      (skill) => !state.learnedSkills.includes(skill)
    );
    if (newSkills.length > 0) {
      await setICState(employeeId, {
        ...state,
        learnedSkills: [...state.learnedSkills, ...newSkills],
        completedTasks: [...state.completedTasks, task.id],
        currentTasks: state.currentTasks.filter((id) => id !== task.id),
        lastActive: new Date().toISOString(),
      });
    } else {
      await setICState(employeeId, {
        ...state,
        completedTasks: [...state.completedTasks, task.id],
        currentTasks: state.currentTasks.filter((id) => id !== task.id),
        lastActive: new Date().toISOString(),
      });
    }

    // Store in memory
    await db.insert(memories).values({
      employeeId: employeeId,
      type: "task",
      content: `Completed task "${task.title}". ${execution.summary}. Learned: ${execution.learnedSkills.join(", ") || "nothing new"}`,
      importance: "0.7",
    });

    // Request manager evaluation
    if (state.managerId) {
      try {
        await managerEvaluationHook.resume(`manager:${state.managerId}`, {
          type: "evaluateDeliverable",
          deliverableId: deliverable.id,
          taskId: task.id,
        });
        console.log(
          `[IC ${employeeId}] Requested evaluation from manager ${state.managerId}`
        );
      } catch (hookError) {
        console.warn(
          `[IC ${employeeId}] Could not request manager evaluation:`,
          hookError
        );
      }
    }

    console.log(`[IC ${employeeId}] Task ${task.id} completed successfully`);
  } catch (error) {
    console.error(`[IC ${employeeId}] Error executing task:`, error);
  }
}

/**
 * Proactively helps peers with blockers
 */
async function checkAndHelpPeers(employeeId: string) {
  "use step";

  try {
    const state = await getICState(employeeId);
    if (!state) return;

    // Get peers with blocked tasks (in-progress for a while, no recent updates)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const blockedTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, "in-progress"),
          sql`${tasks.updatedAt} < ${oneHourAgo.toISOString()}`,
          sql`${tasks.assignedTo} != ${employeeId}`
        )
      )
      .limit(5);

    for (const task of blockedTasks) {
      if (!task.assignedTo) continue;

      // Check if I can help based on skills
      const [peer] = await db
        .select()
        .from(employees)
        .where(eq(employees.id, task.assignedTo))
        .limit(1);

      if (!peer) continue;

      // Check skill overlap
      const skillOverlap = state.skills.filter((skill) =>
        peer.skills.includes(skill)
      );

      if (skillOverlap.length > 0) {
        // Offer help via ping
        try {
          await icPingHook.resume(`ic:${task.assignedTo}:pings`, {
            type: "receivePing",
            pingId: `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
            from: employeeId,
            message: `I noticed you're working on "${task.title}". I have skills in ${skillOverlap.join(", ")}. Can I help?`,
          });

          // Record collaboration
          await setICState(employeeId, {
            ...state,
            collaborationHistory: [
              ...state.collaborationHistory,
              {
                type: "helped",
                with: task.assignedTo,
                taskId: task.id,
                timestamp: new Date().toISOString(),
                details: `Offered help on task "${task.title}"`,
              },
            ],
            lastActive: new Date().toISOString(),
          });

          console.log(
            `[IC ${employeeId}] Offered help to ${task.assignedTo} on task ${task.id}`
          );
        } catch (pingError) {
          console.warn(`[IC ${employeeId}] Could not send ping:`, pingError);
        }
      }
    }
  } catch (error) {
    console.error(`[IC ${employeeId}] Error checking and helping peers:`, error);
  }
}

/**
 * Reflects on completed work and extracts insights
 */
async function reflectOnWork(employeeId: string) {
  "use step";

  try {
    const state = await getICState(employeeId);
    if (!state) return;

    // Get recently completed tasks that haven't been reflected on
    const recentCompleted = state.completedTasks.filter(
      (taskId) =>
        !state.reflectionInsights.some((insight) => insight.taskId === taskId)
    );

    if (recentCompleted.length === 0) return;

    // Reflect on the most recent completed task
    const taskId = recentCompleted[0];
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) return;

    // Get deliverables for this task
    const taskDeliverables = await db
      .select()
      .from(deliverables)
      .where(eq(deliverables.taskId, taskId));

    // Get evaluation feedback if available
    const evaluatedDeliverable = taskDeliverables.find(
      (d) => d.evaluatedBy && d.evaluationScore
    );

    // Get employee record for persona
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    const persona = employee?.persona || "";

    // Use AI to reflect
    const prompt = `You are an autonomous IC employee reflecting on completed work to improve future performance.

${persona ? `Your Persona: ${persona}\n\n` : ""}Task: ${task.title}
Description: ${task.description}
Deliverables Created: ${taskDeliverables.length}
Evaluation Score: ${evaluatedDeliverable?.evaluationScore || "Not yet evaluated"}/10

Your Current Skills: ${state.skills.join(", ")}
Your Learned Skills: ${state.learnedSkills.join(", ") || "None yet"}
Previous Insights: ${state.reflectionInsights.map((i) => i.insight).join("; ").substring(0, 500) || "None yet"}

Reflect on this work and extract:
1. Key insights about what worked well
2. What could be improved
3. New skills or knowledge gained
4. Patterns or best practices discovered
5. How this connects to previous work

Respond in JSON:
{
  "insight": "main insight or learning",
  "learnedSkills": ["skill1", "skill2"],
  "improvements": ["improvement1", "improvement2"],
  "connections": "how this connects to previous work"
}`;

    const result = await generateText({
      model: "openai/gpt-4.1" as never,
      prompt,
    });

    // Track cost
    await trackAICost(result, {
      employeeId,
      taskId: taskId,
      model: "openai/gpt-4.1",
      operation: "reflection",
    });

    let text = result.text.trim();
    if (text.startsWith("```json")) {
      text = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (text.startsWith("```")) {
      text = text.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    const reflection = JSON.parse(text) as {
      insight: string;
      learnedSkills: string[];
      improvements: string[];
      connections: string;
    };

    // Store reflection
    const newInsight: ReflectionInsight = {
      taskId: taskId,
      insight: reflection.insight,
      learnedSkills: reflection.learnedSkills,
      improvements: reflection.improvements,
      timestamp: new Date().toISOString(),
    };

    // Update learned skills
    const newSkills = reflection.learnedSkills.filter(
      (skill) => !state.learnedSkills.includes(skill)
    );

    await setICState(employeeId, {
      ...state,
      reflectionInsights: [...state.reflectionInsights, newInsight],
      learnedSkills: newSkills.length > 0
        ? [...state.learnedSkills, ...newSkills]
        : state.learnedSkills,
      lastActive: new Date().toISOString(),
    });

    // Store reflection in memory
    await db.insert(memories).values({
      employeeId: employeeId,
      type: "learning",
      content: `Reflection on "${task.title}": ${reflection.insight}. Connections: ${reflection.connections}`,
      importance: "0.9",
    });

    console.log(`[IC ${employeeId}] Reflected on task ${taskId}: ${reflection.insight}`);
  } catch (error) {
    console.error(`[IC ${employeeId}] Error reflecting on work:`, error);
  }
}

/**
 * Identifies improvements and creates tasks proactively
 */
async function identifyImprovements(employeeId: string) {
  "use step";

  try {
    const state = await getICState(employeeId);
    if (!state) return;

    // Only check occasionally (not every loop)
    if (Math.random() > 0.1) return; // 10% chance per loop

    // Get recent reflections
    const recentInsights = state.reflectionInsights
      .slice(-5)
      .map((i) => i.improvements)
      .flat();

    if (recentInsights.length === 0) return;

    // Get employee record for persona
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    const persona = employee?.persona || "";

    // Use AI to identify actionable improvements
    const prompt = `You are an autonomous IC employee identifying improvements based on reflections.

${persona ? `Your Persona: ${persona}\n\n` : ""}Recent Improvement Ideas: ${recentInsights.join("; ")}

Your Skills: ${state.skills.join(", ")}
Your Learned Skills: ${state.learnedSkills.join(", ") || "None yet"}

Identify 1-2 actionable improvement tasks that would:
1. Build on your recent learnings
2. Address identified improvements
3. Leverage your skills
4. Add value to the team

Respond in JSON:
{
  "improvements": [
    {
      "title": "task title",
      "description": "detailed description",
      "priority": "low" | "medium" | "high"
    }
  ]
}`;

    const result = await generateText({
      model: "openai/gpt-4.1" as never,
      prompt,
    });

    // Track cost
    await trackAICost(result, {
      employeeId,
      taskId: null, // No specific task for improvement identification
      model: "openai/gpt-4.1",
      operation: "improvement_identification",
    });

    let text = result.text.trim();
    if (text.startsWith("```json")) {
      text = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (text.startsWith("```")) {
      text = text.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    const improvements = JSON.parse(text) as {
      improvements: Array<{
        title: string;
        description: string;
        priority: "low" | "medium" | "high";
      }>;
    };

    // Create improvement tasks (self-assigned)
    for (const improvement of improvements.improvements) {
      const [newTask] = await db
        .insert(tasks)
        .values({
          title: improvement.title,
          description: improvement.description,
          assignedTo: employeeId,
          status: "pending",
          priority: improvement.priority,
        })
        .returning();

      console.log(
        `[IC ${employeeId}] Created improvement task: ${improvement.title}`
      );

      // Add to current tasks
      await setICState(employeeId, {
        ...state,
        currentTasks: [...state.currentTasks, newTask.id],
        lastActive: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error(`[IC ${employeeId}] Error identifying improvements:`, error);
  }
}

/**
 * Attends a meeting
 */
async function attendMeeting(
  employeeId: string,
  meeting: import("@/workflows/shared/hooks").ICMeetingEvent
) {
  "use step";

  console.log(`[IC ${employeeId}] Attending meeting: ${meeting.meetingId}`);

  try {
    // Store meeting attendance in memory
    await db.insert(memories).values({
      employeeId: employeeId,
      type: "meeting",
      content: `Attended ${meeting.meetingType} meeting ${meeting.meetingId}`,
      importance: "0.6",
    });
  } catch (error) {
    console.error(`[IC ${employeeId}] Error attending meeting:`, error);
  }
}

/**
 * Responds to a ping
 */
async function respondToPing(
  employeeId: string,
  ping: import("@/workflows/shared/hooks").ICPingEvent
) {
  "use step";

  try {
    const state = await getICState(employeeId);
    if (!state) return;

    if (ping.type === "receivePing") {
      console.log(`[IC ${employeeId}] Responding to ping from ${ping.from}`);

      // Store ping in memory
      await db.insert(memories).values({
        employeeId: employeeId,
        type: "interaction",
        content: `Received ping from ${ping.from}: ${ping.message}`,
        importance: "0.5",
      });

      // Record collaboration
      await setICState(employeeId, {
        ...state,
        collaborationHistory: [
          ...state.collaborationHistory,
          {
            type: "received_help",
            with: ping.from,
            taskId: "",
            timestamp: new Date().toISOString(),
            details: `Received ping: ${ping.message}`,
          },
        ],
        lastActive: new Date().toISOString(),
      });
    } else if (ping.type === "pingResponse") {
      // Handle ping response (when someone responds to our ping)
      console.log(`[IC ${employeeId}] Received ping response from ${ping.to}`);

      await db.insert(memories).values({
        employeeId: employeeId,
        type: "interaction",
        content: `Received response to ping: ${ping.response}`,
        importance: "0.5",
      });
    }
  } catch (error) {
    console.error(`[IC ${employeeId}] Error responding to ping:`, error);
  }
}

// State management functions
async function getICState(employeeId: string): Promise<ICState | null> {
  "use step";

  try {
    // Try to get from Redis cache first
    try {
      const cachedState = await redisGet(`ic:state:${employeeId}`);
      if (cachedState) {
        const parsed = JSON.parse(cachedState) as ICState;
        // Validate the cached state is still valid by checking if employee exists
        const [employee] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, employeeId))
          .limit(1);
        
        if (employee && employee.role === "ic") {
          // Update lastActive and return cached state
          parsed.lastActive = new Date().toISOString();
          return parsed;
        }
      }
    } catch (redisError) {
      // If Redis fails, fall back to database
      console.warn(`[IC ${employeeId}] Redis cache miss or error, falling back to database:`, redisError);
    }

    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    if (!employee || employee.role !== "ic") {
      return null;
    }

    // Get current tasks
    const currentTaskRecords = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.assignedTo, employeeId),
          or(eq(tasks.status, "pending"), eq(tasks.status, "in-progress"))
        )
      );

    // Get completed tasks
    const completedTaskRecords = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.assignedTo, employeeId),
          or(eq(tasks.status, "completed"), eq(tasks.status, "reviewed"))
        )
      );

    // Get memories for learned skills extraction
    const learningMemories = await db
      .select()
      .from(memories)
      .where(
        and(eq(memories.employeeId, employeeId), eq(memories.type, "learning"))
      );

    // Extract learned skills from memories (simplified - in production would use AI)
    const learnedSkills: string[] = [];
    for (const memory of learningMemories) {
      const learnedMatch = memory.content.match(/Learned: ([^.]*)/);
      if (learnedMatch) {
        const skills = learnedMatch[1].split(",").map((s) => s.trim());
        learnedSkills.push(...skills);
      }
    }

    const state: ICState = {
      employeeId,
      name: employee.name,
      role: "ic",
      skills: employee.skills,
      managerId: employee.managerId,
      currentTasks: currentTaskRecords.map((t) => t.id),
      completedTasks: completedTaskRecords.map((t) => t.id),
      learnedSkills: Array.from(new Set(learnedSkills)),
      collaborationHistory: [], // Would be stored in DB in production
      reflectionInsights: [], // Would be stored in DB in production
      createdAt: employee.createdAt.toISOString(),
      lastActive: new Date().toISOString(),
    };

    // Cache in Redis (expires in 1 hour)
    try {
      await redisSet(`ic:state:${employeeId}`, JSON.stringify(state), { ex: 3600 });
    } catch (redisError) {
      // Non-fatal - continue even if Redis caching fails
      console.warn(`[IC ${employeeId}] Failed to cache state in Redis:`, redisError);
    }

    return state;
  } catch (error) {
    console.error(`Error getting IC state:`, error);
    return null;
  }
}

async function setICState(employeeId: string, state: ICState): Promise<void> {
  "use step";

  try {
    // Update lastActive timestamp
    const updatedState: ICState = {
      ...state,
      lastActive: new Date().toISOString(),
    };

    // Store in Redis cache (expires in 1 hour)
    try {
      await redisSet(`ic:state:${employeeId}`, JSON.stringify(updatedState), { ex: 3600 });
    } catch (redisError) {
      // Non-fatal - continue even if Redis caching fails
      console.warn(`[IC ${employeeId}] Failed to cache state in Redis:`, redisError);
    }

    // Update employee's updatedAt timestamp to indicate workflow is active
    // This is used by HR workflow's self-healing mechanism to detect if workflow is running
    await db
      .update(employees)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employeeId));

    // State is also stored in database (employees, tasks, memories tables)
    // The database is the source of truth, Redis is just for fast access
    // collaborationHistory and reflectionInsights would be stored in DB in production
  } catch (error) {
    console.error(`[IC ${employeeId}] Error setting IC state:`, error);
    // Don't throw - state management should be resilient
  }
}

