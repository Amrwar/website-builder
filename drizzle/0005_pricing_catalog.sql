CREATE TYPE "public"."discount_kind" AS ENUM('percentage', 'fixed');--> statement-breakpoint
CREATE TABLE "catalog_currencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" "currency" NOT NULL,
	"rate" text NOT NULL,
	"round_to_minor_units" integer DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"reviewed_on" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"category_id" text NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"minimum_tier" "scope_tier" DEFAULT 'essential' NOT NULL,
	"implies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applies_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"surcharge_minor_units" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"build_type" "build_type" NOT NULL,
	"tier" "scope_tier" NOT NULL,
	"price_minor_units" integer,
	"guaranteed_days" integer,
	"point_threshold" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"kind" "discount_kind" NOT NULL,
	"value" integer NOT NULL,
	"max_discount_minor_units" integer,
	"min_order_minor_units" integer,
	"applies_to_build_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"max_redemptions" integer,
	"times_used" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_currencies_code_key" ON "catalog_currencies" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_features_key_key" ON "catalog_features" USING btree ("key");--> statement-breakpoint
CREATE INDEX "catalog_features_active_idx" ON "catalog_features" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_tiers_build_tier_key" ON "catalog_tiers" USING btree ("build_type","tier");--> statement-breakpoint
CREATE UNIQUE INDEX "discounts_code_key" ON "discounts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "discounts_active_idx" ON "discounts" USING btree ("is_active","ends_at");--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Catalogue invariants.
--
-- The admin screens validate every one of these before writing. These are the
-- layer underneath: the rules hold against a careless migration, a seed script
-- and a direct psql session too, because an incoherent price list is not a
-- cosmetic fault -- it is a wrong number on an invoice.
-- ---------------------------------------------------------------------------

-- A tier with no published price is a quotation, and quoted work has no
-- deadline to guarantee. Allowing days without a price would publish a
-- guarantee nobody priced; allowing a price without days would sell a fixed
-- build with no promise attached.
ALTER TABLE "catalog_tiers"
  ADD CONSTRAINT "catalog_tiers_price_days_coherent"
  CHECK (
    (price_minor_units IS NULL AND guaranteed_days IS NULL)
    OR (price_minor_units IS NOT NULL AND guaranteed_days IS NOT NULL)
  );--> statement-breakpoint

ALTER TABLE "catalog_tiers"
  ADD CONSTRAINT "catalog_tiers_amounts_sane"
  CHECK (
    (price_minor_units IS NULL OR price_minor_units > 0)
    AND (guaranteed_days IS NULL OR guaranteed_days BETWEEN 1 AND 365)
    AND point_threshold >= 0
  );--> statement-breakpoint

ALTER TABLE "catalog_features"
  ADD CONSTRAINT "catalog_features_amounts_sane"
  CHECK (
    points >= 0
    AND (surcharge_minor_units IS NULL OR surcharge_minor_units > 0)
    AND length(btrim(key)) > 0
  );--> statement-breakpoint

-- A zero or negative rate would price a build at nothing. Rate is text so the
-- reviewed figure is stored exactly as a person wrote it, so the check casts.
ALTER TABLE "catalog_currencies"
  ADD CONSTRAINT "catalog_currencies_rate_positive"
  CHECK (rate ~ '^[0-9]+(\.[0-9]+)?$' AND rate::numeric > 0 AND round_to_minor_units >= 1);--> statement-breakpoint

-- Percentages are percentages; fixed amounts are minor units. A "percentage"
-- of 5000 would take 50x the order value off, which the engine clamps -- but
-- it should never have been storable.
ALTER TABLE "discounts"
  ADD CONSTRAINT "discounts_value_matches_kind"
  CHECK (
    (kind = 'percentage' AND value BETWEEN 1 AND 100)
    OR (kind = 'fixed' AND value > 0)
  );--> statement-breakpoint

ALTER TABLE "discounts"
  ADD CONSTRAINT "discounts_limits_sane"
  CHECK (
    code = upper(btrim(code))
    AND length(code) > 0
    AND (max_discount_minor_units IS NULL OR max_discount_minor_units > 0)
    AND (min_order_minor_units IS NULL OR min_order_minor_units >= 0)
    AND (max_redemptions IS NULL OR max_redemptions > 0)
    AND times_used >= 0
    AND (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
  );
