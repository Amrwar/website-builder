import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users";
import { creditEntryKindEnum } from "./enums";

/**
 * Build credits.
 *
 * A platform-level resource, deliberately **not** tied to a website. Credit is
 * held by a person, and it can be spent on a change to any project they own,
 * on an automation, on a spreadsheet conversion, or on something that does not
 * exist yet. Hanging the balance off a project would make the obvious next
 * question -- "can I use last month's credit on my new app?" -- a schema
 * migration.
 *
 * Measured in **minutes of build time** rather than in money. Credit bought at
 * one price and spent a year later must buy the same amount of work; a balance
 * denominated in currency would quietly devalue every time the price list
 * moved, which is a worse deal than the customer agreed to.
 */

/**
 * One balance per person.
 *
 * `balanceMinutes` is a cache of the ledger, kept because the balance is read
 * on nearly every screen and summing an append-only ledger each time is a scan
 * that only grows. The ledger remains the truth: `recomputeBalance` can always
 * rebuild this column, and a disagreement between them is a bug in us, never a
 * reason to doubt the ledger.
 */
export const creditAccounts = pgTable(
  "credit_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    balanceMinutes: integer("balance_minutes").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("credit_accounts_owner_key").on(table.ownerId)],
);

/**
 * Every movement, append-only.
 *
 * There is no update path and no delete path. A mistake is corrected by an
 * `adjusted` entry carrying a reason, so the history of someone's balance
 * cannot be quietly rewritten -- which matters because this is a thing they
 * paid for.
 *
 * `minutes` is signed: positive adds, negative consumes. One column rather
 * than a direction flag, so summing the ledger is a sum and cannot be got
 * wrong by reading the flag backwards.
 *
 * `subjectType` and `subjectId` are an untyped pair on purpose. Credit is
 * spent against whatever kind of work exists, and a foreign key per kind would
 * mean a migration for every new product type -- exactly the coupling this
 * table is designed to avoid.
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => creditAccounts.id, { onDelete: "restrict" }),

    kind: creditEntryKindEnum("kind").notNull(),

    /** Signed. Positive adds credit, negative consumes it. Never zero. */
    minutes: integer("minutes").notNull(),

    /** The balance immediately after this entry, for a readable statement. */
    balanceAfterMinutes: integer("balance_after_minutes").notNull(),

    /** What this was for, e.g. "project" / a project id. Both or neither. */
    subjectType: text("subject_type"),
    subjectId: text("subject_id"),

    /** Shown to the customer on their statement. */
    description: text("description"),
    /** Required for a manual adjustment; recorded for everything else. */
    reason: text("reason"),

    /** Who caused it. Null for grants made by the renewal sweep. */
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    /**
     * Granted credit can lapse. Null never expires, which is what purchased
     * credit gets -- someone who paid cash for build time should not lose it.
     */
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    /**
     * Stops a retried grant being counted twice. Unique where present, so the
     * monthly grant for one subscription period can only land once.
     */
    idempotencyKey: text("idempotency_key"),

    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /* Foreign keys are not indexed automatically. Without these, every
       delete or key update on the referenced table scans this one to check
       the constraint, and every join on the column walks the heap. Cheap to
       hold while the tables are small; an incident to add once they are not. */
    index("credit_ledger_actor_user_id_idx").on(table.actorUserId),

    index("credit_ledger_account_idx").on(table.accountId, table.occurredAt.desc()),
    uniqueIndex("credit_ledger_idempotency_key").on(table.idempotencyKey),
    index("credit_ledger_expiry_idx").on(table.expiresAt),
  ],
);

export const creditAccountsRelations = relations(creditAccounts, ({ one, many }) => ({
  owner: one(users, { fields: [creditAccounts.ownerId], references: [users.id] }),
  entries: many(creditLedger),
}));

export const creditLedgerRelations = relations(creditLedger, ({ one }) => ({
  account: one(creditAccounts, {
    fields: [creditLedger.accountId],
    references: [creditAccounts.id],
  }),
}));

export type CreditAccount = typeof creditAccounts.$inferSelect;
export type CreditEntry = typeof creditLedger.$inferSelect;
