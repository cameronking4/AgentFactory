import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reports, reportResponses, employees } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * GET /api/reports
 * Lists all reports (optionally filtered by managerId or ceoId)
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const managerId = searchParams.get("managerId");
    const ceoId = searchParams.get("ceoId");
    const status = searchParams.get("status");

    let query = db.select().from(reports);

    if (managerId) {
      query = db
        .select()
        .from(reports)
        .where(eq(reports.managerId, managerId)) as any;
    }

    if (ceoId) {
      query = db
        .select()
        .from(reports)
        .where(eq(reports.ceoId, ceoId)) as any;
    }

    if (status) {
      // Add status filter if needed
      // This would require a more complex query builder
    }

    const allReports = await query.orderBy(desc(reports.createdAt));

    // Get responses and manager/CEO info for each report
    const reportsWithDetails = await Promise.all(
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

        const [ceo] = report.ceoId
          ? await db
              .select()
              .from(employees)
              .where(eq(employees.id, report.ceoId))
              .limit(1)
          : [null];

        return {
          ...report,
          manager: manager ? { id: manager.id, name: manager.name } : null,
          ceo: ceo ? { id: ceo.id, name: ceo.name } : null,
          responses: responses,
        };
      })
    );

    return NextResponse.json({
      success: true,
      reports: reportsWithDetails,
      count: reportsWithDetails.length,
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

