import { defineHook, getWorkflowMetadata, fetch } from "workflow";
import { generateText } from "ai";
import { db } from "@/lib/db";
import { employees, tasks, deliverables, memories } from "@/lib/db/schema";
import { eq, and, sql, or } from "drizzle-orm";
import { icMeetingHook, icPingHook } from "@/workflows/shared/hooks";
import { managerEvaluationHook } from "@/workflows/employees/manager-workflow";
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

  // Initialize state
  const existingState = await getICState(employeeId);
  if (!existingState) {
    await setICState(employeeId, initialState);
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
    // Proactive: Check for new tasks assigned to this IC (run first to pick up new work)
    await checkForNewTasks(employeeId);

    // Proactive: Execute current tasks autonomously
    await executeCurrentTasks(employeeId);

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

    const result = (await Promise.race([
      taskEventPromise.then((event) => ({ type: "task" as const, event })),
      meetingEventPromise.then((meeting) => ({ type: "meeting" as const, meeting })),
      pingEventPromise.then((ping) => ({ type: "ping" as const, ping })),
      new Promise<{ type: "timeout" }>((resolve) =>
        setTimeout(() => resolve({ type: "timeout" }), 5000)
      ),
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

Your Skills: ${state.skills.join(", ")}
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
 */
async function checkForNewTasks(employeeId: string) {
  "use step";

  try {
    const state = await getICState(employeeId);
    if (!state) return;

    // Get tasks assigned to this IC that are not in current tasks
    const newTasks = await db
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

    for (const task of newTasks) {
      if (!state.currentTasks.includes(task.id)) {
        console.log(`[IC ${employeeId}] Found new task: ${task.id} - ${task.title}`);
        await handleNewTask(employeeId, task.id);
      }
    }
  } catch (error) {
    console.error(`[IC ${employeeId}] Error checking for new tasks:`, error);
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

Your Skills: ${state.skills.join(", ")}
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

    // Use AI to reflect
    const prompt = `You are an autonomous IC employee reflecting on completed work to improve future performance.

Task: ${task.title}
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

    // Use AI to identify actionable improvements
    const prompt = `You are an autonomous IC employee identifying improvements based on reflections.

Recent Improvement Ideas: ${recentInsights.join("; ")}

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

    return {
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
  } catch (error) {
    console.error(`Error getting IC state:`, error);
    return null;
  }
}

async function setICState(employeeId: string, _state: ICState): Promise<void> {
  "use step";

  try {
    // Update employee's updatedAt timestamp
    await db
      .update(employees)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employeeId));

    // State is primarily stored in database (employees, tasks, memories tables)
    // In production, would use Redis or dedicated state table for collaborationHistory and reflectionInsights
  } catch (error) {
    console.error(`Error setting IC state:`, error);
  }
}

