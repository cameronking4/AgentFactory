import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { createTaskInputSchema, taskQuerySchema } from "@/lib/types";
import { eq, and } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate input
    const validatedData = createTaskInputSchema.parse(body);

    // Insert task into database
    const [newTask] = await db
      .insert(tasks)
      .values({
        title: validatedData.title,
        description: validatedData.description,
        parentTaskId: validatedData.parentTaskId || null,
        assignedTo: validatedData.assignedTo || null,
        priority: validatedData.priority || "medium",
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        id: newTask.id,
        task: newTask,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const queryParams = {
      status: searchParams.get("status") || undefined,
      assignedTo: searchParams.get("assignedTo") || undefined,
    };

    // Validate query parameters
    const validatedQuery = taskQuerySchema.parse(queryParams);

    // Build query with filters
    const conditions = [];
    if (validatedQuery.status) {
      conditions.push(eq(tasks.status, validatedQuery.status));
    }
    if (validatedQuery.assignedTo) {
      conditions.push(eq(tasks.assignedTo, validatedQuery.assignedTo));
    }

    const allTasks = await db
      .select()
      .from(tasks)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return NextResponse.json({
      success: true,
      tasks: allTasks,
      count: allTasks.length,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}

