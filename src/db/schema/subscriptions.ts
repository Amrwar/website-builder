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

import { projects } from "./projects";
import { users } from "./users";
import { billingIntervalEnum, currencyEnum, subscriptionStatusEnum } from "./enums";

/**
 * Maintenance plans and subscriptions.
 *
 * A build is bought once; keeping it running is a separate, cancellable
 * commitment. Folding hosting into the headline price would make the published
 * figure untrue from the second month, which is the opposite of what a
 * fixed-price promise is for.
 */

/* -------------------------------------------------------------------------
 * Plans
 * ---------------------------------------------------------------------- */

/**
 * The sellable plans.
 *
 * Follows the catalogue pattern established in Phase 10: `config/maintenance`
 * remains the seed and the fallback, an empty table means "use what shipped",
 * and every edit here is audited. Prices are never hard-coded in a component.
 *
 * `includedCreditMinutes` is why plans are modelled rather than being three
 * product rows: the top plan includes build credit, and that grant has to be
 * made every period by something that knows how much.
 */
export const maintenancePlans = pgTable(
  "maintenance_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Matches a `MaintenancePlanId`. Never renamed; retired by deactivating. */
    key: text("key").notNull(),

    priceMinorUnits: integer("price_minor_units").notNull(),
    currency: currencyEnum("currency").notNull().default("CAD"),
    interval: billingIntervalEnum("interval").notNull().default("monthly"),

    /** Keys under `home.maintenance.features.*`. */
    featureKeys: jsonb("feature_keys").$type<string[]>().notNull().default([]),

    /** Build credit granted at the start of each paid period. */
    includedCreditMinutes: integer("included_credit_minutes").notNull().default(0),

    /** Free days before the first charge. Zero means billed immediately. */
    trialDays: integer("trial_days").notNull().default(0),

    isRecommended: boolean("is_recommended").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("maintenance_plans_key_key").on(table.key)],
);

/* -------------------------------------------------------------------------
 * Subscriptions
 * ---------------------------------------------------------------------- */

/**
 * One customer's commitment to one plan.
 *
 * Attached to a project because a maintenance plan maintains a specific thing,
 * but owned by a user because the user is who pays and who may cancel.
 *
 * `cancelAtPeriodEnd` exists so cancelling is not destructive. A customer who
 * cancels on the second of the month has paid to the end of it, and cutting
 * their site off that day would be theft. The subscription keeps running and
 * stops at the boundary.
 *
 * The provider's identifiers are stored but are never the source of truth for
 * entitlement: a webhook can be late, replayed or lost, so `status` and the
 * period columns are ours and are what the platform reads.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Human-facing identifier, e.g. "SUB-2026-0007". */
    reference: text("reference").notNull(),

    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    /** Null for a plan bought before the project it will cover exists. */
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),

    planKey: text("plan_key").notNull(),

    status: subscriptionStatusEnum("status").notNull().default("trialing"),
    interval: billingIntervalEnum("interval").notNull().default("monthly"),

    /** Frozen at purchase, so a later price change does not alter this one. */
    priceMinorUnits: integer("price_minor_units").notNull(),
    currency: currencyEnum("currency").notNull().default("CAD"),

    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),

    currentPeriodStart: timestamp("current_period_start", { withTimezone: true })
      .notNull()
      .defaultNow(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),

    /** Set when the customer has cancelled but the paid term is still running. */
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),

    pausedAt: timestamp("paused_at", { withTimezone: true }),
    pastDueSince: timestamp("past_due_since", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),

    provider: text("provider"),
    providerSubscriptionId: text("provider_subscription_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("subscriptions_reference_key").on(table.reference),
    index("subscriptions_owner_idx").on(table.ownerId),
    index("subscriptions_project_idx").on(table.projectId),
    // The renewal sweep reads exactly this.
    index("subscriptions_renewal_idx").on(table.status, table.currentPeriodEnd),
  ],
);

/**
 * Every change of state, append-only.
 *
 * A subscription row says what is true now. This says what happened, which is
 * the only thing that answers "I was charged after I cancelled" -- a dispute
 * that cannot be settled from current state alone.
 */
export const subscriptionEvents = pgTable(
  "subscription_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),

    /** Dotted action, e.g. "subscription.upgraded". */
    action: text("action").notNull(),
    fromStatus: subscriptionStatusEnum("from_status"),
    toStatus: subscriptionStatusEnum("to_status"),
    fromPlanKey: text("from_plan_key"),
    toPlanKey: text("to_plan_key"),

    /** Who did it. Null for the renewal sweep and other system actions. */
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text("note"),

    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /* Foreign keys are not indexed automatically. Without these, every
       delete or key update on the referenced table scans this one to check
       the constraint, and every join on the column walks the heap. Cheap to
       hold while the tables are small; an incident to add once they are not. */
    index("subscription_events_actor_user_id_idx").on(table.actorUserId),

    index("subscription_events_subscription_idx").on(
      table.subscriptionId,
      table.occurredAt.desc(),
    ),
  ],
);

/* -------------------------------------------------------------------------
 * Relations
 * ---------------------------------------------------------------------- */

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  owner: one(users, { fields: [subscriptions.ownerId], references: [users.id] }),
  project: one(projects, {
    fields: [subscriptions.projectId],
    references: [projects.id],
  }),
  events: many(subscriptionEvents),
}));

export const subscriptionEventsRelations = relations(subscriptionEvents, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [subscriptionEvents.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export type MaintenancePlanRow = typeof maintenancePlans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type SubscriptionEvent = typeof subscriptionEvents.$inferSelect;
