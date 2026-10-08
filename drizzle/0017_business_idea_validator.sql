CREATE TYPE "public"."validation_capture_mode" AS ENUM('inquiry', 'waitlist');--> statement-breakpoint
CREATE TYPE "public"."validation_event_kind" AS ENUM('view', 'cta_click', 'inquiry', 'signup');--> statement-breakpoint
CREATE TYPE "public"."validation_status" AS ENUM('live', 'paused', 'closed');--> statement-breakpoint
CREATE TABLE "validation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"kind" "validation_event_kind" NOT NULL,
	"visitor_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validation_experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"status" "validation_status" DEFAULT 'live' NOT NULL,
	"locale" text NOT NULL,
	"capture_mode" "validation_capture_mode" NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "validation_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"kind" "validation_capture_mode" NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"message" text,
	"consented_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "validation_events" ADD CONSTRAINT "validation_events_experiment_id_validation_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."validation_experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_experiments" ADD CONSTRAINT "validation_experiments_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_leads" ADD CONSTRAINT "validation_leads_experiment_id_validation_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."validation_experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "validation_events_experiment_kind_idx" ON "validation_events" USING btree ("experiment_id","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "validation_experiments_slug_key" ON "validation_experiments" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "validation_experiments_owner_idx" ON "validation_experiments" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "validation_leads_experiment_idx" ON "validation_leads" USING btree ("experiment_id","created_at");