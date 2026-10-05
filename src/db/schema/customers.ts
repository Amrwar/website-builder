import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { projects } from "./projects";

/**
 * Customers.
 *
 * Identity lives in Clerk; this table is the local projection of it, kept in
 * sync by the Clerk webhook. Only what the platform actually needs to query or
 * join on is mirrored -- credentials and session state stay with Clerk and are
 * never copied here.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Clerk's user id. The join key between Clerk and everything here. */
    clerkUserId: text("clerk_user_id").notNull(),

    email: text("email").notNull(),
    displayName: text("display_name"),

    /** Preferred UI language: one of the application locales. */
    preferredLocale: text("preferred_locale").notNull().default("en"),

    /**
     * ISO 3166-1 alpha-2 billing country.
     *
     * Deliberately separate from `preferredLocale`: language does not
     * determine currency, and pricing is resolved from country.
     */
    billingCountry: text("billing_country"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("customers_clerk_user_id_key").on(table.clerkUserId),
    index("customers_email_idx").on(table.email),
  ],
);

export const customersRelations = relations(customers, ({ many }) => ({
  projects: many(projects),
}));

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
