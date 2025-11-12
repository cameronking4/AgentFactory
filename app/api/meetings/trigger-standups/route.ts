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

    console.log(`[Trigger Standups] Started orchestrator workflow: ${orchestratorId}`);
    
    // Wait a bit for the workflow to initialize and create the hook
    // The workflow needs time to set up before we can resume hooks
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log(`[Trigger Standups] Waiting period complete, attempting to trigger meetings for ${managers.length} manager(s)`);

    // Helper function to retry hook resume with exponential backoff
    async function resumeHookWithRetry(
      token: string,
      event: { type: "runStandup"; managerId: string; participantIds: string[] },
      maxRetries = 5,
      initialDelay = 500
    ) {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const result = await meetingOrchestratorHook.resume(token, event);
          if (result) {
            if (attempt > 0) {
              console.log(
                `[Trigger Standups] Hook resume succeeded on attempt ${attempt + 1}`
              );
            }
            return result;
          }
          // If result is null, the hook might not be ready yet
          if (attempt < maxRetries - 1) {
            const delay = initialDelay * Math.pow(2, attempt);
            console.log(
              `[Trigger Standups] Hook not ready, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        } catch (error) {
          // If it's not the last attempt, retry
          if (attempt < maxRetries - 1) {
            const delay = initialDelay * Math.pow(2, attempt);
            console.log(
              `[Trigger Standups] Hook resume error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}):`,
              error
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          } else {
            console.error(
              `[Trigger Standups] Hook resume failed after ${maxRetries} attempts:`,
              error
            );
            throw error;
          }
        }
      }
      console.warn(
        `[Trigger Standups] Hook resume returned null after ${maxRetries} attempts`
      );
      return null;
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

        console.log(
          `[Trigger Standups] Manager ${manager.name} (${manager.id}) has ${participantIds.length} direct report(s)`
        );

        // Only trigger if manager has direct reports
        if (participantIds.length === 0) {
          console.log(
            `[Trigger Standups] Skipping manager ${manager.name} - no direct reports`
          );
          triggeredMeetings.push({
            managerId: manager.id,
            managerName: manager.name,
            participantCount: 0,
            success: false,
            error: "No direct reports",
          });
          continue;
        }

        // Trigger standup via hook with retry
        const token = `meeting_orchestrator:${orchestratorId}`;
        console.log(
          `[Trigger Standups] Attempting to trigger standup for manager ${manager.name} with ${participantIds.length} participant(s)`
        );
        const result = await resumeHookWithRetry(token, {
          type: "runStandup",
          managerId: manager.id,
          participantIds,
        });

        if (result) {
          console.log(
            `[Trigger Standups] Successfully triggered standup for manager ${manager.name}`
          );
          triggeredMeetings.push({
            managerId: manager.id,
            managerName: manager.name,
            participantCount: participantIds.length,
            success: true,
          });
        } else {
          console.error(
            `[Trigger Standups] Failed to trigger standup for manager ${manager.name} - hook not ready after retries`
          );
          triggeredMeetings.push({
            managerId: manager.id,
            managerName: manager.name,
            participantCount: participantIds.length,
            success: false,
            error: "Failed to trigger meeting - hook not ready after retries",
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

