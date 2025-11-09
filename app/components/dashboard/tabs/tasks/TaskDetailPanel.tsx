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
      <div className="p-6 border-b bg-gray-50">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex gap-2 items-center mb-2">
              <span
                className={`px-3 py-1 rounded text-sm font-medium border capitalize ${
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
                className={`px-3 py-1 rounded text-sm font-medium border ${
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
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{task.title}</h3>
          </div>
          <span className="text-sm text-gray-500 whitespace-nowrap">
            {new Date(task.createdAt).toLocaleString()}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          {assignee && (
            <div>
              <span className="text-gray-600">Assigned to: </span>
              <span
                className="text-blue-600 cursor-pointer hover:underline font-medium"
                onClick={() => onEmployeeSelect(assignee)}
              >
                {assignee.name}
              </span>
            </div>
          )}
          <div>
            <span className="text-gray-600">Type: </span>
            <span className="font-medium">{task.parentTaskId ? "Subtask" : "High-level Task"}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          {/* Description */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Description</h4>
            <div className="rounded-lg border bg-gray-50 p-4">
              <p className="text-sm whitespace-pre-wrap text-gray-900">{task.description}</p>
            </div>
          </div>

          {/* Stage Times */}
          {Object.keys(taskStageTimes).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Time in Stages</h4>
              <div className="rounded-lg border bg-gray-50 p-4">
                <div className="space-y-2">
                  {Object.entries(taskStageTimes).map(([stage, seconds]) => (
                    <div key={stage} className="flex justify-between items-center text-sm">
                      <span className="capitalize text-gray-700">{stage}</span>
                      <span className="font-medium text-gray-900">{formatDuration(seconds)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Activity Log */}
          {taskActivity.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Activity Log</h4>
              <div className="rounded-lg border bg-gray-50 p-4">
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {taskActivity.map((activity, idx) => (
                    <div key={idx} className="border-l-2 border-gray-300 pl-3 pb-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{activity.description}</div>
                          {activity.employee && (
                            <div className="text-xs mt-1 text-gray-600">by {activity.employee}</div>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
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
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Deliverables ({taskDeliverables.length})
              </h4>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {taskDeliverables.map((deliverable) => (
                  <div key={deliverable.id} className="rounded-lg border bg-white p-4">
                    <div className="flex justify-between items-start mb-2">
                      <span className="px-2 py-1 rounded text-xs font-medium border capitalize">
                        {deliverable.type}
                      </span>
                      {deliverable.evaluationScore !== null && (
                        <span className="px-2 py-1 rounded text-xs font-medium border bg-green-100 text-green-800">
                          {deliverable.evaluationScore}/10
                        </span>
                      )}
                    </div>
                    <div className="text-sm mt-2 whitespace-pre-wrap text-gray-900 line-clamp-3">
                      {deliverable.content}
                    </div>
                    <div className="text-xs mt-2 text-gray-500">
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

