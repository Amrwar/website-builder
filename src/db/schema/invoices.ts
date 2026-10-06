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

import { currencyEnum, invoiceStatusEnum } from "./enums";
import { orders } from "./orders";
import { users } from "./users";

/**
 * Invoices.
 *
 * A financial document, which makes it the most immutable thing in the schema.
 * Once issued, its number, its line items and its totals never change -- a
 * correction is a new document, not an edit, because an invoice that can be
 * altered after the fact is worthless as a record.
 *
 * Everything is therefore snapshotted. The customer's name and business
 * details are copied in at issue time rather than joined on read: an invoice
 * must still show who was billed even after they rename their company.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Sequential and gapless within a year, e.g. "INV-2026-0001". Many tax
     * regimes require exactly that, which is why it is allocated from a
     * counter at issue time rather than derived from a random id.
     */
    number: text("number").notNull(),

    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),

    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    status: invoiceStatusEnum("status").notNull().default("draft"),

    /* --- Billed-to snapshot. Copied, never joined. --------------------- */
    billToName: text("bill_to_name").notNull(),
    billToEmail: text("bill_to_email").notNull(),
    billToOrganization: text("bill_to_organization"),
    billToCountry: text("bill_to_country"),
    billToTaxId: text("bill_to_tax_id"),

    currency: currencyEnum("currency").notNull().default("CAD"),
    subtotalMinorUnits: integer("subtotal_minor_units").notNull(),
    discountMinorUnits: integer("discount_minor_units").notNull().default(0),
    taxMinorUnits: integer("tax_minor_units").notNull().default(0),
    totalMinorUnits: integer("total_minor_units").notNull(),
    refundedMinorUnits: integer("refunded_minor_units").notNull().default(0),

    /** The rate applied, and the basis for it. Zero until registered. */
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull().default(0),
    taxNote: text("tax_note"),

    /** Frozen line items, so the document stands alone. */
    lineItems: jsonb("line_items").notNull(),

    /** Locale the document was rendered in. */
    locale: text("locale").notNull().default("en"),

    issuedAt: timestamp("issued_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("invoices_number_key").on(table.number),
    /** One invoice per order: the guard against issuing a second on a retry. */
    uniqueIndex("invoices_order_id_key").on(table.orderId),
    index("invoices_owner_id_idx").on(table.ownerId),
    index("invoices_status_idx").on(table.status),
  ],
);

export const invoicesRelations = relations(invoices, ({ one }) => ({
  order: one(orders, { fields: [invoices.orderId], references: [orders.id] }),
  owner: one(users, { fields: [invoices.ownerId], references: [users.id] }),
}));

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

/**
 * Document number counters.
 *
 * A dedicated table because gapless sequential numbering cannot come from a
 * Postgres sequence: sequences deliberately leak numbers on rollback, and a
 * gap in an invoice series is the kind of thing an auditor asks about. The
 * counter is incremented inside the same transaction as the document, under a
 * row lock, so concurrent issues serialise instead of colliding.
 */
export const documentCounters = pgTable(
  "document_counters",
  {
    /** e.g. "invoice", "order". */
    scope: text("scope").notNull(),
    /** Calendar year the series belongs to. */
    year: integer("year").notNull(),
    lastValue: integer("last_value").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("document_counters_scope_year_key").on(table.scope, table.year),
  ],
);
