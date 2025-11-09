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
        isSelected ? "bg-blue-50 border-blue-200" : "hover:bg-gray-50"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex gap-2 items-center flex-wrap">
          <span
            className={`px-2 py-1 rounded text-xs font-medium border capitalize ${
              employee.role === "manager"
                ? "bg-purple-100 text-purple-800"
                : "bg-blue-100 text-blue-800"
            }`}
          >
            {employee.role.toUpperCase()}
          </span>
          {employee.status === "terminated" && (
            <span className="px-2 py-1 rounded text-xs font-medium border bg-red-100 text-red-800">
              Terminated
            </span>
          )}
        </div>
      </div>
      <div className="text-sm font-medium text-gray-900 mb-1">{employee.name}</div>
      {manager && <div className="text-xs text-gray-600">Manager: {manager.name}</div>}
      <div className="text-xs text-gray-500 mt-2 line-clamp-1">Skills: {employee.skills.join(", ")}</div>
    </div>
  );
}

