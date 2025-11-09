import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reports, reportResponses, employees } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { ceoHook } from "@/workflows/employees/ceo-workflow";

/**
 * GET /api/ceo/[ceoId]/reports
 * Lists all reports for a CEO
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ceoId: string }> }
): Promise<NextResponse> {
  try {
    const { ceoId } = await params;

    const allReports = await db
      .select()
      .from(reports)
      .where(eq(reports.ceoId, ceoId))
      .orderBy(desc(reports.createdAt));

    // Get responses for each report
    const reportsWithResponses = await Promise.all(
      allReports.map(async (report) => {
        const responses = await db
          .select()
          .from(reportResponses)
          .where(eq(reportResponses.reportId, report.id))
          .orderBy(desc(reportResponses.createdAt));

        const [manager] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, report.managerId))
          .limit(1);

        return {
          ...report,
          manager: manager ? { id: manager.id, name: manager.name } : null,
          responses: responses,
        };
      })
    );

    return NextResponse.json({
      success: true,
      reports: reportsWithResponses,
      count: reportsWithResponses.length,
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
 * POST /api/ceo/[ceoId]/reports/[reportId]/respond
 * CEO responds to a report
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ ceoId: string; reportId: string }> }
): Promise<NextResponse> {
  try {
    const { ceoId, reportId } = await params;
    const body = await request.json();
    const { response } = body;

    if (!response) {
      return NextResponse.json(
        { error: "response is required" },
        { status: 400 }
      );
    }

    // Verify report exists and belongs to this CEO
    const [report] = await db
      .select()
      .from(reports)
      .where(and(eq(reports.id, reportId), eq(reports.ceoId, ceoId)))
      .limit(1);

    if (!report) {
      return NextResponse.json(
        { error: "Report not found or not assigned to this CEO" },
        { status: 404 }
      );
    }

    // Send response via CEO workflow hook
    const token = `ceo:${ceoId}`;
    const result = await ceoHook.resume(token, {
      type: "respondToReport",
      reportId: reportId,
      response: response,
    });

    if (!result) {
      return NextResponse.json(
        { error: "CEO workflow not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      reportId: reportId,
      message: "Response sent successfully",
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

