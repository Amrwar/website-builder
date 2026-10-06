CREATE TYPE "public"."billing_interval" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."checklist_group" AS ENUM('customer', 'technical', 'compliance');--> statement-breakpoint
CREATE TYPE "public"."checklist_state" AS ENUM('pending', 'done', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."credit_entry_kind" AS ENUM('purchased', 'granted', 'awarded', 'spent', 'refunded', 'expired', 'adjusted');--> statement-breakpoint
CREATE TYPE "public"."dns_state" AS ENUM('unconfigured', 'misconfigured', 'propagating', 'configured');--> statement-breakpoint
CREATE TYPE "public"."domain_verification" AS ENUM('unverified', 'pending', 'verified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."hosting_status" AS ENUM('pending', 'provisioning', 'active', 'suspended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ssl_state" AS ENUM('none', 'pending', 'issued', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verification" "domain_verification" DEFAULT 'unverified' NOT NULL,
	"verification_token" text,
	"verified_at" timestamp with time zone,
	"dns_state" "dns_state" DEFAULT 'unconfigured' NOT NULL,
	"dns_checked_at" timestamp with time zone,
	"ssl_state" "ssl_state" DEFAULT 'none' NOT NULL,
	"ssl_issued_at" timestamp with time zone,
	"ssl_expires_at" timestamp with time zone,
	"owned_by_customer" boolean DEFAULT true NOT NULL,
	"registrar" text,
	"registration_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "launch_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"group" "checklist_group" NOT NULL,
	"translation_key" text NOT NULL,
	"applies_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"customer_visible" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_hosting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "hosting_status" DEFAULT 'pending' NOT NULL,
	"plan_key" text,
	"provider" text,
	"provider_project_id" text,
	"production_url" text,
	"activated_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"uptime_basis_points" integer,
	"uptime_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_launch_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"state" "checklist_state" DEFAULT 'pending' NOT NULL,
	"note" text,
	"completed_by_user_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"price_minor_units" integer NOT NULL,
	"currency" "currency" DEFAULT 'CAD' NOT NULL,
	"interval" "billing_interval" DEFAULT 'monthly' NOT NULL,
	"feature_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"included_credit_minutes" integer DEFAULT 0 NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"is_recommended" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"action" text NOT NULL,
	"from_status" "subscription_status",
	"to_status" "subscription_status",
	"from_plan_key" text,
	"to_plan_key" text,
	"actor_user_id" uuid,
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"project_id" uuid,
	"plan_key" text NOT NULL,
	"status" "subscription_status" DEFAULT 'trialing' NOT NULL,
	"interval" "billing_interval" DEFAULT 'monthly' NOT NULL,
	"price_minor_units" integer NOT NULL,
	"currency" "currency" DEFAULT 'CAD' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"paused_at" timestamp with time zone,
	"past_due_since" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"provider" text,
	"provider_subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"balance_minutes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" "credit_entry_kind" NOT NULL,
	"minutes" integer NOT NULL,
	"balance_after_minutes" integer NOT NULL,
	"subject_type" text,
	"subject_id" text,
	"description" text,
	"reason" text,
	"actor_user_id" uuid,
	"expires_at" timestamp with time zone,
	"idempotency_key" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "provider_deployment_id" text;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "provider_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "rollback_of_deployment_id" uuid;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "triggered_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_hosting" ADD CONSTRAINT "project_hosting_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_launch_checks" ADD CONSTRAINT "project_launch_checks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_launch_checks" ADD CONSTRAINT "project_launch_checks_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_account_id_credit_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."credit_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "domains_name_key" ON "domains" USING btree ("name");--> statement-breakpoint
CREATE INDEX "domains_project_idx" ON "domains" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "domains_ssl_expiry_idx" ON "domains" USING btree ("ssl_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "launch_checklist_items_key_key" ON "launch_checklist_items" USING btree ("key");--> statement-breakpoint
CREATE INDEX "launch_checklist_items_order_idx" ON "launch_checklist_items" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "project_hosting_project_key" ON "project_hosting" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_launch_checks_item_key" ON "project_launch_checks" USING btree ("project_id","item_key");--> statement-breakpoint
CREATE UNIQUE INDEX "maintenance_plans_key_key" ON "maintenance_plans" USING btree ("key");--> statement-breakpoint
CREATE INDEX "subscription_events_subscription_idx" ON "subscription_events" USING btree ("subscription_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_reference_key" ON "subscriptions" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "subscriptions_owner_idx" ON "subscriptions" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "subscriptions_project_idx" ON "subscriptions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "subscriptions_renewal_idx" ON "subscriptions" USING btree ("status","current_period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_accounts_owner_key" ON "credit_accounts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "credit_ledger_account_idx" ON "credit_ledger" USING btree ("account_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_idempotency_key" ON "credit_ledger" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "credit_ledger_expiry_idx" ON "credit_ledger" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Lifecycle invariants.
--
-- These encode the two rules of this phase that are worth more than any UI:
-- a deployment is not successful until the provider says so, and a credit
-- ledger is append-only arithmetic that has to add up.
-- ---------------------------------------------------------------------------

-- A deployment is "ready" only when the hosting provider confirmed it.
--
-- Our code can set a status; it cannot observe someone else's infrastructure.
-- Without this, an optimistic write after calling a deploy API would tell a
-- customer their site is live while it is still building -- or failing.
ALTER TABLE "deployments"
  ADD CONSTRAINT "deployments_ready_requires_confirmation"
  CHECK (state <> 'ready' OR provider_confirmed_at IS NOT NULL);--> statement-breakpoint

-- A failure says when, and vice versa. A failed deployment with no timestamp
-- cannot be ordered against anything, which makes a history unreadable.
ALTER TABLE "deployments"
  ADD CONSTRAINT "deployments_failure_coherent"
  CHECK ((state = 'failed') = (failed_at IS NOT NULL));--> statement-breakpoint

ALTER TABLE "deployments"
  ADD CONSTRAINT "deployments_rollback_not_self"
  CHECK (rollback_of_deployment_id IS NULL OR rollback_of_deployment_id <> id);--> statement-breakpoint

-- A zero-minute entry is noise in a statement somebody reads.
ALTER TABLE "credit_ledger"
  ADD CONSTRAINT "credit_ledger_minutes_nonzero"
  CHECK (minutes <> 0);--> statement-breakpoint

-- Direction has to match the kind, or a "spent" entry could add credit.
ALTER TABLE "credit_ledger"
  ADD CONSTRAINT "credit_ledger_direction_matches_kind"
  CHECK (
    (kind IN ('purchased', 'granted', 'awarded', 'refunded') AND minutes > 0)
    OR (kind IN ('spent', 'expired') AND minutes < 0)
    OR kind = 'adjusted'
  );--> statement-breakpoint

-- A manual correction with no stated reason is an unexplained change to
-- something the customer paid for.
ALTER TABLE "credit_ledger"
  ADD CONSTRAINT "credit_ledger_adjustment_needs_reason"
  CHECK (kind <> 'adjusted' OR length(btrim(coalesce(reason, ''))) > 0);--> statement-breakpoint

-- A balance cannot go below zero, here or anywhere. Credit is prepaid.
ALTER TABLE "credit_ledger"
  ADD CONSTRAINT "credit_ledger_balance_nonnegative"
  CHECK (balance_after_minutes >= 0);--> statement-breakpoint

ALTER TABLE "credit_accounts"
  ADD CONSTRAINT "credit_accounts_balance_nonnegative"
  CHECK (balance_minutes >= 0);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- The credit ledger is append-only.
--
-- The application has no update or delete path, and this is the layer beneath
-- it: a careless migration, a direct psql session or a future bug cannot
-- rewrite what somebody's balance used to be. Corrections are new rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION credit_ledger_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'credit_ledger is append-only; record a correcting entry instead'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER credit_ledger_no_update
  BEFORE UPDATE OR DELETE ON "credit_ledger"
  FOR EACH ROW EXECUTE FUNCTION credit_ledger_append_only();--> statement-breakpoint

-- A subscription's period has to move forward, or a renewal could bill for a
-- window that already passed.
ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_period_forward"
  CHECK (current_period_end > current_period_start);--> statement-breakpoint

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_price_nonnegative"
  CHECK (price_minor_units >= 0);--> statement-breakpoint

ALTER TABLE "maintenance_plans"
  ADD CONSTRAINT "maintenance_plans_amounts_sane"
  CHECK (
    price_minor_units > 0
    AND included_credit_minutes >= 0
    AND trial_days BETWEEN 0 AND 90
  );--> statement-breakpoint

-- One primary domain per project. A partial unique index rather than a check,
-- because the rule is about the set of rows, not about any one of them.
CREATE UNIQUE INDEX "domains_one_primary_per_project"
  ON "domains" ("project_id") WHERE "is_primary";--> statement-breakpoint

ALTER TABLE "domains"
  ADD CONSTRAINT "domains_name_lowercase"
  CHECK (name = lower(btrim(name)) AND length(name) > 3 AND name NOT LIKE '%/%');--> statement-breakpoint

-- Uptime is a percentage in basis points. Anything outside the range is a
-- measurement bug, and publishing it would be a false claim.
ALTER TABLE "project_hosting"
  ADD CONSTRAINT "project_hosting_uptime_in_range"
  CHECK (uptime_basis_points IS NULL OR uptime_basis_points BETWEEN 0 AND 10000);--> statement-breakpoint

-- A measured figure needs the moment it was measured beside it.
ALTER TABLE "project_hosting"
  ADD CONSTRAINT "project_hosting_uptime_dated"
  CHECK ((uptime_basis_points IS NULL) = (uptime_checked_at IS NULL));--> statement-breakpoint

-- "Not applicable" is a judgement, and a judgement needs its reason recorded.
ALTER TABLE "project_launch_checks"
  ADD CONSTRAINT "project_launch_checks_na_needs_note"
  CHECK (state <> 'not_applicable' OR length(btrim(coalesce(note, ''))) > 0);
