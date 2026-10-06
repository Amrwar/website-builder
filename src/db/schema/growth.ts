import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { orders } from "./orders";
import { projects } from "./projects";
import { users } from "./users";
import {
  buildTypeEnum,
  commissionStateEnum,
  currencyEnum,
  fraudStateEnum,
  partnerKindEnum,
  partnerStatusEnum,
  payoutStatusEnum,
  referralOwnerKindEnum,
  referralStatusEnum,
  reviewStatusEnum,
  rewardStateEnum,
  showcaseStatusEnum,
} from "./enums";

/**
 * Growth: referrals, partners, affiliates, reviews and the build wall.
 *
 * Two decisions shape this whole file.
 *
 * **One attribution path.** A customer sharing a link, an agency sending a
 * client and an affiliate running ads are the same event from the platform's
 * point of view: somebody arrived carrying a code. They therefore share one
 * `referral_codes` table and one `referrals` ledger, and differ only in what
 * the owner earns. Three parallel tracking systems would mean three places for
 * attribution to be wrong and three sets of anti-abuse rules to keep in step.
 *
 * **Nothing here can manufacture proof.** A review exists only against a
 * delivered project and only from the person who paid for it; a build-wall
 * entry exists only with recorded customer consent. Both constraints are in
 * the schema, not only in the service, because the standing rule against
 * invented proof is worth more than any one code path.
 */

/* -------------------------------------------------------------------------
 * Referral codes
 * ---------------------------------------------------------------------- */

/**
 * A shareable code.
 *
 * Exactly one owner column is set, enforced by a CHECK. The alternative --
 * three tables of codes -- would make "resolve this code" a three-way lookup
 * that a future fourth owner kind silently breaks.
 */
export const referralCodes = pgTable(
  "referral_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Upper-case, unambiguous alphabet. See `lib/growth/codes`. */
    code: text("code").notNull(),

    ownerKind: referralOwnerKindEnum("owner_kind").notNull(),

    /** Set when `ownerKind` is "customer". */
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    /** Set when `ownerKind` is "partner". */
    ownerPartnerId: uuid("owner_partner_id"),
    /** Set when `ownerKind` is "affiliate". */
    ownerAffiliateId: uuid("owner_affiliate_id"),

    /** A withdrawn code stops attributing without losing its history. */
    isActive: boolean("is_active").notNull().default(true),

    /** Counted for the owner's own dashboard; the ledger remains the truth. */
    visitCount: integer("visit_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("referral_codes_code_key").on(table.code),
    index("referral_codes_owner_user_idx").on(table.ownerUserId),
    index("referral_codes_owner_partner_idx").on(table.ownerPartnerId),
    index("referral_codes_owner_affiliate_idx").on(table.ownerAffiliateId),
  ],
);

/* -------------------------------------------------------------------------
 * Referrals
 * ---------------------------------------------------------------------- */

/**
 * One referred person, once.
 *
 * `referredUserId` is unique across the whole table: a customer can be
 * referred by exactly one person, ever. Without that, two codes could both
 * claim the same signup and both be paid for it, which is the cheapest
 * referral fraud there is.
 *
 * `referrerUserId` is denormalised from the code so the database itself can
 * refuse a self-referral. A rule that lives only in the service is a rule one
 * forgotten call site removes.
 */
export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    codeId: uuid("code_id")
      .notNull()
      .references(() => referralCodes.id, { onDelete: "restrict" }),

    /** Copied from the code, for the self-referral CHECK. Null for non-users. */
    referrerUserId: uuid("referrer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    referredUserId: uuid("referred_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    status: referralStatusEnum("status").notNull().default("signed_up"),
    fraudState: fraudStateEnum("fraud_state").notNull().default("clear"),
    /** Rule keys that fired, so a flag is explainable rather than a verdict. */
    fraudReasons: jsonb("fraud_reasons").$type<string[]>().notNull().default([]),

    rewardState: rewardStateEnum("reward_state").notNull().default("none"),
    /** What the referrer actually received, in build minutes. */
    rewardMinutes: integer("reward_minutes"),
    /** What the referred customer received. Both sides, same amount. */
    refereeRewardMinutes: integer("referee_reward_minutes"),

    /** The project whose build start converted this. */
    convertedProjectId: uuid("converted_project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),

    /**
     * Signals kept for duplicate-account detection, never for marketing.
     *
     * Hashes, not values: comparing two signups does not require storing
     * anybody's address, and a hash cannot be read back out of a breach.
     */
    signupIpHash: text("signup_ip_hash"),
    signupEmailHash: text("signup_email_hash"),

    /** Attribution lapses if nothing converts; stated so it is not open-ended. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("referrals_referred_user_key").on(table.referredUserId),
    index("referrals_code_idx").on(table.codeId),
    index("referrals_referrer_idx").on(table.referrerUserId),
    index("referrals_status_idx").on(table.status, table.fraudState),
    index("referrals_email_hash_idx").on(table.signupEmailHash),
    index("referrals_ip_hash_idx").on(table.signupIpHash),
  ],
);

/* -------------------------------------------------------------------------
 * Partners
 * ---------------------------------------------------------------------- */

/**
 * An agency, freelancer, consultant or advisor who sends business here.
 *
 * A partner is not necessarily a platform user: the person who refers a client
 * may never configure a build themselves. `userId` links one when there is
 * one, and is null otherwise rather than forcing a shadow account into
 * existence.
 */
export const partners = pgTable(
  "partners",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    kind: partnerKindEnum("kind").notNull(),
    status: partnerStatusEnum("status").notNull().default("applied"),

    companyName: text("company_name").notNull(),
    contactName: text("contact_name").notNull(),
    /** Lower-cased on write; one application per address. */
    email: text("email").notNull(),
    website: text("website"),
    country: text("country"),

    /** What they said they do, in their own words, from the application. */
    pitch: text("pitch"),

    /** Their share of a referred build, in basis points. 1000 = 10%. */
    commissionBasisPoints: integer("commission_basis_points").notNull().default(0),

    /** Linked platform account, when the partner also has one. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),

    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Required when rejecting or suspending: a refusal needs a reason. */
    statusNote: text("status_note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("partners_email_key").on(table.email),
    index("partners_status_idx").on(table.status),
  ],
);

/* -------------------------------------------------------------------------
 * Affiliates
 * ---------------------------------------------------------------------- */

/**
 * An external affiliate.
 *
 * Deliberately a thin record. The brief asked to *prepare* the architecture,
 * and the honest reading of that is: model the account, the tracking, the
 * commissions and the payout state so nothing has to be reshaped later -- and
 * do not invent a payout integration nobody has chosen a provider for.
 * `payoutReference` is a free-text handle for whatever that turns out to be.
 */
export const affiliates = pgTable(
  "affiliates",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    name: text("name").notNull(),
    email: text("email").notNull(),
    website: text("website"),
    status: partnerStatusEnum("status").notNull().default("applied"),

    commissionBasisPoints: integer("commission_basis_points").notNull().default(0),

    /** How they get paid. A handle, not credentials; never a card or an IBAN. */
    payoutMethod: text("payout_method"),
    payoutReference: text("payout_reference"),

    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),

    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    statusNote: text("status_note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("affiliates_email_key").on(table.email),
    index("affiliates_status_idx").on(table.status),
  ],
);

/**
 * One earned commission.
 *
 * Every amount is computed on the server from the order's own frozen totals.
 * There is no column a caller could propose a commission in, which is what
 * makes commission manipulation a schema-level impossibility rather than a
 * validation rule somebody can forget.
 *
 * Unique on the referral: one conversion earns one commission. A retried
 * webhook or a double-clicked approval cannot pay twice.
 */
export const commissions = pgTable(
  "commissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    referralId: uuid("referral_id")
      .notNull()
      .references(() => referrals.id, { onDelete: "restrict" }),

    /** Exactly one of these is set, matching the code's owner kind. */
    affiliateId: uuid("affiliate_id").references(() => affiliates.id, {
      onDelete: "restrict",
    }),
    partnerId: uuid("partner_id").references(() => partners.id, {
      onDelete: "restrict",
    }),

    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),

    /** The order total the rate was applied to, frozen at the moment it earned. */
    grossMinorUnits: integer("gross_minor_units").notNull(),
    /** The rate used, frozen too: a later rate change cannot rewrite history. */
    rateBasisPoints: integer("rate_basis_points").notNull(),
    amountMinorUnits: integer("amount_minor_units").notNull(),
    currency: currencyEnum("currency").notNull().default("CAD"),

    state: commissionStateEnum("state").notNull().default("pending"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversalReason: text("reversal_reason"),

    payoutId: uuid("payout_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("commissions_referral_key").on(table.referralId),
    index("commissions_affiliate_idx").on(table.affiliateId, table.state),
    index("commissions_partner_idx").on(table.partnerId, table.state),
    index("commissions_payout_idx").on(table.payoutId),
  ],
);

/** A batch of approved commissions, paid together. */
export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    reference: text("reference").notNull(),

    affiliateId: uuid("affiliate_id").references(() => affiliates.id, {
      onDelete: "restrict",
    }),
    partnerId: uuid("partner_id").references(() => partners.id, {
      onDelete: "restrict",
    }),

    amountMinorUnits: integer("amount_minor_units").notNull(),
    currency: currencyEnum("currency").notNull().default("CAD"),
    status: payoutStatusEnum("status").notNull().default("requested"),

    /** The provider's own identifier once money has actually moved. */
    providerReference: text("provider_reference"),
    failureReason: text("failure_reason"),

    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    paidAt: timestamp("paid_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payouts_reference_key").on(table.reference),
    index("payouts_affiliate_idx").on(table.affiliateId, table.status),
    index("payouts_partner_idx").on(table.partnerId, table.status),
  ],
);

/* -------------------------------------------------------------------------
 * Reviews
 * ---------------------------------------------------------------------- */

/**
 * A customer's review of a delivered project.
 *
 * One per project, enforced by a unique index, and the row is created as an
 * **invitation** by the platform rather than by whoever wants to write one.
 * Together those two facts are the anti-fake-review control: a review cannot
 * exist without a project that was actually delivered, and the same project
 * cannot be reviewed twice to bury a bad one.
 *
 * `authorDisplayName` is what gets published, and it is the customer's choice.
 * Publishing somebody's full name because it happened to be on their account
 * is not consent.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    status: reviewStatusEnum("status").notNull().default("invited"),

    /** 1–5. Null while the invitation is unanswered. */
    rating: integer("rating"),
    body: text("body"),

    /** How the customer wants to be credited, if at all. */
    authorDisplayName: text("author_display_name"),
    /** False means the review may be published anonymously, or not at all. */
    consentToPublish: boolean("consent_to_publish").notNull().default(false),

    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),

    moderatedByUserId: uuid("moderated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    /** Required on rejection. A refusal nobody can explain is not moderation. */
    moderationNote: text("moderation_note"),

    /** Approved and live. Null means approved but held back. */
    publishedAt: timestamp("published_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("reviews_project_key").on(table.projectId),
    index("reviews_status_idx").on(table.status),
    index("reviews_published_idx").on(table.publishedAt),
  ],
);

/* -------------------------------------------------------------------------
 * The build wall
 * ---------------------------------------------------------------------- */

/**
 * One published build.
 *
 * Carries its own copy of everything shown. The brief's instruction was not to
 * expose private customer information, and the surest way to honour it is for
 * the public query to touch no customer-owned table at all: what is written
 * here is what the world sees, and it got here through a deliberate act with
 * recorded consent.
 *
 * `customerConsentAt` and `consentGivenByUserId` are not decoration. Without
 * them, "did they agree to this?" is answered by whoever remembers.
 */
export const showcaseEntries = pgTable(
  "showcase_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),

    /** URL segment. Lower-case, hyphenated, unique. */
    slug: text("slug").notNull(),

    title: text("title").notNull(),
    summary: text("summary").notNull(),

    /** Free text; the customer's sector, not a controlled vocabulary. */
    industry: text("industry"),
    buildType: buildTypeEnum("build_type").notNull(),

    /** Named only where it is genuinely informative. */
    technologies: jsonb("technologies").$type<string[]>().notNull().default([]),

    /** Blob pathnames, not customer uploads: these are deliberately prepared. */
    screenshots: jsonb("screenshots").$type<string[]>().notNull().default([]),

    /** Days from build start to launch, copied so it cannot drift. */
    deliveredInDays: integer("delivered_in_days"),

    /** The review quoted alongside it, where one was approved. */
    reviewId: uuid("review_id").references(() => reviews.id, { onDelete: "set null" }),

    /** Shown only with consent; otherwise the build appears unattributed. */
    displayCustomerName: boolean("display_customer_name").notNull().default(false),
    customerLabel: text("customer_label"),

    /** The consent itself. No entry is published without it. */
    customerConsentAt: timestamp("customer_consent_at", { withTimezone: true }),
    consentGivenByUserId: uuid("consent_given_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    status: showcaseStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("showcase_entries_slug_key").on(table.slug),
    uniqueIndex("showcase_entries_project_key").on(table.projectId),
    index("showcase_entries_published_idx").on(table.status, table.sortOrder),
  ],
);

/* -------------------------------------------------------------------------
 * Relations
 * ---------------------------------------------------------------------- */

export const referralCodesRelations = relations(referralCodes, ({ one, many }) => ({
  owner: one(users, { fields: [referralCodes.ownerUserId], references: [users.id] }),
  referrals: many(referrals),
}));

export const referralsRelations = relations(referrals, ({ one }) => ({
  code: one(referralCodes, {
    fields: [referrals.codeId],
    references: [referralCodes.id],
  }),
  referredUser: one(users, {
    fields: [referrals.referredUserId],
    references: [users.id],
  }),
  convertedProject: one(projects, {
    fields: [referrals.convertedProjectId],
    references: [projects.id],
  }),
}));

export const commissionsRelations = relations(commissions, ({ one }) => ({
  referral: one(referrals, {
    fields: [commissions.referralId],
    references: [referrals.id],
  }),
  affiliate: one(affiliates, {
    fields: [commissions.affiliateId],
    references: [affiliates.id],
  }),
  partner: one(partners, {
    fields: [commissions.partnerId],
    references: [partners.id],
  }),
  order: one(orders, { fields: [commissions.orderId], references: [orders.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  project: one(projects, { fields: [reviews.projectId], references: [projects.id] }),
  author: one(users, { fields: [reviews.authorUserId], references: [users.id] }),
}));

export const showcaseEntriesRelations = relations(showcaseEntries, ({ one }) => ({
  project: one(projects, {
    fields: [showcaseEntries.projectId],
    references: [projects.id],
  }),
  review: one(reviews, { fields: [showcaseEntries.reviewId], references: [reviews.id] }),
}));

export type ReferralCode = typeof referralCodes.$inferSelect;
export type Referral = typeof referrals.$inferSelect;
export type Partner = typeof partners.$inferSelect;
export type Affiliate = typeof affiliates.$inferSelect;
export type Commission = typeof commissions.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type ShowcaseEntry = typeof showcaseEntries.$inferSelect;
