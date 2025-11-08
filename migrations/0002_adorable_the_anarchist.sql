ALTER TYPE "public"."cost_type" ADD VALUE 'tokens';--> statement-breakpoint
ALTER TABLE "costs" ADD COLUMN "prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "costs" ADD COLUMN "completion_tokens" integer;--> statement-breakpoint
ALTER TABLE "costs" ADD COLUMN "total_tokens" integer;--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "feedback" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "persona" text;