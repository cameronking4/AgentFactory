"use client";

import type { Employee } from "../../types";

interface EmployeeListItemProps {
  employee: Employee;
  employees: Employee[];
  isSelected: boolean;
  onClick: () => void;
}

export function EmployeeListItem({ employee, employees, isSelected, onClick }: EmployeeListItemProps) {
  const manager = employee.managerId ? employees.find((e) => e.id === employee.managerId) : null;

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
              employee.role === "manager"
                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                : "bg-primary/10 text-primary border-primary/20"
            }`}
          >
            {employee.role.toUpperCase()}
          </span>
          {employee.status === "terminated" && (
            <span className="px-2 py-1 rounded text-xs font-medium border bg-destructive/10 text-destructive border-destructive/20">
              Terminated
            </span>
          )}
        </div>
      </div>
      <div className="text-sm font-medium text-foreground mb-1">{employee.name}</div>
      {manager && <div className="text-xs text-muted-foreground">Manager: {manager.name}</div>}
      <div className="text-xs text-muted-foreground mt-2 line-clamp-1">Skills: {employee.skills.join(", ")}</div>
    </div>
  );
}

