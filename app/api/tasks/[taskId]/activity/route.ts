import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, deliverables, memories, employees } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/tasks/[taskId]/activity
 * Get full activity log for a task including status changes, deliverables, and related events
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
): Promise<NextResponse> {
  try {
    const { taskId } = await params;

    // Get task
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    // Get subtasks
    const subtasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.parentTaskId, taskId));

    // Get deliverables
    const taskDeliverables = await db
      .select()
      .from(deliverables)
      .where(eq(deliverables.taskId, taskId));

    // Get employee who created deliverables (for activity log)
    const deliverableActivities = await Promise.all(
      taskDeliverables.map(async (deliverable) => {
        const [creator] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, deliverable.createdBy))
          .limit(1);
        return {
          type: "deliverable_created",
          timestamp: deliverable.createdAt.toISOString(),
          employee: creator?.name || "Unknown",
          deliverable: {
            id: deliverable.id,
            type: deliverable.type,
            evaluationScore: deliverable.evaluationScore,
            evaluatedBy: deliverable.evaluatedBy,
          },
        };
      })
    );

    // Build activity log from task status changes
    const activities = [
      {
        type: "task_created",
        timestamp: task.createdAt.toISOString(),
        status: "pending",
        description: "Task created",
      },
      ...(task.status !== "pending"
        ? [
            {
              type: "status_change",
              timestamp: task.updatedAt.toISOString(),
              status: task.status,
              description: `Task moved to ${task.status}`,
            },
          ]
        : []),
      ...(task.completedAt
        ? [
            {
              type: "task_completed",
              timestamp: task.completedAt.toISOString(),
              status: "completed",
              description: "Task completed",
            },
          ]
        : []),
      ...deliverableActivities,
    ];

    // Sort by timestamp
    activities.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Calculate time in each stage
    const stageTimes: Record<string, number> = {};
    let currentStage = "pending";
    let stageStartTime = new Date(task.createdAt).getTime();

    for (const activity of activities) {
      if (
        (activity.type === "status_change" || activity.type === "task_completed" || activity.type === "task_created") &&
        "status" in activity
      ) {
        const stageEndTime = new Date(activity.timestamp).getTime();
        const duration = stageEndTime - stageStartTime;
        stageTimes[currentStage] = (stageTimes[currentStage] || 0) + duration;
        currentStage = activity.status as string;
        stageStartTime = stageEndTime;
      }
    }

    // Add current stage time if task is still in progress
    if (task.status !== "reviewed" && task.status !== "completed") {
      const now = Date.now();
      const duration = now - stageStartTime;
      stageTimes[currentStage] = (stageTimes[currentStage] || 0) + duration;
    }

    return NextResponse.json({
      success: true,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
        completedAt: task.completedAt?.toISOString() || null,
      },
      subtasks: subtasks.map((st) => ({
        id: st.id,
        title: st.title,
        status: st.status,
        createdAt: st.createdAt.toISOString(),
        updatedAt: st.updatedAt.toISOString(),
        completedAt: st.completedAt?.toISOString() || null,
      })),
      deliverables: taskDeliverables.map((d) => ({
        id: d.id,
        type: d.type,
        content: d.content.substring(0, 500) + (d.content.length > 500 ? "..." : ""),
        createdBy: d.createdBy,
        evaluatedBy: d.evaluatedBy,
        evaluationScore: d.evaluationScore,
        createdAt: d.createdAt.toISOString(),
      })),
      activities,
      stageTimes: Object.fromEntries(
        Object.entries(stageTimes).map(([stage, ms]) => [
          stage,
          Math.round(ms / 1000), // Convert to seconds
        ])
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}

