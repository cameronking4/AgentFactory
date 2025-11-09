import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reports, reportResponses, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/reports/[reportId]
 * Gets a specific report with responses
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> }
): Promise<NextResponse> {
  try {
    const { reportId } = await params;

    const [report] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1);

    if (!report) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    const responses = await db
      .select()
      .from(reportResponses)
      .where(eq(reportResponses.reportId, reportId))
      .orderBy(reportResponses.createdAt);

    const [manager] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, report.managerId))
      .limit(1);

    const [ceo] = report.ceoId
      ? await db
          .select()
          .from(employees)
          .where(eq(employees.id, report.ceoId))
          .limit(1)
      : [null];

    return NextResponse.json({
      success: true,
      report: {
        ...report,
        manager: manager ? { id: manager.id, name: manager.name } : null,
        ceo: ceo ? { id: ceo.id, name: ceo.name } : null,
        responses: responses,
      },
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

