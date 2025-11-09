import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { FatalError } from "workflow";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  ceoWorkflow,
  createInitialCEOState,
  type CEOState,
} from "@/workflows/employees/ceo-workflow";

/**
 * POST /api/ceo
 * Starts a CEO workflow
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { ceoId, name } = body;

    if (!ceoId) {
      return NextResponse.json(
        { error: "ceoId is required" },
        { status: 400 }
      );
    }

    // Verify CEO exists
    const [ceo] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.id, ceoId), eq(employees.role, "ceo")))
      .limit(1);

    if (!ceo) {
      return NextResponse.json(
        { error: "CEO not found or invalid role" },
        { status: 404 }
      );
    }

    const initialState: CEOState = createInitialCEOState(
      ceoId,
      name || ceo.name
    );

    const result = await start(ceoWorkflow, [initialState]);

    return NextResponse.json({
      success: true,
      workflowRunId: result.runId,
      ceoId: ceoId,
      message: "CEO workflow started successfully",
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
 * GET /api/ceo
 * Lists all CEOs
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const ceos = await db
      .select()
      .from(employees)
      .where(eq(employees.role, "ceo"));

    return NextResponse.json({
      success: true,
      ceos: ceos,
      count: ceos.length,
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

