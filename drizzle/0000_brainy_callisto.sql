CREATE TYPE "public"."actor_type" AS ENUM('customer', 'staff', 'system');--> statement-breakpoint
CREATE TYPE "public"."assessment_source" AS ENUM('rule_engine', 'llm', 'manual_override');--> statement-breakpoint
CREATE TYPE "public"."build_type" AS ENUM('website', 'system', 'mobileApp');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('CAD', 'USD', 'EUR', 'GBP', 'AED', 'SAR');--> statement-breakpoint
CREATE TYPE "public"."design_approach" AS ENUM('design_for_me', 'supplied_brand', 'existing_design');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'quoted', 'awaiting_quote', 'awaiting_payment', 'awaiting_assets', 'in_build', 'in_preview', 'awaiting_approval', 'approved', 'launching', 'launched', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."scope_tier" AS ENUM('essential', 'extended', 'advanced', 'custom');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('customer', 'admin', 'project_manager', 'developer', 'designer', 'support');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"role" "user_role" DEFAULT 'customer' NOT NULL,
	"preferred_locale" text DEFAULT 'en' NOT NULL,
	"preferred_currency" "currency" DEFAULT 'CAD' NOT NULL,
	"timezone" text DEFAULT 'America/Toronto' NOT NULL,
	"notify_build_updates" boolean DEFAULT true NOT NULL,
	"notify_messages" boolean DEFAULT true NOT NULL,
	"notify_deadline_alerts" boolean DEFAULT true NOT NULL,
	"notify_product_news" boolean DEFAULT false NOT NULL,
	"business_name" text,
	"business_website" text,
	"billing_country" text,
	"tax_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"build_type" "build_type" NOT NULL,
	"scope_tier" "scope_tier",
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"price_minor_units" integer,
	"currency" "currency" DEFAULT 'CAD' NOT NULL,
	"guaranteed_days" integer,
	"paid_at" timestamp with time zone,
	"assets_submitted_at" timestamp with time zone,
	"build_started_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"launched_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"idea_text" text DEFAULT '' NOT NULL,
	"idea_locale" text DEFAULT 'en' NOT NULL,
	"selected_capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"design_approach" "design_approach",
	"estimated_screens" integer,
	"reference_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"asset_pathnames" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scope_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source" "assessment_source" NOT NULL,
	"assessor_id" text NOT NULL,
	"assessor_version" text NOT NULL,
	"build_type" "build_type" NOT NULL,
	"tier" "scope_tier" NOT NULL,
	"complexity_points" integer DEFAULT 0 NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requires_custom_quote" boolean DEFAULT false NOT NULL,
	"price_minor_units" integer,
	"currency" "currency" DEFAULT 'CAD' NOT NULL,
	"guaranteed_days" integer,
	"input_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_briefs" ADD CONSTRAINT "project_briefs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_assessments" ADD CONSTRAINT "scope_assessments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_events" ADD CONSTRAINT "project_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_user_id_key" ON "users" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_reference_key" ON "projects" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "projects_owner_id_idx" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_deadline_at_idx" ON "projects" USING btree ("deadline_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_briefs_project_id_key" ON "project_briefs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "scope_assessments_project_created_idx" ON "scope_assessments" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "project_events_project_occurred_idx" ON "project_events" USING btree ("project_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "project_events_type_idx" ON "project_events" USING btree ("type");