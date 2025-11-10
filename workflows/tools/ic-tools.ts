import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { employees, tasks, deliverables, memories } from "@/lib/db/schema";
import { eq, and, or, ilike, desc, gte } from "drizzle-orm";
import { icPingHook } from "@/workflows/shared/hooks";
import { managerEvaluationHook } from "@/workflows/employees/manager-workflow";

/**
 * Creates IC tools for AI function calling
 * These tools allow the IC to interact with other ICs, managers, and external APIs
 * 
 * Note: Tools must be created synchronously (not in a step function) to preserve execute functions
 */
export function createICTools(employeeId: string, managerId: string | null) {
  return {
    // @ts-expect-error - tool() function type definitions don't match runtime behavior
    pingIC: tool({
      description: "Ping another IC employee under the same manager to ask for help, share information, or collaborate",
      inputSchema: z.object({
        icId: z.string().describe("The ID of the IC employee to ping"),
        message: z.string().describe("The message to send to the IC"),
      }),
      execute: async ({ icId, message }: { icId: string; message: string }) => {
        "use step";
        try {
          // Verify the IC exists and is under the same manager
          const [targetIC] = await db
            .select()
            .from(employees)
            .where(eq(employees.id, icId))
            .limit(1);

          if (!targetIC) {
            return { success: false, error: `IC with ID ${icId} not found` };
          }

          if (targetIC.role !== "ic") {
            return { success: false, error: `Employee ${icId} is not an IC` };
          }

          // If we have a manager, verify both ICs are under the same manager
          if (managerId && targetIC.managerId !== managerId) {
            return {
              success: false,
              error: `IC ${icId} is not under the same manager. You can only ping ICs under your manager.`,
            };
          }

          // Send ping via hook
          const pingId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
          await icPingHook.resume(`ic:${icId}:pings`, {
            type: "receivePing",
            pingId,
            from: employeeId,
            message,
          });

          // Store ping in memory
          await db.insert(memories).values({
            employeeId: employeeId,
            type: "interaction",
            content: `Sent ping to IC ${targetIC.name} (${icId}): ${message}`,
            importance: "0.6",
          });

          return {
            success: true,
            message: `Successfully sent ping to ${targetIC.name}`,
            pingId,
          };
        } catch (error) {
          console.error(`[IC ${employeeId}] Error pinging IC:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
    }),

    // @ts-expect-error - tool() function type definitions don't match runtime behavior
    pingManager: tool({
      description: "Ping your manager to ask questions, request help, or provide updates",
      inputSchema: z.object({
        message: z.string().describe("The message to send to your manager"),
      }),
      execute: async ({ message }: { message: string }) => {
        "use step";
        try {
          if (!managerId) {
            return { success: false, error: "You don't have a manager assigned" };
          }

          // Verify manager exists
          const [manager] = await db
            .select()
            .from(employees)
            .where(eq(employees.id, managerId))
            .limit(1);

          if (!manager || manager.role !== "manager") {
            return { success: false, error: "Manager not found or invalid" };
          }

          // Send message to manager via hook (using requestWork event type as a general communication)
          await managerEvaluationHook.resume(`manager:${managerId}`, {
            type: "requestWork",
            icId: employeeId,
          });

          // Store ping in memory
          await db.insert(memories).values({
            employeeId: employeeId,
            type: "interaction",
            content: `Sent message to manager ${manager.name}: ${message}`,
            importance: "0.7",
          });

          return {
            success: true,
            message: `Successfully sent message to manager ${manager.name}`,
          };
        } catch (error) {
          console.error(`[IC ${employeeId}] Error pinging manager:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
    }),

    // @ts-expect-error - tool() function type definitions don't match runtime behavior
    simpleFetch: tool({
      description: "Make a simple HTTP GET request to fetch data from a URL",
      inputSchema: z.object({
        url: z.string().url().describe("The URL to fetch from"),
        headers: z
          .record(z.string())
          .optional()
          .describe("Optional HTTP headers to include in the request"),
      }),
      execute: async ({ url, headers }) => {
        "use step";
        try {
          const response = await fetch(url, {
            method: "GET",
            headers: headers || {},
          });

          const contentType = response.headers.get("content-type");
          let data: any;

          if (contentType?.includes("application/json")) {
            data = await response.json();
          } else {
            data = await response.text();
          }

          // Store fetch in memory
          await db.insert(memories).values({
            employeeId: employeeId,
            type: "task",
            content: `Fetched data from ${url}. Status: ${response.status}`,
            importance: "0.5",
          });

          return {
            success: true,
            status: response.status,
            statusText: response.statusText,
            data,
            headers: Object.fromEntries(response.headers.entries()),
          };
        } catch (error) {
          console.error(`[IC ${employeeId}] Error fetching URL:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
    }),

    // @ts-expect-error - tool() function type definitions don't match runtime behavior
    executeRestAPI: tool({
      description: "Execute a REST API call (GET, POST, PUT, DELETE, PATCH) to any endpoint",
      inputSchema: z.object({
        url: z.string().url().describe("The API endpoint URL"),
        method: z
          .enum(["GET", "POST", "PUT", "DELETE", "PATCH"])
          .describe("The HTTP method to use"),
        headers: z
          .record(z.string())
          .optional()
          .describe("HTTP headers to include in the request"),
        body: z
          .any()
          .optional()
          .describe("Request body (will be JSON stringified if object)"),
      }),
      execute: async ({ url, method, headers, body }) => {
        "use step";
        try {
          const requestHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            ...(headers || {}),
          };

          const requestBody =
            body !== undefined
              ? typeof body === "string"
                ? body
                : JSON.stringify(body)
              : undefined;

          const response = await fetch(url, {
            method,
            headers: requestHeaders,
            body: requestBody,
          });

          const contentType = response.headers.get("content-type");
          let data: any;

          if (contentType?.includes("application/json")) {
            data = await response.json();
          } else {
            data = await response.text();
          }

          // Store API call in memory
          await db.insert(memories).values({
            employeeId: employeeId,
            type: "task",
            content: `Executed ${method} ${url}. Status: ${response.status}`,
            importance: "0.6",
          });

          return {
            success: true,
            status: response.status,
            statusText: response.statusText,
            data,
            headers: Object.fromEntries(response.headers.entries()),
          };
        } catch (error) {
          console.error(`[IC ${employeeId}] Error executing REST API:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
    }),

    // @ts-expect-error - tool() function type definitions don't match runtime behavior
    searchDeliverables: tool({
      description: "Search for deliverables by keyword. Searches in deliverable content and related task titles/descriptions",
      inputSchema: z.object({
        keyword: z.string().describe("The keyword to search for in deliverable content"),
        limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results to return"),
        createdBy: z.string().optional().describe("Filter by employee ID who created the deliverable"),
        type: z.enum(["code", "document", "config", "text"]).optional().describe("Filter by deliverable type"),
      }),
      execute: async ({ keyword, limit, createdBy, type }) => {
        "use step";
        try {
          // Build search conditions
          const conditions = [];
          
          // Keyword search in content (case-insensitive)
          conditions.push(ilike(deliverables.content, `%${keyword}%`));
          
          if (createdBy) {
            conditions.push(eq(deliverables.createdBy, createdBy));
          }
          
          if (type) {
            conditions.push(eq(deliverables.type, type));
          }

          // Get deliverables matching keyword
          const matchingDeliverables = await db
            .select()
            .from(deliverables)
            .where(and(...conditions))
            .orderBy(desc(deliverables.createdAt))
            .limit(limit || 10);

          // Get related task info for context
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
                taskDescription: task?.description || "",
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
          console.error(`[IC ${employeeId}] Error searching deliverables:`, error);
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

          // Get related task info
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

          const [evaluator] = deliverable.evaluatedBy
            ? await db
                .select()
                .from(employees)
                .where(eq(employees.id, deliverable.evaluatedBy))
                .limit(1)
            : [null];

          return {
            success: true,
            deliverable: {
              id: deliverable.id,
              type: deliverable.type,
              content: deliverable.content,
              taskId: deliverable.taskId,
              taskTitle: task?.title || "Unknown",
              taskDescription: task?.description || "",
              createdBy: deliverable.createdBy,
              createdByName: creator?.name || "Unknown",
              evaluatedBy: deliverable.evaluatedBy,
              evaluatedByName: evaluator?.name || null,
              evaluationScore: deliverable.evaluationScore,
              feedback: deliverable.feedback,
              createdAt: deliverable.createdAt.toISOString(),
              updatedAt: deliverable.updatedAt.toISOString(),
            },
          };
        } catch (error) {
          console.error(`[IC ${employeeId}] Error getting deliverable:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
    }),

    // @ts-expect-error - tool() function type definitions don't match runtime behavior
    findEmployee: tool({
      description: "Find employees by name, role, skills, or other criteria. Useful for identifying the right person to contact or collaborate with",
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

          // Filter by skills if provided (PostgreSQL array contains)
          if (skills && skills.length > 0) {
            matchingEmployees = matchingEmployees.filter((emp) =>
              skills.some((skill: string) => emp.skills.includes(skill))
            );
          }

          // Get manager info for each employee
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
          console.error(`[IC ${employeeId}] Error finding employees:`, error);
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
      description: "Fetch memories from the database. Useful for retrieving past learnings, interactions, or task-related information",
      inputSchema: z.object({
        employeeId: z.string().optional().describe("Filter by employee ID (defaults to current employee)"),
        type: z.enum(["meeting", "task", "learning", "interaction"]).optional().describe("Filter by memory type"),
        keyword: z.string().optional().describe("Search for keyword in memory content"),
        limit: z.number().int().min(1).max(100).optional().default(20).describe("Maximum number of memories to return"),
        minImportance: z.number().min(0).max(1).optional().describe("Filter by minimum importance score (0-1)"),
      }),
      execute: async ({ employeeId: filterEmployeeId, type, keyword, limit, minImportance }) => {
        "use step";
        try {
          const conditions = [];

          // Default to current employee if not specified
          const targetEmployeeId = filterEmployeeId || employeeId;
          conditions.push(eq(memories.employeeId, targetEmployeeId));

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
            .where(and(...conditions))
            .orderBy(desc(memories.createdAt))
            .limit(limit || 20);

          return {
            success: true,
            count: matchingMemories.length,
            memories: matchingMemories.map((m) => ({
              id: m.id,
              type: m.type,
              content: m.content,
              importance: parseFloat(m.importance),
              createdAt: m.createdAt.toISOString(),
            })),
          };
        } catch (error) {
          console.error(`[IC ${employeeId}] Error fetching memories:`, error);
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
      description: "Add a memory to the database. Useful for storing learnings, insights, or important information for future reference",
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
              employeeId: employeeId,
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
          console.error(`[IC ${employeeId}] Error adding memory:`, error);
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

          // Search in title or description (case-insensitive)
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

          // Get assignee info
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
          console.error(`[IC ${employeeId}] Error searching tasks:`, error);
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

          // Get assignee info
          const assignee = task.assignedTo
            ? await db
                .select()
                .from(employees)
                .where(eq(employees.id, task.assignedTo))
                .limit(1)
                .then((rows) => rows[0] || null)
            : null;

          // Get parent task if exists
          const parentTask = task.parentTaskId
            ? await db
                .select()
                .from(tasks)
                .where(eq(tasks.id, task.parentTaskId))
                .limit(1)
                .then((rows) => rows[0] || null)
            : null;

          // Get subtasks
          const subtasks = await db
            .select()
            .from(tasks)
            .where(eq(tasks.parentTaskId, taskId));

          // Get deliverables for this task
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
          console.error(`[IC ${employeeId}] Error getting task:`, error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
    }),
  };
}

