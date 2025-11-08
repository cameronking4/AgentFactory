import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, employees, deliverables, memories, meetings, costs, mcpServers } from "@/lib/db/schema";

/**
 * POST /api/admin/clear-db
 * Clear all data from the database (for testing)
 */
export async function POST(): Promise<NextResponse> {
  try {
    // Delete in order to respect foreign key constraints
    await db.delete(costs);
    await db.delete(deliverables);
    await db.delete(memories);
    await db.delete(meetings);
    await db.delete(tasks);
    await db.delete(mcpServers);
    await db.delete(employees);

    return NextResponse.json({
      success: true,
      message: "Database cleared successfully",
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

