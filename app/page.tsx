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

interface TaskActivity {
  type: string;
  timestamp: string;
  status?: string;
  description: string;
  employee?: string;
  deliverable?: any;
}

interface EmployeeDetails {
  employee: Employee;
  relationships: {
    manager: any;
    directReports: any[];
  };
  memories: any[];
  tasks: {
    current: any[];
    completed: any[];
  };
  pings: any[];
  meetings: {
    recent: any[];
    upcoming: any[];
  };
  stats: any;
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
  const [costs, setCosts] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  
  // Detailed views
  const [taskActivity, setTaskActivity] = useState<TaskActivity[]>([]);
  const [taskDeliverables, setTaskDeliverables] = useState<any[]>([]);
  const [taskStageTimes, setTaskStageTimes] = useState<Record<string, number>>({});
  const [employeeDetails, setEmployeeDetails] = useState<EmployeeDetails | null>(null);
  const [viewMode, setViewMode] = useState<"tasks" | "employees">("tasks");

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
    if (!taskTitle.trim() || !taskDescription.trim()) {
      setError("Please provide both title and description");
      return;
    }

    if (!hrId) {
      setError("HR workflow not initialized. Please refresh the page.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const taskResponse = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskTitle,
          description: taskDescription,
          priority: "high",
        }),
      });

      const taskData = await taskResponse.json();
      if (!taskResponse.ok) {
        throw new Error(taskData.error || "Failed to create task");
      }

      const hrResponse = await fetch(`/api/hr/${hrId}/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: taskData.task.id,
          taskTitle: taskTitle,
          taskDescription: taskDescription,
        }),
      });

      const hrData = await hrResponse.json();
      if (!hrResponse.ok) {
        throw new Error(hrData.error || "Failed to send task to HR");
      }

      setSuccess(`Task created and sent to HR! Task ID: ${taskData.task.id.slice(0, 8)}...`);
      setTaskTitle("");
      setTaskDescription("");

      setTimeout(async () => {
        const tasksRes = await fetch("/api/tasks");
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          if (tasksData.success) {
            setTasks(tasksData.tasks || []);
          }
        }
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
      case "in-progress":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "reviewed":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "low":
        return "bg-gray-100 text-gray-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "high":
        return "bg-orange-100 text-orange-800";
      case "critical":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const totalCost = costs.reduce((sum, cost) => sum + parseFloat(cost.amount || "0"), 0);
  const highLevelTasks = tasks.filter((t) => !t.parentTaskId);
  const subtasks = tasks.filter((t) => t.parentTaskId);
  const ics = employees.filter((e) => e.role === "ic");
  const managers = employees.filter((e) => e.role === "manager");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-50 mb-2">
            CEO Dashboard
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            AI Agent Factory - Monitor and manage your autonomous workforce
          </p>
          {hrId && (
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
              HR Workflow: <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">{hrId.slice(0, 20)}...</code>
            </p>
          )}
        </div>

        {/* Messages */}
        {(error || success) && (
          <div className={`mb-6 p-4 rounded-lg ${
            error 
              ? "bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
              : "bg-green-100 border border-green-400 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
          }`}>
            {error || success}
          </div>
        )}

        {/* Task Input Section */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 mb-4">
            Create New Task
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Task Title
              </label>
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="e.g., Build a Next.js blog platform"
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading || !hrId}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Task Description
              </label>
              <textarea
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="Describe the task in detail..."
                rows={4}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading || !hrId}
              />
            </div>
            <button
              onClick={createTask}
              disabled={loading || !hrId || !taskTitle.trim() || !taskDescription.trim()}
              className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Creating Task..." : "Create Task & Assign to HR"}
            </button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Tasks</div>
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-50">{tasks.length}</div>
            <div className="text-xs text-slate-500 mt-1">{highLevelTasks.length} high-level, {subtasks.length} subtasks</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Employees</div>
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-50">{employees.length}</div>
            <div className="text-xs text-slate-500 mt-1">{ics.length} ICs, {managers.length} Managers</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Deliverables</div>
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-50">
              {taskDeliverables.length > 0 ? taskDeliverables.length : "—"}
            </div>
            <div className="text-xs text-slate-500 mt-1">Completed work</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Cost</div>
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-50">${totalCost.toFixed(2)}</div>
            <div className="text-xs text-slate-500 mt-1">USD</div>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="mb-6 flex gap-4">
          <button
            onClick={() => {
              setViewMode("tasks");
              setSelectedEmployee(null);
            }}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === "tasks"
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            }`}
          >
            Tasks
          </button>
          <button
            onClick={() => {
              setViewMode("employees");
              setSelectedTask(null);
            }}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === "employees"
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            }`}
          >
            Employees
          </button>
        </div>

        {/* Main Content Grid */}
        {viewMode === "tasks" ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tasks List */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
                  Tasks
                </h2>
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
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
                  <p className="text-slate-500 dark:text-slate-400 text-center py-8">
                    No tasks yet. Create your first task above!
                  </p>
                ) : (
                  tasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedTask?.id === task.id
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                          : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-50">
                          {task.title}
                        </h3>
                        <div className="flex gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(task.status)}`}>
                            {task.status}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(task.priority)}`}>
                            {task.priority}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 line-clamp-2">
                        {task.description}
                      </p>
                      <div className="flex justify-between items-center text-xs text-slate-500">
                        <span>
                          {task.parentTaskId ? "Subtask" : "High-level Task"}
                        </span>
                        <span>
                          {new Date(task.createdAt).toLocaleString()}
                        </span>
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
                  <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-4">
                      Task Details
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">Status</div>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(selectedTask.status)}`}>
                          {selectedTask.status}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Description</div>
                        <p className="text-sm text-slate-700 dark:text-slate-300">{selectedTask.description}</p>
                      </div>
                    </div>
                  </div>

                  {/* Stage Times */}
                  {Object.keys(taskStageTimes).length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-4">
                        Time in Stages
                      </h3>
                      <div className="space-y-2">
                        {Object.entries(taskStageTimes).map(([stage, seconds]) => (
                          <div key={stage} className="flex justify-between items-center">
                            <span className="text-sm text-slate-600 dark:text-slate-400 capitalize">{stage}</span>
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-50">
                              {formatDuration(seconds)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Activity Log */}
                  {taskActivity.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-4">
                        Activity Log
                      </h3>
                      <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {taskActivity.map((activity, idx) => (
                          <div key={idx} className="border-l-2 border-blue-500 pl-3 pb-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="text-sm font-medium text-slate-900 dark:text-slate-50">
                                  {activity.description}
                                </div>
                                {activity.employee && (
                                  <div className="text-xs text-slate-500 mt-1">
                                    by {activity.employee}
                                  </div>
                                )}
                              </div>
                              <div className="text-xs text-slate-500">
                                {new Date(activity.timestamp).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Deliverables */}
                  {taskDeliverables.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-4">
                        Deliverables ({taskDeliverables.length})
                      </h3>
                      <div className="space-y-4 max-h-[400px] overflow-y-auto">
                        {taskDeliverables.map((deliverable) => (
                          <div
                            key={deliverable.id}
                            className="p-4 rounded-lg bg-slate-50 dark:bg-slate-700"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                {deliverable.type}
                              </span>
                              {deliverable.evaluationScore && (
                                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                                  Score: {deliverable.evaluationScore}/10
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-slate-700 dark:text-slate-300 mt-2 whitespace-pre-wrap">
                              {deliverable.content}
                            </div>
                            <div className="text-xs text-slate-500 mt-2">
                              Created: {new Date(deliverable.createdAt).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
                  <p className="text-slate-500 dark:text-slate-400 text-center py-8">
                    Select a task to view details
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Employees List */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 mb-4">
                Employees
              </h2>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {employees.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400 text-center py-8">
                    No employees yet
                  </p>
                ) : (
                  employees.map((employee) => (
                    <div
                      key={employee.id}
                      onClick={() => setSelectedEmployee(employee)}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedEmployee?.id === employee.id
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                          : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-50">
                          {employee.name}
                        </h3>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          employee.role === "ic" 
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                        }`}>
                          {employee.role.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        Skills: {employee.skills.join(", ")}
                      </div>
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
                  <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-4">
                      {employeeDetails.employee.name}
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">Role</div>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          employeeDetails.employee.role === "ic" 
                            ? "bg-green-100 text-green-800"
                            : "bg-purple-100 text-purple-800"
                        }`}>
                          {employeeDetails.employee.role.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Skills</div>
                        <div className="flex flex-wrap gap-1">
                          {employeeDetails.employee.skills.map((skill, idx) => (
                            <span key={idx} className="px-2 py-1 rounded text-xs bg-slate-100 dark:bg-slate-700">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Relationships */}
                  <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-4">
                      Relationships
                    </h3>
                    <div className="space-y-3">
                      {employeeDetails.relationships.manager && (
                        <div>
                          <div className="text-sm text-slate-600 dark:text-slate-400">Manager</div>
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-50">
                            {employeeDetails.relationships.manager.name}
                          </div>
                        </div>
                      )}
                      {employeeDetails.relationships.directReports.length > 0 && (
                        <div>
                          <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                            Direct Reports ({employeeDetails.relationships.directReports.length})
                          </div>
                          <div className="space-y-1">
                            {employeeDetails.relationships.directReports.map((dr: any) => (
                              <div key={dr.id} className="text-sm text-slate-700 dark:text-slate-300">
                                {dr.name}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-4">
                      Stats
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">Current Tasks</div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                          {employeeDetails.stats.currentTasks}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">Completed</div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                          {employeeDetails.stats.completedTasks}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">Memories</div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                          {employeeDetails.stats.totalMemories}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">Pings</div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                          {employeeDetails.stats.totalPings}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Memories */}
                  {employeeDetails.memories.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-4">
                        Memories ({employeeDetails.memories.length})
                      </h3>
                      <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {employeeDetails.memories.slice(0, 10).map((memory: any) => (
                          <div key={memory.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700">
                            <div className="flex justify-between items-start mb-1">
                              <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                {memory.type}
                              </span>
                              <span className="text-xs text-slate-500">
                                {new Date(memory.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <div className="text-sm text-slate-700 dark:text-slate-300 mt-2">
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
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-4">
                        Pings ({employeeDetails.pings.length})
                      </h3>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {employeeDetails.pings.slice(0, 5).map((ping: any, idx: number) => (
                          <div key={idx} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700">
                            <div className="text-sm text-slate-700 dark:text-slate-300">
                              {ping.content.substring(0, 150)}
                              {ping.content.length > 150 && "..."}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {new Date(ping.timestamp).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Meetings */}
                  {employeeDetails.meetings.recent.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-4">
                        Recent Meetings
                      </h3>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {employeeDetails.meetings.recent.slice(0, 5).map((meeting: any) => (
                          <div key={meeting.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700">
                            <div className="flex justify-between items-start mb-1">
                              <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                                {meeting.type}
                              </span>
                              <span className="text-xs text-slate-500">
                                {new Date(meeting.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                              {meeting.participants.length} participants
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
                  <p className="text-slate-500 dark:text-slate-400 text-center py-8">
                    Select an employee to view details
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
