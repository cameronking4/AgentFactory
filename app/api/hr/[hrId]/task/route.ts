import { NextResponse } from "next/server";
import { hrTaskHook } from "@/workflows/hr/hr-workflow";
import { z } from "zod";

const sendTaskSchema = z.object({
  taskId: z.string().uuid(),
  taskTitle: z.string().min(1),
  taskDescription: z.string().min(1),
});

/**
 * POST /api/hr/[hrId]/task
 * Sends a new task to an HR workflow instance
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ hrId: string }> }
): Promise<NextResponse> {
  try {
    const { hrId } = await params;
    const body = await request.json();

    // Validate input
    const validatedData = sendTaskSchema.parse(body);

    // Send task to HR workflow via hook
    const token = `hr:${hrId}`;
    const result = await hrTaskHook.resume(token, {
      type: "newTask",
      taskId: validatedData.taskId,
      taskTitle: validatedData.taskTitle,
      taskDescription: validatedData.taskDescription,
    });

    if (result) {
      return NextResponse.json({
        success: true,
        runId: result.runId,
        message: "Task sent to HR workflow",
      });
    } else {
      return NextResponse.json(
        { error: "HR workflow not found or hook invalid" },
        { status: 404 }
      );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}

