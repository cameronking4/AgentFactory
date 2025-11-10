"use client";

import type { Meeting, Employee } from "../../types";
import type { ViewMode } from "../../types";

interface MeetingDetailPanelProps {
  meeting: Meeting;
  employees: Employee[];
  onViewModeChange: (mode: ViewMode) => void;
  onEmployeeSelect: (employee: Employee) => void;
}

export function MeetingDetailPanel({
  meeting,
  employees,
  onViewModeChange,
  onEmployeeSelect,
}: MeetingDetailPanelProps) {
  return (
    <>
      <div className="p-6 border-b bg-muted">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex gap-2 items-center mb-2">
              <span className="px-3 py-1 rounded text-sm font-medium border capitalize bg-card">
                {meeting.type}
              </span>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Meeting Transcript</h3>
          </div>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {new Date(meeting.createdAt).toLocaleString()}
          </span>
        </div>

        <div className="text-sm">
          <span className="text-muted-foreground font-medium">Participants: </span>
          <span className="text-foreground">
            {meeting.participants.map((pid, idx) => {
              const emp = employees.find((e) => e.id === pid);
              return (
                <span key={pid}>
                  {idx > 0 && ", "}
                  {emp ? (
                    <span
                      className="text-primary cursor-pointer hover:underline font-medium"
                      onClick={() => {
                        onEmployeeSelect(emp);
                        onViewModeChange("employees");
                      }}
                    >
                      {emp.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{pid.slice(0, 8)}...</span>
                  )}
                </span>
              );
            })}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-foreground mb-2">Transcript</h4>
        </div>
        <div className="rounded-lg border bg-muted p-4">
          <div className="text-sm whitespace-pre-wrap text-foreground leading-relaxed">
            {meeting.transcript}
          </div>
        </div>
      </div>
    </>
  );
}

