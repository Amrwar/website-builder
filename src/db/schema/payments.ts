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

import { currencyEnum, paymentProviderEnum, paymentStatusEnum } from "./enums";
import { orders } from "./orders";

/**
 * Payment attempts.
 *
 * One row per attempt, not one per order: a customer who abandons a checkout
 * and comes back has two attempts against one order, and only one of them
 * succeeded. Collapsing that into a single mutable row loses the history
 * exactly when a dispute needs it.
 *
 * `status` is our normalised vocabulary; `providerStatus` keeps the provider's
 * own word for it, because the two will not always map cleanly and the
 * original is what support will be reading back to a customer.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),

    provider: paymentProviderEnum("provider").notNull(),

    /**
     * The provider's identifier for the attempt -- a Stripe Checkout Session
     * id. Unique, so a webhook can find the attempt it belongs to without
     * guessing, and so one session cannot create two payment rows.
     */
    providerReference: text("provider_reference").notNull(),

    /** The charge or payment intent, known only once money moves. */
    providerPaymentId: text("provider_payment_id"),

    status: paymentStatusEnum("status").notNull().default("initiated"),
    /** The provider's own status string, unmapped. */
    providerStatus: text("provider_status"),

    amountMinorUnits: integer("amount_minor_units").notNull(),
    currency: currencyEnum("currency").notNull().default("CAD"),

    refundedMinorUnits: integer("refunded_minor_units").notNull().default(0),

    /**
     * Sent to the provider so a retried create call returns the original
     * attempt instead of charging twice.
     */
    idempotencyKey: text("idempotency_key").notNull(),

    /** Last error reported, for support. Never shown to the customer raw. */
    failureReason: text("failure_reason"),

    initiatedAt: timestamp("initiated_at", { withTimezone: true }).notNull().defaultNow(),
    succeededAt: timestamp("succeeded_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payments_provider_reference_key").on(
      table.provider,
      table.providerReference,
    ),
    uniqueIndex("payments_idempotency_key_key").on(table.idempotencyKey),
    index("payments_order_id_idx").on(table.orderId),
    index("payments_status_idx").on(table.status),
  ],
);

/**
 * Provider event log.
 *
 * Two jobs, and the second is the important one:
 *
 *  1. An audit history of everything the provider told us.
 *  2. **The replay guard.** `providerEventId` is unique, so inserting the row
 *     is what claims an event for processing. A replayed or duplicated
 *     delivery hits the constraint and is answered without re-running
 *     fulfilment. Stripe explicitly says to track event ids for this and not
 *     to rely on timestamps, and that the same event can arrive more than once.
 *
 * `processedAt` separates "received and recorded" from "acted upon", so a
 * crash between the two is visible rather than silently lost.
 */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    provider: paymentProviderEnum("provider").notNull(),

    /** The provider's event id. The uniqueness here is the replay guard. */
    providerEventId: text("provider_event_id").notNull(),

    type: text("type").notNull(),

    /** Set once the event is matched to an attempt; some never match. */
    paymentId: uuid("payment_id").references(() => payments.id, {
      onDelete: "set null",
    }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),

    /** The verified payload, for reconstructing what we were told and when. */
    payload: jsonb("payload").notNull(),

    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    /** Why processing failed, when it did. Retried by the provider. */
    processingError: text("processing_error"),
  },
  (table) => [
    uniqueIndex("payment_events_provider_event_id_key").on(
      table.provider,
      table.providerEventId,
    ),
    index("payment_events_payment_id_idx").on(table.paymentId),
    index("payment_events_order_id_idx").on(table.orderId),
  ],
);

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
  events: many(paymentEvents),
}));

export const paymentEventsRelations = relations(paymentEvents, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentEvents.paymentId],
    references: [payments.id],
  }),
}));

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type PaymentEvent = typeof paymentEvents.$inferSelect;
