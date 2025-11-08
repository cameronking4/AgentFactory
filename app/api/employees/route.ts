import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { employeeQuerySchema } from "@/lib/types";
import { eq, and } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const queryParams = {
      role: searchParams.get("role") || undefined,
      status: searchParams.get("status") || undefined,
    };

    // Validate query parameters
    const validatedQuery = employeeQuerySchema.parse(queryParams);

    // Build query with filters
    const conditions = [];
    if (validatedQuery.role) {
      conditions.push(eq(employees.role, validatedQuery.role));
    }
    if (validatedQuery.status) {
      conditions.push(eq(employees.status, validatedQuery.status));
    }

    const allEmployees = await db
      .select()
      .from(employees)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return NextResponse.json({
      success: true,
      employees: allEmployees,
      count: allEmployees.length,
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

