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
        isSelected ? "bg-primary/10 border-primary/20" : "hover:bg-muted"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex gap-2 items-center flex-wrap">
          <span
            className={`px-2 py-1 rounded text-xs font-medium border capitalize ${
              task.status === "completed"
                ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
                : task.status === "in-progress"
                ? "bg-primary/10 text-primary border-primary/20"
                : task.status === "reviewed"
                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                : "bg-muted text-muted-foreground border-border"
            }`}
          >
            {task.status}
          </span>
          <span
            className={`px-2 py-1 rounded text-xs font-medium border ${
              task.priority === "critical"
                ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                : task.priority === "high"
                ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"
                : task.priority === "medium"
                ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20"
                : "bg-muted text-muted-foreground border-border"
            }`}
          >
            {task.priority}
          </span>
          {task.parentTaskId && (
            <span className="px-2 py-1 rounded text-xs font-medium border bg-card">Subtask</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(task.createdAt).toLocaleDateString()}
        </span>
      </div>
      <div className="text-sm font-medium text-foreground mb-1 line-clamp-1">{task.title}</div>
      {assignee && (
        <Badge className="text-xs" variant="outline">
          Assigned to {assignee.name}
        </Badge>
      )}
      <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{task.description}</div>
    </div>
  );
}

