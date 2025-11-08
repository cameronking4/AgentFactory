"use client";

import { useState, useEffect } from "react";

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
  
  // Data
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [costAggregates, setCostAggregates] = useState<CostAggregates | null>(null);
  const [allDeliverables, setAllDeliverables] = useState<Deliverable[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  
  // Detailed views
  const [taskActivity, setTaskActivity] = useState<TaskActivity[]>([]);
  const [taskDeliverables, setTaskDeliverables] = useState<Deliverable[]>([]);
  const [taskStageTimes, setTaskStageTimes] = useState<Record<string, number>>({});
  const [employeeDetails, setEmployeeDetails] = useState<EmployeeDetails | null>(null);
  const [viewMode, setViewMode] = useState<"tasks" | "employees" | "costs">("tasks");

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Initialize HR workflow on mount
  useEffect(() => {
    const initHR = async () => {
      try {
        const response = await fetch("/api/hr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await response.json();
        if (data.success && data.hrId) {
          setHrId(data.hrId);
        }
      } catch (err) {
        console.error("Error initializing HR:", err);
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
      } catch (err) {
        console.error("Error refreshing data:", err);
      }
    };

    refreshData();
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

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

  const createTask = async () => {
    if (!hrId || !taskTitle.trim() || !taskDescription.trim()) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskTitle,
          description: taskDescription,
          hrId,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setSuccess("Task created and assigned to HR!");
        setTaskTitle("");
        setTaskDescription("");
        // Refresh tasks
        const tasksRes = await fetch("/api/tasks");
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          if (tasksData.success) {
            setTasks(tasksData.tasks || []);
          }
        }
      } else {
        setError(data.error || "Failed to create task");
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
        setSelectedTask(null);
        setSelectedEmployee(null);
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
          <h1 className="text-4xl font-bold mb-2">CEO Dashboard</h1>
          <p className="text-lg">AI Agent Factory - Monitor and manage your autonomous workforce</p>
          {hrId && (
            <p className="text-sm mt-1">
              HR Workflow: <code className="px-2 py-1 rounded border">{hrId.slice(0, 20)}...</code>
            </p>
          )}
        </div>

        {/* Messages */}
        {(error || success) && (
          <div className={`mb-6 p-4 rounded-lg border ${error ? "border-red-500" : "border-green-500"}`}>
            {error || success}
          </div>
        )}

        {/* Task Input Section */}
        <div className="rounded-lg border shadow p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Create New Task</h2>
          <div className="space-y-4">
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
            <div className="flex gap-4">
              <button
                onClick={createTask}
                disabled={loading || !hrId || !taskTitle.trim() || !taskDescription.trim()}
                className="px-6 py-3 rounded-lg border shadow font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Creating Task..." : "Create Task & Assign to HR"}
              </button>
              <button
                onClick={clearDatabase}
                className="px-6 py-3 rounded-lg border shadow font-medium"
              >
                Clear Database
              </button>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="rounded-lg border shadow p-6">
            <div className="text-sm mb-1">Total Tasks</div>
            <div className="text-3xl font-bold">{tasks.length}</div>
            <div className="text-xs mt-1">{highLevelTasks.length} high-level, {subtasks.length} subtasks</div>
          </div>
          <div className="rounded-lg border shadow p-6">
            <div className="text-sm mb-1">Employees</div>
            <div className="text-3xl font-bold">{employees.length}</div>
            <div className="text-xs mt-1">{ics.length} ICs, {managers.length} Managers</div>
          </div>
          <div className="rounded-lg border shadow p-6">
            <div className="text-sm mb-1">Deliverables</div>
            <div className="text-3xl font-bold">{allDeliverables.length}</div>
            <div className="text-xs mt-1">Total completed work</div>
          </div>
          <div className="rounded-lg border shadow p-6">
            <div className="text-sm mb-1">Total Cost</div>
            <div className="text-3xl font-bold">${totalCost.toFixed(2)}</div>
            <div className="text-xs mt-1">USD</div>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="mb-6 flex gap-4">
          <button
            onClick={() => {
              setViewMode("tasks");
              setSelectedEmployee(null);
            }}
            className={`px-4 py-2 rounded-lg border shadow font-medium ${viewMode === "tasks" ? "ring-2" : ""}`}
          >
            Tasks
          </button>
          <button
            onClick={() => {
              setViewMode("employees");
              setSelectedTask(null);
            }}
            className={`px-4 py-2 rounded-lg border shadow font-medium ${viewMode === "employees" ? "ring-2" : ""}`}
          >
            Employees
          </button>
          <button
            onClick={() => {
              setViewMode("costs");
              setSelectedTask(null);
              setSelectedEmployee(null);
            }}
            className={`px-4 py-2 rounded-lg border shadow font-medium ${viewMode === "costs" ? "ring-2" : ""}`}
          >
            Costs
          </button>
        </div>

        {/* Main Content Grid */}
        {viewMode === "costs" ? (
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
        ) : viewMode === "tasks" ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tasks List */}
            <div className="lg:col-span-2 rounded-lg border shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold">Tasks</h2>
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
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {tasks.length === 0 ? (
                  <p className="text-center py-8">No tasks yet. Create your first task above!</p>
                ) : (
                  tasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedTask?.id === task.id ? "ring-2" : ""
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold">{task.title}</h3>
                        <div className="flex gap-2">
                          <span className="px-2 py-1 rounded text-xs font-medium border">
                            {task.status}
                          </span>
                          <span className="px-2 py-1 rounded text-xs font-medium border">
                            {task.priority}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm mb-2 line-clamp-2">{task.description}</p>
                      <div className="flex justify-between items-center text-xs">
                        <span>{task.parentTaskId ? "Subtask" : "High-level Task"}</span>
                        <span>{new Date(task.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Task Details */}
            <div className="space-y-6">
              {selectedTask ? (
                <>
                  {/* Task Info */}
                  <div className="rounded-lg border shadow p-6">
                    <h3 className="text-xl font-semibold mb-4">Task Details</h3>
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm">Status</div>
                        <span className="px-2 py-1 rounded text-xs font-medium border">
                          {selectedTask.status}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm mb-1">Description</div>
                        <p className="text-sm">{selectedTask.description}</p>
                      </div>
                    </div>
                  </div>

                  {/* Stage Times */}
                  {Object.keys(taskStageTimes).length > 0 && (
                    <div className="rounded-lg border shadow p-6">
                      <h3 className="text-xl font-semibold mb-4">Time in Stages</h3>
                      <div className="space-y-2">
                        {Object.entries(taskStageTimes).map(([stage, seconds]) => (
                          <div key={stage} className="flex justify-between items-center">
                            <span className="text-sm capitalize">{stage}</span>
                            <span className="text-sm font-medium">{formatDuration(seconds)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Activity Log */}
                  {taskActivity.length > 0 && (
                    <div className="rounded-lg border shadow p-6">
                      <h3 className="text-xl font-semibold mb-4">Activity Log</h3>
                      <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {taskActivity.map((activity, idx) => (
                          <div key={idx} className="border-l-2 pl-3 pb-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="text-sm font-medium">{activity.description}</div>
                                {activity.employee && (
                                  <div className="text-xs mt-1">by {activity.employee}</div>
                                )}
                              </div>
                              <div className="text-xs">{new Date(activity.timestamp).toLocaleString()}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Deliverables */}
                  {taskDeliverables.length > 0 && (
                    <div className="rounded-lg border shadow p-6">
                      <h3 className="text-xl font-semibold mb-4">Deliverables ({taskDeliverables.length})</h3>
                      <div className="space-y-4 max-h-[400px] overflow-y-auto">
                        {taskDeliverables.map((deliverable) => (
                          <div key={deliverable.id} className="p-4 rounded-lg border">
                            <div className="flex justify-between items-start mb-2">
                              <span className="px-2 py-1 rounded text-xs font-medium border">
                                {deliverable.type}
                              </span>
                              {deliverable.evaluationScore && (
                                <span className="text-sm font-medium">
                                  Score: {deliverable.evaluationScore}/10
                                </span>
                              )}
                            </div>
                            <div className="text-sm mt-2 whitespace-pre-wrap">{deliverable.content}</div>
                            <div className="text-xs mt-2">
                              Created: {new Date(deliverable.createdAt).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-lg border shadow p-6">
                  <p className="text-center py-8">Select a task to view details</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Employees List */}
            <div className="lg:col-span-2 rounded-lg border shadow p-6">
              <h2 className="text-2xl font-semibold mb-4">Employees</h2>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {employees.length === 0 ? (
                  <p className="text-center py-8">No employees yet</p>
                ) : (
                  employees.map((employee) => (
                    <div
                      key={employee.id}
                      onClick={() => setSelectedEmployee(employee)}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedEmployee?.id === employee.id ? "ring-2" : ""
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold">{employee.name}</h3>
                        <span className="px-2 py-1 rounded text-xs font-medium border">
                          {employee.role.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sm">Skills: {employee.skills.join(", ")}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Employee Details */}
            <div className="space-y-6">
              {selectedEmployee && employeeDetails ? (
                <>
                  {/* Employee Info */}
                  <div className="rounded-lg border shadow p-6">
                    <h3 className="text-xl font-semibold mb-4">{employeeDetails.employee.name}</h3>
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm">Role</div>
                        <span className="px-2 py-1 rounded text-xs font-medium border">
                          {employeeDetails.employee.role.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm mb-1">Skills</div>
                        <div className="flex flex-wrap gap-1">
                          {employeeDetails.employee.skills.map((skill, idx) => (
                            <span key={idx} className="px-2 py-1 rounded text-xs border">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Relationships */}
                  <div className="rounded-lg border shadow p-6">
                    <h3 className="text-xl font-semibold mb-4">Relationships</h3>
                    <div className="space-y-3">
                      {employeeDetails.relationships.manager && (
                        <div>
                          <div className="text-sm">Manager</div>
                          <div className="text-sm font-medium">
                            {employeeDetails.relationships.manager.name}
                          </div>
                        </div>
                      )}
                      {employeeDetails.relationships.directReports.length > 0 && (
                        <div>
                          <div className="text-sm mb-2">
                            Direct Reports ({employeeDetails.relationships.directReports.length})
                          </div>
                          <div className="space-y-1">
                            {employeeDetails.relationships.directReports.map((dr) => (
                              <div key={dr.id} className="text-sm">
                                {dr.name}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="rounded-lg border shadow p-6">
                    <h3 className="text-xl font-semibold mb-4">Stats</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs">Current Tasks</div>
                        <div className="text-2xl font-bold">{employeeDetails.stats.currentTasks}</div>
                      </div>
                      <div>
                        <div className="text-xs">Completed</div>
                        <div className="text-2xl font-bold">{employeeDetails.stats.completedTasks}</div>
                      </div>
                      <div>
                        <div className="text-xs">Memories</div>
                        <div className="text-2xl font-bold">{employeeDetails.stats.totalMemories}</div>
                      </div>
                      <div>
                        <div className="text-xs">Pings</div>
                        <div className="text-2xl font-bold">{employeeDetails.stats.totalPings}</div>
                      </div>
                    </div>
                  </div>

                  {/* Memories */}
                  {employeeDetails.memories.length > 0 && (
                    <div className="rounded-lg border shadow p-6">
                      <h3 className="text-xl font-semibold mb-4">Memories ({employeeDetails.memories.length})</h3>
                      <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {employeeDetails.memories.slice(0, 10).map((memory) => (
                          <div key={memory.id} className="p-3 rounded-lg border">
                            <div className="flex justify-between items-start mb-1">
                              <span className="px-2 py-1 rounded text-xs font-medium border">
                                {memory.type}
                              </span>
                              <span className="text-xs">{new Date(memory.createdAt).toLocaleString()}</span>
                            </div>
                            <div className="text-sm mt-2">
                              {memory.content.substring(0, 200)}
                              {memory.content.length > 200 && "..."}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pings */}
                  {employeeDetails.pings.length > 0 && (
                    <div className="rounded-lg border shadow p-6">
                      <h3 className="text-xl font-semibold mb-4">Pings ({employeeDetails.pings.length})</h3>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {employeeDetails.pings.slice(0, 5).map((ping, idx) => (
                          <div key={idx} className="p-3 rounded-lg border">
                            <div className="text-sm">{ping.content.substring(0, 150)}</div>
                            <div className="text-xs mt-1">{new Date(ping.timestamp).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Meetings */}
                  {employeeDetails.meetings.recent.length > 0 && (
                    <div className="rounded-lg border shadow p-6">
                      <h3 className="text-xl font-semibold mb-4">Recent Meetings</h3>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {employeeDetails.meetings.recent.slice(0, 5).map((meeting) => (
                          <div key={meeting.id} className="p-3 rounded-lg border">
                            <div className="flex justify-between items-start mb-1">
                              <span className="px-2 py-1 rounded text-xs font-medium border">
                                {meeting.type}
                              </span>
                              <span className="text-xs">{new Date(meeting.createdAt).toLocaleString()}</span>
                            </div>
                            <div className="text-xs mt-1">{meeting.participants.length} participants</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-lg border shadow p-6">
                  <p className="text-center py-8">Select an employee to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
