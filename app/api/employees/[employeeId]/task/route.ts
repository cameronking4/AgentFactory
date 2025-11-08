import { NextResponse } from "next/server";
import { icTaskHook } from "@/workflows/employees/ic-workflow";
import { z } from "zod";

const assignTaskSchema = z.object({
  taskId: z.string().uuid(),
});

/**
 * POST /api/employees/[employeeId]/task
 * Assign a task to an IC
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> }
): Promise<NextResponse> {
  try {
    const { employeeId } = await params;
    const body = await request.json();

    // Validate input
    const validatedData = assignTaskSchema.parse(body);

    // Send task assignment via hook
    const token = `ic:${employeeId}:tasks`;
    const result = await icTaskHook.resume(token, {
      type: "newTask",
      taskId: validatedData.taskId,
    });

    if (result) {
      return NextResponse.json({
        success: true,
        runId: result.runId,
        message: "Task assigned successfully",
      });
    } else {
      return NextResponse.json(
        { error: "IC workflow not found. Start the workflow first." },
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

