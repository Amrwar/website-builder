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

import { buildTypeEnum, currencyEnum, pricingModelEnum, productTypeEnum } from "./enums";

/**
 * The sellable catalogue.
 *
 * Deliberately a table rather than a constant, because what the company sells
 * changes on a commercial timescale and should not require a deploy. A build,
 * a design service, a maintenance plan and a block of credits are all rows
 * here, differing by `type` and `pricingModel`.
 *
 * ── On name and description ───────────────────────────────────────────────
 * These are the *internal* name and description: what staff see in the admin
 * console and on an invoice line. Customer-facing copy comes from the
 * translation catalogues via `translationKey`, because every customer string
 * in this product exists in three languages and a database column cannot hold
 * three. A product with no `translationKey` falls back to `name`, which is how
 * a one-off line item stays possible without a deploy.
 *
 * ── On price ──────────────────────────────────────────────────────────────
 * `basePriceMinorUnits` is authoritative only for `fixed` and `recurring`
 * products. For `scope_assessed` builds it is the published "from" figure used
 * in marketing; the sellable price comes from the scope engine against a
 * specific brief. Two sources of truth for one number is how a customer ends
 * up charged something other than what they were shown.
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Stable slug used in code and in order snapshots. Never reused. */
    key: text("key").notNull(),

    type: productTypeEnum("type").notNull(),
    pricingModel: pricingModelEnum("pricing_model").notNull(),

    /** Grouping for the catalogue UI, e.g. "builds", "aftercare". */
    category: text("category").notNull(),

    /** Internal name and description. See the note above. */
    name: text("name").notNull(),
    description: text("description"),

    /** Key under the `products.*` namespace for customer-facing copy. */
    translationKey: text("translation_key"),

    /**
     * For `build` products, which build this is. Null for everything else --
     * a maintenance plan is not a website.
     */
    buildType: buildTypeEnum("build_type"),

    basePriceMinorUnits: integer("base_price_minor_units"),
    currency: currencyEnum("currency").notNull().default("CAD"),

    /**
     * Withdrawn products are deactivated, never deleted: orders reference
     * them, and an invoice that cannot name what was bought is not an invoice.
     */
    isActive: boolean("is_active").notNull().default(true),

    /**
     * How this product may be configured -- which capabilities apply, screen
     * limits, platform options. Shape varies by `type`, which is why it is
     * jsonb and is parsed through a Zod schema at the boundary rather than
     * trusted structurally.
     */
    configurationRules: jsonb("configuration_rules").notNull().default({}),

    /** What the price covers, as translation key suffixes. */
    includedFeatures: jsonb("included_features").notNull().default([]),

    /**
     * Who may buy it: requires an existing project, staff-only, region
     * limits. Enforced server-side at order creation, never in the UI alone.
     */
    eligibilityRules: jsonb("eligibility_rules").notNull().default({}),

    /** Display order within a category, smallest first. */
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("products_key_key").on(table.key),
    index("products_type_idx").on(table.type),
    index("products_active_idx").on(table.isActive),
  ],
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
