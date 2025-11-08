CREATE TYPE "public"."cost_type" AS ENUM('api', 'mcp', 'storage');--> statement-breakpoint
CREATE TYPE "public"."deliverable_type" AS ENUM('code', 'document', 'config', 'text');--> statement-breakpoint
CREATE TYPE "public"."employee_role" AS ENUM('ic', 'manager');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."meeting_type" AS ENUM('standup', 'sync', 'ping');--> statement-breakpoint
CREATE TYPE "public"."memory_type" AS ENUM('meeting', 'task', 'learning', 'interaction');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'in-progress', 'completed', 'reviewed');--> statement-breakpoint
CREATE TABLE "costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid,
	"task_id" uuid,
	"type" "cost_type" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"type" "deliverable_type" NOT NULL,
	"content" text NOT NULL,
	"created_by" uuid NOT NULL,
	"evaluated_by" uuid,
	"evaluation_score" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" "employee_role" NOT NULL,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"status" "employee_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"code" text NOT NULL,
	"created_by" uuid NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "meeting_type" NOT NULL,
	"participants" text[] DEFAULT '{}' NOT NULL,
	"transcript" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" "memory_type" NOT NULL,
	"content" text NOT NULL,
	"importance" numeric(3, 2) DEFAULT '0.5' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_task_id" uuid,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"assigned_to" uuid,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "costs" ADD CONSTRAINT "costs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costs" ADD CONSTRAINT "costs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_evaluated_by_employees_id_fk" FOREIGN KEY ("evaluated_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_tasks_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_employees_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "costs_employee_id_idx" ON "costs" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "costs_task_id_idx" ON "costs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "costs_type_idx" ON "costs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "deliverables_task_id_idx" ON "deliverables" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "deliverables_created_by_idx" ON "deliverables" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "employees_status_idx" ON "employees" USING btree ("status");--> statement-breakpoint
CREATE INDEX "employees_role_idx" ON "employees" USING btree ("role");--> statement-breakpoint
CREATE INDEX "mcp_servers_created_by_idx" ON "mcp_servers" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "memories_employee_id_idx" ON "memories" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "memories_type_idx" ON "memories" USING btree ("type");--> statement-breakpoint
CREATE INDEX "tasks_assigned_to_idx" ON "tasks" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_parent_task_id_idx" ON "tasks" USING btree ("parent_task_id");