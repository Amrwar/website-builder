import { pgEnum } from "drizzle-orm/pg-core";

import { BUILD_TYPES } from "@/config/products";
import { USER_ROLES } from "@/config/roles";
import { SUPPORTED_CURRENCIES } from "@/lib/pricing/money";

/**
 * Postgres enums.
 *
 * Where a union already exists in application config it is reused here rather
 * than retyped, so the database and the domain cannot drift. Adding a value in
 * config produces a migration, which is the point: the change becomes visible
 * and reviewable instead of silent.
 */

/**
 * Authorization roles. Defined in `@/config/roles` so the union is reachable
 * from client code without pulling the database layer with it.
 */
export const userRoleEnum = pgEnum("user_role", USER_ROLES);

/** website | system | mobileApp */
export const buildTypeEnum = pgEnum("build_type", BUILD_TYPES);

export const currencyEnum = pgEnum("currency", SUPPORTED_CURRENCIES);

/**
 * Scope tiers, smallest first.
 *
 * `custom` is terminal: it means the work cannot be sold at a published price
 * and needs a human quotation.
 */
export const SCOPE_TIERS = ["essential", "extended", "advanced", "custom"] as const;
export type ScopeTierId = (typeof SCOPE_TIERS)[number];
export const scopeTierEnum = pgEnum("scope_tier", SCOPE_TIERS);

/**
 * Project lifecycle.
 *
 * The distinction between `awaiting_assets` and `in_build` is the delivery
 * guarantee itself: payment alone does not start the countdown, because the
 * customer's required information and assets must be in before work can
 * begin. The clock starts on the transition into `in_build`, never earlier.
 */
export const PROJECT_STATUSES = [
  /** Being configured; no commitment yet. */
  "draft",
  /** Scope assessed and a price issued. */
  "quoted",
  /** Scope exceeds the published ladder; a human quote is owed. */
  "awaiting_quote",
  "awaiting_payment",
  /** Paid, but the guarantee countdown has NOT started. */
  "awaiting_assets",
  /** Countdown running. */
  "in_build",
  "in_preview",
  "awaiting_approval",
  "approved",
  /** For mobile apps this covers store submission, which is outside the guarantee. */
  "launching",
  "launched",
  "cancelled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const projectStatusEnum = pgEnum("project_status", PROJECT_STATUSES);

/**
 * What produced a scope assessment.
 *
 * Recorded so an assessment can always be traced to its origin. When an LLM
 * assessor is added it writes `llm` here; nothing else about the schema
 * changes, and historical rule-engine assessments stay distinguishable.
 */
export const ASSESSMENT_SOURCES = ["rule_engine", "llm", "manual_override"] as const;
export type AssessmentSource = (typeof ASSESSMENT_SOURCES)[number];
export const assessmentSourceEnum = pgEnum("assessment_source", ASSESSMENT_SOURCES);

/** How the customer wants the design handled. */
export const DESIGN_APPROACHES = [
  /** "Design it for me". */
  "design_for_me",
  /** Customer supplies brand assets and direction. */
  "supplied_brand",
  /** Rebuild or extend an existing design. */
  "existing_design",
] as const;
export type DesignApproach = (typeof DESIGN_APPROACHES)[number];
export const designApproachEnum = pgEnum("design_approach", DESIGN_APPROACHES);

/** Who caused a recorded event. */
export const ACTOR_TYPES = ["customer", "staff", "system"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];
export const actorTypeEnum = pgEnum("actor_type", ACTOR_TYPES);

/* -------------------------------------------------------------------------
 * Commerce
 * ---------------------------------------------------------------------- */

/**
 * What kind of thing is being sold.
 *
 * The platform is not a single-product shop. A build, a design service, a
 * maintenance subscription and a block of build credits are all orderable, and
 * they price and fulfil differently -- so the type is modelled rather than
 * inferred from a name.
 */
export const PRODUCT_TYPES = [
  /** A website, business system or mobile app. Priced by the scope engine. */
  "build",
  /** "Design it for me", sold alongside a build. */
  "design_service",
  /** Recurring hosting, updates and monitoring. */
  "maintenance_plan",
  /** Pre-purchased capacity for later features. */
  "build_credit",
  /** Automation work. */
  "automation",
  /** Anything else packaged and sold at a published price. */
  "business_product",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];
export const productTypeEnum = pgEnum("product_type", PRODUCT_TYPES);

/**
 * How a product's price is arrived at.
 *
 * `scope_assessed` products have no sellable price until a brief has been
 * assessed; their `base_price_minor_units` is the published "from" figure for
 * marketing only. Keeping this explicit stops the catalogue and the scope
 * engine becoming two competing sources of truth for the same number.
 */
export const PRICING_MODELS = ["scope_assessed", "fixed", "recurring"] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];
export const pricingModelEnum = pgEnum("pricing_model", PRICING_MODELS);

/**
 * Order lifecycle.
 *
 * `paid` means the money arrived. `completed` means the thing bought was
 * delivered. They are separate because the gap between them is the entire
 * product, and conflating them would make "paid but not yet built" unsayable.
 */
export const ORDER_STATUSES = [
  "draft",
  "pending_payment",
  "paid",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
  "completed",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);

/** Payment attempt lifecycle, as reported by the provider and normalised. */
export const PAYMENT_STATUSES = [
  "initiated",
  "pending",
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const paymentStatusEnum = pgEnum("payment_status", PAYMENT_STATUSES);

/**
 * Who processed the money.
 *
 * Stored per payment rather than assumed globally, so moving providers, or
 * running two at once in different markets, is a data change and not a
 * rewrite. `manual` covers a bank transfer reconciled by hand.
 */
export const PAYMENT_PROVIDERS = ["stripe", "manual"] as const;
export type PaymentProviderId = (typeof PAYMENT_PROVIDERS)[number];
export const paymentProviderEnum = pgEnum("payment_provider", PAYMENT_PROVIDERS);

export const INVOICE_STATUSES = ["draft", "issued", "paid", "void", "refunded"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const invoiceStatusEnum = pgEnum("invoice_status", INVOICE_STATUSES);
