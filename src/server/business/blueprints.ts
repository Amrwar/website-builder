import "server-only";

import { and, asc, desc, eq, inArray, isNotNull, max, sql } from "drizzle-orm";
import { z } from "zod";

import {
  BLUEPRINT_KEY_PATTERN,
  SHIPPED_BLUEPRINTS,
  SHIPPED_CATEGORIES,
  isShippedBlueprintKey,
  isShippedCategoryKey,
} from "@/config/business";
import { LOCALES } from "@/config/locales";
import { db } from "@/db/client";
import {
  businessBlueprintVersions,
  businessBlueprints,
  businessCategories,
  orderItems,
  orders,
  users,
  type LocalizedNames,
} from "@/db/schema";
import { ApiError } from "@/lib/api/response";
import {
  blueprintDefinitionSchema,
  blueprintKeySchema,
  definitionFromShipped,
  type BlueprintDefinition,
} from "@/lib/business/blueprint";
import { logger } from "@/lib/logger";
import type { AuthContext } from "@/server/auth";
import { diffFields, recordAudit } from "@/server/admin/audit";

/**
 * Business-in-a-Box blueprints: which version is live, and administering them.
 *
 * The overlay rule, stated once: a blueprint's live definition is its
 * published database version if it has one, otherwise -- for a shipped key --
 * version 0 from `config/business.ts`. An archived blueprint is not offered
 * whatever its versions say. A blueprint created in the console is offered
 * only once a version of it has been published.
 *
 * Writing needs `settings:manage`, the same permission as the price list:
 * what a blueprint recommends decides what customers are quoted, which is a
 * commercial judgement and the owner's to make. Reading needs only console
 * access. Both refuse with `not_found`, like every staff surface.
 */

/* -------------------------------------------------------------------------
 * The catalogue, merged
 * ---------------------------------------------------------------------- */

export interface CatalogBlueprint {
  key: string;
  version: number;
  definition: BlueprintDefinition;
  status: "active" | "archived";
  source: "shipped" | "database";
  sortOrder: number;
}

export interface CatalogCategory {
  key: string;
  /** Null when the catalogues carry the names. */
  names: LocalizedNames | null;
  sortOrder: number;
  isActive: boolean;
  source: "shipped" | "database";
}

export interface BusinessCatalog {
  categories: CatalogCategory[];
  /** Every blueprint with a live definition, archived ones included. */
  blueprints: CatalogBlueprint[];
}

function parseDefinition(raw: unknown, context: string): BlueprintDefinition | null {
  const parsed = blueprintDefinitionSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Written by this service, so this means the schema moved underneath a
  // stored version. Failing closed -- hiding it -- is safer than offering a
  // blueprint whose meaning is no longer certain.
  logger.error("stored blueprint definition no longer validates", {
    context,
    issues: parsed.error.issues.map((issue) => issue.path.join(".")),
  });
  return null;
}

export async function loadBusinessCatalog(): Promise<BusinessCatalog> {
  const [categoryRows, blueprintRows] = await Promise.all([
    db.select().from(businessCategories),
    db.select().from(businessBlueprints),
  ]);

  const publishedPairs = blueprintRows
    .filter((row) => row.publishedVersion !== null)
    .map((row) => sql`(${row.id}::uuid, ${row.publishedVersion}::int)`);

  const versionRows =
    publishedPairs.length === 0
      ? []
      : await db
          .select({
            blueprintId: businessBlueprintVersions.blueprintId,
            definition: businessBlueprintVersions.definition,
          })
          .from(businessBlueprintVersions)
          .where(
            sql`(${businessBlueprintVersions.blueprintId}, ${businessBlueprintVersions.version}) in (${sql.join(publishedPairs, sql`, `)})`,
          );
  const publishedById = new Map(versionRows.map((row) => [row.blueprintId, row]));
  const rowByKey = new Map(blueprintRows.map((row) => [row.key, row]));

  const blueprints: CatalogBlueprint[] = [];

  SHIPPED_BLUEPRINTS.forEach((shipped, index) => {
    const row = rowByKey.get(shipped.key);
    const published = row ? publishedById.get(row.id) : undefined;
    const definition = published
      ? parseDefinition(published.definition, shipped.key)
      : definitionFromShipped(shipped);
    if (!definition) return;
    blueprints.push({
      key: shipped.key,
      version: published && row?.publishedVersion ? row.publishedVersion : 0,
      definition,
      status: row?.status ?? "active",
      source: published ? "database" : "shipped",
      sortOrder: row?.sortOrder ?? index,
    });
  });

  for (const row of blueprintRows) {
    if (isShippedBlueprintKey(row.key)) continue;
    const published = publishedById.get(row.id);
    if (!published || row.publishedVersion === null) continue;
    const definition = parseDefinition(published.definition, row.key);
    if (!definition) continue;
    blueprints.push({
      key: row.key,
      version: row.publishedVersion,
      definition,
      status: row.status,
      source: "database",
      sortOrder: row.sortOrder,
    });
  }

  const categoryByKey = new Map(categoryRows.map((row) => [row.key, row]));
  const categories: CatalogCategory[] = SHIPPED_CATEGORIES.map((key, index) => {
    const row = categoryByKey.get(key);
    return {
      key,
      names: row?.names ?? null,
      sortOrder: row?.sortOrder ?? index,
      isActive: row?.isActive ?? true,
      source: "shipped" as const,
    };
  });
  for (const row of categoryRows) {
    if (isShippedCategoryKey(row.key) || !row.names) continue;
    categories.push({
      key: row.key,
      names: row.names,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      source: "database",
    });
  }

  const bySort = <T extends { sortOrder: number; key: string }>(a: T, b: T) =>
    a.sortOrder - b.sortOrder || a.key.localeCompare(b.key);
  return { categories: categories.sort(bySort), blueprints: blueprints.sort(bySort) };
}

/**
 * What a customer may choose from: active blueprints in active categories.
 *
 * A blueprint whose category was deactivated disappears with it rather than
 * floating free under no heading.
 */
export function offeredBlueprints(catalog: BusinessCatalog): CatalogBlueprint[] {
  const activeCategories = new Set(
    catalog.categories.filter((category) => category.isActive).map((c) => c.key),
  );
  return catalog.blueprints.filter(
    (blueprint) =>
      blueprint.status === "active" &&
      activeCategories.has(blueprint.definition.categoryKey),
  );
}

/* -------------------------------------------------------------------------
 * Provenance on an order
 * ---------------------------------------------------------------------- */

/**
 * Whether a draft's claimed blueprint version is one customers were offered.
 *
 * Version 0 must be a shipped key; any other version must exist and have been
 * published. An archived blueprint still validates -- the customer may have
 * started before it was archived, and the label is still true.
 */
export async function isKnownBlueprintVersion(
  key: string,
  version: number,
): Promise<boolean> {
  if (!BLUEPRINT_KEY_PATTERN.test(key)) return false;
  if (version === 0) return isShippedBlueprintKey(key);

  const [row] = await db
    .select({ id: businessBlueprintVersions.id })
    .from(businessBlueprintVersions)
    .innerJoin(
      businessBlueprints,
      eq(businessBlueprints.id, businessBlueprintVersions.blueprintId),
    )
    .where(
      and(
        eq(businessBlueprints.key, key),
        eq(businessBlueprintVersions.version, version),
        isNotNull(businessBlueprintVersions.publishedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/* -------------------------------------------------------------------------
 * Guards
 * ---------------------------------------------------------------------- */

function requireManage(context: AuthContext): AuthContext {
  if (!context.can("settings:manage")) throw new ApiError("not_found", "Not found.");
  return context;
}

function requireRead(context: AuthContext): AuthContext {
  if (!context.can("admin:access")) throw new ApiError("not_found", "Not found.");
  return context;
}

function invalid(message: string): never {
  throw new ApiError("validation_failed", message);
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "That blueprint is not valid.";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

/* -------------------------------------------------------------------------
 * Reading, for the console
 * ---------------------------------------------------------------------- */

const ORDERED_STATUSES = ["paid", "partially_refunded", "refunded", "completed"] as const;

export interface AdminBlueprintSummary extends CatalogBlueprint {
  /** Highest version written, published or not. 0 when only shipped. */
  latestVersion: number;
  /** True when a version newer than the live one is waiting to be published. */
  hasUnpublished: boolean;
  paidOrders: number;
}

export async function readBlueprintsForAdmin(context: AuthContext): Promise<{
  catalog: BusinessCatalog;
  blueprints: AdminBlueprintSummary[];
  drafts: string[];
}> {
  requireRead(context);
  const catalog = await loadBusinessCatalog();

  const [latest, ordered, rows] = await Promise.all([
    db
      .select({
        key: businessBlueprints.key,
        latest: max(businessBlueprintVersions.version),
      })
      .from(businessBlueprintVersions)
      .innerJoin(
        businessBlueprints,
        eq(businessBlueprints.id, businessBlueprintVersions.blueprintId),
      )
      .groupBy(businessBlueprints.key),
    db
      .select({
        key: sql<string>`${orderItems.configuration} -> 'blueprint' ->> 'key'`,
        count: sql<number>`count(distinct ${orders.id})::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          inArray(orders.status, [...ORDERED_STATUSES]),
          sql`${orderItems.configuration} -> 'blueprint' ->> 'key' is not null`,
        ),
      )
      .groupBy(sql`${orderItems.configuration} -> 'blueprint' ->> 'key'`),
    db.select({ key: businessBlueprints.key }).from(businessBlueprints),
  ]);

  const latestByKey = new Map(latest.map((row) => [row.key, row.latest ?? 0]));
  const orderedByKey = new Map(ordered.map((row) => [row.key, row.count]));
  const live = new Set(catalog.blueprints.map((blueprint) => blueprint.key));

  return {
    catalog,
    blueprints: catalog.blueprints.map((blueprint) => {
      const latestVersion = latestByKey.get(blueprint.key) ?? 0;
      return {
        ...blueprint,
        latestVersion,
        hasUnpublished: latestVersion > blueprint.version,
        paidOrders: orderedByKey.get(blueprint.key) ?? 0,
      };
    }),
    // Created in the console and never published: not in the catalogue yet,
    // but an administrator needs to be able to find them again.
    drafts: rows.map((row) => row.key).filter((key) => !live.has(key)),
  };
}

export interface AdminBlueprintVersion {
  version: number;
  definition: BlueprintDefinition | null;
  note: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  authorEmail: string | null;
}

export interface AdminBlueprintDetail {
  key: string;
  shipped: BlueprintDefinition | null;
  status: "active" | "archived";
  publishedVersion: number | null;
  /** Newest first. */
  versions: AdminBlueprintVersion[];
  /** The definition an edit should start from: newest version, else shipped. */
  working: BlueprintDefinition;
  workingVersion: number;
}

export async function readBlueprintForAdmin(
  rawKey: string,
  context: AuthContext,
): Promise<AdminBlueprintDetail | null> {
  requireRead(context);
  const key = blueprintKeySchema.safeParse(rawKey);
  if (!key.success) return null;

  const shippedEntry = SHIPPED_BLUEPRINTS.find((entry) => entry.key === key.data);
  const shipped = shippedEntry ? definitionFromShipped(shippedEntry) : null;

  const [row] = await db
    .select()
    .from(businessBlueprints)
    .where(eq(businessBlueprints.key, key.data))
    .limit(1);
  if (!row && !shipped) return null;

  const versionRows = row
    ? await db
        .select({
          version: businessBlueprintVersions.version,
          definition: businessBlueprintVersions.definition,
          note: businessBlueprintVersions.note,
          createdAt: businessBlueprintVersions.createdAt,
          publishedAt: businessBlueprintVersions.publishedAt,
          authorEmail: users.email,
        })
        .from(businessBlueprintVersions)
        .leftJoin(users, eq(users.id, businessBlueprintVersions.createdByUserId))
        .where(eq(businessBlueprintVersions.blueprintId, row.id))
        .orderBy(desc(businessBlueprintVersions.version))
    : [];

  const versions = versionRows.map((version) => ({
    ...version,
    definition: parseDefinition(version.definition, `${key.data} v${version.version}`),
  }));
  const newest = versions.find((version) => version.definition);

  const working = newest?.definition ?? shipped;
  if (!working) return null;

  return {
    key: key.data,
    shipped,
    status: row?.status ?? "active",
    publishedVersion: row?.publishedVersion ?? null,
    versions,
    working,
    workingVersion: newest?.version ?? 0,
  };
}

/* -------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------- */

const saveInputSchema = z.object({
  definition: z.unknown(),
  note: z.string().trim().max(500).optional(),
  publish: z.boolean().optional(),
});

async function categoryExists(key: string): Promise<boolean> {
  if (isShippedCategoryKey(key)) return true;
  const [row] = await db
    .select({ id: businessCategories.id })
    .from(businessCategories)
    .where(and(eq(businessCategories.key, key), isNotNull(businessCategories.names)))
    .limit(1);
  return Boolean(row);
}

/**
 * Writes the next version of a blueprint, creating the blueprint if this is
 * its first. Optionally publishes it in the same transaction, so a
 * blueprint is never briefly pointed at a version that is not there.
 */
export async function saveBlueprintVersion(
  rawKey: string,
  input: unknown,
  context: AuthContext,
): Promise<{ version: number; published: boolean }> {
  requireManage(context);

  const key = blueprintKeySchema.safeParse(rawKey);
  if (!key.success) invalid(firstIssue(key.error));
  const parsedInput = saveInputSchema.safeParse(input);
  if (!parsedInput.success) invalid(firstIssue(parsedInput.error));
  const definition = blueprintDefinitionSchema.safeParse(parsedInput.data.definition);
  if (!definition.success) invalid(firstIssue(definition.error));

  const shipped = isShippedBlueprintKey(key.data);
  // A shipped blueprint may lean on the catalogues for its words; a new one
  // has nowhere else to get them from.
  if (!shipped && !definition.data.copy) {
    invalid(`A new blueprint needs its name and summary in ${LOCALES.join(", ")}.`);
  }
  if (!(await categoryExists(definition.data.categoryKey))) {
    invalid(`There is no category "${definition.data.categoryKey}".`);
  }

  const publish = parsedInput.data.publish ?? false;
  const note = parsedInput.data.note || null;

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(businessBlueprints)
      .where(eq(businessBlueprints.key, key.data))
      .limit(1);

    const blueprint =
      existing ??
      (
        await tx
          .insert(businessBlueprints)
          .values({
            key: key.data,
            sortOrder: shipped
              ? SHIPPED_BLUEPRINTS.findIndex((entry) => entry.key === key.data)
              : 1000,
          })
          .returning()
      )[0];
    if (!blueprint) throw new Error("blueprint row was not created");

    const [{ latest } = { latest: 0 }] = await tx
      .select({ latest: max(businessBlueprintVersions.version) })
      .from(businessBlueprintVersions)
      .where(eq(businessBlueprintVersions.blueprintId, blueprint.id));
    const version = (latest ?? 0) + 1;

    await tx.insert(businessBlueprintVersions).values({
      blueprintId: blueprint.id,
      version,
      definition: definition.data as unknown as Record<string, unknown>,
      note,
      createdByUserId: context.user.id,
      publishedAt: publish ? new Date() : null,
    });

    if (publish) {
      await tx
        .update(businessBlueprints)
        .set({ publishedVersion: version, updatedAt: new Date() })
        .where(eq(businessBlueprints.id, blueprint.id));
    }

    return { version, previous: existing?.publishedVersion ?? null };
  });

  await recordAudit({
    category: "configuration",
    action: publish ? "blueprint.version_published" : "blueprint.version_saved",
    actor: context,
    subjectType: "business_blueprint",
    subjectId: key.data,
    subjectLabel: `${key.data} v${result.version}`,
    before: publish ? { publishedVersion: result.previous } : null,
    after: {
      version: result.version,
      ...(publish ? { publishedVersion: result.version } : {}),
      recommended: definition.data.recommended,
      optional: definition.data.optional,
      buildType: definition.data.buildType,
      categoryKey: definition.data.categoryKey,
    },
    reason: note,
  });

  return { version: result.version, published: publish };
}

/**
 * Starts a new blueprint: its first version, unpublished.
 *
 * Refuses a key already in use, shipped or not -- "create" silently becoming
 * "add a version to someone else's blueprint" is the confusing direction.
 */
export async function createBlueprint(
  rawKey: string,
  input: unknown,
  context: AuthContext,
): Promise<{ version: number }> {
  requireManage(context);
  const key = blueprintKeySchema.safeParse(rawKey);
  if (!key.success) invalid(firstIssue(key.error));
  if (isShippedBlueprintKey(key.data)) invalid(`"${key.data}" is already a blueprint.`);
  const [existing] = await db
    .select({ id: businessBlueprints.id })
    .from(businessBlueprints)
    .where(eq(businessBlueprints.key, key.data))
    .limit(1);
  if (existing) invalid(`"${key.data}" is already a blueprint.`);

  const { version } = await saveBlueprintVersion(
    key.data,
    { ...(input as object), publish: false },
    context,
  );
  return { version };
}

/**
 * Points a blueprint at one of its versions.
 *
 * Also how a change is rolled back: publishing an older version makes it
 * live again without rewriting anything, and the audit trail shows both.
 */
export async function publishBlueprintVersion(
  rawKey: string,
  rawVersion: unknown,
  context: AuthContext,
): Promise<void> {
  requireManage(context);
  const key = blueprintKeySchema.safeParse(rawKey);
  if (!key.success) invalid(firstIssue(key.error));
  const version = z.number().int().min(1).safeParse(rawVersion);
  if (!version.success) invalid("Choose a saved version to publish.");

  const previous = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(businessBlueprints)
      .where(eq(businessBlueprints.key, key.data))
      .limit(1);
    if (!row) throw new ApiError("not_found", "Not found.");

    const [target] = await tx
      .select()
      .from(businessBlueprintVersions)
      .where(
        and(
          eq(businessBlueprintVersions.blueprintId, row.id),
          eq(businessBlueprintVersions.version, version.data),
        ),
      )
      .limit(1);
    if (!target) throw new ApiError("not_found", "Not found.");
    if (!parseDefinition(target.definition, `${key.data} v${version.data}`)) {
      invalid("That version no longer validates and cannot be published.");
    }

    if (!target.publishedAt) {
      await tx
        .update(businessBlueprintVersions)
        .set({ publishedAt: new Date() })
        .where(eq(businessBlueprintVersions.id, target.id));
    }
    await tx
      .update(businessBlueprints)
      .set({ publishedVersion: version.data, updatedAt: new Date() })
      .where(eq(businessBlueprints.id, row.id));
    return row.publishedVersion;
  });

  await recordAudit({
    category: "configuration",
    action: "blueprint.version_published",
    actor: context,
    subjectType: "business_blueprint",
    subjectId: key.data,
    subjectLabel: `${key.data} v${version.data}`,
    before: { publishedVersion: previous },
    after: { publishedVersion: version.data },
  });
}

/** Archives or restores a blueprint, shipped ones included. */
export async function setBlueprintStatus(
  rawKey: string,
  rawStatus: unknown,
  context: AuthContext,
): Promise<void> {
  requireManage(context);
  const key = blueprintKeySchema.safeParse(rawKey);
  if (!key.success) invalid(firstIssue(key.error));
  const status = z.enum(["active", "archived"]).safeParse(rawStatus);
  if (!status.success) invalid("Unknown status.");

  const [existing] = await db
    .select()
    .from(businessBlueprints)
    .where(eq(businessBlueprints.key, key.data))
    .limit(1);
  if (!existing && !isShippedBlueprintKey(key.data)) {
    throw new ApiError("not_found", "Not found.");
  }

  if (existing) {
    if (existing.status === status.data) return;
    await db
      .update(businessBlueprints)
      .set({ status: status.data, updatedAt: new Date() })
      .where(eq(businessBlueprints.id, existing.id));
  } else {
    await db.insert(businessBlueprints).values({
      key: key.data,
      status: status.data,
      sortOrder: SHIPPED_BLUEPRINTS.findIndex((entry) => entry.key === key.data),
    });
  }

  await recordAudit({
    category: "configuration",
    action: status.data === "archived" ? "blueprint.archived" : "blueprint.restored",
    actor: context,
    subjectType: "business_blueprint",
    subjectId: key.data,
    subjectLabel: key.data,
    before: { status: existing?.status ?? "active" },
    after: { status: status.data },
  });
}

const namesSchema = z.object(
  Object.fromEntries(
    LOCALES.map((locale) => [locale, z.string().trim().min(2).max(60)]),
  ) as Record<(typeof LOCALES)[number], z.ZodString>,
);

const categoryInputSchema = z.object({
  key: blueprintKeySchema,
  names: namesSchema.nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Creates a category, or changes one -- including a shipped one, whose
 * names may be overridden but never removed.
 */
export async function saveCategory(input: unknown, context: AuthContext): Promise<void> {
  requireManage(context);
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) invalid(firstIssue(parsed.error));
  const { key, names, sortOrder, isActive } = parsed.data;

  const shipped = isShippedCategoryKey(key);
  const [existing] = await db
    .select()
    .from(businessCategories)
    .where(eq(businessCategories.key, key))
    .limit(1);

  if (!shipped && !existing?.names && !names) {
    invalid(`A new category needs its name in ${LOCALES.join(", ")}.`);
  }

  const values = {
    ...(names !== undefined
      ? { names: shipped ? names : (names ?? existing?.names) }
      : {}),
    ...(sortOrder !== undefined ? { sortOrder } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
  };
  if (!shipped && values.names === null)
    invalid("A category you created keeps its names.");

  if (existing) {
    await db
      .update(businessCategories)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(businessCategories.id, existing.id));
  } else {
    await db.insert(businessCategories).values({
      key,
      names: values.names ?? null,
      sortOrder:
        values.sortOrder ??
        (shipped ? (SHIPPED_CATEGORIES as readonly string[]).indexOf(key) : 1000),
      isActive: values.isActive ?? true,
    });
  }

  const before = existing
    ? {
        names: existing.names,
        sortOrder: existing.sortOrder,
        isActive: existing.isActive,
      }
    : null;
  const after = {
    names: values.names ?? existing?.names ?? null,
    sortOrder: values.sortOrder ?? existing?.sortOrder,
    isActive: values.isActive ?? existing?.isActive ?? true,
  };
  await recordAudit({
    category: "configuration",
    action: existing ? "blueprint_category.updated" : "blueprint_category.created",
    actor: context,
    subjectType: "business_category",
    subjectId: key,
    subjectLabel: key,
    ...(before ? diffFields(before, after) : { before: null, after }),
  });
}

/** Category rows as stored, for the console's category table. */
export async function readCategoriesForAdmin(context: AuthContext) {
  requireRead(context);
  return db.select().from(businessCategories).orderBy(asc(businessCategories.sortOrder));
}
