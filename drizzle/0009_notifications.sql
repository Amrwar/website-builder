CREATE TYPE "public"."notification_kind" AS ENUM('order_paid', 'invoice_issued', 'refund_issued', 'deadline_missed', 'build_started', 'preview_ready', 'project_launched', 'approval_requested', 'message_received', 'deadline_approaching', 'product_news');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"locale" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"project_id" uuid,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"email_attempted_at" timestamp with time zone,
	"email_sent_at" timestamp with time zone,
	"email_failed_at" timestamp with time zone,
	"email_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_email_outcome_needs_attempt" CHECK (("notifications"."email_sent_at" is null and "notifications"."email_failed_at" is null)
          or "notifications"."email_attempted_at" is not null),
	CONSTRAINT "notifications_email_one_outcome" CHECK ("notifications"."email_sent_at" is null or "notifications"."email_failed_at" is null),
	CONSTRAINT "notifications_email_error_needs_failure" CHECK ("notifications"."email_error" is null or "notifications"."email_failed_at" is not null),
	CONSTRAINT "notifications_locale_is_served" CHECK ("notifications"."locale" in ('en', 'fr', 'ar'))
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_recipient_id_idx" ON "notifications" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications" USING btree ("dedupe_key") WHERE "notifications"."dedupe_key" is not null;