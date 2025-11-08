import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees, tasks, memories, meetings } from "@/lib/db/schema";
import { eq, and, or, desc } from "drizzle-orm";

/**
 * GET /api/employees/[employeeId]/details
 * Get comprehensive employee details including memories, relationships, pings, meetings
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> }
): Promise<NextResponse> {
  try {
    const { employeeId } = await params;

    // Get employee
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    // Get manager if IC
    let manager = null;
    if (employee.managerId) {
      const [managerRecord] = await db
        .select()
        .from(employees)
        .where(eq(employees.id, employee.managerId))
        .limit(1);
      manager = managerRecord
        ? {
            id: managerRecord.id,
            name: managerRecord.name,
            role: managerRecord.role,
          }
        : null;
    }

    // Get direct reports if manager
    let directReports: any[] = [];
    if (employee.role === "manager") {
      directReports = await db
        .select()
        .from(employees)
        .where(eq(employees.managerId, employeeId));
    }

    // Get all memories
    const employeeMemories = await db
      .select()
      .from(memories)
      .where(eq(memories.employeeId, employeeId))
      .orderBy(desc(memories.createdAt));

    // Get current tasks
    const currentTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.assignedTo, employeeId),
          or(eq(tasks.status, "pending"), eq(tasks.status, "in-progress"))
        )
      );

    // Get completed tasks
    const completedTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.assignedTo, employeeId),
          or(eq(tasks.status, "completed"), eq(tasks.status, "reviewed"))
        )
      );

    // Get meetings this employee participated in
    // Fetch all meetings and filter in JavaScript (Drizzle array queries can be tricky)
    const allMeetings = await db
      .select()
      .from(meetings)
      .orderBy(desc(meetings.createdAt))
      .limit(50);
    
    const employeeMeetings = allMeetings.filter((m) =>
      m.participants.includes(employeeId)
    ).slice(0, 10);

    // Extract pings from memories (interaction type)
    const pings = employeeMemories
      .filter((m) => m.type === "interaction")
      .map((m) => ({
        content: m.content,
        timestamp: m.createdAt.toISOString(),
        importance: m.importance,
      }));

    // Get upcoming meetings (would need scheduled meetings - for now use recent)
    const upcomingMeetings = employeeMeetings.slice(0, 3);

    return NextResponse.json({
      success: true,
      employee: {
        id: employee.id,
        name: employee.name,
        role: employee.role,
        skills: employee.skills,
        status: employee.status,
        managerId: employee.managerId,
        createdAt: employee.createdAt.toISOString(),
        updatedAt: employee.updatedAt.toISOString(),
      },
      relationships: {
        manager,
        directReports: directReports.map((dr) => ({
          id: dr.id,
          name: dr.name,
          role: dr.role,
          skills: dr.skills,
        })),
      },
      memories: employeeMemories.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        importance: m.importance,
        createdAt: m.createdAt.toISOString(),
      })),
      tasks: {
        current: currentTasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          createdAt: t.createdAt.toISOString(),
        })),
        completed: completedTasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          completedAt: t.completedAt?.toISOString() || null,
        })),
      },
      pings,
      meetings: {
        recent: employeeMeetings.map((m) => ({
          id: m.id,
          type: m.type,
          participants: m.participants,
          transcript: m.transcript.substring(0, 200) + "...",
          createdAt: m.createdAt.toISOString(),
        })),
        upcoming: upcomingMeetings.map((m) => ({
          id: m.id,
          type: m.type,
          createdAt: m.createdAt.toISOString(),
        })),
      },
      stats: {
        totalMemories: employeeMemories.length,
        currentTasks: currentTasks.length,
        completedTasks: completedTasks.length,
        totalPings: pings.length,
        totalMeetings: employeeMeetings.length,
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

