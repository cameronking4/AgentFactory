import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees, meetings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  meetingOrchestratorWorkflow,
  createInitialMeetingOrchestratorState,
  meetingOrchestratorHook,
  type MeetingOrchestratorState,
  type ScheduledMeeting,
} from "@/workflows/meetings/meeting-orchestrator";
import { start } from "workflow/api";
import { FatalError } from "workflow";

/**
 * POST /api/meetings/schedule-daily-scrums
 * Schedules daily scrum meetings at 10am for all managers with their direct reports
 * This should be called by a cron job daily at 10am
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    // Get all active managers
    const managers = await db
      .select()
      .from(employees)
      .where(and(eq(employees.role, "manager"), eq(employees.status, "active")));

    if (managers.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No active managers found",
        meetingsScheduled: 0,
      });
    }

    // Start or get meeting orchestrator
    let orchestratorId: string;
    try {
      const initialState: MeetingOrchestratorState =
        createInitialMeetingOrchestratorState();
      const result = await start(meetingOrchestratorWorkflow, [initialState]);
      orchestratorId = result.runId;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("503") || message.includes("already")) {
        // For now, we'll create a new orchestrator each time
        // In production, you might want to track orchestrator IDs
        return NextResponse.json(
          {
            success: false,
            error: "Meeting orchestrator may already be running. Please retry.",
          },
          { status: 503 }
        );
      }
      throw error;
    }

    // Calculate today's 10am in the system timezone
    const now = new Date();
    const today10am = new Date(now);
    today10am.setHours(10, 0, 0, 0);
    
    // If it's already past 10am today, schedule for tomorrow
    const scheduledTime = now.getTime() > today10am.getTime()
      ? new Date(today10am.getTime() + 24 * 60 * 60 * 1000) // Tomorrow 10am
      : today10am; // Today 10am

    // Schedule scrum meetings for each manager
    const scheduledMeetings: Array<{
      managerId: string;
      managerName: string;
      participantCount: number;
      success: boolean;
      error?: string;
      meetingId?: string;
    }> = [];

    for (const manager of managers) {
      try {
        // Get direct reports for this manager
        const directReports = await db
          .select()
          .from(employees)
          .where(eq(employees.managerId, manager.id));

        const participantIds = directReports.map((dr) => dr.id);

        // Only schedule if manager has direct reports
        if (participantIds.length === 0) {
          scheduledMeetings.push({
            managerId: manager.id,
            managerName: manager.name,
            participantCount: 0,
            success: false,
            error: "No direct reports",
          });
          continue;
        }

        // Create scheduled meeting
        const meeting: ScheduledMeeting = {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
          type: "standup", // Use standup type for scrum meetings
          scheduledTime: scheduledTime.toISOString(),
          participants: [manager.id, ...participantIds], // Include manager as participant
          managerId: manager.id,
          frequency: "daily", // Recurring daily
        };

        // Schedule meeting via hook
        const token = `meeting_orchestrator:${orchestratorId}`;
        const result = await meetingOrchestratorHook.resume(token, {
          type: "scheduleMeeting",
          meeting,
        });

        if (result) {
          scheduledMeetings.push({
            managerId: manager.id,
            managerName: manager.name,
            participantCount: participantIds.length,
            success: true,
            meetingId: meeting.id,
          });
        } else {
          scheduledMeetings.push({
            managerId: manager.id,
            managerName: manager.name,
            participantCount: participantIds.length,
            success: false,
            error: "Failed to schedule meeting",
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        scheduledMeetings.push({
          managerId: manager.id,
          managerName: manager.name,
          participantCount: 0,
          success: false,
          error: message,
        });
      }
    }

    const successfulCount = scheduledMeetings.filter((m) => m.success).length;

    return NextResponse.json({
      success: true,
      orchestratorId,
      scheduledTime: scheduledTime.toISOString(),
      meetingsScheduled: successfulCount,
      totalManagers: managers.length,
      details: scheduledMeetings,
      message: `Successfully scheduled ${successfulCount} daily scrum meeting(s) for ${scheduledTime.toLocaleString()}`,
    });
  } catch (error) {
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
 * GET /api/meetings/schedule-daily-scrums
 * Returns information about scheduled daily scrums
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    // Get all active managers
    const managers = await db
      .select()
      .from(employees)
      .where(and(eq(employees.role, "manager"), eq(employees.status, "active")));

    // Get recent scrum meetings (standup type meetings)
    const recentScrums = await db
      .select()
      .from(meetings)
      .where(eq(meetings.type, "standup"))
      .orderBy(meetings.createdAt)
      .limit(50);

    const managerInfo = await Promise.all(
      managers.map(async (manager) => {
        const directReports = await db
          .select()
          .from(employees)
          .where(eq(employees.managerId, manager.id));

        return {
          managerId: manager.id,
          managerName: manager.name,
          directReportCount: directReports.length,
        };
      })
    );

    return NextResponse.json({
      success: true,
      managers: managerInfo,
      recentScrums: recentScrums.map((m) => ({
        id: m.id,
        type: m.type,
        participantCount: m.participants.length,
        createdAt: m.createdAt,
      })),
      message: `Found ${managers.length} active managers`,
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

