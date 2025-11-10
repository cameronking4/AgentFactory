import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, deliverables, employees, costs, memories } from "@/lib/db/schema";
import { desc, eq, or, and, gte } from "drizzle-orm";

export interface ActivityItem {
  id: string;
  type: "task_created" | "task_started" | "task_completed" | "deliverable_created" | "deliverable_evaluated" | "employee_active" | "cost_recorded";
  timestamp: string;
  employeeId?: string;
  employeeName?: string;
  taskId?: string;
  taskTitle?: string;
  deliverableId?: string;
  deliverableType?: string;
  costAmount?: string;
  description: string;
  metadata?: Record<string, any>;
}

/**
 * GET /api/activity
 * Get recent activity across tasks, deliverables, employees, and costs
 * Returns a unified activity feed sorted by timestamp
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const hours = parseInt(searchParams.get("hours") || "24", 10);

    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - hours);

    const activities: ActivityItem[] = [];

    // 1. Get recent task status changes
    // Fetch all tasks and filter in memory for better compatibility
    const allRecentTasks = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        assignedTo: tasks.assignedTo,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        completedAt: tasks.completedAt,
      })
      .from(tasks)
      .orderBy(desc(tasks.updatedAt))
      .limit(limit * 3); // Fetch more to account for filtering

    // Filter tasks that have activity in the time window
    const recentTasks = allRecentTasks.filter(
      (task) =>
        task.createdAt >= cutoffTime ||
        (task.status === "in-progress" && task.updatedAt >= cutoffTime) ||
        (task.completedAt && task.completedAt >= cutoffTime)
    );

    for (const task of recentTasks) {
      // Task created
      if (task.createdAt >= cutoffTime) {
        const [employee] = task.assignedTo
          ? await db
              .select({ id: employees.id, name: employees.name })
              .from(employees)
              .where(eq(employees.id, task.assignedTo))
              .limit(1)
          : [null];

        activities.push({
          id: `task_created_${task.id}`,
          type: "task_created",
          timestamp: task.createdAt.toISOString(),
          employeeId: employee?.id,
          employeeName: employee?.name,
          taskId: task.id,
          taskTitle: task.title,
          description: employee
            ? `Task "${task.title}" created and assigned to ${employee.name}`
            : `Task "${task.title}" created`,
        });
      }

      // Task started (moved to in-progress)
      if (task.status === "in-progress" && task.updatedAt >= cutoffTime) {
        const [employee] = task.assignedTo
          ? await db
              .select({ id: employees.id, name: employees.name })
              .from(employees)
              .where(eq(employees.id, task.assignedTo))
              .limit(1)
          : [null];

        activities.push({
          id: `task_started_${task.id}_${task.updatedAt.getTime()}`,
          type: "task_started",
          timestamp: task.updatedAt.toISOString(),
          employeeId: employee?.id,
          employeeName: employee?.name,
          taskId: task.id,
          taskTitle: task.title,
          description: employee
            ? `${employee.name} started working on "${task.title}"`
            : `Task "${task.title}" started`,
        });
      }

      // Task completed
      if (task.completedAt && task.completedAt >= cutoffTime) {
        const [employee] = task.assignedTo
          ? await db
              .select({ id: employees.id, name: employees.name })
              .from(employees)
              .where(eq(employees.id, task.assignedTo))
              .limit(1)
          : [null];

        activities.push({
          id: `task_completed_${task.id}`,
          type: "task_completed",
          timestamp: task.completedAt.toISOString(),
          employeeId: employee?.id,
          employeeName: employee?.name,
          taskId: task.id,
          taskTitle: task.title,
          description: employee
            ? `${employee.name} completed "${task.title}"`
            : `Task "${task.title}" completed`,
        });
      }
    }

    // 2. Get recent deliverables
    const allDeliverables = await db
      .select({
        id: deliverables.id,
        type: deliverables.type,
        taskId: deliverables.taskId,
        createdBy: deliverables.createdBy,
        evaluatedBy: deliverables.evaluatedBy,
        evaluationScore: deliverables.evaluationScore,
        createdAt: deliverables.createdAt,
        updatedAt: deliverables.updatedAt,
      })
      .from(deliverables)
      .orderBy(desc(deliverables.createdAt))
      .limit(limit * 2);

    const recentDeliverables = allDeliverables.filter(
      (deliverable) => deliverable.createdAt >= cutoffTime
    );

    for (const deliverable of recentDeliverables) {
      const [creator] = await db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(eq(employees.id, deliverable.createdBy))
        .limit(1);

      const [task] = deliverable.taskId
        ? await db
            .select({ id: tasks.id, title: tasks.title })
            .from(tasks)
            .where(eq(tasks.id, deliverable.taskId))
            .limit(1)
        : [null];

      activities.push({
        id: `deliverable_created_${deliverable.id}`,
        type: "deliverable_created",
        timestamp: deliverable.createdAt.toISOString(),
        employeeId: creator?.id,
        employeeName: creator?.name,
        taskId: task?.id,
        taskTitle: task?.title,
        deliverableId: deliverable.id,
        deliverableType: deliverable.type,
        description: creator
          ? `${creator.name} created a ${deliverable.type} deliverable${task ? ` for "${task.title}"` : ""}`
          : `Deliverable created${task ? ` for "${task.title}"` : ""}`,
      });

      // If evaluated, add evaluation activity
      if (deliverable.evaluatedBy && deliverable.updatedAt >= cutoffTime) {
        const [evaluator] = await db
          .select({ id: employees.id, name: employees.name })
          .from(employees)
          .where(eq(employees.id, deliverable.evaluatedBy))
          .limit(1);

        activities.push({
          id: `deliverable_evaluated_${deliverable.id}`,
          type: "deliverable_evaluated",
          timestamp: deliverable.updatedAt.toISOString(),
          employeeId: evaluator?.id,
          employeeName: evaluator?.name,
          taskId: task?.id,
          taskTitle: task?.title,
          deliverableId: deliverable.id,
          deliverableType: deliverable.type,
          description: evaluator
            ? `${evaluator.name} evaluated deliverable${deliverable.evaluationScore ? ` (score: ${deliverable.evaluationScore})` : ""}`
            : `Deliverable evaluated${deliverable.evaluationScore ? ` (score: ${deliverable.evaluationScore})` : ""}`,
          metadata: {
            evaluationScore: deliverable.evaluationScore,
          },
        });
      }
    }

    // 3. Get recent costs (API usage)
    const allCosts = await db
      .select({
        id: costs.id,
        amount: costs.amount,
        type: costs.type,
        employeeId: costs.employeeId,
        taskId: costs.taskId,
        timestamp: costs.timestamp,
      })
      .from(costs)
      .orderBy(desc(costs.timestamp))
      .limit(limit * 2);

    const recentCosts = allCosts.filter((cost) => cost.timestamp >= cutoffTime);

    for (const cost of recentCosts) {
      const [employee] = cost.employeeId
        ? await db
            .select({ id: employees.id, name: employees.name })
            .from(employees)
            .where(eq(employees.id, cost.employeeId))
            .limit(1)
        : [null];

      activities.push({
        id: `cost_${cost.id}`,
        type: "cost_recorded",
        timestamp: cost.timestamp.toISOString(),
        employeeId: employee?.id,
        employeeName: employee?.name,
        taskId: cost.taskId || undefined,
        costAmount: cost.amount,
        description: employee
          ? `${employee.name} used ${cost.type} API ($${cost.amount})`
          : `${cost.type} API usage ($${cost.amount})`,
        metadata: {
          costType: cost.type,
        },
      });
    }

    // 4. Get employees currently working (have in-progress tasks)
    const activeEmployees = await db
      .select({
        id: employees.id,
        name: employees.name,
        role: employees.role,
      })
      .from(employees)
      .innerJoin(tasks, eq(tasks.assignedTo, employees.id))
      .where(eq(tasks.status, "in-progress"))
      .groupBy(employees.id, employees.name, employees.role);

    for (const employee of activeEmployees) {
      const inProgressTasks = await db
        .select({ id: tasks.id, title: tasks.title, updatedAt: tasks.updatedAt })
        .from(tasks)
        .where(and(eq(tasks.assignedTo, employee.id), eq(tasks.status, "in-progress")))
        .orderBy(desc(tasks.updatedAt))
        .limit(1);

      if (inProgressTasks.length > 0) {
        const latestTask = inProgressTasks[0];
        // Only add if task was updated recently
        if (latestTask.updatedAt >= cutoffTime) {
          activities.push({
            id: `employee_active_${employee.id}_${latestTask.updatedAt.getTime()}`,
            type: "employee_active",
            timestamp: latestTask.updatedAt.toISOString(),
            employeeId: employee.id,
            employeeName: employee.name,
            taskId: latestTask.id,
            taskTitle: latestTask.title,
            description: `${employee.name} is actively working on "${latestTask.title}"`,
          });
        }
      }
    }

    // Sort all activities by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Limit to requested number
    const limitedActivities = activities.slice(0, limit);

    return NextResponse.json({
      success: true,
      activities: limitedActivities,
      count: limitedActivities.length,
    });
  } catch (error) {
    console.error("Error fetching activity:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        activities: [],
      },
      { status: 500 }
    );
  }
}

