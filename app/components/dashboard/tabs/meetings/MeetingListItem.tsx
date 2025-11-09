"use client";

import type { Meeting, Employee } from "../../types";

interface MeetingListItemProps {
  meeting: Meeting;
  employees: Employee[];
  isSelected: boolean;
  onClick: () => void;
}

export function MeetingListItem({ meeting, employees, isSelected, onClick }: MeetingListItemProps) {
  const participantNames = meeting.participants
    .map((pid) => {
      const emp = employees.find((e) => e.id === pid);
      return emp?.name || pid.slice(0, 8) + "...";
    })
    .join(", ");

  return (
    <div
      onClick={onClick}
      className={`p-4 border-b cursor-pointer transition-colors ${
        isSelected ? "bg-blue-50 border-blue-200" : "hover:bg-gray-50"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex gap-2 items-center flex-wrap">
          <span className="px-2 py-1 rounded text-xs font-medium border capitalize bg-white">
            {meeting.type}
          </span>
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {new Date(meeting.createdAt).toLocaleDateString()}
        </span>
      </div>
      <div className="text-xs text-gray-600 mb-2">
        {meeting.participants.length} participant{meeting.participants.length !== 1 ? "s" : ""}
      </div>
      <div className="text-xs text-gray-500 line-clamp-2">{participantNames}</div>
      <div className="text-xs text-gray-400 mt-2 line-clamp-1">
        {meeting.transcript.substring(0, 80)}
        {meeting.transcript.length > 80 && "..."}
      </div>
    </div>
  );
}

