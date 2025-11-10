"use client";

import { useState, useEffect } from "react";
import { EmptyState } from "../shared/EmptyState";
import { DetailPanel } from "../shared/DetailPanel";
import { EmployeeListItem } from "./employees/EmployeeListItem";
import { EmployeeDetailPanel } from "./employees/EmployeeDetailPanel";
import type { Employee, EmployeeDetails } from "../types";

interface EmployeesTabProps {
  employees: Employee[];
  selectedEmployee: Employee | null;
  onEmployeeSelect: (employee: Employee | null) => void;
}

export function EmployeesTab({ employees, selectedEmployee, onEmployeeSelect }: EmployeesTabProps) {
  const [employeeDetails, setEmployeeDetails] = useState<EmployeeDetails | null>(null);

  // Load employee details when selected
  useEffect(() => {
    if (!selectedEmployee) {
      setEmployeeDetails(null);
      return;
    }

    const loadEmployeeDetails = async () => {
      try {
        const response = await fetch(`/api/employees/${selectedEmployee.id}/details`);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setEmployeeDetails(data);
          }
        }
      } catch (err) {
        console.error("Error loading employee details:", err);
      }
    };

    loadEmployeeDetails();
    const interval = setInterval(loadEmployeeDetails, 5000);
    return () => clearInterval(interval);
  }, [selectedEmployee]);

  if (employees.length === 0) {
    return (
      <div className="rounded-lg border shadow overflow-hidden">
        <EmptyState title="No employees yet" description="No employees yet" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border shadow overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 h-[calc(100vh-300px)]">
        {/* Left Panel - Employees List */}
        <div className="border-r overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-muted">
            <h2 className="text-xl font-semibold">All Employees</h2>
            <p className="text-sm text-muted-foreground mt-1">{employees.length} total</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {employees
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((employee) => (
                <EmployeeListItem
                  key={employee.id}
                  employee={employee}
                  employees={employees}
                  isSelected={selectedEmployee?.id === employee.id}
                  onClick={() => onEmployeeSelect(employee)}
                />
              ))}
          </div>
        </div>

        {/* Right Panel - Employee Details */}
        <DetailPanel emptyTitle="Select an employee" emptyDescription="Choose an item from the list to view details">
          {selectedEmployee && employeeDetails && (
            <EmployeeDetailPanel
              employeeDetails={employeeDetails}
              employees={employees}
              onEmployeeSelect={onEmployeeSelect}
            />
          )}
        </DetailPanel>
      </div>
    </div>
  );
}

