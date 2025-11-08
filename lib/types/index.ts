import { z } from "zod";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import {
  employees,
  tasks,
  deliverables,
  mcpServers,
  memories,
  meetings,
  costs,
} from "@/lib/db/schema";

// Drizzle inferred types
export type Employee = InferSelectModel<typeof employees>;
export type EmployeeInsert = InferInsertModel<typeof employees>;

export type Task = InferSelectModel<typeof tasks>;
export type TaskInsert = InferInsertModel<typeof tasks>;

export type Deliverable = InferSelectModel<typeof deliverables>;
export type DeliverableInsert = InferInsertModel<typeof deliverables>;

export type MCPServer = InferSelectModel<typeof mcpServers>;
export type MCPServerInsert = InferInsertModel<typeof mcpServers>;

export type Memory = InferSelectModel<typeof memories>;
export type MemoryInsert = InferInsertModel<typeof memories>;

export type Meeting = InferSelectModel<typeof meetings>;
export type MeetingInsert = InferInsertModel<typeof meetings>;

export type Cost = InferSelectModel<typeof costs>;
export type CostInsert = InferInsertModel<typeof costs>;

// Status enums
export type EmployeeStatus = "active" | "terminated";
export type EmployeeRole = "ic" | "manager";
export type TaskStatus = "pending" | "in-progress" | "completed" | "reviewed";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type DeliverableType = "code" | "document" | "config" | "text";
export type MemoryType = "meeting" | "task" | "learning" | "interaction";
export type MeetingType = "standup" | "sync" | "ping";
export type CostType = "api" | "mcp" | "storage";

// Zod validation schemas for API inputs
export const createTaskInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  parentTaskId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

export const createEmployeeInputSchema = z.object({
  name: z.string().min(1),
  role: z.enum(["ic", "manager"]),
  skills: z.array(z.string()).default([]),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeInputSchema>;

export const createDeliverableInputSchema = z.object({
  taskId: z.string().uuid(),
  type: z.enum(["code", "document", "config", "text"]),
  content: z.string().min(1),
  createdBy: z.string().uuid(),
});

export type CreateDeliverableInput = z.infer<
  typeof createDeliverableInputSchema
>;

export const createCostInputSchema = z.object({
  employeeId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  type: z.enum(["api", "mcp", "storage"]),
  amount: z.number().positive(),
  currency: z.string().default("USD"),
});

export type CreateCostInput = z.infer<typeof createCostInputSchema>;

// Query filter schemas
export const taskQuerySchema = z.object({
  status: z.enum(["pending", "in-progress", "completed", "reviewed"]).optional(),
  assignedTo: z.string().uuid().optional(),
});

export const employeeQuerySchema = z.object({
  role: z.enum(["ic", "manager"]).optional(),
  status: z.enum(["active", "terminated"]).optional(),
});

export const costQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

