CREATE TYPE "public"."audit_category" AS ENUM('security', 'finance', 'delivery', 'configuration', 'access');--> statement-breakpoint
CREATE TYPE "public"."message_visibility" AS ENUM('customer', 'internal');--> statement-breakpoint
CREATE TYPE "public"."refund_reason" AS ENUM('guarantee_cancel', 'guarantee_continue', 'duplicate_payment', 'customer_request', 'goodwill', 'other');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('requested', 'approved', 'rejected', 'processing', 'completed', 'failed');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'owner' BEFORE 'admin';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'finance' BEFORE 'developer';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'qa' BEFORE 'support';--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "audit_category" NOT NULL,
	"action" text NOT NULL,
	"actor_user_id" uuid,
	"actor_email" text,
	"actor_role" text,
	"subject_type" text NOT NULL,
	"subject_id" text,
	"subject_label" text,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"request_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid,
	"status" "refund_status" DEFAULT 'requested' NOT NULL,
	"reason" "refund_reason" NOT NULL,
	"note" text,
	"amount_minor_units" integer NOT NULL,
	"currency" "currency" DEFAULT 'CAD' NOT NULL,
	"requested_by_user_id" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"rejection_note" text,
	"provider_refund_id" text,
	"processed_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_messages" ADD COLUMN "visibility" "message_visibility" DEFAULT 'customer' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_occurred_idx" ON "audit_events" USING btree ("occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_category_idx" ON "audit_events" USING btree ("category","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_subject_idx" ON "audit_events" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refunds_status_idx" ON "refunds" USING btree ("status","requested_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "project_messages_visibility_idx" ON "project_messages" USING btree ("project_id","visibility");