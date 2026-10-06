import { relations } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { currencyEnum, refundReasonEnum, refundStatusEnum } from "./enums";
import { orders } from "./orders";
import { payments } from "./payments";
import { users } from "./users";

/**
 * Refunds.
 *
 * A refund is a request before it is a transaction, and the two are separate
 * states with separate actors: finance raises it, an owner or administrator
 * releases it. That segregation is the whole reason this is a table rather
 * than a column on `orders` -- "who asked, who approved, when, and why" is the
 * record an auditor wants, and a status column cannot hold it.
 *
 * Nothing here decides authority. The permission checks live in
 * `server/admin/refunds.ts`; this records what was decided.
 */
export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    reference: text("reference").notNull(),

    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    /** The attempt being reversed, once it is known. */
    paymentId: uuid("payment_id").references(() => payments.id, {
      onDelete: "set null",
    }),

    status: refundStatusEnum("status").notNull().default("requested"),
    reason: refundReasonEnum("reason").notNull(),
    /** Required for `other`, and for anything outside the guarantee. */
    note: text("note"),

    amountMinorUnits: integer("amount_minor_units").notNull(),
    currency: currencyEnum("currency").notNull().default("CAD"),

    /* --- Who did what ------------------------------------------------- */
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),

    /**
     * Null until someone with `refund:execute` approves. Deliberately a
     * different column from `requestedBy`, so "the same person did both" is
     * visible rather than inferred.
     */
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionNote: text("rejection_note"),

    /* --- The money ----------------------------------------------------- */
    providerRefundId: text("provider_refund_id"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    failureReason: text("failure_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("refunds_order_idx").on(table.orderId),
    index("refunds_status_idx").on(table.status, table.requestedAt.desc()),
  ],
);

export const refundsRelations = relations(refunds, ({ one }) => ({
  order: one(orders, { fields: [refunds.orderId], references: [orders.id] }),
  requestedBy: one(users, {
    fields: [refunds.requestedByUserId],
    references: [users.id],
  }),
}));

export type Refund = typeof refunds.$inferSelect;
export type NewRefund = typeof refunds.$inferInsert;
