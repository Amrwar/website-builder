CREATE TYPE "public"."commission_state" AS ENUM('pending', 'approved', 'paid', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."fraud_state" AS ENUM('clear', 'flagged', 'blocked', 'cleared');--> statement-breakpoint
CREATE TYPE "public"."partner_kind" AS ENUM('agency', 'freelancer', 'consultant', 'advisor');--> statement-breakpoint
CREATE TYPE "public"."partner_status" AS ENUM('applied', 'approved', 'suspended', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('requested', 'approved', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."referral_owner_kind" AS ENUM('customer', 'partner', 'affiliate');--> statement-breakpoint
CREATE TYPE "public"."referral_status" AS ENUM('visited', 'signed_up', 'converted', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('invited', 'submitted', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."reward_state" AS ENUM('none', 'granted', 'clawed_back');--> statement-breakpoint
CREATE TYPE "public"."showcase_status" AS ENUM('draft', 'published', 'retired');--> statement-breakpoint
CREATE TABLE "affiliates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"website" text,
	"status" "partner_status" DEFAULT 'applied' NOT NULL,
	"commission_basis_points" integer DEFAULT 0 NOT NULL,
	"payout_method" text,
	"payout_reference" text,
	"user_id" uuid,
	"approved_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"status_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" uuid NOT NULL,
	"affiliate_id" uuid,
	"partner_id" uuid,
	"order_id" uuid NOT NULL,
	"gross_minor_units" integer NOT NULL,
	"rate_basis_points" integer NOT NULL,
	"amount_minor_units" integer NOT NULL,
	"currency" "currency" DEFAULT 'CAD' NOT NULL,
	"state" "commission_state" DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"reversed_at" timestamp with time zone,
	"reversal_reason" text,
	"payout_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "partner_kind" NOT NULL,
	"status" "partner_status" DEFAULT 'applied' NOT NULL,
	"company_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"website" text,
	"country" text,
	"pitch" text,
	"commission_basis_points" integer DEFAULT 0 NOT NULL,
	"user_id" uuid,
	"approved_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"status_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"affiliate_id" uuid,
	"partner_id" uuid,
	"amount_minor_units" integer NOT NULL,
	"currency" "currency" DEFAULT 'CAD' NOT NULL,
	"status" "payout_status" DEFAULT 'requested' NOT NULL,
	"provider_reference" text,
	"failure_reason" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"owner_kind" "referral_owner_kind" NOT NULL,
	"owner_user_id" uuid,
	"owner_partner_id" uuid,
	"owner_affiliate_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"visit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_id" uuid NOT NULL,
	"referrer_user_id" uuid,
	"referred_user_id" uuid NOT NULL,
	"status" "referral_status" DEFAULT 'signed_up' NOT NULL,
	"fraud_state" "fraud_state" DEFAULT 'clear' NOT NULL,
	"fraud_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reward_state" "reward_state" DEFAULT 'none' NOT NULL,
	"reward_minutes" integer,
	"referee_reward_minutes" integer,
	"converted_project_id" uuid,
	"converted_at" timestamp with time zone,
	"signup_ip_hash" text,
	"signup_email_hash" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"status" "review_status" DEFAULT 'invited' NOT NULL,
	"rating" integer,
	"body" text,
	"author_display_name" text,
	"consent_to_publish" boolean DEFAULT false NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"moderated_by_user_id" uuid,
	"moderated_at" timestamp with time zone,
	"moderation_note" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "showcase_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"industry" text,
	"build_type" "build_type" NOT NULL,
	"technologies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"screenshots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"delivered_in_days" integer,
	"review_id" uuid,
	"display_customer_name" boolean DEFAULT false NOT NULL,
	"customer_label" text,
	"customer_consent_at" timestamp with time zone,
	"consent_given_by_user_id" uuid,
	"status" "showcase_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_code_id_referral_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."referral_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_converted_project_id_projects_id_fk" FOREIGN KEY ("converted_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderated_by_user_id_users_id_fk" FOREIGN KEY ("moderated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "showcase_entries" ADD CONSTRAINT "showcase_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "showcase_entries" ADD CONSTRAINT "showcase_entries_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "showcase_entries" ADD CONSTRAINT "showcase_entries_consent_given_by_user_id_users_id_fk" FOREIGN KEY ("consent_given_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "affiliates_email_key" ON "affiliates" USING btree ("email");--> statement-breakpoint
CREATE INDEX "affiliates_status_idx" ON "affiliates" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "commissions_referral_key" ON "commissions" USING btree ("referral_id");--> statement-breakpoint
CREATE INDEX "commissions_affiliate_idx" ON "commissions" USING btree ("affiliate_id","state");--> statement-breakpoint
CREATE INDEX "commissions_partner_idx" ON "commissions" USING btree ("partner_id","state");--> statement-breakpoint
CREATE INDEX "commissions_payout_idx" ON "commissions" USING btree ("payout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partners_email_key" ON "partners" USING btree ("email");--> statement-breakpoint
CREATE INDEX "partners_status_idx" ON "partners" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_reference_key" ON "payouts" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "payouts_affiliate_idx" ON "payouts" USING btree ("affiliate_id","status");--> statement-breakpoint
CREATE INDEX "payouts_partner_idx" ON "payouts" USING btree ("partner_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "referral_codes_owner_user_idx" ON "referral_codes" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "referral_codes_owner_partner_idx" ON "referral_codes" USING btree ("owner_partner_id");--> statement-breakpoint
CREATE INDEX "referral_codes_owner_affiliate_idx" ON "referral_codes" USING btree ("owner_affiliate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_referred_user_key" ON "referrals" USING btree ("referred_user_id");--> statement-breakpoint
CREATE INDEX "referrals_code_idx" ON "referrals" USING btree ("code_id");--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE INDEX "referrals_status_idx" ON "referrals" USING btree ("status","fraud_state");--> statement-breakpoint
CREATE INDEX "referrals_email_hash_idx" ON "referrals" USING btree ("signup_email_hash");--> statement-breakpoint
CREATE INDEX "referrals_ip_hash_idx" ON "referrals" USING btree ("signup_ip_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_project_key" ON "reviews" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "reviews_status_idx" ON "reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reviews_published_idx" ON "reviews" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "showcase_entries_slug_key" ON "showcase_entries" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "showcase_entries_project_key" ON "showcase_entries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "showcase_entries_published_idx" ON "showcase_entries" USING btree ("status","sort_order");--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Growth invariants.
--
-- The anti-abuse rules that are structural rather than editorial live here as
-- well as in `lib/growth/fraud`. A rule enforced only in a service is a rule
-- that one forgotten call site removes, and these decide who gets paid.
-- ---------------------------------------------------------------------------

-- A code belongs to exactly one owner. Zero owners would attribute to nobody;
-- two would let the same conversion be claimed twice.
ALTER TABLE "referral_codes"
  ADD CONSTRAINT "referral_codes_one_owner"
  CHECK (
    (CASE WHEN owner_user_id      IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN owner_partner_id   IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN owner_affiliate_id IS NULL THEN 0 ELSE 1 END) = 1
  );--> statement-breakpoint

-- The owner column has to match the declared kind, or a customer's code could
-- be paid a partner's commission.
ALTER TABLE "referral_codes"
  ADD CONSTRAINT "referral_codes_owner_matches_kind"
  CHECK (
    (owner_kind = 'customer'  AND owner_user_id      IS NOT NULL) OR
    (owner_kind = 'partner'   AND owner_partner_id   IS NOT NULL) OR
    (owner_kind = 'affiliate' AND owner_affiliate_id IS NOT NULL)
  );--> statement-breakpoint

ALTER TABLE "referral_codes"
  ADD CONSTRAINT "referral_codes_code_shape"
  CHECK (code = upper(btrim(code)) AND length(code) BETWEEN 4 AND 32);--> statement-breakpoint

-- One customer, one referrer, forever. Without this two codes could both claim
-- the same signup and both be paid for it -- the cheapest referral fraud there
-- is. The unique index on `referred_user_id` is the other half of this rule.
ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_not_self"
  CHECK (referrer_user_id IS NULL OR referrer_user_id <> referred_user_id);--> statement-breakpoint

-- A reward that was handed over has to say how much. "Granted: unknown amount"
-- is not a record anybody can reconcile.
ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_reward_amounts"
  CHECK (
    (reward_state = 'none' AND reward_minutes IS NULL)
    OR (reward_state <> 'none' AND reward_minutes IS NOT NULL AND reward_minutes >= 0)
  );--> statement-breakpoint

-- Nothing converts without the moment it converted.
ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_converted_dated"
  CHECK ((status = 'converted') = (converted_at IS NOT NULL));--> statement-breakpoint

-- A blocked referral has never been paid. This is the last line of the
-- anti-abuse design: whatever a service believes, the database refuses to hold
-- a row that says "fraudulent" and "paid" at the same time.
ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_blocked_pays_nothing"
  CHECK (fraud_state <> 'blocked' OR reward_state <> 'granted');--> statement-breakpoint

-- A flag needs its reasons, or nobody reviewing it knows what to look at.
ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_flag_has_reasons"
  CHECK (
    fraud_state = 'clear' OR jsonb_array_length(fraud_reasons) > 0
  );--> statement-breakpoint

-- Commission belongs to exactly one earner, matching the code that earned it.
ALTER TABLE "commissions"
  ADD CONSTRAINT "commissions_one_earner"
  CHECK (
    (affiliate_id IS NOT NULL AND partner_id IS NULL)
    OR (affiliate_id IS NULL AND partner_id IS NOT NULL)
  );--> statement-breakpoint

-- The amount is derived from the gross and the rate, and can never exceed
-- either the order or 100%. A commission larger than the sale is a loss
-- disguised as growth.
ALTER TABLE "commissions"
  ADD CONSTRAINT "commissions_amount_sane"
  CHECK (
    gross_minor_units > 0
    AND rate_basis_points BETWEEN 0 AND 10000
    AND amount_minor_units >= 0
    AND amount_minor_units <= gross_minor_units
  );--> statement-breakpoint

ALTER TABLE "commissions"
  ADD CONSTRAINT "commissions_reversal_has_reason"
  CHECK (
    state <> 'reversed'
    OR (reversed_at IS NOT NULL AND length(btrim(coalesce(reversal_reason, ''))) > 0)
  );--> statement-breakpoint

ALTER TABLE "payouts"
  ADD CONSTRAINT "payouts_one_recipient"
  CHECK (
    (affiliate_id IS NOT NULL AND partner_id IS NULL)
    OR (affiliate_id IS NULL AND partner_id IS NOT NULL)
  );--> statement-breakpoint

ALTER TABLE "payouts"
  ADD CONSTRAINT "payouts_amount_positive"
  CHECK (amount_minor_units > 0);--> statement-breakpoint

-- Money that has been paid says when. A paid payout with no date cannot be
-- reconciled against a bank statement.
ALTER TABLE "payouts"
  ADD CONSTRAINT "payouts_paid_dated"
  CHECK ((status = 'paid') = (paid_at IS NOT NULL));--> statement-breakpoint

-- A rating is one to five, and a submitted review has both a rating and words.
-- An "empty five stars" is not a review, it is a number somebody clicked.
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_rating_range"
  CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);--> statement-breakpoint

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_submitted_has_content"
  CHECK (
    status = 'invited'
    OR (rating IS NOT NULL AND length(btrim(coalesce(body, ''))) >= 10)
  );--> statement-breakpoint

-- Rejecting somebody's words requires saying why.
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_rejection_has_note"
  CHECK (
    status <> 'rejected'
    OR length(btrim(coalesce(moderation_note, ''))) > 0
  );--> statement-breakpoint

-- Only an approved review is ever live. Without this, a rejected review could
-- be published by an UPDATE that forgot to clear the timestamp.
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_published_only_when_approved"
  CHECK (published_at IS NULL OR status = 'approved');--> statement-breakpoint

-- A name is published only with consent. The standing rule against invented
-- proof has a twin: no real person's name appears without them agreeing.
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_name_needs_consent"
  CHECK (
    published_at IS NULL
    OR consent_to_publish
    OR author_display_name IS NULL
  );--> statement-breakpoint

-- Nothing reaches the build wall without recorded customer consent.
ALTER TABLE "showcase_entries"
  ADD CONSTRAINT "showcase_published_needs_consent"
  CHECK (
    status <> 'published'
    OR (customer_consent_at IS NOT NULL AND published_at IS NOT NULL)
  );--> statement-breakpoint

-- And a customer is named only where they agreed to be.
ALTER TABLE "showcase_entries"
  ADD CONSTRAINT "showcase_name_needs_consent"
  CHECK (NOT display_customer_name OR customer_consent_at IS NOT NULL);--> statement-breakpoint

ALTER TABLE "showcase_entries"
  ADD CONSTRAINT "showcase_slug_shape"
  CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
