import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { employees, tasks, deliverables, memories } from "@/lib/db/schema";
import { eq, and, or, ilike, desc, gte } from "drizzle-orm";

/**
 * Creates Manager tools for AI function calling
 * These tools allow managers to search, find, and manage team resources
 * 
 * Note: Tools must be created synchronously (not in a step function) to preserve execute functions
 */
export function createManagerTools(managerId: string) {
  return {
    // @ts-expect-error - tool() function type definitions don't match runtime behavior
    searchDeliverables: tool({
      description: "Search for deliverables by keyword. Useful for finding similar work or examples when evaluating deliverables",
      inputSchema: z.object({
        keyword: z.string().describe("The keyword to search for in deliverable content"),
        limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results to return"),
        createdBy: z.string().optional().describe("Filter by employee ID who created the deliverable"),
        type: z.enum(["code", "document", "config", "text"]).optional().describe("Filter by deliverable type"),
      }),
      execute: async ({ keyword, limit, createdBy, type }) => {
        "use step";
        try {
          const conditions = [];
          conditions.push(ilike(deliverables.content, `%${keyword}%`));
          
          if (createdBy) {
            conditions.push(eq(deliverables.createdBy, createdBy));
          }
          
          if (type) {
            conditions.push(eq(deliverables.type, type));
          }

          const matchingDeliverables = await db
            .select()
            .from(deliverables)
            .where(and(...conditions))
            .orderBy(desc(deliverables.createdAt))
            .limit(limit || 10);

          const deliverablesWithTasks = await Promise.all(
            matchingDeliverables.map(async (deliverable) => {
              const [task] = await db
                .select()
                .from(tasks)
                .where(eq(tasks.id, deliverable.taskId))
                .limit(1);
              
              const [creator] = await db
                .select()
                .from(employees)
                .where(eq(employees.id, deliverable.createdBy))
                .limit(1);

              return {
                id: deliverable.id,
                type: deliverable.type,
                taskId: deliverable.taskId,
                taskTitle: task?.title || "Unknown",
                createdBy: deliverable.createdBy,
                createdByName: creator?.name || "Unknown",
                evaluationScore: deliverable.evaluationScore,
                createdAt: deliverable.createdAt.toISOString(),
                contentPreview: deliverable.content.substring(0, 200) + (deliverable.content.length > 200 ? "..." : ""),
              };
            })
          );

          return {
            success: true,
            count: deliverablesWithTasks.length,
            deliverables: deliverablesWithTasks,
          };
        } catch (error) {
          console.error(`[Manager ${managerId}] Error searching deliverables:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
            deliverables: [],
            count: 0,
          };
        }
      },
    }),

    // @ts-expect-error - tool() function type definitions don't match runtime behavior
    getDeliverable: tool({
      description: "Get the full content of a deliverable by its ID",
      inputSchema: z.object({
        deliverableId: z.string().describe("The ID of the deliverable to retrieve"),
      }),
      execute: async ({ deliverableId }) => {
        "use step";
        try {
          const [deliverable] = await db
            .select()
            .from(deliverables)
            .where(eq(deliverables.id, deliverableId))
            .limit(1);

          if (!deliverable) {
            return {
              success: false,
              error: `Deliverable with ID ${deliverableId} not found`,
            };
          }

          const [task] = await db
            .select()
            .from(tasks)
            .where(eq(tasks.id, deliverable.taskId))
            .limit(1);

          const [creator] = await db
            .select()
            .from(employees)
            .where(eq(employees.id, deliverable.createdBy))
            .limit(1);

          return {
            success: true,
            deliverable: {
              id: deliverable.id,
              type: deliverable.type,
              content: deliverable.content,
              taskId: deliverable.taskId,
              taskTitle: task?.title || "Unknown",
              createdBy: deliverable.createdBy,
              createdByName: creator?.name || "Unknown",
              evaluationScore: deliverable.evaluationScore,
              feedback: deliverable.feedback,
              createdAt: deliverable.createdAt.toISOString(),
            },
          };
        } catch (error) {
          console.error(`[Manager ${managerId}] Error getting deliverable:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
    }),

    // @ts-expect-error - tool() function type definitions don't match runtime behavior
    findEmployee: tool({
      description: "Find employees by name, role, skills, or other criteria. Useful for identifying team members or finding the right person for a task",
      inputSchema: z.object({
        name: z.string().optional().describe("Search by employee name (partial match, case-insensitive)"),
        role: z.enum(["ic", "manager", "ceo"]).optional().describe("Filter by employee role"),
        skills: z.array(z.string()).optional().describe("Filter by skills (employee must have at least one of these skills)"),
        managerId: z.string().optional().describe("Filter by manager ID (find direct reports)"),
        status: z.enum(["active", "terminated"]).optional().default("active").describe("Filter by employee status"),
        limit: z.number().int().min(1).max(50).optional().default(20).describe("Maximum number of results to return"),
      }),
      execute: async ({ name, role, skills, managerId, status, limit }) => {
        "use step";
        try {
          const conditions = [];

          if (name) {
            conditions.push(ilike(employees.name, `%${name}%`));
          }

          if (role) {
            conditions.push(eq(employees.role, role));
          }

          if (managerId) {
            conditions.push(eq(employees.managerId, managerId));
          }

          if (status) {
            conditions.push(eq(employees.status, status));
          }

          let matchingEmployees = await db
            .select()
            .from(employees)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .limit(limit || 20);

          if (skills && skills.length > 0) {
            matchingEmployees = matchingEmployees.filter((emp) =>
              skills.some((skill: string) => emp.skills.includes(skill))
            );
          }

          const employeesWithManager = await Promise.all(
            matchingEmployees.map(async (emp) => {
              const manager = emp.managerId
                ? await db
                    .select()
                    .from(employees)
                    .where(eq(employees.id, emp.managerId))
                    .limit(1)
                    .then((rows) => rows[0] || null)
                : null;

              return {
                id: emp.id,
                name: emp.name,
                role: emp.role,
                skills: emp.skills,
                status: emp.status,
                managerId: emp.managerId,
                managerName: manager?.name || null,
                persona: emp.persona || null,
                createdAt: emp.createdAt.toISOString(),
              };
            })
          );

          return {
            success: true,
            count: employeesWithManager.length,
            employees: employeesWithManager,
          };
        } catch (error) {
          console.error(`[Manager ${managerId}] Error finding employees:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
            employees: [],
            count: 0,
          };
        }
      },
    }),

    // @ts-expect-error - tool() function type definitions don't match runtime behavior
    fetchMemories: tool({
      description: "Fetch memories from the database. Useful for retrieving past evaluations, learnings, or team interactions",
      inputSchema: z.object({
        employeeId: z.string().optional().describe("Filter by employee ID (useful for reviewing a specific team member's memories)"),
        type: z.enum(["meeting", "task", "learning", "interaction"]).optional().describe("Filter by memory type"),
        keyword: z.string().optional().describe("Search for keyword in memory content"),
        limit: z.number().int().min(1).max(100).optional().default(20).describe("Maximum number of memories to return"),
        minImportance: z.number().min(0).max(1).optional().describe("Filter by minimum importance score (0-1)"),
      }),
      execute: async ({ employeeId, type, keyword, limit, minImportance }) => {
        "use step";
        try {
          const conditions = [];

          if (employeeId) {
            conditions.push(eq(memories.employeeId, employeeId));
          }

          if (type) {
            conditions.push(eq(memories.type, type));
          }

          if (keyword) {
            conditions.push(ilike(memories.content, `%${keyword}%`));
          }

          if (minImportance !== undefined) {
            conditions.push(gte(memories.importance, minImportance.toString()));
          }

          const matchingMemories = await db
            .select()
            .from(memories)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(memories.createdAt))
            .limit(limit || 20);

          return {
            success: true,
            count: matchingMemories.length,
            memories: matchingMemories.map((m) => ({
              id: m.id,
              employeeId: m.employeeId,
              type: m.type,
              content: m.content,
              importance: parseFloat(m.importance),
              createdAt: m.createdAt.toISOString(),
            })),
          };
        } catch (error) {
          console.error(`[Manager ${managerId}] Error fetching memories:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
            memories: [],
            count: 0,
          };
        }
      },
    }),

    // @ts-expect-error - tool() function type definitions don't match runtime behavior
    addMemory: tool({
      description: "Add a memory to the database. Useful for storing evaluation insights, team learnings, or important observations",
      inputSchema: z.object({
        content: z.string().describe("The content of the memory"),
        type: z.enum(["meeting", "task", "learning", "interaction"]).describe("The type of memory"),
        importance: z.number().min(0).max(1).optional().default(0.5).describe("Importance score from 0 to 1 (higher = more important)"),
      }),
      execute: async ({ content, type, importance }) => {
        "use step";
        try {
          const [memory] = await db
            .insert(memories)
            .values({
              employeeId: managerId,
              type: type,
              content: content,
              importance: importance?.toString() || "0.5",
            })
            .returning();

          return {
            success: true,
            memory: {
              id: memory.id,
              type: memory.type,
              content: memory.content,
              importance: parseFloat(memory.importance),
              createdAt: memory.createdAt.toISOString(),
            },
          };
        } catch (error) {
          console.error(`[Manager ${managerId}] Error adding memory:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
    }),

    // @ts-expect-error - tool() function type definitions don't match runtime behavior
    searchTasks: tool({
      description: "Search for tasks by keyword in title or description. Useful for finding related work or understanding task context",
      inputSchema: z.object({
        keyword: z.string().describe("The keyword to search for in task title or description"),
        status: z.enum(["pending", "in-progress", "completed", "reviewed"]).optional().describe("Filter by task status"),
        assignedTo: z.string().optional().describe("Filter by employee ID who the task is assigned to"),
        priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("Filter by task priority"),
        limit: z.number().int().min(1).max(50).optional().default(20).describe("Maximum number of results to return"),
      }),
      execute: async ({ keyword, status, assignedTo, priority, limit }) => {
        "use step";
        try {
          const conditions = [];

          conditions.push(
            or(
              ilike(tasks.title, `%${keyword}%`),
              ilike(tasks.description, `%${keyword}%`)
            )
          );

          if (status) {
            conditions.push(eq(tasks.status, status));
          }

          if (assignedTo) {
            conditions.push(eq(tasks.assignedTo, assignedTo));
          }

          if (priority) {
            conditions.push(eq(tasks.priority, priority));
          }

          const matchingTasks = await db
            .select()
            .from(tasks)
            .where(and(...conditions))
            .orderBy(desc(tasks.createdAt))
            .limit(limit || 20);

          const tasksWithAssignee = await Promise.all(
            matchingTasks.map(async (task) => {
              const assignee = task.assignedTo
                ? await db
                    .select()
                    .from(employees)
                    .where(eq(employees.id, task.assignedTo))
                    .limit(1)
                    .then((rows) => rows[0] || null)
                : null;

              return {
                id: task.id,
                title: task.title,
                description: task.description,
                status: task.status,
                priority: task.priority,
                assignedTo: task.assignedTo,
                assignedToName: assignee?.name || null,
                parentTaskId: task.parentTaskId,
                createdAt: task.createdAt.toISOString(),
                updatedAt: task.updatedAt.toISOString(),
                completedAt: task.completedAt?.toISOString() || null,
              };
            })
          );

          return {
            success: true,
            count: tasksWithAssignee.length,
            tasks: tasksWithAssignee,
          };
        } catch (error) {
          console.error(`[Manager ${managerId}] Error searching tasks:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
            tasks: [],
            count: 0,
          };
        }
      },
    }),

    // @ts-expect-error - tool() function type definitions don't match runtime behavior
    getTask: tool({
      description: "Get detailed information about a task by its ID, including related deliverables and status",
      inputSchema: z.object({
        taskId: z.string().describe("The ID of the task to retrieve"),
      }),
      execute: async ({ taskId }) => {
        "use step";
        try {
          const [task] = await db
            .select()
            .from(tasks)
            .where(eq(tasks.id, taskId))
            .limit(1);

          if (!task) {
            return {
              success: false,
              error: `Task with ID ${taskId} not found`,
            };
          }

          const assignee = task.assignedTo
            ? await db
                .select()
                .from(employees)
                .where(eq(employees.id, task.assignedTo))
                .limit(1)
                .then((rows) => rows[0] || null)
            : null;

          const parentTask = task.parentTaskId
            ? await db
                .select()
                .from(tasks)
                .where(eq(tasks.id, task.parentTaskId))
                .limit(1)
                .then((rows) => rows[0] || null)
            : null;

          const subtasks = await db
            .select()
            .from(tasks)
            .where(eq(tasks.parentTaskId, taskId));

          const taskDeliverables = await db
            .select()
            .from(deliverables)
            .where(eq(deliverables.taskId, taskId));

          return {
            success: true,
            task: {
              id: task.id,
              title: task.title,
              description: task.description,
              status: task.status,
              priority: task.priority,
              assignedTo: task.assignedTo,
              assignedToName: assignee?.name || null,
              parentTaskId: task.parentTaskId,
              parentTaskTitle: parentTask?.title || null,
              subtasksCount: subtasks.length,
              subtasks: subtasks.map((st) => ({
                id: st.id,
                title: st.title,
                status: st.status,
              })),
              deliverablesCount: taskDeliverables.length,
              deliverables: taskDeliverables.map((d) => ({
                id: d.id,
                type: d.type,
                evaluationScore: d.evaluationScore,
                createdAt: d.createdAt.toISOString(),
              })),
              createdAt: task.createdAt.toISOString(),
              updatedAt: task.updatedAt.toISOString(),
              completedAt: task.completedAt?.toISOString() || null,
            },
          };
        } catch (error) {
          console.error(`[Manager ${managerId}] Error getting task:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
    }),
  };
}

