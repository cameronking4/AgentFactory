"use client";

import { Badge } from "@/components/ui/badge";
import type { Task, Employee } from "../../types";

interface TaskListItemProps {
  task: Task;
  employees: Employee[];
  isSelected: boolean;
  onClick: () => void;
}

export function TaskListItem({ task, employees, isSelected, onClick }: TaskListItemProps) {
  const assignee = task.assignedTo ? employees.find((e) => e.id === task.assignedTo) : null;

  return (
    <div
      onClick={onClick}
      className={`p-4 border-b cursor-pointer transition-colors ${
        isSelected ? "bg-blue-50 border-blue-200" : "hover:bg-gray-50"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex gap-2 items-center flex-wrap">
          <span
            className={`px-2 py-1 rounded text-xs font-medium border capitalize ${
              task.status === "completed"
                ? "bg-green-100 text-green-800"
                : task.status === "in-progress"
                ? "bg-blue-100 text-blue-800"
                : task.status === "reviewed"
                ? "bg-purple-100 text-purple-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {task.status}
          </span>
          <span
            className={`px-2 py-1 rounded text-xs font-medium border ${
              task.priority === "critical"
                ? "bg-red-100 text-red-800"
                : task.priority === "high"
                ? "bg-orange-100 text-orange-800"
                : task.priority === "medium"
                ? "bg-yellow-100 text-yellow-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {task.priority}
          </span>
          {task.parentTaskId && (
            <span className="px-2 py-1 rounded text-xs font-medium border bg-white">Subtask</span>
          )}
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {new Date(task.createdAt).toLocaleDateString()}
        </span>
      </div>
      <div className="text-sm font-medium text-gray-900 mb-1 line-clamp-1">{task.title}</div>
      {assignee && (
        <Badge className="text-xs text-gray-600" variant="outline">
          Assigned to {assignee.name}
        </Badge>
      )}
      <div className="text-xs text-gray-500 mt-2 line-clamp-2">{task.description}</div>
    </div>
  );
}

