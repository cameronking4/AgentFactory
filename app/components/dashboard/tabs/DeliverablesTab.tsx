"use client";

import { useEffect } from "react";
import { EmptyState } from "../shared/EmptyState";
import { DetailPanel } from "../shared/DetailPanel";
import { DeliverableListItem } from "./deliverables/DeliverableListItem";
import { DeliverableDetailPanel } from "./deliverables/DeliverableDetailPanel";
import type { Deliverable, Task, Employee } from "../types";
import type { ViewMode } from "../types";

interface DeliverablesTabProps {
  deliverables: Deliverable[];
  tasks: Task[];
  employees: Employee[];
  selectedDeliverable: Deliverable | null;
  onDeliverableSelect: (deliverable: Deliverable | null) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onTaskSelect: (task: Task) => void;
  onEmployeeSelect: (employee: Employee) => void;
}

export function DeliverablesTab({
  deliverables,
  tasks,
  employees,
  selectedDeliverable,
  onDeliverableSelect,
  onViewModeChange,
  onTaskSelect,
  onEmployeeSelect,
}: DeliverablesTabProps) {
  // Auto-select first deliverable when switching to deliverables view
  useEffect(() => {
    if (deliverables.length > 0 && !selectedDeliverable) {
      onDeliverableSelect(deliverables[0]);
    }
  }, [deliverables, selectedDeliverable, onDeliverableSelect]);

  if (deliverables.length === 0) {
    return (
      <div className="rounded-lg border shadow overflow-hidden">
        <EmptyState
          title="No deliverables yet"
          description="No deliverables yet. Deliverables will appear here as employees complete work."
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border shadow overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 h-[calc(100vh-300px)]">
        {/* Left Panel - Deliverables List */}
        <div className="border-r overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-muted">
            <h2 className="text-xl font-semibold">All Deliverables</h2>
            <p className="text-sm text-muted-foreground mt-1">{deliverables.length} total</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {deliverables
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((deliverable) => (
                <DeliverableListItem
                  key={deliverable.id}
                  deliverable={deliverable}
                  tasks={tasks}
                  employees={employees}
                  isSelected={selectedDeliverable?.id === deliverable.id}
                  onClick={() => onDeliverableSelect(deliverable)}
                />
              ))}
          </div>
        </div>

        {/* Right Panel - Deliverable Preview */}
        <DetailPanel emptyTitle="Select a deliverable" emptyDescription="Choose an item from the list to view its content">
          {selectedDeliverable && (
            <DeliverableDetailPanel
              deliverable={selectedDeliverable}
              tasks={tasks}
              employees={employees}
              onViewModeChange={onViewModeChange}
              onTaskSelect={onTaskSelect}
              onEmployeeSelect={onEmployeeSelect}
            />
          )}
        </DetailPanel>
      </div>
    </div>
  );
}

