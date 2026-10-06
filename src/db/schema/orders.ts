import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { currencyEnum, orderStatusEnum, productTypeEnum, scopeTierEnum } from "./enums";
import { products } from "./products";
import { projects } from "./projects";
import { scopeAssessments } from "./scope-assessments";
import { users } from "./users";

/**
 * Orders.
 *
 * An order is the commercial record of what was agreed, and it is immutable in
 * every respect that matters. The totals, the currency, the conversion
 * arithmetic and the scope that justified the price are all frozen here at the
 * moment the order is placed.
 *
 * That immutability is the whole point. Tier prices are provisional and will
 * change; the rate table is reviewed and will move; the scope rules carry a
 * version precisely because they evolve. None of that may reach backwards and
 * alter what a customer was charged last month.
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Human-quotable, e.g. "ORD-2026-0001". Unique, and never reused. */
    number: text("number").notNull(),

    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    status: orderStatusEnum("status").notNull().default("draft"),

    /**
     * The currency the customer is charged in. Every amount on this order and
     * its items is in this currency -- there is no mixed-currency order.
     */
    currency: currencyEnum("currency").notNull().default("CAD"),

    subtotalMinorUnits: integer("subtotal_minor_units").notNull().default(0),
    discountMinorUnits: integer("discount_minor_units").notNull().default(0),
    /**
     * Tax. Zero until a tax registration exists -- see `config/commerce.ts`.
     * The column is here from the start because retrofitting tax onto issued
     * invoices is far worse than carrying a zero.
     */
    taxMinorUnits: integer("tax_minor_units").notNull().default(0),
    totalMinorUnits: integer("total_minor_units").notNull().default(0),

    /** Cumulative amount refunded, which drives partially_refunded. */
    refundedMinorUnits: integer("refunded_minor_units").notNull().default(0),

    /**
     * The complete pricing derivation: base-currency amounts, the rate and
     * rounding step applied, the rate table's review date, the scope assessor
     * and its ruleset version. This is what makes a charged figure defensible
     * years later.
     */
    pricingSnapshot: jsonb("pricing_snapshot").notNull(),

    /** Locale the order was placed in; invoices are rendered in it. */
    locale: text("locale").notNull().default("en"),

    /**
     * Caller-supplied key that makes order creation idempotent. A customer who
     * double-submits, or whose connection retries, gets the same order back
     * rather than a second one.
     */
    idempotencyKey: text("idempotency_key").notNull(),

    /**
     * The project this order produced, set at fulfilment. Null before payment
     * -- a project must not exist merely because a checkout was opened.
     */
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),

    placedAt: timestamp("placed_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("orders_number_key").on(table.number),
    /** The duplicate-order guard, enforced by the database rather than by a check-then-insert. */
    uniqueIndex("orders_idempotency_key_key").on(table.idempotencyKey),
    index("orders_owner_id_idx").on(table.ownerId),
    index("orders_status_idx").on(table.status),
  ],
);

/**
 * Order lines.
 *
 * Each line preserves everything needed to reconstruct what was bought: the
 * product as it was named then, the exact configuration, the scope assessment
 * that priced it, and the conversion arithmetic. A later edit to the product
 * catalogue cannot change what this line says.
 */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),

    /**
     * Restrict, not cascade: deleting a product must not silently empty an
     * order. Products are deactivated instead.
     */
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "restrict",
    }),

    /** Snapshots, so the line still reads correctly if the catalogue moves. */
    productKey: text("product_key").notNull(),
    productType: productTypeEnum("product_type").notNull(),
    /**
     * The internal English name, kept because it is what the payment provider
     * shows on a card statement and what staff search on. It is *not* what the
     * customer is shown -- see `translationKey`.
     */
    productName: text("product_name").notNull(),
    /**
     * The catalogue key the customer-facing label is translated from.
     *
     * Snapshotted alongside the price rather than derived on read, so a line
     * still names itself after the catalogue has moved on. Nullable only
     * because orders placed before this column existed have no value; those
     * fall back to `productName`.
     */
    translationKey: text("translation_key"),

    quantity: integer("quantity").notNull().default(1),

    /** The configurator draft exactly as submitted. */
    configuration: jsonb("configuration"),

    /** The assessment that justified the price, and its frozen copy. */
    scopeAssessmentId: uuid("scope_assessment_id").references(() => scopeAssessments.id, {
      onDelete: "set null",
    }),
    scopeTier: scopeTierEnum("scope_tier"),
    scopeSnapshot: jsonb("scope_snapshot"),

    /** Capability keys this line covers, for the invoice and the build brief. */
    selectedCapabilities: jsonb("selected_capabilities").notNull().default([]),

    unitAmountMinorUnits: integer("unit_amount_minor_units").notNull(),
    discountMinorUnits: integer("discount_minor_units").notNull().default(0),
    taxMinorUnits: integer("tax_minor_units").notNull().default(0),
    totalMinorUnits: integer("total_minor_units").notNull(),
    currency: currencyEnum("currency").notNull().default("CAD"),

    /**
     * How the charged amount was derived from the base-currency price: the
     * base figure, the rate, the rounding step and when the table was reviewed.
     */
    conversion: jsonb("conversion"),

    /** Guaranteed development days sold on this line, if any. */
    guaranteedDays: integer("guaranteed_days"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("order_items_order_id_idx").on(table.orderId)],
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  owner: one(users, { fields: [orders.ownerId], references: [users.id] }),
  project: one(projects, { fields: [orders.projectId], references: [projects.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
