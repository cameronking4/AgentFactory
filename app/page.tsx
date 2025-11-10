"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CheckSquare, Users, FileText, DollarSign, Calendar } from "lucide-react";
import { Header } from "./components/dashboard/Header";
import { StatsOverview } from "./components/dashboard/StatsOverview";
import { OverviewTab } from "./components/dashboard/tabs/OverviewTab";
import { TasksTab } from "./components/dashboard/tabs/TasksTab";
import { EmployeesTab } from "./components/dashboard/tabs/EmployeesTab";
import { CostsTab } from "./components/dashboard/tabs/CostsTab";
import { DeliverablesTab } from "./components/dashboard/tabs/DeliverablesTab";
import { MeetingsTab } from "./components/dashboard/tabs/MeetingsTab";
import { useDashboardData } from "./components/dashboard/hooks/useDashboardData";
import { useHRWorkflow } from "./components/dashboard/hooks/useHRWorkflow";
import type { Task, Employee, Deliverable, Meeting, ViewMode } from "./components/dashboard/types";

export default function CEODashboard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedDeliverable, setSelectedDeliverable] = useState<Deliverable | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  const { hrId, error: hrError } = useHRWorkflow();
  const {
    tasks,
    employees,
    costs,
    costAggregates,
    allDeliverables,
    allMeetings,
    setTasks,
    setAllDeliverables,
    setAllMeetings,
  } = useDashboardData(autoRefresh);

  useEffect(() => {
    if (hrError) {
      setError(hrError);
    }
  }, [hrError]);

  const createTask = async (title: string, description: string) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Create task in database
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });

      const data = await response.json();
      if (!data.success || !data.id) {
        setError(data.error || "Failed to create task");
        return;
      }

      // 2. Notify HR workflow about the new task (if we have an hrId)
      if (hrId) {
        try {
          const hrResponse = await fetch(`/api/hr/${hrId}/task`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              taskId: data.id,
              taskTitle: title,
              taskDescription: description,
            }),
          });

          const hrData = await hrResponse.json();
          if (!hrData.success) {
            console.warn("Task created but HR notification failed:", hrData.error);
          }
        } catch (hrErr) {
          console.warn("Task created but HR notification failed:", hrErr);
        }
      } else {
        console.log("Task created without HR ID - will be picked up by proactive check");
      }

      setSuccess("Task created! HR will process it shortly.");
      // Refresh tasks
      const tasksRes = await fetch("/api/tasks");
      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        if (tasksData.success) {
          setTasks(tasksData.tasks || []);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
      setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 1000);
    }
  };

  const clearDatabase = async () => {
    if (!confirm("Are you sure you want to clear all data? This cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch("/api/admin/clear-db", {
        method: "POST",
      });
      const data = await response.json();
      if (data.success) {
        setSuccess("Database cleared successfully");
        setTasks([]);
        setAllDeliverables([]);
        setAllMeetings([]);
        setSelectedTask(null);
        setSelectedEmployee(null);
        setSelectedDeliverable(null);
        setSelectedMeeting(null);
      } else {
        setError(data.error || "Failed to clear database");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const triggerStandups = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/meetings/trigger-standups", {
        method: "POST",
      });
      const data = await response.json();
      if (data.success) {
        setSuccess(`Successfully triggered ${data.meetingsTriggered} standup meeting(s)! Meetings will appear shortly.`);
        // Refresh meetings after a short delay
        setTimeout(() => {
          const refreshData = async () => {
            try {
              const meetingsRes = await fetch("/api/meetings");
              if (meetingsRes.ok) {
                const meetingsData = await meetingsRes.json();
                if (meetingsData.success) {
                  setAllMeetings(meetingsData.meetings || []);
                }
              }
            } catch (err) {
              console.error("Error refreshing meetings:", err);
            }
          };
          refreshData();
        }, 3000);
      } else {
        setError(data.error || "Failed to trigger standup meetings");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleViewModeChange = (newViewMode: ViewMode) => {
    setViewMode(newViewMode);
    // Clear selections when switching tabs
    if (newViewMode === "tasks") {
      setSelectedEmployee(null);
    } else if (newViewMode === "employees") {
      setSelectedTask(null);
    } else {
      setSelectedTask(null);
      setSelectedEmployee(null);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Header hrId={hrId} onCreateTask={createTask} onClearDatabase={clearDatabase} loading={loading} />

        {/* Messages */}
        {(error || success) && (
          <div className={`mb-6 p-4 rounded-lg border ${error ? "border-red-500" : "border-green-500"}`}>
            {error || success}
          </div>
        )}

        {/* View Mode Tabs */}
        <Tabs value={viewMode} onValueChange={(value) => handleViewModeChange(value as ViewMode)} className="mb-2 w-full flex">
          <TabsList className="w-full">
            {[
              {
                value: "overview",
                label: "Overview",
                icon: Calendar
              },
              {
                value: "tasks",
                label: "Tasks",
                icon: CheckSquare
              },
              {
                value: "employees",
                label: "Employees",
                icon: Users
              },
              {
                value: "costs",
                label: "Costs",
                icon: DollarSign
              },
              {
                value: "deliverables",
                label: "Deliverables",
                icon: FileText
              },
              {
                value: "meetings",
                label: "Meetings",
                icon: Calendar
              }
            ].map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value}>
                <Icon className="w-4 h-4 mr-1.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <StatsOverview tasks={tasks} employees={employees} deliverables={allDeliverables} costs={costs} />
            <OverviewTab tasks={tasks} employees={employees} deliverables={allDeliverables} costs={costs} />
          </TabsContent>

          <TabsContent value="tasks" className="mt-6">
            <TasksTab
              tasks={tasks}
              employees={employees}
              autoRefresh={autoRefresh}
              onAutoRefreshChange={setAutoRefresh}
              selectedTask={selectedTask}
              onTaskSelect={setSelectedTask}
              onViewModeChange={handleViewModeChange}
              onEmployeeSelect={setSelectedEmployee}
            />
          </TabsContent>

          <TabsContent value="employees" className="mt-6">
            <EmployeesTab
              employees={employees}
              selectedEmployee={selectedEmployee}
              onEmployeeSelect={setSelectedEmployee}
            />
          </TabsContent>

          <TabsContent value="costs" className="mt-6">
            <CostsTab costs={costs} costAggregates={costAggregates} tasks={tasks} employees={employees} />
          </TabsContent>

          <TabsContent value="deliverables" className="mt-6">
            <DeliverablesTab
              deliverables={allDeliverables}
              tasks={tasks}
              employees={employees}
              selectedDeliverable={selectedDeliverable}
              onDeliverableSelect={setSelectedDeliverable}
              onViewModeChange={handleViewModeChange}
              onTaskSelect={setSelectedTask}
              onEmployeeSelect={setSelectedEmployee}
            />
          </TabsContent>

          <TabsContent value="meetings" className="mt-6">
            <MeetingsTab
              meetings={allMeetings}
              employees={employees}
              selectedMeeting={selectedMeeting}
              onMeetingSelect={setSelectedMeeting}
              onViewModeChange={handleViewModeChange}
              onEmployeeSelect={setSelectedEmployee}
              onTriggerStandups={triggerStandups}
              loading={loading}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
