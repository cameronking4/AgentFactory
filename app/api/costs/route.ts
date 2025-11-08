import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { costs } from "@/lib/db/schema";
import { costQuerySchema } from "@/lib/types";
import { eq, and, gte, lte } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const queryParams = {
      employeeId: searchParams.get("employeeId") || undefined,
      taskId: searchParams.get("taskId") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    };

    // Validate query parameters
    const validatedQuery = costQuerySchema.parse(queryParams);

    // Build query with filters
    const conditions = [];
    if (validatedQuery.employeeId) {
      conditions.push(eq(costs.employeeId, validatedQuery.employeeId));
    }
    if (validatedQuery.taskId) {
      conditions.push(eq(costs.taskId, validatedQuery.taskId));
    }
    if (validatedQuery.startDate) {
      conditions.push(gte(costs.timestamp, new Date(validatedQuery.startDate)));
    }
    if (validatedQuery.endDate) {
      conditions.push(lte(costs.timestamp, new Date(validatedQuery.endDate)));
    }

    const allCosts = await db
      .select()
      .from(costs)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    // Calculate aggregates
    const totalAmount = allCosts.reduce((sum, cost) => {
      return sum + parseFloat(cost.amount);
    }, 0);

    const totalByType = allCosts.reduce((acc, cost) => {
      acc[cost.type] = (acc[cost.type] || 0) + parseFloat(cost.amount);
      return acc;
    }, {} as Record<string, number>);

    const totalByEmployee = allCosts.reduce((acc, cost) => {
      if (cost.employeeId) {
        acc[cost.employeeId] = (acc[cost.employeeId] || 0) + parseFloat(cost.amount);
      }
      return acc;
    }, {} as Record<string, number>);

    const totalByTask = allCosts.reduce((acc, cost) => {
      if (cost.taskId) {
        acc[cost.taskId] = (acc[cost.taskId] || 0) + parseFloat(cost.amount);
      }
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({
      success: true,
      costs: allCosts,
      count: allCosts.length,
      aggregates: {
        total: totalAmount,
        byType: totalByType,
        byEmployee: totalByEmployee,
        byTask: totalByTask,
      },
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

