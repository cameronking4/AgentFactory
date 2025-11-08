import { NextResponse } from "next/server";
import { meetingOrchestratorHook } from "@/workflows/meetings/meeting-orchestrator";
import { z } from "zod";

const pingResponseSchema = z.object({
  pingId: z.string().min(1),
  from: z.string().uuid(), // IC who is responding
  to: z.string().uuid(), // Original sender
  response: z.string().min(1),
});

/**
 * POST /api/meetings/orchestrator/[orchestratorId]/ping/response
 * Send a response to a ping
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orchestratorId: string }> }
): Promise<NextResponse> {
  try {
    const { orchestratorId } = await params;
    const body = await request.json();

    // Validate input
    const validatedData = pingResponseSchema.parse(body);

    // Send ping response via hook
    const token = `meeting_orchestrator:${orchestratorId}`;
    const result = await meetingOrchestratorHook.resume(token, {
      type: "pingResponse",
      pingId: validatedData.pingId,
      from: validatedData.from,
      to: validatedData.to,
      response: validatedData.response,
    });

    if (result) {
      return NextResponse.json({
        success: true,
        runId: result.runId,
        message: "Ping response sent successfully",
      });
    } else {
      return NextResponse.json(
        { error: "Meeting orchestrator not found" },
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

