import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const updatePersonaSchema = z.object({
  persona: z.string().optional().nullable(),
});

/**
 * GET /api/employees/[employeeId]/persona
 * Get employee persona
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> }
): Promise<NextResponse> {
  try {
    const { employeeId } = await params;

    const [employee] = await db
      .select({ persona: employees.persona })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      persona: employee.persona || null,
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

/**
 * PATCH /api/employees/[employeeId]/persona
 * Update employee persona
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> }
): Promise<NextResponse> {
  try {
    const { employeeId } = await params;
    const body = await request.json();

    // Validate input
    const validatedData = updatePersonaSchema.parse(body);

    // Update employee persona
    const [updated] = await db
      .update(employees)
      .set({
        persona: validatedData.persona || null,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employeeId))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      employee: {
        id: updated.id,
        name: updated.name,
        persona: updated.persona,
      },
      message: "Persona updated successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}

