"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SlidersHorizontal, SlidersVertical, Calendar, X } from "lucide-react";
import type { Task } from "../types";
import type { DateRangePreset } from "../types";
import { dateRangePresetLabels } from "../utils/dateRange";

interface TaskFiltersProps {
  taskStatusFilter: Set<Task["status"]>;
  taskTypeFilter: "all" | "high-level" | "subtask";
  taskDateRangePreset: string | null;
  onStatusFilterToggle: (status: Task["status"]) => void;
  onStatusFilterReset: () => void;
  onTypeFilterChange: (type: "all" | "high-level" | "subtask") => void;
  onDateRangePresetChange: (preset: DateRangePreset | null) => void;
  onClearAll: () => void;
}

export function TaskFilters({
  taskStatusFilter,
  taskTypeFilter,
  taskDateRangePreset,
  onStatusFilterToggle,
  onStatusFilterReset,
  onTypeFilterChange,
  onDateRangePresetChange,
  onClearAll,
}: TaskFiltersProps) {
  const hasActiveFilters = taskStatusFilter.size < 4 || taskTypeFilter !== "all" || taskDateRangePreset;

  return (
    <div className="flex gap-2 pt-3 border-t">
      {/* Status Filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs">
            <SlidersHorizontal className="w-3 h-3 mr-1.5" />
            Status
            {taskStatusFilter.size < 4 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-xs">
                {taskStatusFilter.size}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Filter by Status</span>
              {taskStatusFilter.size < 4 && (
                <button
                  onClick={onStatusFilterReset}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Select all
                </button>
              )}
            </div>
            {(["pending", "in-progress", "completed", "reviewed"] as Task["status"][]).map((status) => (
              <label key={status} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={taskStatusFilter.has(status)}
                  onChange={() => onStatusFilterToggle(status)}
                  className="rounded"
                />
                <span className="text-sm capitalize">{status}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Type Filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs">
            <SlidersVertical className="w-3 h-3 mr-1.5" />
            {taskTypeFilter === "all" ? "Type" : taskTypeFilter === "high-level" ? "High-level" : "Subtask"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-3" align="start">
          <div className="space-y-2">
            <div className="text-sm font-medium mb-2">Filter by Type</div>
            {(["all", "high-level", "subtask"] as const).map((type) => (
              <label key={type} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="taskType"
                  checked={taskTypeFilter === type}
                  onChange={() => onTypeFilterChange(type)}
                  className="rounded"
                />
                <span className="text-sm">
                  {type === "high-level" ? "High-level" : type === "subtask" ? "Subtask" : "All"}
                </span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Date Range Filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs">
            <Calendar className="w-3 h-3 mr-1.5" />
            {taskDateRangePreset ? dateRangePresetLabels[taskDateRangePreset as DateRangePreset] : "Date Range"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="start">
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Filter by Date</span>
              {taskDateRangePreset && (
                <button
                  onClick={() => onDateRangePresetChange(null)}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {(["1h", "3h", "6h", "12h", "24h", "3d", "1w", "2w", "month", "quarter", "year"] as DateRangePreset[]).map((preset) => (
                <button
                  key={preset}
                  onClick={() => onDateRangePresetChange(preset === taskDateRangePreset ? null : preset)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                    taskDateRangePreset === preset
                      ? "bg-blue-100 text-blue-800"
                      : "hover:bg-gray-100"
                  }`}
                >
                  {dateRangePresetLabels[preset]}
                </button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Clear All Filters */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClearAll}>
          <X className="w-3 h-3 mr-1.5" />
          Clear all
        </Button>
      )}
    </div>
  );
}

