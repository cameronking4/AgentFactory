import { NextResponse } from "next/server";
import { managerEvaluationHook } from "@/workflows/employees/manager-workflow";
import { z } from "zod";

const reviewRequestSchema = z.object({
  taskId: z.string().uuid(),
  deliverableId: z.string().uuid().optional(),
  action: z.enum(["approve", "requestRevision"]),
  feedback: z.string().optional(), // Required if action is "requestRevision"
});

/**
 * POST /api/managers/[managerId]/review
 * Manager reviews a task - can approve or request revision
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ managerId: string }> }
): Promise<NextResponse> {
  try {
    const { managerId } = await params;
    const body = await request.json();

    // Validate input
    const validatedData = reviewRequestSchema.parse(body);

    // Validate feedback is provided for revision requests
    if (validatedData.action === "requestRevision" && !validatedData.feedback) {
      return NextResponse.json(
        { error: "Feedback is required when requesting revision" },
        { status: 400 }
      );
    }

    if (!validatedData.deliverableId && validatedData.action === "requestRevision") {
      return NextResponse.json(
        { error: "Deliverable ID is required when requesting revision" },
        { status: 400 }
      );
    }

    // Send review action to manager workflow
    const token = `manager:${managerId}`;

    if (validatedData.action === "approve") {
      // Mark as reviewed
      const result = await managerEvaluationHook.resume(token, {
        type: "markReviewed",
        taskId: validatedData.taskId,
      });

      if (result) {
        return NextResponse.json({
          success: true,
          runId: result.runId,
          message: "Task marked as reviewed",
        });
      } else {
        return NextResponse.json(
          { error: "Manager workflow not found" },
          { status: 404 }
        );
      }
    } else {
      // Request revision
      const result = await managerEvaluationHook.resume(token, {
        type: "requestRevision",
        taskId: validatedData.taskId,
        deliverableId: validatedData.deliverableId!,
        feedback: validatedData.feedback!,
      });

      if (result) {
        return NextResponse.json({
          success: true,
          runId: result.runId,
          message: "Revision requested",
        });
      } else {
        return NextResponse.json(
          { error: "Manager workflow not found" },
          { status: 404 }
        );
      }
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

