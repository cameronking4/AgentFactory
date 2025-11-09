import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { FatalError } from "workflow";
import {
  hrWorkflow,
  createInitialHRState,
  hrTaskHook,
  type HRState,
} from "@/workflows/hr/hr-workflow";

/**
 * POST /api/hr
 * Starts a new HR workflow instance
 * Note: If a workflow is already running, this will return 503
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const initialState: HRState =
      body.initialState ?? createInitialHRState();

    // Start the HR workflow
    // If workflow is already running, start() may throw or return existing runId
    try {
      const result = await start(hrWorkflow, [initialState]);

      // Return the workflow run ID
      const runId = result.runId;

      return NextResponse.json({
        success: true,
        hrId: runId,
        message: "HR workflow started successfully",
      });
    } catch (startError) {
      // If workflow is already running, Vercel Workflows may return 503 or throw
      const message = startError instanceof Error ? startError.message : "Unknown error";
      
      // If it's a 503 or similar, the workflow is likely already running
      if (message.includes("503") || message.includes("already") || message.includes("running")) {
        return NextResponse.json(
          {
            success: false,
            error: "HR workflow may already be running",
            message: "An HR workflow instance may already be active. Tasks will be processed by the existing instance.",
          },
          { status: 503 }
        );
      }

      // Re-throw other errors
      throw startError;
    }
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
 * GET /api/hr
 * Lists all HR workflow instances (for now, just returns info)
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    // TODO: Query database for HR employees
    // For now, return placeholder
    return NextResponse.json({
      success: true,
      message: "HR endpoint - use POST to start HR workflow",
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

