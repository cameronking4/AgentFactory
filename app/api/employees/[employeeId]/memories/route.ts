import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { memories } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/employees/[employeeId]/memories
 * Get all memories for an employee
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> }
): Promise<NextResponse> {
  try {
    const { employeeId } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || undefined;

    let query = db
      .select()
      .from(memories)
      .where(eq(memories.employeeId, employeeId));

    if (type) {
      query = db
        .select()
        .from(memories)
        .where(
          and(eq(memories.employeeId, employeeId), eq(memories.type, type as any))
        ) as any;
    }

    const employeeMemories = await query;

    return NextResponse.json({
      success: true,
      memories: employeeMemories,
      count: employeeMemories.length,
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

