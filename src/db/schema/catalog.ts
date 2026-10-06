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

import { buildTypeEnum, currencyEnum, discountKindEnum, scopeTierEnum } from "./enums";

/**
 * The commercial catalogue, as data.
 *
 * Phase 9 made these screens read-only on the argument that version-controlled
 * configuration is reviewable and revertable. Phase 10 asks for them to be
 * editable with auditing, which is a decision the business owner is entitled
 * to make -- so the rules move into the database, and the properties that made
 * configuration safe are preserved another way:
 *
 *  - **Reviewable**: every change writes an `audit_events` row with the
 *    before and after values and who made it.
 *  - **Revertable**: the audit entry carries enough to put a value back.
 *  - **Historically inert**: orders already freeze a complete pricing
 *    snapshot, so editing a price here can never alter what someone was
 *    charged. That guarantee is what makes editing safe at all.
 *
 * Code constants in `config/` remain the seed and the fallback: an empty table
 * means "use the shipped defaults", so the platform works before anyone has
 * touched the admin screens.
 */

/* -------------------------------------------------------------------------
 * Features
 * ---------------------------------------------------------------------- */

/**
 * Sellable capabilities.
 *
 * Mirrors `lib/scope/capabilities.ts`. The two levers that decide scope --
 * `points` and `minimumTier` -- are both editable, because both are commercial
 * judgements about how much work something is, not facts about the code.
 */
export const catalogFeatures = pgTable(
  "catalog_features",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Matches a `CapabilityKey`. Never renamed; retired by deactivating. */
    key: text("key").notNull(),
    categoryId: text("category_id").notNull(),

    points: integer("points").notNull().default(0),
    minimumTier: scopeTierEnum("minimum_tier").notNull().default("essential"),

    /** Capability keys this one necessarily drags in. */
    implies: jsonb("implies").$type<string[]>().notNull().default([]),
    /** Build types this applies to. Empty means all of them. */
    appliesTo: jsonb("applies_to").$type<string[]>().notNull().default([]),

    /**
     * An optional extra charged on top of the tier price, for features that
     * are genuinely additive rather than scope-defining -- an integration, a
     * migration. Null means the tier price already covers it.
     */
    surchargeMinorUnits: integer("surcharge_minor_units"),

    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("catalog_features_key_key").on(table.key),
    index("catalog_features_active_idx").on(table.isActive),
  ],
);

/* -------------------------------------------------------------------------
 * Tiers
 * ---------------------------------------------------------------------- */

/**
 * What each tier of each build costs and how long it is guaranteed for.
 *
 * `pointThreshold` is the complexity floor that selects this tier, so the
 * ladder itself is editable: moving a threshold changes which briefs land
 * where, which is exactly the lever a business uses when its estimates turn
 * out to be wrong.
 *
 * A row with a null price is a custom quote, and `guaranteedDays` must be null
 * with it -- there is no deadline to guarantee on work that has not been
 * scoped.
 */
export const catalogTiers = pgTable(
  "catalog_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    buildType: buildTypeEnum("build_type").notNull(),
    tier: scopeTierEnum("tier").notNull(),

    /** Base currency minor units. Null means a quotation is required. */
    priceMinorUnits: integer("price_minor_units"),
    guaranteedDays: integer("guaranteed_days"),

    /** Accumulated complexity points at or above which this tier applies. */
    pointThreshold: integer("point_threshold").notNull().default(0),

    /** False for a tier that is temporarily not sold. */
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("catalog_tiers_build_tier_key").on(table.buildType, table.tier),
  ],
);

/* -------------------------------------------------------------------------
 * Currencies
 * ---------------------------------------------------------------------- */

/**
 * Published local prices.
 *
 * Still a configured price list rather than a converter: `rate` is reviewed by
 * a person and `reviewedOn` records when, so a published price never moves
 * because a market did.
 */
export const catalogCurrencies = pgTable(
  "catalog_currencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    code: currencyEnum("code").notNull(),
    /** Multiplier from the base currency. Exactly 1 for the base itself. */
    rate: text("rate").notNull(),
    /** Published prices round **up** to a whole multiple of this. */
    roundToMinorUnits: integer("round_to_minor_units").notNull().default(100),

    isActive: boolean("is_active").notNull().default(true),
    reviewedOn: text("reviewed_on"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("catalog_currencies_code_key").on(table.code)],
);

/* -------------------------------------------------------------------------
 * Discounts
 * ---------------------------------------------------------------------- */

/**
 * Coupons.
 *
 * The code is matched case-insensitively on a normalised column, and every
 * constraint that limits a discount -- validity window, usage cap, minimum
 * order, which build types it applies to -- lives here rather than in the
 * checkout. A discount the browser can describe is a discount the browser can
 * invent.
 */
export const discounts = pgTable(
  "discounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Upper-cased on write, so lookup is exact and case-insensitive. */
    code: text("code").notNull(),
    description: text("description"),

    kind: discountKindEnum("kind").notNull(),
    /** Percent (1–100) for `percentage`, base minor units for `fixed`. */
    value: integer("value").notNull(),

    /** Never discount below this, whatever the percentage works out to. */
    maxDiscountMinorUnits: integer("max_discount_minor_units"),
    minOrderMinorUnits: integer("min_order_minor_units"),

    /** Empty means every build type. */
    appliesToBuildTypes: jsonb("applies_to_build_types")
      .$type<string[]>()
      .notNull()
      .default([]),

    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),

    /** Null is unlimited. `timesUsed` is incremented when an order is placed. */
    maxRedemptions: integer("max_redemptions"),
    timesUsed: integer("times_used").notNull().default(0),

    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("discounts_code_key").on(table.code),
    index("discounts_active_idx").on(table.isActive, table.endsAt),
  ],
);

export type CatalogFeature = typeof catalogFeatures.$inferSelect;
export type CatalogTier = typeof catalogTiers.$inferSelect;
export type CatalogCurrency = typeof catalogCurrencies.$inferSelect;
export type Discount = typeof discounts.$inferSelect;
