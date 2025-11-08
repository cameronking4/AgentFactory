import { defineHook, getWorkflowMetadata, fetch } from "workflow";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { db } from "@/lib/db";
import { employees, tasks, memories, costs } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { start } from "workflow/api";
import "dotenv/config";

// HR Workflow State
export interface HRState {
  hrId: string;
  activeTasks: string[]; // Task IDs being processed
  hiredEmployees: string[]; // Employee IDs hired by this HR instance
  createdAt: string;
  lastActive: string;
}

// Events that HR workflow can receive
export type HREvent =
  | { type: "newTask"; taskId: string; taskTitle: string; taskDescription: string }
  | { type: "hireEmployee"; role: "ic" | "manager"; skills: string[]; name: string }
  | { type: "getStatus" };

// Define hooks for type safety
export const hrTaskHook = defineHook<HREvent>();

// Initial state factory
export function createInitialHRState(): HRState {
  return {
    hrId: "", // Will be set from workflowRunId
    activeTasks: [],
    hiredEmployees: [],
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  };
}

/**
 * HR Workflow - Receives high-level tasks, plans employee creation, and hires ICs
 */
export async function hrWorkflow(initialState: HRState) {
  "use workflow";

  // Set up fetch for AI SDK (required for workflows)
  globalThis.fetch = fetch;

  // Get workflow metadata to use as HR ID
  const metadata = getWorkflowMetadata();
  const hrId = metadata.workflowRunId;

  console.log(`[HR ${hrId}] Starting HR workflow`);

  // Initialize state
  const existingState = await getHRState(hrId);
  if (!existingState) {
    const newState = { ...initialState, hrId };
    await setHRState(hrId, newState);
  }

  // Create hook for receiving tasks and events
  const receiveEvent = hrTaskHook.create({
    token: `hr:${hrId}`,
  });

  console.log(`[HR ${hrId}] Hook created with token: hr:${hrId}`);

  // Event loop: process events sequentially
  for await (const event of receiveEvent) {
    try {
      console.log(`[HR ${hrId}] Received event:`, event);

      const state = await getHRState(hrId);

      switch (event.type) {
        case "newTask":
          await handleNewTask(hrId, event);
          break;
        case "hireEmployee":
          await handleHireEmployee(hrId, event);
          break;
        case "getStatus":
          // Just return current state
          break;
      }

      // Update last active
      const updatedState = await getHRState(hrId);
      await setHRState(hrId, {
        ...updatedState,
        lastActive: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[HR ${hrId}] Error processing event:`, err);
      // Continue processing events even if one fails
    }
  }
}

/**
 * Handles a new high-level task from CEO
 */
async function handleNewTask(hrId: string, event: { taskId: string; taskTitle: string; taskDescription: string }) {
  "use step";

  console.log(`[HR ${hrId}] Processing new task: ${event.taskId}`);

  // 1. Analyze the task
  const plan = await analyzeTask(event.taskTitle, event.taskDescription);

  // 2. Determine IC requirements
  const icRequirements = await determineICRequirements(plan);

  // 3. Find or hire ICs (reuse existing when possible)
  const assignedEmployeeIds: string[] = [];
  for (const requirement of icRequirements) {
    // Use AI to evaluate whether to reuse existing IC or hire new
    const decision = await evaluateICAssignment(
      requirement.skills,
      event.taskTitle,
      event.taskDescription,
      plan
    );
    
    if (decision.shouldReuse && decision.selectedIC) {
      console.log(
        `[HR ${hrId}] AI decision: Reuse existing IC ${decision.selectedIC.id} (${decision.selectedIC.name}). Reason: ${decision.reason}`
      );
      assignedEmployeeIds.push(decision.selectedIC.id);
    } else {
      console.log(
        `[HR ${hrId}] AI decision: Hire new IC. Reason: ${decision.reason}`
      );
      const employeeId = await hireIC(hrId, requirement);
      if (employeeId) {
        assignedEmployeeIds.push(employeeId);
      }
    }
  }

  // 4. Assign task to ICs
  if (assignedEmployeeIds.length > 0) {
    await assignTaskToICs(event.taskId, assignedEmployeeIds);
  }

  // Update state
  const state = await getHRState(hrId);
  const newlyHired = assignedEmployeeIds.filter(
    (id) => !state.hiredEmployees.includes(id)
  );
  await setHRState(hrId, {
    ...state,
    activeTasks: [...state.activeTasks, event.taskId],
    hiredEmployees: [...new Set([...state.hiredEmployees, ...assignedEmployeeIds])],
  });

  const reusedCount = assignedEmployeeIds.length - newlyHired.length;
  console.log(
    `[HR ${hrId}] Task ${event.taskId} processed. Assigned ${assignedEmployeeIds.length} ICs (${reusedCount} reused, ${newlyHired.length} newly hired).`
  );
}

/**
 * Analyzes a high-level task and creates a plan
 */
async function analyzeTask(taskTitle: string, taskDescription: string): Promise<TaskPlan> {
  "use step";

  try {
    const prompt = `You are an HR manager analyzing a high-level task. Your job is to break down what needs to be done and determine what skills are needed.

Task Title: ${taskTitle}
Task Description: ${taskDescription}

Analyze this task and provide:
1. A breakdown of the work needed
2. What technical skills are required
3. What roles/types of employees would be best suited
4. Estimated complexity

Respond in JSON format with this structure:
{
  "breakdown": ["step1", "step2", ...],
  "requiredSkills": ["skill1", "skill2", ...],
  "recommendedRoles": ["role1", "role2", ...],
  "complexity": "low" | "medium" | "high",
  "estimatedICs": number
}`;

    // Try AI Gateway first, fallback to direct OpenAI provider
    let result;
    try {
      result = await generateText({
        model: 'openai/gpt-4.1' as never, // AI Gateway
        prompt,
      });
    } catch (gatewayError) {
      // Fallback to direct OpenAI provider if Gateway fails
      if (process.env.OPENAI_API_KEY) {
        result = await generateText({
          model: openai('gpt-4o'),
          prompt,
        });
      } else {
        throw gatewayError; // Re-throw if no OpenAI key either
      }
    }

    // Parse the JSON response (handle markdown code blocks if present)
    let text = result.text.trim();
    // Remove markdown code blocks if present
    if (text.startsWith("```json")) {
      text = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (text.startsWith("```")) {
      text = text.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }
    const plan = JSON.parse(text) as TaskPlan;
    return plan;
  } catch (error) {
    console.error("Error analyzing task:", error);
    // Return default plan on error
    return {
      breakdown: [taskDescription],
      requiredSkills: ["general"],
      recommendedRoles: ["ic"],
      complexity: "medium",
      estimatedICs: 2,
    };
  }
}

interface TaskPlan {
  breakdown: string[];
  requiredSkills: string[];
  recommendedRoles: string[];
  complexity: "low" | "medium" | "high";
  estimatedICs: number;
}

/**
 * Determines IC requirements based on task plan
 */
async function determineICRequirements(plan: TaskPlan): Promise<ICRequirement[]> {
  "use step";

  const requirements: ICRequirement[] = [];
  const numICs = Math.max(1, Math.min(plan.estimatedICs, 5)); // Limit to 1-5 ICs for MVP

  // Distribute skills across ICs
  const skillsPerIC = Math.ceil(plan.requiredSkills.length / numICs);

  for (let i = 0; i < numICs; i++) {
    const startIdx = i * skillsPerIC;
    const endIdx = Math.min(startIdx + skillsPerIC, plan.requiredSkills.length);
    const assignedSkills = plan.requiredSkills.slice(startIdx, endIdx);

    requirements.push({
      name: `IC ${i + 1}`,
      role: "ic" as const,
      skills: assignedSkills.length > 0 ? assignedSkills : ["general"],
    });
  }

  return requirements;
}

interface ICRequirement {
  name: string;
  role: "ic" | "manager";
  skills: string[];
}

interface ICAssignmentDecision {
  shouldReuse: boolean;
  selectedIC: { id: string; name: string; skills: string[] } | null;
  reason: string;
}

interface ICandidateMetrics {
  id: string;
  name: string;
  skills: string[];
  activeTaskCount: number;
  completedTaskCount: number;
  memoryCount: number;
  recentCost: number; // Total cost in last 30 days
  skillMatchScore: number; // 0-1 score of skill overlap
}

/**
 * Uses AI to evaluate whether to reuse an existing IC or hire a new one
 * Considers: skills match, task load, memory/context, cost, and other factors
 */
async function evaluateICAssignment(
  requiredSkills: string[],
  taskTitle: string,
  taskDescription: string,
  taskPlan: TaskPlan
): Promise<ICAssignmentDecision> {
  "use step";

  try {
    // 1. Get all active IC employees
    const allICs = await db
      .select()
      .from(employees)
      .where(and(eq(employees.role, "ic"), eq(employees.status, "active")));

    if (allICs.length === 0) {
      return {
        shouldReuse: false,
        selectedIC: null,
        reason: "No existing ICs available. Need to hire new.",
      };
    }

    // 2. Gather comprehensive metrics for each candidate IC
    const candidates: ICandidateMetrics[] = [];
    
    for (const ic of allICs) {
      // Calculate skill match score
      const matchingSkills = requiredSkills.filter((reqSkill) =>
        ic.skills.some((icSkill) =>
          icSkill.toLowerCase().includes(reqSkill.toLowerCase()) ||
          reqSkill.toLowerCase().includes(icSkill.toLowerCase())
        )
      );
      const skillMatchScore = matchingSkills.length / Math.max(requiredSkills.length, 1);

      // Get active task count
      const activeTasks = await db
        .select({ count: sql<number>`count(*)` })
        .from(tasks)
        .where(and(eq(tasks.assignedTo, ic.id), eq(tasks.status, "in-progress")));
      const activeTaskCount = Number(activeTasks[0]?.count || 0);

      // Get completed task count (for experience metric)
      const completedTasks = await db
        .select({ count: sql<number>`count(*)` })
        .from(tasks)
        .where(and(eq(tasks.assignedTo, ic.id), eq(tasks.status, "completed")));
      const completedTaskCount = Number(completedTasks[0]?.count || 0);

      // Get memory count (context/experience)
      const memoryResults = await db
        .select({ count: sql<number>`count(*)` })
        .from(memories)
        .where(eq(memories.employeeId, ic.id));
      const memoryCount = Number(memoryResults[0]?.count || 0);

      // Get recent cost (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentCosts = await db
        .select({ total: sql<number>`sum(${costs.amount})` })
        .from(costs)
        .where(
          and(
            eq(costs.employeeId, ic.id),
            sql`${costs.timestamp} >= ${thirtyDaysAgo.toISOString()}`
          )
        );
      const recentCost = Number(recentCosts[0]?.total || 0);

      candidates.push({
        id: ic.id,
        name: ic.name,
        skills: ic.skills,
        activeTaskCount,
        completedTaskCount,
        memoryCount,
        recentCost,
        skillMatchScore,
      });
    }

    // 3. Use AI to make intelligent decision
    const decision = await makeAIAssignmentDecision(
      candidates,
      requiredSkills,
      taskTitle,
      taskDescription,
      taskPlan
    );

    return decision;
  } catch (error) {
    console.error("Error evaluating IC assignment:", error);
    // Fallback: hire new if evaluation fails
    return {
      shouldReuse: false,
      selectedIC: null,
      reason: `Error during evaluation: ${error instanceof Error ? error.message : "Unknown error"}. Hiring new IC as fallback.`,
    };
  }
}

/**
 * Uses AI to make the final decision on IC assignment
 */
async function makeAIAssignmentDecision(
  candidates: ICandidateMetrics[],
  requiredSkills: string[],
  taskTitle: string,
  taskDescription: string,
  taskPlan: TaskPlan
): Promise<ICAssignmentDecision> {
  "use step";

  try {
    // Format candidates for AI analysis
    const candidatesSummary = candidates.map((c) => ({
      id: c.id,
      name: c.name,
      skills: c.skills,
      activeTasks: c.activeTaskCount,
      completedTasks: c.completedTaskCount,
      memories: c.memoryCount,
      recentCost: c.recentCost.toFixed(2),
      skillMatch: `${(c.skillMatchScore * 100).toFixed(0)}%`,
    }));

    const prompt = `You are an HR manager deciding whether to assign a task to an existing employee or hire a new one.

TASK TO ASSIGN:
Title: ${taskTitle}
Description: ${taskDescription}
Required Skills: ${requiredSkills.join(", ")}
Complexity: ${taskPlan.complexity}
Estimated ICs Needed: ${taskPlan.estimatedICs}

EXISTING CANDIDATE EMPLOYEES:
${JSON.stringify(candidatesSummary, null, 2)}

EVALUATION CRITERIA:
1. **Skill Match**: How well do the candidate's skills match the required skills?
2. **Bandwidth**: How many active tasks does the candidate have? (Consider: <2 = good capacity, 2-3 = moderate, >3 = overloaded)
3. **Experience**: How many completed tasks and memories does the candidate have? (More = better context/experience)
4. **Cost Efficiency**: What's the candidate's recent cost? (Lower = more cost-effective, but consider if they're underutilized)
5. **Context/Memory**: Does the candidate have relevant memories that could help? (Higher memory count = more context)

DECISION RULES:
- REUSE if: Good skill match (≥50%) AND has capacity (≤3 active tasks) AND cost-effective
- HIRE NEW if: No good candidates OR all candidates overloaded OR cost of reuse > cost of new hire
- Consider: A candidate with high memory/experience might be worth reusing even with moderate skill match if they have relevant context

Respond in JSON format:
{
  "shouldReuse": boolean,
  "selectedICId": "employee-id" | null,
  "reason": "brief explanation of decision"
}`;

    // Try AI Gateway first, fallback to direct OpenAI provider
    let result;
    try {
      result = await generateText({
        model: 'openai/gpt-4.1' as never, // AI Gateway
        prompt,
      });
    } catch (gatewayError) {
      // Fallback to direct OpenAI provider if Gateway fails
      if (process.env.OPENAI_API_KEY) {
        result = await generateText({
          model: openai('gpt-4o'),
          prompt,
        });
      } else {
        throw gatewayError; // Re-throw if no OpenAI key either
      }
    }

    // Parse AI response
    let text = result.text.trim();
    if (text.startsWith("```json")) {
      text = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (text.startsWith("```")) {
      text = text.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    const aiDecision = JSON.parse(text) as {
      shouldReuse: boolean;
      selectedICId: string | null;
      reason: string;
    };

    // Find the selected IC
    const selectedIC = aiDecision.shouldReuse && aiDecision.selectedICId
      ? candidates.find((c) => c.id === aiDecision.selectedICId)
      : null;

    return {
      shouldReuse: aiDecision.shouldReuse,
      selectedIC: selectedIC
        ? { id: selectedIC.id, name: selectedIC.name, skills: selectedIC.skills }
        : null,
      reason: aiDecision.reason,
    };
  } catch (error) {
    console.error("Error in AI assignment decision:", error);
    // Fallback: simple rule-based decision
    const bestCandidate = candidates
      .filter((c) => c.skillMatchScore >= 0.5 && c.activeTaskCount < 3)
      .sort((a, b) => b.skillMatchScore - a.skillMatchScore)[0];

    if (bestCandidate) {
      return {
        shouldReuse: true,
        selectedIC: {
          id: bestCandidate.id,
          name: bestCandidate.name,
          skills: bestCandidate.skills,
        },
        reason: `Fallback: Selected best matching candidate (${bestCandidate.skillMatchScore * 100}% skill match, ${bestCandidate.activeTaskCount} active tasks)`,
      };
    }

    return {
      shouldReuse: false,
      selectedIC: null,
      reason: "Fallback: No suitable candidates found. Hiring new IC.",
    };
  }
}

/**
 * Hires an IC by creating an employee record and starting their workflow
 */
async function hireIC(hrId: string, requirement: ICRequirement): Promise<string | null> {
  "use step";

  try {
    // Generate a unique name for the new IC
    const existingICs = await db
      .select()
      .from(employees)
      .where(eq(employees.role, "ic"));
    
    const icNumber = existingICs.length + 1;
    const name = `IC ${icNumber}`;

    // Create employee record in database
    const [employee] = await db
      .insert(employees)
      .values({
        name: name,
        role: requirement.role,
        skills: requirement.skills,
        status: "active",
      })
      .returning();

    console.log(`[HR ${hrId}] Hired new employee: ${employee.id} (${employee.name})`);

    // TODO: Start employee workflow when IC workflow is implemented
    // For now, just create the employee record
    // const initialState = createInitialICState(employee.id, requirement);
    // await start(icEmployeeWorkflow, [initialState]);

    return employee.id;
  } catch (error) {
    console.error(`[HR ${hrId}] Error hiring IC:`, error);
    return null;
  }
}

/**
 * Assigns a task to multiple ICs
 */
async function assignTaskToICs(taskId: string, employeeIds: string[]) {
  "use step";

  try {
    // Update task in database to assign to first IC (for MVP)
    // In full implementation, would create subtasks for each IC
    if (employeeIds.length > 0) {
      await db
        .update(tasks)
        .set({
          assignedTo: employeeIds[0],
          status: "in-progress",
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));

      console.log(`[HR] Assigned task ${taskId} to employee ${employeeIds[0]}`);
    }
  } catch (error) {
    console.error("Error assigning task to ICs:", error);
  }
}

/**
 * Handles manual employee hiring request
 */
async function handleHireEmployee(
  hrId: string,
  event: { role: "ic" | "manager"; skills: string[]; name: string }
) {
  "use step";

  const requirement: ICRequirement = {
    name: event.name,
    role: event.role,
    skills: event.skills,
  };

  const employeeId = await hireIC(hrId, requirement);
  if (employeeId) {
    const state = await getHRState(hrId);
    await setHRState(hrId, {
      ...state,
      hiredEmployees: [...state.hiredEmployees, employeeId],
    });
  }
}

// State management functions
// For MVP, use in-memory store (like counter actor)
// In production, would use Redis or dedicated HR state table
const hrStateStore = new Map<string, HRState>();

async function getHRState(hrId: string): Promise<HRState | null> {
  "use step";

  const storedState = hrStateStore.get(hrId);
  return storedState || null;
}

async function setHRState(hrId: string, state: HRState): Promise<void> {
  "use step";

  hrStateStore.set(hrId, state);
}

