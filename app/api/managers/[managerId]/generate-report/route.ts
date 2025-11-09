import { NextResponse } from "next/server";
import { managerEvaluationHook } from "@/workflows/employees/manager-workflow";

/**
 * POST /api/managers/[managerId]/generate-report
 * Triggers report generation for a manager
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ managerId: string }> }
): Promise<NextResponse> {
  try {
    const { managerId } = await params;

    // Trigger report generation via manager workflow hook
    const token = `manager:${managerId}`;
    const result = await managerEvaluationHook.resume(token, {
      type: "generateReport",
    });

    if (!result) {
      return NextResponse.json(
        { error: "Manager workflow not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      managerId: managerId,
      message: "Report generation triggered successfully",
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

