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

import type { Locale } from "@/config/locales";
import { blueprintStatusEnum } from "./enums";
import { users } from "./users";

/**
 * Business-in-a-Box, as administered data.
 *
 * The same overlay as the pricing catalogue: `config/business.ts` ships
 * version 0 of every blueprint and the shipped categories, and an empty table
 * means "use what shipped". A row here exists only once an administrator has
 * changed something.
 *
 * Versions are the point. An order records the blueprint version it started
 * from, so a version must mean the same thing forever -- which is why
 * `business_blueprint_versions` is append-only in the database (migration
 * 0016), not merely by convention. Editing a blueprint writes a new version;
 * publishing points the blueprint at it.
 */

/** Category names in every language, for a category an administrator added. */
export type LocalizedNames = Record<Locale, string>;

export const businessCategories = pgTable(
  "business_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** A shipped key, or a new one. Never renamed; retired by deactivating. */
    key: text("key").notNull(),
    /** Null for a shipped category, whose names are in the catalogues. */
    names: jsonb("names").$type<LocalizedNames>(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("business_categories_key_key").on(table.key)],
);

export const businessBlueprints = pgTable(
  "business_blueprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    status: blueprintStatusEnum("status").notNull().default("active"),
    /**
     * The version customers see. Null while only drafts exist, in which case
     * a shipped blueprint stays on version 0 and a new one is not offered.
     */
    publishedVersion: integer("published_version"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("business_blueprints_key_key").on(table.key)],
);

export const businessBlueprintVersions = pgTable(
  "business_blueprint_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blueprintId: uuid("blueprint_id")
      .notNull()
      .references(() => businessBlueprints.id, { onDelete: "restrict" }),
    /** 1, 2, 3… per blueprint. Version 0 is the shipped definition, in code. */
    version: integer("version").notNull(),
    /** A `BlueprintDefinition`, validated by the service before it is written. */
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
    /** Why this version exists, in the administrator's words. */
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set once, when first published. The only column that ever changes. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("business_blueprint_versions_blueprint_version_key").on(
      table.blueprintId,
      table.version,
    ),
    index("business_blueprint_versions_created_by_idx").on(table.createdByUserId),
  ],
);

export type BusinessCategoryRow = typeof businessCategories.$inferSelect;
export type BusinessBlueprintRow = typeof businessBlueprints.$inferSelect;
export type BusinessBlueprintVersionRow = typeof businessBlueprintVersions.$inferSelect;
