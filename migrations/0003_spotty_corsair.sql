CREATE TYPE "public"."report_status" AS ENUM('draft', 'submitted', 'acknowledged', 'responded');--> statement-breakpoint
ALTER TYPE "public"."employee_role" ADD VALUE 'ceo';--> statement-breakpoint
CREATE TABLE "report_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"ceo_id" uuid NOT NULL,
	"response" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manager_id" uuid NOT NULL,
	"ceo_id" uuid,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"status" "report_status" DEFAULT 'draft' NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"submitted_at" timestamp,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_responses" ADD CONSTRAINT "report_responses_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_responses" ADD CONSTRAINT "report_responses_ceo_id_employees_id_fk" FOREIGN KEY ("ceo_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_responses" ADD CONSTRAINT "report_responses_report_id_report_responses_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report_responses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_manager_id_employees_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_ceo_id_employees_id_fk" FOREIGN KEY ("ceo_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_responses_report_id_idx" ON "report_responses" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "report_responses_ceo_id_idx" ON "report_responses" USING btree ("ceo_id");--> statement-breakpoint
CREATE INDEX "reports_manager_id_idx" ON "reports" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "reports_ceo_id_idx" ON "reports" USING btree ("ceo_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");