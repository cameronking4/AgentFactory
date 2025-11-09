"use client";

import { useState, useEffect } from "react";
import { EmptyState } from "../shared/EmptyState";
import { DetailPanel } from "../shared/DetailPanel";
import { MeetingListItem } from "./meetings/MeetingListItem";
import { MeetingDetailPanel } from "./meetings/MeetingDetailPanel";
import type { Meeting, Employee } from "../types";
import type { ViewMode } from "../types";

interface MeetingsTabProps {
  meetings: Meeting[];
  employees: Employee[];
  selectedMeeting: Meeting | null;
  onMeetingSelect: (meeting: Meeting | null) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onEmployeeSelect: (employee: Employee) => void;
  onTriggerStandups: () => Promise<void>;
  loading: boolean;
}

export function MeetingsTab({
  meetings,
  employees,
  selectedMeeting,
  onMeetingSelect,
  onViewModeChange,
  onEmployeeSelect,
  onTriggerStandups,
  loading,
}: MeetingsTabProps) {
  // Auto-select first meeting when switching to meetings view
  useEffect(() => {
    if (meetings.length > 0 && !selectedMeeting) {
      onMeetingSelect(meetings[0]);
    }
  }, [meetings, selectedMeeting, onMeetingSelect]);

  if (meetings.length === 0) {
    return (
      <div className="rounded-lg border shadow overflow-hidden">
        <EmptyState
          title="No meetings yet"
          description="No meetings yet. Meetings will appear here as they are conducted."
          action={{
            label: "Trigger Standup Meetings for All Managers",
            onClick: onTriggerStandups,
            loading,
          }}
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border shadow overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 h-[calc(100vh-300px)]">
        {/* Left Panel - Meetings List */}
        <div className="border-r overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-gray-50">
            <div className="flex justify-between items-center mb-2">
              <div>
                <h2 className="text-xl font-semibold">All Meetings</h2>
                <p className="text-sm text-gray-600 mt-1">{meetings.length} total</p>
              </div>
              <button
                onClick={onTriggerStandups}
                disabled={loading}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Triggering..." : "Trigger Standups"}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {meetings
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((meeting) => (
                <MeetingListItem
                  key={meeting.id}
                  meeting={meeting}
                  employees={employees}
                  isSelected={selectedMeeting?.id === meeting.id}
                  onClick={() => onMeetingSelect(meeting)}
                />
              ))}
          </div>
        </div>

        {/* Right Panel - Meeting Transcript Preview */}
        <DetailPanel emptyTitle="Select a meeting" emptyDescription="Choose an item from the list to view its transcript">
          {selectedMeeting && (
            <MeetingDetailPanel
              meeting={selectedMeeting}
              employees={employees}
              onViewModeChange={onViewModeChange}
              onEmployeeSelect={onEmployeeSelect}
            />
          )}
        </DetailPanel>
      </div>
    </div>
  );
}

