import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  pgEnum,
  varchar,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";

// Enums
export const employeeStatusEnum = pgEnum("employee_status", [
  "active",
  "terminated",
]);

export const employeeRoleEnum = pgEnum("employee_role", ["ic", "manager"]);

export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "in-progress",
  "completed",
  "reviewed",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const deliverableTypeEnum = pgEnum("deliverable_type", [
  "code",
  "document",
  "config",
  "text",
]);

export const memoryTypeEnum = pgEnum("memory_type", [
  "meeting",
  "task",
  "learning",
  "interaction",
]);

export const meetingTypeEnum = pgEnum("meeting_type", [
  "standup",
  "sync",
  "ping",
]);

export const costTypeEnum = pgEnum("cost_type", ["api", "mcp", "storage"]);

// Tables
export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    role: employeeRoleEnum("role").notNull(),
    skills: text("skills").array().notNull().default([]),
    status: employeeStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("employees_status_idx").on(table.status),
    roleIdx: index("employees_role_idx").on(table.role),
  })
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentTaskId: uuid("parent_task_id"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    assignedTo: uuid("assigned_to").references(() => employees.id),
    status: taskStatusEnum("status").notNull().default("pending"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    assignedToIdx: index("tasks_assigned_to_idx").on(table.assignedTo),
    statusIdx: index("tasks_status_idx").on(table.status),
    parentTaskIdIdx: index("tasks_parent_task_id_idx").on(table.parentTaskId),
    parentTaskFk: foreignKey({
      columns: [table.parentTaskId],
      foreignColumns: [table.id],
    }),
  })
);

export const deliverables = pgTable(
  "deliverables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    type: deliverableTypeEnum("type").notNull(),
    content: text("content").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => employees.id),
    evaluatedBy: uuid("evaluated_by").references(() => employees.id),
    evaluationScore: integer("evaluation_score"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    taskIdIdx: index("deliverables_task_id_idx").on(table.taskId),
    createdByIdx: index("deliverables_created_by_idx").on(table.createdBy),
  })
);

export const mcpServers = pgTable(
  "mcp_servers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    code: text("code").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => employees.id),
    usageCount: integer("usage_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    createdByIdx: index("mcp_servers_created_by_idx").on(table.createdBy),
  })
);

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    type: memoryTypeEnum("type").notNull(),
    content: text("content").notNull(),
    importance: numeric("importance", { precision: 3, scale: 2 })
      .notNull()
      .default("0.5"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    employeeIdIdx: index("memories_employee_id_idx").on(table.employeeId),
    typeIdx: index("memories_type_idx").on(table.type),
  })
);

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: meetingTypeEnum("type").notNull(),
  participants: text("participants").array().notNull().default([]),
  transcript: text("transcript").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const costs = pgTable(
  "costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").references(() => employees.id),
    taskId: uuid("task_id").references(() => tasks.id),
    type: costTypeEnum("type").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  (table) => ({
    employeeIdIdx: index("costs_employee_id_idx").on(table.employeeId),
    taskIdIdx: index("costs_task_id_idx").on(table.taskId),
    typeIdx: index("costs_type_idx").on(table.type),
  })
);

