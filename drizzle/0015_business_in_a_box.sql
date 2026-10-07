CREATE TYPE "public"."blueprint_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "business_blueprint_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blueprint_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "business_blueprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"status" "blueprint_status" DEFAULT 'active' NOT NULL,
	"published_version" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"names" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_blueprint_versions" ADD CONSTRAINT "business_blueprint_versions_blueprint_id_business_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."business_blueprints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_blueprint_versions" ADD CONSTRAINT "business_blueprint_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_blueprint_versions_blueprint_version_key" ON "business_blueprint_versions" USING btree ("blueprint_id","version");--> statement-breakpoint
CREATE INDEX "business_blueprint_versions_created_by_idx" ON "business_blueprint_versions" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_blueprints_key_key" ON "business_blueprints" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "business_categories_key_key" ON "business_categories" USING btree ("key");