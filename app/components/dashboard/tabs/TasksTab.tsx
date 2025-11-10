"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { TaskFilters } from "../shared/TaskFilters";
import { EmptyState } from "../shared/EmptyState";
import { DetailPanel } from "../shared/DetailPanel";
import { TaskDetailPanel } from "./tasks/TaskDetailPanel";
import { TaskListItem } from "./tasks/TaskListItem";
import type { Task, Employee, TaskActivity, Deliverable } from "../types";
import type { DateRangePreset } from "../types";
import { getDateRangeFromPreset } from "../utils/dateRange";

interface TasksTabProps {
  tasks: Task[];
  employees: Employee[];
  autoRefresh: boolean;
  onAutoRefreshChange: (value: boolean) => void;
  selectedTask: Task | null;
  onTaskSelect: (task: Task | null) => void;
  onViewModeChange: (mode: "employees") => void;
  onEmployeeSelect: (employee: Employee) => void;
}

export function TasksTab({
  tasks,
  employees,
  autoRefresh,
  onAutoRefreshChange,
  selectedTask,
  onTaskSelect,
  onViewModeChange,
  onEmployeeSelect,
}: TasksTabProps) {
  const [taskStatusFilter, setTaskStatusFilter] = useState<Set<Task["status"]>>(
    new Set(["pending", "in-progress", "completed", "reviewed"])
  );
  const [taskTypeFilter, setTaskTypeFilter] = useState<"all" | "high-level" | "subtask">("all");
  const [taskDateRangePreset, setTaskDateRangePreset] = useState<string | null>(null);
  const [taskActivity, setTaskActivity] = useState<TaskActivity[]>([]);
  const [taskDeliverables, setTaskDeliverables] = useState<Deliverable[]>([]);
  const [taskStageTimes, setTaskStageTimes] = useState<Record<string, number>>({});

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    if (!taskStatusFilter.has(task.status)) return false;
    if (taskTypeFilter === "high-level" && task.parentTaskId) return false;
    if (taskTypeFilter === "subtask" && !task.parentTaskId) return false;
    if (taskDateRangePreset) {
      const { start, end } = getDateRangeFromPreset(taskDateRangePreset as DateRangePreset);
      if (start && end) {
        const taskDate = new Date(task.createdAt);
        if (taskDate < start || taskDate > end) return false;
      }
    }
    return true;
  });

  // Load task activity when selected
  useEffect(() => {
    if (!selectedTask) {
      setTaskActivity([]);
      setTaskDeliverables([]);
      setTaskStageTimes({});
      return;
    }

    const loadTaskActivity = async () => {
      try {
        const response = await fetch(`/api/tasks/${selectedTask.id}/activity`);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setTaskActivity(data.activities || []);
            setTaskDeliverables(data.deliverables || []);
            setTaskStageTimes(data.stageTimes || {});
          }
        }
      } catch (err) {
        console.error("Error loading task activity:", err);
      }
    };

    loadTaskActivity();
    const interval = setInterval(loadTaskActivity, 5000);
    return () => clearInterval(interval);
  }, [selectedTask]);

  const toggleTaskStatusFilter = (status: Task["status"]) => {
    setTaskStatusFilter((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(status)) {
        newSet.delete(status);
      } else {
        newSet.add(status);
      }
      return newSet;
    });
  };

  const clearAllFilters = () => {
    setTaskStatusFilter(new Set(["pending", "in-progress", "completed", "reviewed"]));
    setTaskTypeFilter("all");
    setTaskDateRangePreset(null);
  };

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border shadow overflow-hidden">
        <EmptyState
          title="No tasks yet"
          description="No tasks yet. Create your first task above!"
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border shadow overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 h-[calc(100vh-300px)]">
        {/* Left Panel - Tasks List */}
        <div className="border-r overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-muted">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h2 className="text-xl font-semibold">All Tasks</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {filteredTasks.length} of {tasks.length} tasks
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => onAutoRefreshChange(e.target.checked)}
                  className="rounded"
                />
                Auto-refresh
              </label>
            </div>

            <TaskFilters
              taskStatusFilter={taskStatusFilter}
              taskTypeFilter={taskTypeFilter}
              taskDateRangePreset={taskDateRangePreset}
              onStatusFilterToggle={toggleTaskStatusFilter}
              onStatusFilterReset={() => setTaskStatusFilter(new Set(["pending", "in-progress", "completed", "reviewed"]))}
              onTypeFilterChange={setTaskTypeFilter}
              onDateRangePresetChange={setTaskDateRangePreset}
              onClearAll={clearAllFilters}
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredTasks.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <p>No tasks match the current filters.</p>
                <button
                  onClick={clearAllFilters}
                  className="mt-2 text-sm text-primary hover:underline"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              filteredTasks
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((task) => (
                  <TaskListItem
                    key={task.id}
                    task={task}
                    employees={employees}
                    isSelected={selectedTask?.id === task.id}
                    onClick={() => onTaskSelect(task)}
                  />
                ))
            )}
          </div>
        </div>

        {/* Right Panel - Task Details */}
        <DetailPanel emptyTitle="Select a task" emptyDescription="Choose an item from the list to view its details">
          {selectedTask && (
            <TaskDetailPanel
              task={selectedTask}
              employees={employees}
              taskActivity={taskActivity}
              taskDeliverables={taskDeliverables}
              taskStageTimes={taskStageTimes}
              onEmployeeSelect={(employee) => {
                onEmployeeSelect(employee);
                onViewModeChange("employees");
              }}
            />
          )}
        </DetailPanel>
      </div>
    </div>
  );
}

