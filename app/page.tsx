"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Users, FileText, DollarSign } from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in-progress" | "completed" | "reviewed";
  priority: "low" | "medium" | "high" | "critical";
  assignedTo: string | null;
  parentTaskId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface Employee {
  id: string;
  name: string;
  role: "ic" | "manager";
  skills: string[];
  status: "active" | "terminated";
  managerId: string | null;
}

interface Deliverable {
  id: string;
  taskId: string;
  type: string;
  content: string;
  createdBy: string;
  evaluatedBy: string | null;
  evaluationScore: number | null;
  feedback: string | null;
  createdAt: string;
}

interface Cost {
  id: string;
  employeeId: string | null;
  taskId: string | null;
  type: string;
  amount: string;
  currency: string;
  timestamp: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

interface CostAggregates {
  total: number;
  byType?: Record<string, number>;
  byEmployee?: Record<string, number>;
  byTask?: Record<string, number>;
}

interface Memory {
  id: string;
  employeeId: string;
  type: string;
  content: string;
  importance: number;
  createdAt: string;
}

interface Ping {
  content: string;
  timestamp: string;
}

interface Meeting {
  id: string;
  type: string;
  participants: string[];
  transcript: string;
  createdAt: string;
}

interface Manager {
  id: string;
  name: string;
  role: string;
}

interface DirectReport {
  id: string;
  name: string;
}

interface TaskActivity {
  type: string;
  timestamp: string;
  status?: string;
  description: string;
  employee?: string;
  deliverable?: Deliverable;
}

interface EmployeeDetails {
  employee: Employee;
  relationships: {
    manager: Manager | null;
    directReports: DirectReport[];
  };
  memories: Memory[];
  tasks: {
    current: Task[];
    completed: Task[];
  };
  pings: Ping[];
  meetings: {
    recent: Meeting[];
    upcoming: Meeting[];
  };
  stats: {
    currentTasks: number;
    completedTasks: number;
    totalMemories: number;
    totalPings: number;
  };
}

export default function CEODashboard() {
  const [hrId, setHrId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Task input
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  
  // Data
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [costAggregates, setCostAggregates] = useState<CostAggregates | null>(null);
  const [allDeliverables, setAllDeliverables] = useState<Deliverable[]>([]);
  const [allMeetings, setAllMeetings] = useState<Meeting[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedDeliverable, setSelectedDeliverable] = useState<Deliverable | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  
  // Detailed views
  const [taskActivity, setTaskActivity] = useState<TaskActivity[]>([]);
  const [taskDeliverables, setTaskDeliverables] = useState<Deliverable[]>([]);
  const [taskStageTimes, setTaskStageTimes] = useState<Record<string, number>>({});
  const [employeeDetails, setEmployeeDetails] = useState<EmployeeDetails | null>(null);
  const [viewMode, setViewMode] = useState<"tasks" | "employees" | "costs" | "deliverables" | "meetings">("tasks");

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Initialize HR workflow on mount
  useEffect(() => {
    const initHR = async () => {
      // Try to start a new HR workflow instance
      // If one is already running (503), that's fine - tasks will still be processed
      try {
        const response = await fetch("/api/hr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await response.json();
        
        if (response.status === 503) {
          // HR workflow already running - this is fine, tasks will be processed
          // We can't get the existing workflow ID easily, but that's okay
          // The system will work with the existing workflow
          console.log("HR workflow already running, using existing instance");
          setError(null); // Clear any previous errors
          return;
        }
        
        if (data.success && data.hrId) {
          setHrId(data.hrId);
          setError(null);
        } else {
          setError(data.error || "Failed to initialize HR workflow");
        }
      } catch (err) {
        console.error("Error initializing HR:", err);
        // Don't set error for network issues - might be temporary
        // The system can still work if an HR workflow is already running
      }
    };
    initHR();
  }, []);

  // Auto-refresh data
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
  }, [autoRefresh, viewMode, selectedDeliverable, selectedMeeting]);

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

  // Auto-select first deliverable when switching to deliverables view
  useEffect(() => {
    if (viewMode === "deliverables" && allDeliverables.length > 0 && !selectedDeliverable) {
      setSelectedDeliverable(allDeliverables[0]);
    }
  }, [viewMode, allDeliverables, selectedDeliverable]);

  // Auto-select first meeting when switching to meetings view
  useEffect(() => {
    if (viewMode === "meetings" && allMeetings.length > 0 && !selectedMeeting) {
      setSelectedMeeting(allMeetings[0]);
    }
  }, [viewMode, allMeetings, selectedMeeting]);

  const createTask = async () => {
    if (!taskTitle.trim() || !taskDescription.trim()) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Create task in database
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskTitle,
          description: taskDescription,
        }),
      });

      const data = await response.json();
      if (!data.success || !data.id) {
        setError(data.error || "Failed to create task");
        return;
      }

      // 2. Notify HR workflow about the new task (if we have an hrId)
      // If we don't have an hrId, the HR workflow's proactive checkForPendingTasks will pick it up
      if (hrId) {
        try {
          const hrResponse = await fetch(`/api/hr/${hrId}/task`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              taskId: data.id,
              taskTitle: taskTitle,
              taskDescription: taskDescription,
            }),
          });

          const hrData = await hrResponse.json();
          if (!hrData.success) {
            console.warn("Task created but HR notification failed:", hrData.error);
            // Don't fail - the proactive check will pick it up
          }
        } catch (hrErr) {
          console.warn("Task created but HR notification failed:", hrErr);
          // Don't fail - the proactive check will pick it up
        }
      } else {
        console.log("Task created without HR ID - will be picked up by proactive check");
      }

      setSuccess("Task created! HR will process it shortly.");
      setTaskTitle("");
      setTaskDescription("");
      setTaskDialogOpen(false);
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
        setEmployees([]);
        setCosts([]);
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

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const totalCost = costs.reduce((sum, cost) => sum + parseFloat(cost.amount || "0"), 0);
  const highLevelTasks = tasks.filter((t) => !t.parentTaskId);
  const subtasks = tasks.filter((t) => t.parentTaskId);
  const ics = employees.filter((e) => e.role === "ic");
  const managers = employees.filter((e) => e.role === "manager");

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h1 className="text-4xl font-bold mb-2">CEO Dashboard</h1>
              <p className="text-lg">AI Agent Factory - Monitor and manage your autonomous workforce</p>
              {hrId && (
                <p className="text-sm mt-1">
                  Agent Resources Workflow: <code className="px-2 py-1 rounded border">{hrId.slice(0, 20)}...</code>
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
                <DialogTrigger asChild>
                  <Button>Create Task</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[600px]">
                  <DialogHeader>
                    <DialogTitle>Create New Task</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Task Title</label>
                      <input
                        type="text"
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                        placeholder="e.g., Build a Next.js blog platform"
                        className="w-full px-4 py-2 rounded-lg border focus:outline-none focus:ring-2"
                        disabled={loading || !hrId}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Task Description</label>
                      <textarea
                        value={taskDescription}
                        onChange={(e) => setTaskDescription(e.target.value)}
                        placeholder="Describe the task in detail..."
                        rows={4}
                        className="w-full px-4 py-2 rounded-lg border focus:outline-none focus:ring-2"
                        disabled={loading || !hrId}
                      />
                    </div>
                    <div className="flex gap-4 justify-end">
                      <Button
                        onClick={createTask}
                        disabled={loading || !hrId || !taskTitle.trim() || !taskDescription.trim()}
                      >
                        {loading ? "Creating Task..." : "Create Task & Assign to AR (Agent Resources)"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              {/* Clear Database Button */}
              <div className="mb-8 flex justify-end">
                <Button
                  onClick={clearDatabase}
                  variant="outline"
                >
                  Layoff Staff
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        {(error || success) && (
          <div className={`mb-6 p-4 rounded-lg border ${error ? "border-red-500" : "border-green-500"}`}>
            {error || success}
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 bg-background overflow-hidden rounded-xl border border-border mb-8">
        {[
          {
            title: "Total Tasks",
            subtitle: "All tasks",
            mainValue: tasks.length,
            badge: (
              <Badge className="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400 px-2 py-1 rounded-full text-sm font-medium flex items-center gap-1 shadow-none">
                <CheckSquare className="w-3 h-3 text-blue-500" />
                {highLevelTasks.length} high-level
              </Badge>
            ),
            secondary: (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium">{subtasks.length}</span> subtasks
              </div>
            )
          },
          {
            title: "Employees",
            subtitle: "Active workforce",
            mainValue: employees.length,
            badge: (
              <Badge className="bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400 px-2 py-1 rounded-full text-sm font-medium flex items-center gap-1 shadow-none">
                <Users className="w-3 h-3 text-purple-500" />
                {ics.length} ICs
              </Badge>
            ),
            secondary: (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium">{managers.length}</span> managers
              </div>
            )
          },
          {
            title: "Deliverables",
            subtitle: "Completed work",
            mainValue: allDeliverables.length,
            badge: (
              <Badge className="bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400 px-2 py-1 rounded-full text-sm font-medium flex items-center gap-1 shadow-none">
                <FileText className="w-3 h-3 text-green-500" />
                Total
              </Badge>
            ),
            secondary: (
              <div className="text-sm text-muted-foreground">
                All completed deliverables
              </div>
            )
          },
          {
            title: "Total Cost",
            subtitle: "All time",
            mainValue: `$${totalCost.toFixed(2)}`,
            badge: (
              <Badge className="bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400 px-2 py-1 rounded-full text-sm font-medium flex items-center gap-1 shadow-none">
                <DollarSign className="w-3 h-3 text-orange-500" />
                USD
              </Badge>
            ),
            secondary: (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium">{costs.length}</span> cost records
              </div>
            )
          }
        ].map((stat) => (
          <Card
            key={stat.title}
            className="border-0 shadow-none rounded-none border-y md:border-x md:border-y-0 border-border first:border-t-0 md:first:border-l-0 md:first:border-t last:border-0"
          >
            <CardContent className="flex flex-col h-full space-y-2 justify-between">
              <div className="space-y-0.5">
                <div className="text-lg font-semibold text-foreground">{stat.title}</div>
                <div className="text-sm text-muted-foreground">{stat.subtitle}</div>
              </div>
              <div className="flex-1 flex flex-col gap-1.5 justify-between grow">
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold tracking-tight">{stat.mainValue}</span>
                  {stat.badge}
                </div>
                {stat.secondary}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
        {/* View Mode Tabs */}
        <Tabs 
          value={viewMode} 
          onValueChange={(value) => {
            const newViewMode = value as typeof viewMode;
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
          }}
          className="mb-6"
        >
          <TabsList>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="employees">Employees</TabsTrigger>
            <TabsTrigger value="costs">Costs</TabsTrigger>
            <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
            <TabsTrigger value="meetings">Meetings</TabsTrigger>
          </TabsList>

          {/* Main Content Grid */}
          <TabsContent value="deliverables" className="mt-6">
          <div className="rounded-lg border shadow overflow-hidden">
            {allDeliverables.length === 0 ? (
              <div className="p-8">
                <p className="text-center py-8">No deliverables yet. Deliverables will appear here as employees complete work.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 h-[calc(100vh-300px)]">
                {/* Left Panel - Deliverables List */}
                <div className="border-r overflow-hidden flex flex-col">
                  <div className="p-4 border-b bg-gray-50">
                    <h2 className="text-xl font-semibold">All Deliverables</h2>
                    <p className="text-sm text-gray-600 mt-1">{allDeliverables.length} total</p>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {allDeliverables
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((deliverable) => {
                        const task = tasks.find((t) => t.id === deliverable.taskId);
                        const creator = employees.find((e) => e.id === deliverable.createdBy);
                        const isSelected = selectedDeliverable?.id === deliverable.id;
                        
                        return (
                          <div
                            key={deliverable.id}
                            onClick={() => setSelectedDeliverable(deliverable)}
                            className={`p-4 border-b cursor-pointer transition-colors ${
                              isSelected 
                                ? "bg-blue-50 border-blue-200" 
                                : "hover:bg-gray-50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex gap-2 items-center flex-wrap">
                                <span className="px-2 py-1 rounded text-xs font-medium border capitalize bg-white">
                                  {deliverable.type}
                                </span>
                                {deliverable.evaluationScore !== null && (
                                  <span className="px-2 py-1 rounded text-xs font-medium border bg-green-100 text-green-800">
                                    {deliverable.evaluationScore}/10
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-gray-500 whitespace-nowrap">
                                {new Date(deliverable.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            {task && (
                              <div className="text-sm font-medium text-gray-900 mb-1 line-clamp-1">
                                {task.title}
                              </div>
                            )}
                            {creator && (
                              <div className="text-xs text-gray-600">
                                by {creator.name}
                              </div>
                            )}
                            <div className="text-xs text-gray-500 mt-2 line-clamp-2">
                              {deliverable.content.substring(0, 100)}
                              {deliverable.content.length > 100 && "..."}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Right Panel - Deliverable Preview */}
                <div className="overflow-hidden flex flex-col bg-white">
                  {selectedDeliverable ? (
                    <>
                      <div className="p-6 border-b bg-gray-50">
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex-1">
                            <div className="flex gap-2 items-center mb-2">
                              <span className="px-3 py-1 rounded text-sm font-medium border capitalize bg-white">
                                {selectedDeliverable.type}
                              </span>
                              {selectedDeliverable.evaluationScore !== null && (
                                <span className="px-3 py-1 rounded text-sm font-medium border bg-green-100 text-green-800">
                                  Score: {selectedDeliverable.evaluationScore}/10
                                </span>
                              )}
                            </div>
                            {(() => {
                              const task = tasks.find((t) => t.id === selectedDeliverable.taskId);
                              return task ? (
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                  {task.title}
                                </h3>
                              ) : null;
                            })()}
                          </div>
                          <span className="text-sm text-gray-500 whitespace-nowrap">
                            {new Date(selectedDeliverable.createdAt).toLocaleString()}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          {(() => {
                            const task = tasks.find((t) => t.id === selectedDeliverable.taskId);
                            return task ? (
                              <div>
                                <span className="text-gray-600">Task: </span>
                                <span 
                                  className="text-blue-600 cursor-pointer hover:underline font-medium"
                                  onClick={() => {
                                    setSelectedTask(task);
                                    setViewMode("tasks");
                                  }}
                                >
                                  {task.title}
                                </span>
                              </div>
                            ) : null;
                          })()}
                          {(() => {
                            const creator = employees.find((e) => e.id === selectedDeliverable.createdBy);
                            return creator ? (
                              <div>
                                <span className="text-gray-600">Created by: </span>
                                <span 
                                  className="text-blue-600 cursor-pointer hover:underline font-medium"
                                  onClick={() => {
                                    setSelectedEmployee(creator);
                                    setViewMode("employees");
                                  }}
                                >
                                  {creator.name}
                                </span>
                              </div>
                            ) : null;
                          })()}
                          {(() => {
                            const evaluator = selectedDeliverable.evaluatedBy 
                              ? employees.find((e) => e.id === selectedDeliverable.evaluatedBy) 
                              : null;
                            return evaluator ? (
                              <div>
                                <span className="text-gray-600">Evaluated by: </span>
                                <span 
                                  className="text-blue-600 cursor-pointer hover:underline font-medium"
                                  onClick={() => {
                                    setSelectedEmployee(evaluator);
                                    setViewMode("employees");
                                  }}
                                >
                                  {evaluator.name}
                                </span>
                              </div>
                            ) : null;
                          })()}
                        </div>
                        
                        {selectedDeliverable.feedback && (
                          <div className="mt-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                            <div className="text-sm font-medium text-yellow-900 mb-1">Feedback:</div>
                            <div className="text-sm text-yellow-800">{selectedDeliverable.feedback}</div>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1 overflow-y-auto p-6">
                        <div className="mb-4">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Content</h4>
                        </div>
                        <div className="rounded-lg border bg-gray-50 p-4">
                          <pre className="text-sm whitespace-pre-wrap font-mono overflow-x-auto text-gray-900">
                            {selectedDeliverable.content}
                          </pre>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-500">
                      <div className="text-center">
                        <p className="text-lg mb-2">Select a deliverable</p>
                        <p className="text-sm">Choose an item from the list to view its content</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          </TabsContent>

          <TabsContent value="meetings" className="mt-6">
          <div className="rounded-lg border shadow overflow-hidden">
            {allMeetings.length === 0 ? (
              <div className="p-8">
                <p className="text-center py-8 mb-4">No meetings yet. Meetings will appear here as they are conducted.</p>
                <div className="flex justify-center">
                  <button
                    onClick={async () => {
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
                    }}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Triggering..." : "Trigger Standup Meetings for All Managers"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 h-[calc(100vh-300px)]">
                {/* Left Panel - Meetings List */}
                <div className="border-r overflow-hidden flex flex-col">
                  <div className="p-4 border-b bg-gray-50">
                    <div className="flex justify-between items-center mb-2">
                      <div>
                        <h2 className="text-xl font-semibold">All Meetings</h2>
                        <p className="text-sm text-gray-600 mt-1">{allMeetings.length} total</p>
                      </div>
                      <button
                        onClick={async () => {
                          setLoading(true);
                          setError(null);
                          setSuccess(null);
                          try {
                            const response = await fetch("/api/meetings/trigger-standups", {
                              method: "POST",
                            });
                            const data = await response.json();
                            if (data.success) {
                              setSuccess(`Successfully triggered ${data.meetingsTriggered} standup meeting(s)!`);
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
                        }}
                        disabled={loading}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? "Triggering..." : "Trigger Standups"}
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {allMeetings
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((meeting) => {
                        const isSelected = selectedMeeting?.id === meeting.id;
                        const participantNames = meeting.participants
                          .map((pid) => {
                            const emp = employees.find((e) => e.id === pid);
                            return emp?.name || pid.slice(0, 8) + "...";
                          })
                          .join(", ");
                        
                        return (
                          <div
                            key={meeting.id}
                            onClick={() => setSelectedMeeting(meeting)}
                            className={`p-4 border-b cursor-pointer transition-colors ${
                              isSelected 
                                ? "bg-blue-50 border-blue-200" 
                                : "hover:bg-gray-50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex gap-2 items-center flex-wrap">
                                <span className="px-2 py-1 rounded text-xs font-medium border capitalize bg-white">
                                  {meeting.type}
                                </span>
                              </div>
                              <span className="text-xs text-gray-500 whitespace-nowrap">
                                {new Date(meeting.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 mb-2">
                              {meeting.participants.length} participant{meeting.participants.length !== 1 ? "s" : ""}
                            </div>
                            <div className="text-xs text-gray-500 line-clamp-2">
                              {participantNames}
                            </div>
                            <div className="text-xs text-gray-400 mt-2 line-clamp-1">
                              {meeting.transcript.substring(0, 80)}
                              {meeting.transcript.length > 80 && "..."}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Right Panel - Meeting Transcript Preview */}
                <div className="overflow-hidden flex flex-col bg-white">
                  {selectedMeeting ? (
                    <>
                      <div className="p-6 border-b bg-gray-50">
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex-1">
                            <div className="flex gap-2 items-center mb-2">
                              <span className="px-3 py-1 rounded text-sm font-medium border capitalize bg-white">
                                {selectedMeeting.type}
                              </span>
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                              Meeting Transcript
                            </h3>
                          </div>
                          <span className="text-sm text-gray-500 whitespace-nowrap">
                            {new Date(selectedMeeting.createdAt).toLocaleString()}
                          </span>
                        </div>
                        
                        <div className="text-sm">
                          <span className="text-gray-600 font-medium">Participants: </span>
                          <span className="text-gray-900">
                            {selectedMeeting.participants.map((pid, idx) => {
                              const emp = employees.find((e) => e.id === pid);
                              return (
                                <span key={pid}>
                                  {idx > 0 && ", "}
                                  {emp ? (
                                    <span
                                      className="text-blue-600 cursor-pointer hover:underline font-medium"
                                      onClick={() => {
                                        setSelectedEmployee(emp);
                                        setViewMode("employees");
                                      }}
                                    >
                                      {emp.name}
                                    </span>
                                  ) : (
                                    <span className="text-gray-500">
                                      {pid.slice(0, 8)}...
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto p-6">
                        <div className="mb-4">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Transcript</h4>
                        </div>
                        <div className="rounded-lg border bg-gray-50 p-4">
                          <div className="text-sm whitespace-pre-wrap text-gray-900 leading-relaxed">
                            {selectedMeeting.transcript}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-500">
                      <div className="text-center">
                        <p className="text-lg mb-2">Select a meeting</p>
                        <p className="text-sm">Choose an item from the list to view its transcript</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          </TabsContent>

          <TabsContent value="costs" className="mt-6">
          <div className="rounded-lg border shadow p-6">
            <h2 className="text-2xl font-semibold mb-6">Cost Breakdown</h2>
            
            {costAggregates && (
              <div className="space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="rounded-lg border p-4">
                    <div className="text-sm mb-1">Total Cost</div>
                    <div className="text-2xl font-bold">${costAggregates.total?.toFixed(2) || "0.00"}</div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-sm mb-1">Total Records</div>
                    <div className="text-2xl font-bold">{costs.length}</div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-sm mb-1">Avg per Record</div>
                    <div className="text-2xl font-bold">
                      ${costs.length > 0 ? (costAggregates.total / costs.length).toFixed(4) : "0.00"}
                    </div>
                  </div>
                </div>

                {/* By Type */}
                {costAggregates.byType && Object.keys(costAggregates.byType).length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Costs by Type</h3>
                    <div className="space-y-2">
                      {Object.entries(costAggregates.byType).map(([type, amount]) => (
                        <div key={type} className="flex justify-between items-center p-3 rounded-lg border">
                          <span className="font-medium capitalize">{type}</span>
                          <span>${amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* By Employee */}
                {costAggregates.byEmployee && Object.keys(costAggregates.byEmployee).length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Costs by Employee</h3>
                    <div className="space-y-2">
                      {Object.entries(costAggregates.byEmployee)
                        .sort(([, a], [, b]) => b - a)
                        .map(([employeeId, amount]) => {
                          const employee = employees.find((e) => e.id === employeeId);
                          return (
                            <div key={employeeId} className="flex justify-between items-center p-3 rounded-lg border">
                              <span className="font-medium">
                                {employee?.name || `Employee ${employeeId.slice(0, 8)}...`}
                              </span>
                              <span>${amount.toFixed(2)}</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* By Task */}
                {costAggregates.byTask && Object.keys(costAggregates.byTask).length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Costs by Task</h3>
                    <div className="space-y-2">
                      {Object.entries(costAggregates.byTask)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 10)
                        .map(([taskId, amount]) => {
                          const task = tasks.find((t) => t.id === taskId);
                          return (
                            <div key={taskId} className="flex justify-between items-center p-3 rounded-lg border">
                              <span className="font-medium">
                                {task?.title || `Task ${taskId.slice(0, 8)}...`}
                              </span>
                              <span>${amount.toFixed(2)}</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Recent Costs */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">Recent Costs</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Timestamp</th>
                          <th className="text-left p-2">Employee</th>
                          <th className="text-left p-2">Task</th>
                          <th className="text-left p-2">Type</th>
                          <th className="text-right p-2">Amount</th>
                          <th className="text-right p-2">Tokens</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costs
                          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                          .slice(0, 20)
                          .map((cost) => {
                            const employee = employees.find((e) => e.id === cost.employeeId);
                            const task = tasks.find((t) => t.id === cost.taskId);
                            return (
                              <tr key={cost.id} className="border-b">
                                <td className="p-2">{new Date(cost.timestamp).toLocaleString()}</td>
                                <td className="p-2">
                                  {employee?.name || (cost.employeeId ? `${cost.employeeId.slice(0, 8)}...` : "N/A")}
                                </td>
                                <td className="p-2">
                                  {task ? (
                                    <span className="truncate max-w-xs block" title={task.title}>
                                      {task.title}
                                    </span>
                                  ) : (
                                    cost.taskId ? `${cost.taskId.slice(0, 8)}...` : "N/A"
                                  )}
                                </td>
                                <td className="p-2 capitalize">{cost.type}</td>
                                <td className="p-2 text-right font-medium">${parseFloat(cost.amount).toFixed(4)}</td>
                                <td className="p-2 text-right">
                                  {cost.totalTokens ? cost.totalTokens.toLocaleString() : "—"}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
          </TabsContent>

          <TabsContent value="tasks" className="mt-6">
          <div className="rounded-lg border shadow overflow-hidden">
            {tasks.length === 0 ? (
              <div className="p-8">
                <p className="text-center py-8">No tasks yet. Create your first task above!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 h-[calc(100vh-300px)]">
                {/* Left Panel - Tasks List */}
                <div className="border-r overflow-hidden flex flex-col">
                  <div className="p-4 border-b bg-gray-50">
                    <div className="flex justify-between items-center">
                      <div>
                        <h2 className="text-xl font-semibold">All Tasks</h2>
                        <p className="text-sm text-gray-600 mt-1">{tasks.length} total</p>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={autoRefresh}
                          onChange={(e) => setAutoRefresh(e.target.checked)}
                          className="rounded"
                        />
                        Auto-refresh
                      </label>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {tasks
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((task) => {
                        const isSelected = selectedTask?.id === task.id;
                        const assignee = task.assignedTo ? employees.find((e) => e.id === task.assignedTo) : null;
                        
                        return (
                          <div
                            key={task.id}
                            onClick={() => setSelectedTask(task)}
                            className={`p-4 border-b cursor-pointer transition-colors ${
                              isSelected 
                                ? "bg-blue-50 border-blue-200" 
                                : "hover:bg-gray-50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex gap-2 items-center flex-wrap">
                                <span className={`px-2 py-1 rounded text-xs font-medium border capitalize ${
                                  task.status === "completed" ? "bg-green-100 text-green-800" :
                                  task.status === "in-progress" ? "bg-blue-100 text-blue-800" :
                                  task.status === "reviewed" ? "bg-purple-100 text-purple-800" :
                                  "bg-gray-100 text-gray-800"
                                }`}>
                                  {task.status}
                                </span>
                                <span className={`px-2 py-1 rounded text-xs font-medium border ${
                                  task.priority === "critical" ? "bg-red-100 text-red-800" :
                                  task.priority === "high" ? "bg-orange-100 text-orange-800" :
                                  task.priority === "medium" ? "bg-yellow-100 text-yellow-800" :
                                  "bg-gray-100 text-gray-800"
                                }`}>
                                  {task.priority}
                                </span>
                                {task.parentTaskId && (
                                  <span className="px-2 py-1 rounded text-xs font-medium border bg-white">
                                    Subtask
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-gray-500 whitespace-nowrap">
                                {new Date(task.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="text-sm font-medium text-gray-900 mb-1 line-clamp-1">
                              {task.title}
                            </div>
                            {assignee && (
                              <Badge className="text-xs text-gray-600" variant="outline">
                                Assigned to {assignee.name}
                              </Badge>
                            )}
                            <div className="text-xs text-gray-500 mt-2 line-clamp-2">
                              {task.description}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Right Panel - Task Details */}
                <div className="overflow-hidden flex flex-col bg-white">
                  {selectedTask ? (
                    <>
                      <div className="p-6 border-b bg-gray-50">
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex-1">
                            <div className="flex gap-2 items-center mb-2">
                              <span className={`px-3 py-1 rounded text-sm font-medium border capitalize ${
                                selectedTask.status === "completed" ? "bg-green-100 text-green-800" :
                                selectedTask.status === "in-progress" ? "bg-blue-100 text-blue-800" :
                                selectedTask.status === "reviewed" ? "bg-purple-100 text-purple-800" :
                                "bg-gray-100 text-gray-800"
                              }`}>
                                {selectedTask.status}
                              </span>
                              <span className={`px-3 py-1 rounded text-sm font-medium border ${
                                selectedTask.priority === "critical" ? "bg-red-100 text-red-800" :
                                selectedTask.priority === "high" ? "bg-orange-100 text-orange-800" :
                                selectedTask.priority === "medium" ? "bg-yellow-100 text-yellow-800" :
                                "bg-gray-100 text-gray-800"
                              }`}>
                                {selectedTask.priority}
                              </span>
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                              {selectedTask.title}
                            </h3>
                          </div>
                          <span className="text-sm text-gray-500 whitespace-nowrap">
                            {new Date(selectedTask.createdAt).toLocaleString()}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          {selectedTask.assignedTo && (() => {
                            const assignee = employees.find((e) => e.id === selectedTask.assignedTo);
                            return assignee ? (
                              <div>
                                <span className="text-gray-600">Assigned to: </span>
                                <span 
                                  className="text-blue-600 cursor-pointer hover:underline font-medium"
                                  onClick={() => {
                                    setSelectedEmployee(assignee);
                                    setViewMode("employees");
                                  }}
                                >
                                  {assignee.name}
                                </span>
                              </div>
                            ) : null;
                          })()}
                          <div>
                            <span className="text-gray-600">Type: </span>
                            <span className="font-medium">
                              {selectedTask.parentTaskId ? "Subtask" : "High-level Task"}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto p-6">
                        <div className="space-y-6">
                          {/* Description */}
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Description</h4>
                            <div className="rounded-lg border bg-gray-50 p-4">
                              <p className="text-sm whitespace-pre-wrap text-gray-900">
                                {selectedTask.description}
                              </p>
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
                                        <div className="text-xs text-gray-500">{new Date(activity.timestamp).toLocaleString()}</div>
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
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">Deliverables ({taskDeliverables.length})</h4>
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
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-500">
                      <div className="text-center">
                        <p className="text-lg mb-2">Select a task</p>
                        <p className="text-sm">Choose an item from the list to view its details</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          </TabsContent>

          <TabsContent value="employees" className="mt-6">
          <div className="rounded-lg border shadow overflow-hidden">
            {employees.length === 0 ? (
              <div className="p-8">
                <p className="text-center py-8">No employees yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 h-[calc(100vh-300px)]">
                {/* Left Panel - Employees List */}
                <div className="border-r overflow-hidden flex flex-col">
                  <div className="p-4 border-b bg-gray-50">
                    <h2 className="text-xl font-semibold">All Employees</h2>
                    <p className="text-sm text-gray-600 mt-1">{employees.length} total</p>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {employees
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((employee) => {
                        const isSelected = selectedEmployee?.id === employee.id;
                        const manager = employee.managerId ? employees.find((e) => e.id === employee.managerId) : null;
                        
                        return (
                          <div
                            key={employee.id}
                            onClick={() => setSelectedEmployee(employee)}
                            className={`p-4 border-b cursor-pointer transition-colors ${
                              isSelected 
                                ? "bg-blue-50 border-blue-200" 
                                : "hover:bg-gray-50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex gap-2 items-center flex-wrap">
                                <span className={`px-2 py-1 rounded text-xs font-medium border capitalize ${
                                  employee.role === "manager" 
                                    ? "bg-purple-100 text-purple-800" 
                                    : "bg-blue-100 text-blue-800"
                                }`}>
                                  {employee.role.toUpperCase()}
                                </span>
                                {employee.status === "terminated" && (
                                  <span className="px-2 py-1 rounded text-xs font-medium border bg-red-100 text-red-800">
                                    Terminated
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-sm font-medium text-gray-900 mb-1">
                              {employee.name}
                            </div>
                            {manager && (
                              <div className="text-xs text-gray-600">
                                Manager: {manager.name}
                              </div>
                            )}
                            <div className="text-xs text-gray-500 mt-2 line-clamp-1">
                              Skills: {employee.skills.join(", ")}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Right Panel - Employee Details */}
                <div className="overflow-hidden flex flex-col bg-white">
                  {selectedEmployee && employeeDetails ? (
                    <>
                      <div className="p-6 border-b bg-gray-50">
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex-1">
                            <div className="flex gap-2 items-center mb-2">
                              <span className={`px-3 py-1 rounded text-sm font-medium border capitalize ${
                                employeeDetails.employee.role === "manager" 
                                  ? "bg-purple-100 text-purple-800" 
                                  : "bg-blue-100 text-blue-800"
                              }`}>
                                {employeeDetails.employee.role.toUpperCase()}
                              </span>
                              {employeeDetails.employee.status === "terminated" && (
                                <span className="px-3 py-1 rounded text-sm font-medium border bg-red-100 text-red-800">
                                  Terminated
                                </span>
                              )}
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                              {employeeDetails.employee.name}
                            </h3>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          {employeeDetails.relationships.manager && (
                            <div>
                              <span className="text-gray-600">Manager: </span>
                              <span 
                                className="text-blue-600 cursor-pointer hover:underline font-medium"
                                onClick={() => {
                                  const manager = employees.find((e) => e.id === employeeDetails.employee.managerId);
                                  if (manager) {
                                    setSelectedEmployee(manager);
                                  }
                                }}
                              >
                                {employeeDetails.relationships.manager.name}
                              </span>
                            </div>
                          )}
                          {employeeDetails.relationships.directReports.length > 0 && (
                            <div>
                              <span className="text-gray-600">Direct Reports: </span>
                              <span className="font-medium">
                                {employeeDetails.relationships.directReports.length}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto p-6">
                        <div className="space-y-6">
                          {/* Skills */}
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Skills</h4>
                            <div className="rounded-lg border bg-gray-50 p-4">
                              <div className="flex flex-wrap gap-2">
                                {employeeDetails.employee.skills.map((skill, idx) => (
                                  <span key={idx} className="px-2 py-1 rounded text-xs border bg-white">
                                    {skill}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Stats */}
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Stats</h4>
                            <div className="rounded-lg border bg-gray-50 p-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <div className="text-xs text-gray-600">Current Tasks</div>
                                  <div className="text-2xl font-bold text-gray-900">{employeeDetails.stats.currentTasks}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-600">Completed</div>
                                  <div className="text-2xl font-bold text-gray-900">{employeeDetails.stats.completedTasks}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-600">Memories</div>
                                  <div className="text-2xl font-bold text-gray-900">{employeeDetails.stats.totalMemories}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-600">Pings</div>
                                  <div className="text-2xl font-bold text-gray-900">{employeeDetails.stats.totalPings}</div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Direct Reports */}
                          {employeeDetails.relationships.directReports.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                                Direct Reports ({employeeDetails.relationships.directReports.length})
                              </h4>
                              <div className="rounded-lg border bg-gray-50 p-4">
                                <div className="space-y-2">
                                  {employeeDetails.relationships.directReports.map((dr) => (
                                    <div 
                                      key={dr.id} 
                                      className="text-sm text-blue-600 cursor-pointer hover:underline font-medium"
                                      onClick={() => {
                                        const report = employees.find((e) => e.id === dr.id);
                                        if (report) {
                                          setSelectedEmployee(report);
                                        }
                                      }}
                                    >
                                      {dr.name}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Memories */}
                          {employeeDetails.memories.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">Memories ({employeeDetails.memories.length})</h4>
                              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                                {employeeDetails.memories.slice(0, 10).map((memory) => (
                                  <div key={memory.id} className="rounded-lg border bg-white p-4">
                                    <div className="flex justify-between items-start mb-2">
                                      <span className="px-2 py-1 rounded text-xs font-medium border capitalize">
                                        {memory.type}
                                      </span>
                                      <span className="text-xs text-gray-500">{new Date(memory.createdAt).toLocaleString()}</span>
                                    </div>
                                    <div className="text-sm mt-2 text-gray-900 line-clamp-3">
                                      {memory.content}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Pings */}
                          {employeeDetails.pings.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">Pings ({employeeDetails.pings.length})</h4>
                              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                                {employeeDetails.pings.slice(0, 5).map((ping, idx) => (
                                  <div key={idx} className="rounded-lg border bg-white p-4">
                                    <div className="text-sm text-gray-900 line-clamp-3">{ping.content}</div>
                                    <div className="text-xs mt-2 text-gray-500">{new Date(ping.timestamp).toLocaleString()}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Meetings */}
                          {employeeDetails.meetings.recent.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">Recent Meetings</h4>
                              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                                {employeeDetails.meetings.recent.slice(0, 5).map((meeting) => (
                                  <div key={meeting.id} className="rounded-lg border bg-white p-4">
                                    <div className="flex justify-between items-start mb-2">
                                      <span className="px-2 py-1 rounded text-xs font-medium border capitalize">
                                        {meeting.type}
                                      </span>
                                      <span className="text-xs text-gray-500">{new Date(meeting.createdAt).toLocaleString()}</span>
                                    </div>
                                    <div className="text-xs text-gray-600">{meeting.participants.length} participants</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-500">
                      <div className="text-center">
                        <p className="text-lg mb-2">Select an employee</p>
                        <p className="text-sm">Choose an item from the list to view details</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
