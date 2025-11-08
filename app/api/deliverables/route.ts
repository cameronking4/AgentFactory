import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliverables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/deliverables
 * List all deliverables with optional filters
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId") || undefined;

    let query = db.select().from(deliverables);
    if (taskId) {
      query = db
        .select()
        .from(deliverables)
        .where(eq(deliverables.taskId, taskId)) as any;
    }

    const allDeliverables = await query;

    return NextResponse.json({
      success: true,
      deliverables: allDeliverables,
      count: allDeliverables.length,
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

