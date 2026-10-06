CREATE TYPE "public"."approval_kind" AS ENUM('scope', 'design', 'preview', 'launch');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."change_request_status" AS ENUM('submitted', 'under_review', 'quoted', 'approved', 'rejected', 'withdrawn', 'applied');--> statement-breakpoint
CREATE TYPE "public"."deployment_environment" AS ENUM('preview', 'production');--> statement-breakpoint
CREATE TYPE "public"."deployment_state" AS ENUM('queued', 'building', 'ready', 'failed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."file_kind" AS ENUM('customer_upload', 'design_asset', 'document', 'generated', 'deliverable');--> statement-breakpoint
CREATE TYPE "public"."file_visibility" AS ENUM('customer', 'internal');--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"requested_by_user_id" uuid,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"attachment_file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "change_request_status" DEFAULT 'submitted' NOT NULL,
	"scope_impact" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scope_note" text,
	"price_impact_minor_units" integer,
	"currency" "currency" DEFAULT 'CAD' NOT NULL,
	"additional_days" integer,
	"order_id" uuid,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"environment" "deployment_environment" NOT NULL,
	"state" "deployment_state" DEFAULT 'queued' NOT NULL,
	"version" text NOT NULL,
	"url" text,
	"commit_ref" text,
	"note" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "approval_kind" NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"subject_ref" text,
	"summary" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "project_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "file_kind" NOT NULL,
	"visibility" "file_visibility" DEFAULT 'internal' NOT NULL,
	"uploaded_by_user_id" uuid,
	"name" text NOT NULL,
	"group_key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"pathname" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"last_read_at" timestamp with time zone,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"author_user_id" uuid,
	"author_type" "actor_type" NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"attachment_file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "product_type" "product_type" DEFAULT 'build' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_approvals" ADD CONSTRAINT "project_approvals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_approvals" ADD CONSTRAINT "project_approvals_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_messages" ADD CONSTRAINT "project_messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_messages" ADD CONSTRAINT "project_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "change_requests_reference_key" ON "change_requests" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "change_requests_project_idx" ON "change_requests" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "change_requests_status_idx" ON "change_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deployments_project_idx" ON "deployments" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "deployments_environment_idx" ON "deployments" USING btree ("project_id","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "project_approvals_kind_round_key" ON "project_approvals" USING btree ("project_id","kind","round");--> statement-breakpoint
CREATE INDEX "project_approvals_project_idx" ON "project_approvals" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_files_project_idx" ON "project_files" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "project_files_group_version_key" ON "project_files" USING btree ("project_id","group_key","version");--> statement-breakpoint
CREATE INDEX "project_files_kind_idx" ON "project_files" USING btree ("project_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_project_user_key" ON "project_members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_messages_project_idx" ON "project_messages" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;