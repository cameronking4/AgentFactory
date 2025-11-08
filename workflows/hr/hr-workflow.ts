import { defineHook, getWorkflowMetadata, fetch } from "workflow";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { db } from "@/lib/db";
import { employees, tasks, memories, costs } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { start } from "workflow/api";
import {
  managerWorkflow,
  createInitialManagerState,
  managerEvaluationHook,
} from "@/workflows/employees/manager-workflow";
import {
  icEmployeeWorkflow,
  createInitialICState,
  icTaskHook,
} from "@/workflows/employees/ic-workflow";
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

  // 3. Ensure managers exist before hiring ICs
  await ensureManagerExists(hrId);

  // 4. Find or hire ICs (reuse existing when possible)
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
      // Ensure reused IC has a manager assigned
      await ensureICHasManager(hrId, decision.selectedIC.id);
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

  // 5. Assign task to ICs
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
 * Ensures at least one manager exists, creates one if needed
 */
async function ensureManagerExists(hrId: string): Promise<string> {
  "use step";

  try {
    // Check if any managers exist
    const existingManagers = await db
      .select()
      .from(employees)
      .where(and(eq(employees.role, "manager"), eq(employees.status, "active")));

    if (existingManagers.length > 0) {
      console.log(`[HR ${hrId}] Found ${existingManagers.length} existing manager(s)`);
      return existingManagers[0].id; // Return first manager
    }

    // No managers exist, create one
    console.log(`[HR ${hrId}] No managers found, creating new manager`);
    const managerId = await createManager(hrId);
    return managerId;
  } catch (error) {
    console.error(`[HR ${hrId}] Error ensuring manager exists:`, error);
    // Return a fallback - try to get any manager or create one
    const allManagers = await db
      .select()
      .from(employees)
      .where(eq(employees.role, "manager"))
      .limit(1);
    
    if (allManagers.length > 0) {
      return allManagers[0].id;
    }
    
    return await createManager(hrId);
  }
}

/**
 * Creates a new manager employee and starts their workflow
 */
async function createManager(hrId: string): Promise<string> {
  "use step";

  try {
    // Generate a unique name for the new manager
    const existingManagers = await db
      .select()
      .from(employees)
      .where(eq(employees.role, "manager"));
    
    const managerNumber = existingManagers.length + 1;
    const name = `Manager ${managerNumber}`;

    // Create manager employee record
    const [manager] = await db
      .insert(employees)
      .values({
        name: name,
        role: "manager",
        skills: ["management", "qa", "evaluation"],
        status: "active",
      })
      .returning();

    console.log(`[HR ${hrId}] Created new manager: ${manager.id} (${manager.name})`);

    // Start manager workflow
    const initialState = createInitialManagerState(manager.id, manager.name);
    await start(managerWorkflow, [initialState]);

    console.log(`[HR ${hrId}] Started manager workflow for ${manager.id}`);

    return manager.id;
  } catch (error) {
    console.error(`[HR ${hrId}] Error creating manager:`, error);
    throw error;
  }
}

/**
 * Ensures an IC has a manager assigned, assigns one if not
 */
async function ensureICHasManager(hrId: string, icId: string): Promise<void> {
  "use step";

  try {
    // Check if IC already has a manager
    const [ic] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, icId))
      .limit(1);

    if (!ic) {
      console.error(`[HR ${hrId}] IC ${icId} not found`);
      return;
    }

    if (ic.managerId) {
      console.log(`[HR ${hrId}] IC ${icId} already has manager ${ic.managerId}`);
      return;
    }

    // IC doesn't have a manager, assign one
    const managerId = await ensureManagerExists(hrId);
    
    // Assign manager to IC
    await db
      .update(employees)
      .set({
        managerId: managerId,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, icId));

    // Notify manager workflow to track this assignment
    try {
      await managerEvaluationHook.resume(`manager:${managerId}`, {
        type: "assignIC",
        icId: icId,
      });
    } catch (hookError) {
      // Hook might fail if manager workflow isn't running, that's okay
      console.warn(`[HR ${hrId}] Could not notify manager workflow:`, hookError);
    }

    console.log(`[HR ${hrId}] Assigned manager ${managerId} to IC ${icId}`);
  } catch (error) {
    console.error(`[HR ${hrId}] Error ensuring IC has manager:`, error);
  }
}

/**
 * Finds or assigns a manager for a new IC
 * Uses load balancing to distribute ICs across managers
 */
async function findOrAssignManager(hrId: string): Promise<string> {
  "use step";

  try {
    // Get all active managers
    const managers = await db
      .select()
      .from(employees)
      .where(and(eq(employees.role, "manager"), eq(employees.status, "active")));

    if (managers.length === 0) {
      // No managers exist, create one
      return await ensureManagerExists(hrId);
    }

    // Load balancing: find manager with fewest direct reports
    let managerWithLeastReports = managers[0];
    let minReportCount = Infinity;

    for (const manager of managers) {
      const directReports = await db
        .select()
        .from(employees)
        .where(eq(employees.managerId, manager.id));
      
      const reportCount = directReports.length;
      
      if (reportCount < minReportCount) {
        minReportCount = reportCount;
        managerWithLeastReports = manager;
      }
    }

    console.log(
      `[HR ${hrId}] Selected manager ${managerWithLeastReports.id} (${managerWithLeastReports.name}) with ${minReportCount} direct reports`
    );

    return managerWithLeastReports.id;
  } catch (error) {
    console.error(`[HR ${hrId}] Error finding manager:`, error);
    // Fallback: ensure manager exists and return it
    return await ensureManagerExists(hrId);
  }
}

/**
 * Hires an IC by creating an employee record and assigning a manager
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
    const name = requirement.name || `IC ${icNumber}`;

    // Find or assign a manager
    const managerId = await findOrAssignManager(hrId);

    // Create employee record in database with manager assignment
    const [employee] = await db
      .insert(employees)
      .values({
        name: name,
        role: requirement.role,
        skills: requirement.skills,
        status: "active",
        managerId: managerId,
      })
      .returning();

    console.log(
      `[HR ${hrId}] Hired new employee: ${employee.id} (${employee.name}) with manager ${managerId}`
    );

    // Notify manager workflow to track this assignment
    try {
      await managerEvaluationHook.resume(`manager:${managerId}`, {
        type: "assignIC",
        icId: employee.id,
      });
    } catch (hookError) {
      // Hook might fail if manager workflow isn't running, that's okay
      console.warn(`[HR ${hrId}] Could not notify manager workflow:`, hookError);
    }

    // Start IC workflow
    try {
      const initialState = createInitialICState(
        employee.id,
        employee.name,
        requirement.skills,
        managerId
      );
      await start(icEmployeeWorkflow, [initialState]);
      console.log(`[HR ${hrId}] Started IC workflow for ${employee.id}`);
    } catch (workflowError) {
      console.error(
        `[HR ${hrId}] Error starting IC workflow:`,
        workflowError
      );
      // Continue even if workflow start fails - IC can be started manually later
    }

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
    if (employeeIds.length === 0) {
      console.warn(`[HR] No employees to assign task ${taskId} to`);
      return;
    }

    // Assign task to first IC (lead), but notify all ICs for collaboration
    const leadIC = employeeIds[0];
    
    // Update task assignment in database (assigned to lead IC)
    await db
      .update(tasks)
      .set({
        assignedTo: leadIC,
        status: "in-progress",
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    console.log(`[HR] Assigned task ${taskId} to lead IC ${leadIC}`);

    // Notify all ICs about the task (they can collaborate even if not the lead)
    for (const employeeId of employeeIds) {
      try {
        await icTaskHook.resume(`ic:${employeeId}:tasks`, {
          type: "newTask",
          taskId: taskId,
        });
        console.log(`[HR] Notified IC ${employeeId} about task ${taskId}`);
      } catch (hookError) {
        console.warn(
          `[HR] Could not notify IC ${employeeId} via hook:`,
          hookError
        );
        // Task is still assigned in DB, IC will pick it up proactively
      }
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

  try {
    if (event.role === "manager") {
      // Create manager directly
      const managerId = await createManager(hrId);
      const state = await getHRState(hrId);
      await setHRState(hrId, {
        ...state,
        hiredEmployees: [...state.hiredEmployees, managerId],
      });
      console.log(`[HR ${hrId}] Created manager ${managerId} via manual hire request`);
    } else {
      // Create IC with manager assignment
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
        console.log(`[HR ${hrId}] Created IC ${employeeId} via manual hire request`);
      }
    }
  } catch (error) {
    console.error(`[HR ${hrId}] Error handling hire employee request:`, error);
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

