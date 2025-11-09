import { useState, useEffect } from "react";
import type { Task, Employee, Cost, CostAggregates, Deliverable, Meeting } from "../types";

export function useDashboardData(autoRefresh: boolean) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [costAggregates, setCostAggregates] = useState<CostAggregates | null>(null);
  const [allDeliverables, setAllDeliverables] = useState<Deliverable[]>([]);
  const [allMeetings, setAllMeetings] = useState<Meeting[]>([]);

  useEffect(() => {
    if (!autoRefresh) return;

    const refreshData = async () => {
      try {
        // Fetch tasks
        const tasksRes = await fetch("/api/tasks");
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          if (tasksData.success) {
            setTasks(tasksData.tasks || []);
          }
        }

        // Fetch employees
        const employeesRes = await fetch("/api/employees");
        if (employeesRes.ok) {
          const employeesData = await employeesRes.json();
          if (employeesData.success) {
            setEmployees(employeesData.employees || []);
          }
        }

        // Fetch costs
        const costsRes = await fetch("/api/costs");
        if (costsRes.ok) {
          const costsData = await costsRes.json();
          if (costsData.success) {
            setCosts(costsData.costs || []);
            setCostAggregates(costsData.aggregates || null);
          }
        }

        // Fetch all deliverables
        const deliverablesRes = await fetch("/api/deliverables");
        if (deliverablesRes.ok) {
          const deliverablesData = await deliverablesRes.json();
          if (deliverablesData.success) {
            setAllDeliverables(deliverablesData.deliverables || []);
          }
        }

        // Fetch all meetings
        const meetingsRes = await fetch("/api/meetings");
        if (meetingsRes.ok) {
          const meetingsData = await meetingsRes.json();
          if (meetingsData.success) {
            setAllMeetings(meetingsData.meetings || []);
          }
        }
      } catch (err) {
        console.error("Error refreshing data:", err);
      }
    };

    refreshData();
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  return {
    tasks,
    employees,
    costs,
    costAggregates,
    allDeliverables,
    allMeetings,
    setTasks,
    setAllDeliverables,
    setAllMeetings,
  };
}

