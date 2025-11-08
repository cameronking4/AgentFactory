import { NextResponse } from "next/server";
import { managerEvaluationHook, type ManagerEvent } from "@/workflows/employees/manager-workflow";
import { z } from "zod";

const evaluateDeliverableSchema = z.object({
  type: z.literal("evaluateDeliverable"),
  deliverableId: z.string().uuid(),
  taskId: z.string().uuid(),
});

const evaluateTaskSchema = z.object({
  type: z.literal("evaluateTask"),
  taskId: z.string().uuid(),
});

const eventSchema = z.discriminatedUnion("type", [
  evaluateDeliverableSchema,
  evaluateTaskSchema,
]);

/**
 * POST /api/managers/[managerId]/evaluate
 * Sends an evaluation request to a manager workflow
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ managerId: string }> }
): Promise<NextResponse> {
  try {
    const { managerId } = await params;
    const body = await request.json();

    // Validate input
    const event = eventSchema.parse(body) as ManagerEvent;

    // Send event to manager workflow via hook
    const token = `manager:${managerId}`;
    const result = await managerEvaluationHook.resume(token, event);

    if (result) {
      return NextResponse.json({
        success: true,
        runId: result.runId,
        message: "Evaluation request sent to manager workflow",
      });
    } else {
      return NextResponse.json(
        { error: "Manager workflow not found or hook invalid" },
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

