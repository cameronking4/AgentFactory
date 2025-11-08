import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { FatalError } from "workflow";
import { db } from "@/lib/db";
import { meetings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  meetingOrchestratorWorkflow,
  createInitialMeetingOrchestratorState,
  meetingOrchestratorHook,
  type MeetingOrchestratorState,
  type ScheduledMeeting,
} from "@/workflows/meetings/meeting-orchestrator";
import { z } from "zod";

const scheduleMeetingSchema = z.object({
  type: z.enum(["standup", "sync", "ping"]),
  scheduledTime: z.string().datetime(),
  participants: z.array(z.string().uuid()),
  managerId: z.string().uuid().optional(),
  frequency: z.enum(["daily", "weekly", "bi-weekly"]).optional(),
});

/**
 * POST /api/meetings
 * Starts meeting orchestrator or schedules a meeting
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();

    // If body has orchestratorId, schedule a meeting
    if (body.orchestratorId) {
      const validatedData = scheduleMeetingSchema.parse(body);
      const meeting: ScheduledMeeting = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
        type: validatedData.type,
        scheduledTime: validatedData.scheduledTime,
        participants: validatedData.participants,
        managerId: validatedData.managerId,
        frequency: validatedData.frequency,
      };

      const token = `meeting_orchestrator:${body.orchestratorId}`;
      const result = await meetingOrchestratorHook.resume(token, {
        type: "scheduleMeeting",
        meeting,
      });

      if (result) {
        return NextResponse.json({
          success: true,
          meetingId: meeting.id,
          message: "Meeting scheduled successfully",
        });
      } else {
        return NextResponse.json(
          { error: "Meeting orchestrator not found" },
          { status: 404 }
        );
      }
    }

    // Otherwise, start a new meeting orchestrator
    const initialState: MeetingOrchestratorState =
      body.initialState ?? createInitialMeetingOrchestratorState();

    const result = await start(meetingOrchestratorWorkflow, [initialState]);

    return NextResponse.json({
      success: true,
      orchestratorId: result.runId,
      message: "Meeting orchestrator started successfully",
    });
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
    const isFatal = error instanceof FatalError;

    return NextResponse.json(
      {
        error: message,
        fatal: isFatal,
      },
      { status: isFatal ? 400 : 500 }
    );
  }
}

/**
 * GET /api/meetings
 * Lists all meetings
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || undefined;

    let query = db.select().from(meetings);
    if (type) {
      query = db
        .select()
        .from(meetings)
        .where(eq(meetings.type, type as any)) as any;
    }

    const allMeetings = await query;

    return NextResponse.json({
      success: true,
      meetings: allMeetings,
      count: allMeetings.length,
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

