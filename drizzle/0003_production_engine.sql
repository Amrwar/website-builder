CREATE TYPE "public"."deliverable_status" AS ENUM('pending', 'in_progress', 'delivered', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('pending', 'reached', 'missed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('green', 'yellow', 'red');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'ready', 'in_progress', 'blocked', 'in_review', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"deliverable_key" text NOT NULL,
	"title" text NOT NULL,
	"stage" text NOT NULL,
	"status" "deliverable_status" DEFAULT 'pending' NOT NULL,
	"file_id" uuid,
	"deployment_id" uuid,
	"external_url" text,
	"due_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"task_key" text NOT NULL,
	"stage" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"priority" "task_priority" DEFAULT 'normal' NOT NULL,
	"responsible_role" "user_role" NOT NULL,
	"assignee_id" uuid,
	"estimated_minutes" integer DEFAULT 0 NOT NULL,
	"actual_minutes" integer,
	"blocked_minutes" integer DEFAULT 0 NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"blocked_at" timestamp with time zone,
	"blocked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_key" text NOT NULL,
	"stage" text NOT NULL,
	"status" "milestone_status" DEFAULT 'pending' NOT NULL,
	"target_at" timestamp with time zone,
	"reached_at" timestamp with time zone,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"depends_on_task_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "risk_level" "risk_level" DEFAULT 'green' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "risk_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "risk_assessed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_file_id_project_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."project_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_production_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."production_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_production_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."production_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deliverables_project_key_key" ON "deliverables" USING btree ("project_id","deliverable_key");--> statement-breakpoint
CREATE INDEX "deliverables_project_idx" ON "deliverables" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_tasks_project_key_key" ON "production_tasks" USING btree ("project_id","task_key");--> statement-breakpoint
CREATE INDEX "production_tasks_project_idx" ON "production_tasks" USING btree ("project_id","order_index");--> statement-breakpoint
CREATE INDEX "production_tasks_status_idx" ON "production_tasks" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "production_tasks_assignee_idx" ON "production_tasks" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "project_milestones_project_key_key" ON "project_milestones" USING btree ("project_id","milestone_key");--> statement-breakpoint
CREATE INDEX "project_milestones_project_idx" ON "project_milestones" USING btree ("project_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "task_dependencies_pair_key" ON "task_dependencies" USING btree ("task_id","depends_on_task_id");--> statement-breakpoint
CREATE INDEX "task_dependencies_depends_on_idx" ON "task_dependencies" USING btree ("depends_on_task_id");--> statement-breakpoint
CREATE INDEX "task_dependencies_project_idx" ON "task_dependencies" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "projects_risk_idx" ON "projects" USING btree ("risk_level","deadline_at");--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Guarantee timestamp immutability.
--
-- The application already requires `build:execute` to start a build, and the
-- transition is a conditional UPDATE so one project gets one deadline. This
-- trigger is the layer underneath that: once a guarantee timestamp is set, the
-- database itself refuses to change it, whatever code path asks.
--
-- It exists because these four columns decide whether a refund is owed. A
-- permission check protects a route; this protects the fact. A bug, a careless
-- migration, or a direct psql session cannot quietly move the day a customer's
-- countdown began.
--
-- Clearing a value is refused for the same reason as changing one. Correcting
-- a genuine mistake is a deliberate act: `set local app.allow_guarantee_edit`
-- inside a transaction, which is auditable precisely because it is unusual.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_guarantee_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.allow_guarantee_edit', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.paid_at IS NOT NULL AND NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
    RAISE EXCEPTION 'paid_at is immutable once set (project %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.assets_submitted_at IS NOT NULL
     AND NEW.assets_submitted_at IS DISTINCT FROM OLD.assets_submitted_at THEN
    RAISE EXCEPTION 'assets_submitted_at is immutable once set (project %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.build_started_at IS NOT NULL
     AND NEW.build_started_at IS DISTINCT FROM OLD.build_started_at THEN
    RAISE EXCEPTION 'build_started_at is immutable once set (project %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.deadline_at IS NOT NULL AND NEW.deadline_at IS DISTINCT FROM OLD.deadline_at THEN
    RAISE EXCEPTION 'deadline_at is immutable once set (project %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS projects_guard_guarantee ON projects;
--> statement-breakpoint
CREATE TRIGGER projects_guard_guarantee
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION guard_guarantee_timestamps();
--> statement-breakpoint
-- A task cannot depend on itself, which would make it permanently unstartable.
ALTER TABLE task_dependencies
  ADD CONSTRAINT task_dependencies_no_self_reference
  CHECK (task_id <> depends_on_task_id);
