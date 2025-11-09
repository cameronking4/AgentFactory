import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { FatalError } from "workflow";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  meetingOrchestratorWorkflow,
  createInitialMeetingOrchestratorState,
  meetingOrchestratorHook,
  type MeetingOrchestratorState,
} from "@/workflows/meetings/meeting-orchestrator";

/**
 * POST /api/meetings/trigger-standups
 * Triggers one-time standup meetings for all managers with their direct reports
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
        meetingsTriggered: 0,
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
      // If orchestrator already exists, we might get an error
      // For now, we'll create a new one each time
      // In production, you might want to track orchestrator IDs
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("503") || message.includes("already")) {
        // Try to use a default orchestrator ID or create a new one
        // For simplicity, we'll just return an error asking to retry
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

    // For each manager, get their direct reports and trigger a standup
    const triggeredMeetings: Array<{
      managerId: string;
      managerName: string;
      participantCount: number;
      success: boolean;
      error?: string;
    }> = [];

    for (const manager of managers) {
      try {
        // Get direct reports for this manager
        const directReports = await db
          .select()
          .from(employees)
          .where(eq(employees.managerId, manager.id));

        const participantIds = directReports.map((dr) => dr.id);

        // Only trigger if manager has direct reports
        if (participantIds.length === 0) {
          triggeredMeetings.push({
            managerId: manager.id,
            managerName: manager.name,
            participantCount: 0,
            success: false,
            error: "No direct reports",
          });
          continue;
        }

        // Trigger standup via hook
        const token = `meeting_orchestrator:${orchestratorId}`;
        const result = await meetingOrchestratorHook.resume(token, {
          type: "runStandup",
          managerId: manager.id,
          participantIds,
        });

        if (result) {
          triggeredMeetings.push({
            managerId: manager.id,
            managerName: manager.name,
            participantCount: participantIds.length,
            success: true,
          });
        } else {
          triggeredMeetings.push({
            managerId: manager.id,
            managerName: manager.name,
            participantCount: participantIds.length,
            success: false,
            error: "Failed to trigger meeting",
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        triggeredMeetings.push({
          managerId: manager.id,
          managerName: manager.name,
          participantCount: 0,
          success: false,
          error: message,
        });
      }
    }

    const successfulCount = triggeredMeetings.filter((m) => m.success).length;

    return NextResponse.json({
      success: true,
      orchestratorId,
      meetingsTriggered: successfulCount,
      totalManagers: managers.length,
      details: triggeredMeetings,
      message: `Successfully triggered ${successfulCount} standup meeting(s)`,
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

