export interface Task {
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

export interface Employee {
  id: string;
  name: string;
  role: "ic" | "manager";
  skills: string[];
  status: "active" | "terminated";
  managerId: string | null;
}

export interface Deliverable {
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

export interface Cost {
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

export interface CostAggregates {
  total: number;
  byType?: Record<string, number>;
  byEmployee?: Record<string, number>;
  byTask?: Record<string, number>;
}

export interface Memory {
  id: string;
  employeeId: string;
  type: string;
  content: string;
  importance: number;
  createdAt: string;
}

export interface Ping {
  content: string;
  timestamp: string;
}

export interface Meeting {
  id: string;
  type: string;
  participants: string[];
  transcript: string;
  createdAt: string;
}

export interface Manager {
  id: string;
  name: string;
  role: string;
}

export interface DirectReport {
  id: string;
  name: string;
}

export interface TaskActivity {
  type: string;
  timestamp: string;
  status?: string;
  description: string;
  employee?: string;
  deliverable?: Deliverable;
}

export interface EmployeeDetails {
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

export type ViewMode = "tasks" | "employees" | "costs" | "deliverables" | "meetings" | "overview";

export type DateRangePreset = "1h" | "3h" | "6h" | "12h" | "24h" | "3d" | "1w" | "2w" | "month" | "quarter" | "year";

