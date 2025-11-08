import { NextResponse } from "next/server";
import { meetingOrchestratorHook } from "@/workflows/meetings/meeting-orchestrator";
import { z } from "zod";

const runStandupSchema = z.object({
  managerId: z.string().uuid(),
  participantIds: z.array(z.string().uuid()),
});

/**
 * POST /api/meetings/orchestrator/[orchestratorId]/standup
 * Manually trigger a standup meeting
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orchestratorId: string }> }
): Promise<NextResponse> {
  try {
    const { orchestratorId } = await params;
    const body = await request.json();

    // Validate input
    const validatedData = runStandupSchema.parse(body);

    // Trigger standup via hook
    const token = `meeting_orchestrator:${orchestratorId}`;
    const result = await meetingOrchestratorHook.resume(token, {
      type: "runStandup",
      managerId: validatedData.managerId,
      participantIds: validatedData.participantIds,
    });

    if (result) {
      return NextResponse.json({
        success: true,
        runId: result.runId,
        message: "Standup meeting triggered",
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

