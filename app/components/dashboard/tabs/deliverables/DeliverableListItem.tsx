"use client";

import type { Deliverable, Task, Employee } from "../../types";

interface DeliverableListItemProps {
  deliverable: Deliverable;
  tasks: Task[];
  employees: Employee[];
  isSelected: boolean;
  onClick: () => void;
}

export function DeliverableListItem({
  deliverable,
  tasks,
  employees,
  isSelected,
  onClick,
}: DeliverableListItemProps) {
  const task = tasks.find((t) => t.id === deliverable.taskId);
  const creator = employees.find((e) => e.id === deliverable.createdBy);

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
            {deliverable.type}
          </span>
          {deliverable.evaluationScore !== null && (
            <span className="px-2 py-1 rounded text-xs font-medium border bg-green-100 text-green-800">
              {deliverable.evaluationScore}/10
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {new Date(deliverable.createdAt).toLocaleDateString()}
        </span>
      </div>
      {task && <div className="text-sm font-medium text-gray-900 mb-1 line-clamp-1">{task.title}</div>}
      {creator && <div className="text-xs text-gray-600">by {creator.name}</div>}
      <div className="text-xs text-gray-500 mt-2 line-clamp-2">
        {deliverable.content.substring(0, 100)}
        {deliverable.content.length > 100 && "..."}
      </div>
    </div>
  );
}

