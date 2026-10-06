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

/* -------------------------------------------------------------------------
 * Build Room
 * ---------------------------------------------------------------------- */

/**
 * What a file is, which decides who may see it and where it appears.
 *
 * `customer_upload` is what the customer sends us and is the thing the
 * guarantee waits on; `deliverable` is what they receive at the end. The two
 * are separated because "has the customer sent their assets?" must be an
 * indexed question, not a guess from a filename.
 */
export const FILE_KINDS = [
  "customer_upload",
  "design_asset",
  "document",
  /** Produced by us during the build: exports, screenshots, reports. */
  "generated",
  /** The finished thing being handed over. */
  "deliverable",
] as const;
export type FileKind = (typeof FILE_KINDS)[number];
export const fileKindEnum = pgEnum("file_kind", FILE_KINDS);

/**
 * Who a file is for.
 *
 * Internal files exist on the same project and are never returned to a
 * customer-scoped query. Defaulting to `customer` would make an internal note
 * one forgotten flag away from being published.
 */
export const FILE_VISIBILITIES = ["customer", "internal"] as const;
export type FileVisibility = (typeof FILE_VISIBILITIES)[number];
export const fileVisibilityEnum = pgEnum("file_visibility", FILE_VISIBILITIES);

/**
 * Change request lifecycle.
 *
 * `quoted` is a distinct state because a change with a price impact is a
 * commercial offer that the customer has to accept before work starts --
 * approving and paying are not the same event.
 */
export const CHANGE_REQUEST_STATUSES = [
  "submitted",
  "under_review",
  "quoted",
  "approved",
  "rejected",
  "withdrawn",
  "applied",
] as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];
export const changeRequestStatusEnum = pgEnum(
  "change_request_status",
  CHANGE_REQUEST_STATUSES,
);

/** What is being signed off. Mirrors `APPROVAL_KINDS` in config/workspace. */
export const APPROVAL_KIND_VALUES = ["scope", "design", "preview", "launch"] as const;
export const approvalKindEnum = pgEnum("approval_kind", APPROVAL_KIND_VALUES);

export const APPROVAL_STATUSES = ["pending", "approved", "changes_requested"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export const approvalStatusEnum = pgEnum("approval_status", APPROVAL_STATUSES);

export const DEPLOYMENT_ENVIRONMENTS = ["preview", "production"] as const;
export type DeploymentEnvironment = (typeof DEPLOYMENT_ENVIRONMENTS)[number];
export const deploymentEnvironmentEnum = pgEnum(
  "deployment_environment",
  DEPLOYMENT_ENVIRONMENTS,
);

export const DEPLOYMENT_STATES = [
  "queued",
  "building",
  "ready",
  "failed",
  /** Replaced by a newer deployment to the same environment. */
  "superseded",
] as const;
export type DeploymentState = (typeof DEPLOYMENT_STATES)[number];
export const deploymentStateEnum = pgEnum("deployment_state", DEPLOYMENT_STATES);

/* -------------------------------------------------------------------------
 * Production engine
 * ---------------------------------------------------------------------- */

/**
 * Task lifecycle.
 *
 * `pending` and `ready` are separated because the difference is a dependency:
 * a pending task is waiting on something else, a ready one is waiting on a
 * person. Collapsing them would make "what can actually be picked up right
 * now" unanswerable without re-walking the dependency graph.
 *
 * `blocked` is distinct from `pending` for the same reason in reverse: a
 * blocked task has started and stopped, and the time it spends here is lost
 * time that the risk engine has to see.
 */
export const TASK_STATUSES = [
  "pending",
  "ready",
  "in_progress",
  "blocked",
  "in_review",
  "done",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const taskStatusEnum = pgEnum("task_status", TASK_STATUSES);

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const taskPriorityEnum = pgEnum("task_priority", TASK_PRIORITIES);

export const MILESTONE_STATUSES = ["pending", "reached", "missed", "cancelled"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];
export const milestoneStatusEnum = pgEnum("milestone_status", MILESTONE_STATUSES);

/**
 * Deliverable lifecycle.
 *
 * `delivered` and `accepted` are separate states because the gap between them
 * is the customer's review, and conflating them would let an unreviewed
 * handover count as a finished one.
 */
export const DELIVERABLE_STATUSES = [
  "pending",
  "in_progress",
  "delivered",
  "accepted",
  "rejected",
] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];
export const deliverableStatusEnum = pgEnum("deliverable_status", DELIVERABLE_STATUSES);

/** Schedule risk, mirroring `RISK_LEVELS` in `lib/production/risk`. */
export const RISK_LEVEL_VALUES = ["green", "yellow", "red"] as const;
export const riskLevelEnum = pgEnum("risk_level", RISK_LEVEL_VALUES);

/* -------------------------------------------------------------------------
 * Audit
 * ---------------------------------------------------------------------- */

/**
 * Audit categories.
 *
 * Coarse on purpose: the category is what the log is filtered by, and a
 * taxonomy with thirty entries is one nobody uses. The precise act lives in
 * `action`.
 */
export const AUDIT_CATEGORIES = [
  /** Roles, access, account state. */
  "security",
  /** Money: refunds, invoice corrections, payment state. */
  "finance",
  /** Scope, deadlines, assignment, deployment. */
  "delivery",
  /** Platform configuration. */
  "configuration",
  /** Reading something sensitive, where the read itself is notable. */
  "access",
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];
export const auditCategoryEnum = pgEnum("audit_category", AUDIT_CATEGORIES);

/**
 * Refund lifecycle.
 *
 * `requested` and `approved` are distinct states because requesting and
 * releasing a refund are two acts by two different roles -- finance prepares,
 * owner or admin executes. Collapsing them would remove the control.
 */
export const REFUND_STATUSES = [
  "requested",
  "approved",
  "rejected",
  "processing",
  "completed",
  "failed",
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];
export const refundStatusEnum = pgEnum("refund_status", REFUND_STATUSES);

/** Why a refund is owed. The guarantee outcomes are first-class. */
export const REFUND_REASONS = [
  /** Deadline missed, customer cancelled: 100%. */
  "guarantee_cancel",
  /** Deadline missed, customer continued: 30%. */
  "guarantee_continue",
  "duplicate_payment",
  "customer_request",
  "goodwill",
  "other",
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];
export const refundReasonEnum = pgEnum("refund_reason", REFUND_REASONS);

/** Message audience. Internal notes never reach a customer-scoped query. */
export const MESSAGE_VISIBILITIES = ["customer", "internal"] as const;
export type MessageVisibility = (typeof MESSAGE_VISIBILITIES)[number];
export const messageVisibilityEnum = pgEnum("message_visibility", MESSAGE_VISIBILITIES);

/* -------------------------------------------------------------------------
 * Catalogue
 * ---------------------------------------------------------------------- */

/**
 * How a discount reduces a price.
 *
 * Two kinds only. "Buy one get one", tiered thresholds and the rest are
 * campaign mechanics; adding them before a campaign needs one is inventing
 * requirements, and each would need its own interaction rules with the others.
 */
export const DISCOUNT_KINDS = ["percentage", "fixed"] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];
export const discountKindEnum = pgEnum("discount_kind", DISCOUNT_KINDS);

/* -------------------------------------------------------------------------
 * Launch, hosting and the lifecycle after delivery (Phase 11)
 * ---------------------------------------------------------------------- */

/**
 * Where a launch checklist item sits.
 *
 * Grouping is editable data elsewhere; these are the fixed buckets a launch
 * actually has, and they decide who is asked to complete an item.
 */
export const CHECKLIST_GROUPS = [
  /** Things the customer owes us: content, credentials, a decision. */
  "customer",
  /** Our own technical readiness. */
  "technical",
  /** Legal, analytics, anything that must be true before going public. */
  "compliance",
] as const;
export type ChecklistGroup = (typeof CHECKLIST_GROUPS)[number];
export const checklistGroupEnum = pgEnum("checklist_group", CHECKLIST_GROUPS);

/**
 * An item's state on one project.
 *
 * `not_applicable` is a real outcome, not an absence: a site with no
 * newsletter never needs the newsletter item, and recording that is different
 * from leaving it unfinished forever.
 */
export const CHECKLIST_STATES = ["pending", "done", "not_applicable"] as const;
export type ChecklistState = (typeof CHECKLIST_STATES)[number];
export const checklistStateEnum = pgEnum("checklist_state", CHECKLIST_STATES);

/** Where a site is actually hosted. */
export const HOSTING_STATUSES = [
  /** Bought, nothing provisioned yet. */
  "pending",
  "provisioning",
  "active",
  /** Payment lapsed; still served, but the clock is ticking. */
  "suspended",
  "cancelled",
] as const;
export type HostingStatus = (typeof HOSTING_STATUSES)[number];
export const hostingStatusEnum = pgEnum("hosting_status", HOSTING_STATUSES);

/**
 * Domain ownership and DNS.
 *
 * Verification is modelled separately from DNS because they fail for different
 * reasons and the customer has to fix them differently: a domain can be
 * verifiably theirs while its records still point somewhere else.
 */
export const DOMAIN_VERIFICATIONS = [
  "unverified",
  "pending",
  "verified",
  "failed",
] as const;
export type DomainVerification = (typeof DOMAIN_VERIFICATIONS)[number];
export const domainVerificationEnum = pgEnum("domain_verification", DOMAIN_VERIFICATIONS);

export const DNS_STATES = [
  /** No records seen yet. */
  "unconfigured",
  /** Records exist but do not point at us. */
  "misconfigured",
  "propagating",
  "configured",
] as const;
export type DnsState = (typeof DNS_STATES)[number];
export const dnsStateEnum = pgEnum("dns_state", DNS_STATES);

export const SSL_STATES = ["none", "pending", "issued", "failed", "expired"] as const;
export type SslState = (typeof SSL_STATES)[number];
export const sslStateEnum = pgEnum("ssl_state", SSL_STATES);

/**
 * Subscription lifecycle.
 *
 * `paused` and `past_due` are distinct: one is the customer's decision and the
 * other is a payment problem, and conflating them would mean treating a
 * customer who asked for a break like one who is in arrears.
 */
export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "paused",
  "cancelled",
  /** Ran to the end of its term and was not renewed. */
  "expired",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export const subscriptionStatusEnum = pgEnum(
  "subscription_status",
  SUBSCRIPTION_STATUSES,
);

/** How often a subscription bills. */
export const BILLING_INTERVALS = ["monthly", "yearly"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];
export const billingIntervalEnum = pgEnum("billing_interval", BILLING_INTERVALS);

/**
 * Why credit moved.
 *
 * The ledger is append-only, so a correction is another entry rather than an
 * edit. Every kind names who caused it, which is what makes a balance
 * explainable to the person holding it.
 */
export const CREDIT_ENTRY_KINDS = [
  /** Bought outright. */
  "purchased",
  /** Included with a subscription period. */
  "granted",
  /** Given as an apology or a referral reward. */
  "awarded",
  /** Consumed by work. */
  "spent",
  /** Returned because the work was cancelled. */
  "refunded",
  /** Ran out of time. */
  "expired",
  /** A manual correction by staff, always with a reason. */
  "adjusted",
] as const;
export type CreditEntryKind = (typeof CREDIT_ENTRY_KINDS)[number];
export const creditEntryKindEnum = pgEnum("credit_entry_kind", CREDIT_ENTRY_KINDS);

/* -------------------------------------------------------------------------
 * Growth (Phase 12)
 * ---------------------------------------------------------------------- */

/**
 * Who a referral code belongs to.
 *
 * One attribution path, three reward policies. A visit carrying `?ref=` is
 * resolved the same way whoever owns the code; what differs afterwards is what
 * the owner earns -- build credit for a customer, commission for an affiliate
 * or a partner. Modelling it as three separate tracking systems would mean
 * three places for attribution to be wrong.
 */
export const REFERRAL_OWNER_KINDS = ["customer", "partner", "affiliate"] as const;
export type ReferralOwnerKind = (typeof REFERRAL_OWNER_KINDS)[number];
export const referralOwnerKindEnum = pgEnum("referral_owner_kind", REFERRAL_OWNER_KINDS);

/**
 * How far a referral has got.
 *
 * `signed_up` and `converted` are separate because a signup earns nothing: the
 * reward exists to pay for revenue, and an account anybody can create for free
 * is not revenue.
 */
export const REFERRAL_STATUSES = [
  /** The code was used; no account yet. */
  "visited",
  "signed_up",
  /** A build started. This is the only state that earns anything. */
  "converted",
  /** Refused by the anti-abuse rules, or by staff. */
  "rejected",
  /** Nothing happened inside the attribution window. */
  "expired",
] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];
export const referralStatusEnum = pgEnum("referral_status", REFERRAL_STATUSES);

/**
 * What the anti-abuse rules concluded.
 *
 * Deliberately separate from `status`. A referral can be perfectly converted
 * and still be fraudulent, and collapsing the two would mean a blocked payout
 * was indistinguishable from one that simply had not happened yet.
 */
export const FRAUD_STATES = [
  "clear",
  /** Something looks wrong. Held for a person to decide. */
  "flagged",
  /** Refused. No reward is ever paid on this. */
  "blocked",
  /** A person looked at a flag and released it. */
  "cleared",
] as const;
export type FraudState = (typeof FRAUD_STATES)[number];
export const fraudStateEnum = pgEnum("fraud_state", FRAUD_STATES);

/** Whether the reward for a converted referral has actually been handed over. */
export const REWARD_STATES = [
  "none",
  "granted",
  /** Taken back because the order behind it was refunded or cancelled. */
  "clawed_back",
] as const;
export type RewardState = (typeof REWARD_STATES)[number];
export const rewardStateEnum = pgEnum("reward_state", REWARD_STATES);

/** An external partner or affiliate account's standing. */
export const PARTNER_STATUSES = ["applied", "approved", "suspended", "rejected"] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];
export const partnerStatusEnum = pgEnum("partner_status", PARTNER_STATUSES);

/** What kind of business a partner is. Decides nothing technical; it is context. */
export const PARTNER_KINDS = ["agency", "freelancer", "consultant", "advisor"] as const;
export type PartnerKind = (typeof PARTNER_KINDS)[number];
export const partnerKindEnum = pgEnum("partner_kind", PARTNER_KINDS);

/**
 * A commission's life.
 *
 * `reversed` rather than deleted: an affiliate who was told they earned
 * something and then had it taken back is owed the record of both.
 */
export const COMMISSION_STATES = ["pending", "approved", "paid", "reversed"] as const;
export type CommissionState = (typeof COMMISSION_STATES)[number];
export const commissionStateEnum = pgEnum("commission_state", COMMISSION_STATES);

export const PAYOUT_STATUSES = ["requested", "approved", "paid", "failed"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];
export const payoutStatusEnum = pgEnum("payout_status", PAYOUT_STATUSES);

/**
 * A review's life.
 *
 * `invited` exists as a row so an unanswered invitation is visible rather than
 * being an absence, and so an invitation cannot be created for a project that
 * was never delivered.
 */
export const REVIEW_STATUSES = [
  "invited",
  "submitted",
  "approved",
  "rejected",
  /** Taken back by the customer. Their words, their call. */
  "withdrawn",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const reviewStatusEnum = pgEnum("review_status", REVIEW_STATUSES);

/** A build-wall entry's publication state. */
export const SHOWCASE_STATUSES = ["draft", "published", "retired"] as const;
export type ShowcaseStatus = (typeof SHOWCASE_STATUSES)[number];
export const showcaseStatusEnum = pgEnum("showcase_status", SHOWCASE_STATUSES);
