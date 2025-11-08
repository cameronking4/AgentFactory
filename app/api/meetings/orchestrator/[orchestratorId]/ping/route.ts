import { NextResponse } from "next/server";
import { meetingOrchestratorHook } from "@/workflows/meetings/meeting-orchestrator";
import { z } from "zod";

const sendPingSchema = z.object({
  from: z.string().uuid(),
  to: z.string().uuid(),
  message: z.string().min(1),
});

/**
 * POST /api/meetings/orchestrator/[orchestratorId]/ping
 * Send an async ping between employees
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orchestratorId: string }> }
): Promise<NextResponse> {
  try {
    const { orchestratorId } = await params;
    const body = await request.json();

    // Validate input
    const validatedData = sendPingSchema.parse(body);

    // Send ping via hook
    const token = `meeting_orchestrator:${orchestratorId}`;
    const result = await meetingOrchestratorHook.resume(token, {
      type: "sendPing",
      from: validatedData.from,
      to: validatedData.to,
      message: validatedData.message,
    });

    if (result) {
      return NextResponse.json({
        success: true,
        runId: result.runId,
        message: "Ping sent successfully",
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

