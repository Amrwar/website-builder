CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'paid', 'void', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'pending_payment', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded', 'completed');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('stripe', 'manual');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('initiated', 'pending', 'succeeded', 'failed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."pricing_model" AS ENUM('scope_assessed', 'fixed', 'recurring');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('build', 'design_service', 'maintenance_plan', 'build_credit', 'automation', 'business_product');--> statement-breakpoint
ALTER TYPE "public"."currency" ADD VALUE 'EGP';--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"type" "product_type" NOT NULL,
	"pricing_model" "pricing_model" NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"translation_key" text,
	"build_type" "build_type",
	"base_price_minor_units" integer,
	"currency" "currency" DEFAULT 'CAD' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"configuration_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"included_features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"eligibility_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"product_key" text NOT NULL,
	"product_type" "product_type" NOT NULL,
	"product_name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"configuration" jsonb,
	"scope_assessment_id" uuid,
	"scope_tier" "scope_tier",
	"scope_snapshot" jsonb,
	"selected_capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unit_amount_minor_units" integer NOT NULL,
	"discount_minor_units" integer DEFAULT 0 NOT NULL,
	"tax_minor_units" integer DEFAULT 0 NOT NULL,
	"total_minor_units" integer NOT NULL,
	"currency" "currency" DEFAULT 'CAD' NOT NULL,
	"conversion" jsonb,
	"guaranteed_days" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'draft' NOT NULL,
	"currency" "currency" DEFAULT 'CAD' NOT NULL,
	"subtotal_minor_units" integer DEFAULT 0 NOT NULL,
	"discount_minor_units" integer DEFAULT 0 NOT NULL,
	"tax_minor_units" integer DEFAULT 0 NOT NULL,
	"total_minor_units" integer DEFAULT 0 NOT NULL,
	"refunded_minor_units" integer DEFAULT 0 NOT NULL,
	"pricing_snapshot" jsonb NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"idempotency_key" text NOT NULL,
	"project_id" uuid,
	"placed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_event_id" text NOT NULL,
	"type" text NOT NULL,
	"payment_id" uuid,
	"order_id" uuid,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_reference" text NOT NULL,
	"provider_payment_id" text,
	"status" "payment_status" DEFAULT 'initiated' NOT NULL,
	"provider_status" text,
	"amount_minor_units" integer NOT NULL,
	"currency" "currency" DEFAULT 'CAD' NOT NULL,
	"refunded_minor_units" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"failure_reason" text,
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"succeeded_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_counters" (
	"scope" text NOT NULL,
	"year" integer NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"order_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"bill_to_name" text NOT NULL,
	"bill_to_email" text NOT NULL,
	"bill_to_organization" text,
	"bill_to_country" text,
	"bill_to_tax_id" text,
	"currency" "currency" DEFAULT 'CAD' NOT NULL,
	"subtotal_minor_units" integer NOT NULL,
	"discount_minor_units" integer DEFAULT 0 NOT NULL,
	"tax_minor_units" integer DEFAULT 0 NOT NULL,
	"total_minor_units" integer NOT NULL,
	"refunded_minor_units" integer DEFAULT 0 NOT NULL,
	"tax_rate_basis_points" integer DEFAULT 0 NOT NULL,
	"tax_note" text,
	"line_items" jsonb NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"issued_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scope_assessments" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_scope_assessment_id_scope_assessments_id_fk" FOREIGN KEY ("scope_assessment_id") REFERENCES "public"."scope_assessments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "products_key_key" ON "products" USING btree ("key");--> statement-breakpoint
CREATE INDEX "products_type_idx" ON "products" USING btree ("type");--> statement-breakpoint
CREATE INDEX "products_active_idx" ON "products" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_key" ON "orders" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_owner_id_idx" ON "orders" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_id_key" ON "payment_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_events_payment_id_idx" ON "payment_events" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_events_order_id_idx" ON "payment_events" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_reference_key" ON "payments" USING btree ("provider","provider_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payments_order_id_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "document_counters_scope_year_key" ON "document_counters" USING btree ("scope","year");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_order_id_key" ON "invoices" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "invoices_owner_id_idx" ON "invoices" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");