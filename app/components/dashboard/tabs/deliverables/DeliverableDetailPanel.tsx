"use client";

import type { Deliverable, Task, Employee } from "../../types";
import type { ViewMode } from "../../types";

interface DeliverableDetailPanelProps {
  deliverable: Deliverable;
  tasks: Task[];
  employees: Employee[];
  onViewModeChange: (mode: ViewMode) => void;
  onTaskSelect: (task: Task) => void;
  onEmployeeSelect: (employee: Employee) => void;
}

export function DeliverableDetailPanel({
  deliverable,
  tasks,
  employees,
  onViewModeChange,
  onTaskSelect,
  onEmployeeSelect,
}: DeliverableDetailPanelProps) {
  const task = tasks.find((t) => t.id === deliverable.taskId);
  const creator = employees.find((e) => e.id === deliverable.createdBy);
  const evaluator = deliverable.evaluatedBy
    ? employees.find((e) => e.id === deliverable.evaluatedBy)
    : null;

  return (
    <>
      <div className="p-6 border-b bg-gray-50">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex gap-2 items-center mb-2">
              <span className="px-3 py-1 rounded text-sm font-medium border capitalize bg-white">
                {deliverable.type}
              </span>
              {deliverable.evaluationScore !== null && (
                <span className="px-3 py-1 rounded text-sm font-medium border bg-green-100 text-green-800">
                  Score: {deliverable.evaluationScore}/10
                </span>
              )}
            </div>
            {task && <h3 className="text-lg font-semibold text-gray-900 mb-2">{task.title}</h3>}
          </div>
          <span className="text-sm text-gray-500 whitespace-nowrap">
            {new Date(deliverable.createdAt).toLocaleString()}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          {task && (
            <div>
              <span className="text-gray-600">Task: </span>
              <span
                className="text-blue-600 cursor-pointer hover:underline font-medium"
                onClick={() => {
                  onTaskSelect(task);
                  onViewModeChange("tasks");
                }}
              >
                {task.title}
              </span>
            </div>
          )}
          {creator && (
            <div>
              <span className="text-gray-600">Created by: </span>
              <span
                className="text-blue-600 cursor-pointer hover:underline font-medium"
                onClick={() => {
                  onEmployeeSelect(creator);
                  onViewModeChange("employees");
                }}
              >
                {creator.name}
              </span>
            </div>
          )}
          {evaluator && (
            <div>
              <span className="text-gray-600">Evaluated by: </span>
              <span
                className="text-blue-600 cursor-pointer hover:underline font-medium"
                onClick={() => {
                  onEmployeeSelect(evaluator);
                  onViewModeChange("employees");
                }}
              >
                {evaluator.name}
              </span>
            </div>
          )}
        </div>

        {deliverable.feedback && (
          <div className="mt-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
            <div className="text-sm font-medium text-yellow-900 mb-1">Feedback:</div>
            <div className="text-sm text-yellow-800">{deliverable.feedback}</div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Content</h4>
        </div>
        <div className="rounded-lg border bg-gray-50 p-4">
          <pre className="text-sm whitespace-pre-wrap font-mono overflow-x-auto text-gray-900">
            {deliverable.content}
          </pre>
        </div>
      </div>
    </>
  );
}

