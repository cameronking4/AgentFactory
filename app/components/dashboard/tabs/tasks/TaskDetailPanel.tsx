"use client";

import type { Task, Employee, TaskActivity, Deliverable } from "../../types";
import { formatDuration } from "../../utils/format";

interface TaskDetailPanelProps {
  task: Task;
  employees: Employee[];
  taskActivity: TaskActivity[];
  taskDeliverables: Deliverable[];
  taskStageTimes: Record<string, number>;
  onEmployeeSelect: (employee: Employee) => void;
}

export function TaskDetailPanel({
  task,
  employees,
  taskActivity,
  taskDeliverables,
  taskStageTimes,
  onEmployeeSelect,
}: TaskDetailPanelProps) {
  const assignee = task.assignedTo ? employees.find((e) => e.id === task.assignedTo) : null;

  return (
    <>
      <div className="p-6 border-b bg-muted">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex gap-2 items-center mb-2">
              <span
                className={`px-3 py-1 rounded text-sm font-medium border capitalize ${
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
                className={`px-3 py-1 rounded text-sm font-medium border ${
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
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">{task.title}</h3>
          </div>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {new Date(task.createdAt).toLocaleString()}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          {assignee && (
            <div>
              <span className="text-muted-foreground">Assigned to: </span>
              <span
                className="text-primary cursor-pointer hover:underline font-medium"
                onClick={() => onEmployeeSelect(assignee)}
              >
                {assignee.name}
              </span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Type: </span>
            <span className="font-medium">{task.parentTaskId ? "Subtask" : "High-level Task"}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          {/* Description */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2">Description</h4>
            <div className="rounded-lg border bg-muted p-4">
              <p className="text-sm whitespace-pre-wrap text-foreground">{task.description}</p>
            </div>
          </div>

          {/* Stage Times */}
          {Object.keys(taskStageTimes).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Time in Stages</h4>
              <div className="rounded-lg border bg-muted p-4">
                <div className="space-y-2">
                  {Object.entries(taskStageTimes).map(([stage, seconds]) => (
                    <div key={stage} className="flex justify-between items-center text-sm">
                      <span className="capitalize text-foreground">{stage}</span>
                      <span className="font-medium text-foreground">{formatDuration(seconds)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Activity Log */}
          {taskActivity.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Activity Log</h4>
              <div className="rounded-lg border bg-muted p-4">
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {taskActivity.map((activity, idx) => (
                    <div key={idx} className="border-l-2 border-border pl-3 pb-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-sm font-medium text-foreground">{activity.description}</div>
                          {activity.employee && (
                            <div className="text-xs mt-1 text-muted-foreground">by {activity.employee}</div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(activity.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Deliverables */}
          {taskDeliverables.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">
                Deliverables ({taskDeliverables.length})
              </h4>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {taskDeliverables.map((deliverable) => (
                  <div key={deliverable.id} className="rounded-lg border bg-card p-4">
                    <div className="flex justify-between items-start mb-2">
                      <span className="px-2 py-1 rounded text-xs font-medium border capitalize">
                        {deliverable.type}
                      </span>
                      {deliverable.evaluationScore !== null && (
                        <span className="px-2 py-1 rounded text-xs font-medium border bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                          {deliverable.evaluationScore}/10
                        </span>
                      )}
                    </div>
                    <div className="text-sm mt-2 whitespace-pre-wrap text-foreground line-clamp-3">
                      {deliverable.content}
                    </div>
                    <div className="text-xs mt-2 text-muted-foreground">
                      Created: {new Date(deliverable.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

