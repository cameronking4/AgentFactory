import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { FatalError } from "workflow";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  icEmployeeWorkflow,
  createInitialICState,
} from "@/workflows/employees/ic-workflow";

/**
 * POST /api/employees/[employeeId]/start
 * Start an IC workflow for an existing employee
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> }
): Promise<NextResponse> {
  try {
    const { employeeId } = await params;

    // Get employee from database
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    if (employee.role !== "ic") {
      return NextResponse.json(
        { error: "Employee is not an IC" },
        { status: 400 }
      );
    }

    // Create initial state
    const initialState = createInitialICState(
      employee.id,
      employee.name,
      employee.skills,
      employee.managerId
    );

    // Start workflow
    // Note: If workflow is already running, start() will throw or return existing runId
    try {
      const result = await start(icEmployeeWorkflow, [initialState]);

      return NextResponse.json({
        success: true,
        employeeId: employee.id,
        workflowRunId: result.runId,
        message: "IC workflow started successfully",
      });
    } catch (startError) {
      // If workflow is already running, Vercel Workflows may return 503 or throw
      // Check if it's a "already running" scenario
      const message = startError instanceof Error ? startError.message : "Unknown error";
      
      // If it's a 503 or similar, the workflow is likely already running
      if (message.includes("503") || message.includes("already") || message.includes("running")) {
        return NextResponse.json(
          {
            success: false,
            error: "Workflow may already be running",
            message: "IC workflow may already be active",
          },
          { status: 503 }
        );
      }

      const isFatal = startError instanceof FatalError;
      return NextResponse.json(
        {
          error: message,
          fatal: isFatal,
        },
        { status: isFatal ? 400 : 500 }
      );
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

