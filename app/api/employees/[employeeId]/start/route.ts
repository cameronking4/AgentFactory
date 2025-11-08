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
    const result = await start(icEmployeeWorkflow, [initialState]);

    return NextResponse.json({
      success: true,
      employeeId: employee.id,
      workflowRunId: result.runId,
      message: "IC workflow started successfully",
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

