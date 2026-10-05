import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { currencyEnum, userRoleEnum } from "./enums";
import { projects } from "./projects";

/**
 * Platform users.
 *
 * Everyone who signs in: customers and staff alike. They share one table
 * because they share one identity provider and one account surface -- a
 * developer has preferences and a profile exactly as a customer does. What
 * separates them is `role`.
 *
 * Clerk owns authentication; this row is the local projection of it, kept in
 * sync by the Clerk webhook. Credentials, sessions and verification state stay
 * with Clerk and are never mirrored here.
 *
 * `role` is deliberately stored here rather than only in Clerk metadata. Clerk
 * metadata is readable by the client and editable through Clerk's dashboard;
 * authorization decisions need a source of truth the application controls and
 * can change transactionally alongside its own data.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Clerk's user id. The join key between Clerk and everything here. */
    clerkUserId: text("clerk_user_id").notNull(),

    email: text("email").notNull(),
    displayName: text("display_name"),

    /**
     * Authorization role. Defaults to the least-privileged value so a newly
     * synced account can never arrive with elevated access.
     */
    role: userRoleEnum("role").notNull().default("customer"),

    // --- Preferences ------------------------------------------------------
    /** UI language: one of the application locales. */
    preferredLocale: text("preferred_locale").notNull().default("en"),

    /**
     * Display currency. Separate from locale on purpose: a French speaker in
     * Montreal is served `fr` and still pays in CAD.
     */
    preferredCurrency: currencyEnum("preferred_currency").notNull().default("CAD"),

    /** IANA zone, e.g. "America/Toronto". Used for deadlines and timestamps. */
    timezone: text("timezone").notNull().default("America/Toronto"),

    // --- Notification preferences ----------------------------------------
    // Explicit columns rather than a JSON blob: these are queried when sending,
    // and a blob makes "everyone who wants deadline alerts" an unindexable scan.
    notifyBuildUpdates: boolean("notify_build_updates").notNull().default(true),
    notifyMessages: boolean("notify_messages").notNull().default(true),
    notifyDeadlineAlerts: boolean("notify_deadline_alerts").notNull().default(true),
    /**
     * Marketing. Defaults to false: consent has to be given, not withdrawn,
     * and defaulting this to true would make the first email unlawful in
     * several of the markets this product targets.
     */
    notifyProductNews: boolean("notify_product_news").notNull().default(false),

    // --- Business profile -------------------------------------------------
    businessName: text("business_name"),
    businessWebsite: text("business_website"),
    /** ISO 3166-1 alpha-2. Drives pricing currency and tax treatment. */
    billingCountry: text("billing_country"),
    /** VAT / GST registration, where the customer has one. */
    taxId: text("tax_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_clerk_user_id_key").on(table.clerkUserId),
    index("users_email_idx").on(table.email),
    /** Staff listings filter by role. */
    index("users_role_idx").on(table.role),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
