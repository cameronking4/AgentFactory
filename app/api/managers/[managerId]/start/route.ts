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
    // Note: If workflow is already running, start() will throw or return existing runId
    try {
      const result = await start(managerWorkflow, [initialState]);

      return NextResponse.json({
        success: true,
        managerId: result.runId,
        message: "Manager workflow started successfully",
      });
    } catch (startError) {
      // If workflow is already running, Vercel Workflows may return 503 or throw
      const message = startError instanceof Error ? startError.message : "Unknown error";
      
      // If it's a 503 or similar, the workflow is likely already running
      if (message.includes("503") || message.includes("already") || message.includes("running")) {
        return NextResponse.json(
          {
            success: false,
            error: "Workflow may already be running",
            message: "Manager workflow may already be active",
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

