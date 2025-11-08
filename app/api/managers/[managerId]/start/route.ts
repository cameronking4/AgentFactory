import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { FatalError } from "workflow";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  managerWorkflow,
  createInitialManagerState,
} from "@/workflows/employees/manager-workflow";

/**
 * POST /api/managers/[managerId]/start
 * Starts a manager workflow for an existing manager employee
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ managerId: string }> }
): Promise<NextResponse> {
  try {
    const { managerId } = await params;

    // Get employee from database
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, managerId))
      .limit(1);

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    if (employee.role !== "manager") {
      return NextResponse.json(
        { error: "Employee is not a manager" },
        { status: 400 }
      );
    }

    // Create initial state
    const initialState = createInitialManagerState(managerId, employee.name);

    // Start the manager workflow
    const result = await start(managerWorkflow, [initialState]);

    return NextResponse.json({
      success: true,
      managerId: result.runId,
      message: "Manager workflow started successfully",
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

