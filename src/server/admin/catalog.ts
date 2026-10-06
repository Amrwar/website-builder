import "server-only";

import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  catalogCurrencies,
  catalogFeatures,
  catalogTiers,
  discounts,
  type CatalogCurrency,
  type CatalogFeature,
  type CatalogTier,
  type Discount,
} from "@/db/schema";
import { BUILD_TYPES } from "@/config/products";
import { SCOPE_TIERS } from "@/db/schema/enums";
import { ApiError } from "@/lib/api/response";
import { defaultCatalog, normaliseCode } from "@/lib/engine";
import { SUPPORTED_CURRENCIES } from "@/lib/pricing/money";
import type { AuthContext } from "@/server/auth";
import { invalidateCatalogCache } from "@/server/engine";
import { diffFields, recordAudit } from "./audit";

/**
 * Administering the commercial catalogue.
 *
 * Three properties hold for every function here, and they are the reason the
 * pricing rules were allowed to move out of version control and into a table:
 *
 *  1. **Only the owner may write.** `settings:manage` is held by the owner
 *     alone, and an administrator who can refund thousands of dollars still
 *     cannot quietly move a price. Reading is a weaker permission, so finance
 *     can see the price list without being able to change it.
 *  2. **Every change is audited** with the fields that changed, their previous
 *     values and who made them -- which is also what makes a change
 *     revertable.
 *  3. **No change is retroactive.** Orders freeze a complete pricing snapshot
 *     at the moment they are placed, so editing a row here cannot alter what
 *     anybody was charged. That is what makes editing safe at all.
 *
 * Validation happens here and again in the database. The schemas below reject
 * a bad figure with a message an administrator can act on; the CHECK
 * constraints behind them reject it whatever path it arrived by.
 */

/* -------------------------------------------------------------------------
 * Guards
 * ---------------------------------------------------------------------- */

/**
 * Refuses anyone without `settings:manage`.
 *
 * Answers `not_found` rather than `forbidden`, like every other staff-only
 * surface: a refusal that distinguishes "you may not" from "there is nothing
 * here" tells a prober which endpoints are worth attacking.
 */
function requireSettings(context: AuthContext): AuthContext {
  if (!context.can("settings:manage")) {
    throw new ApiError("not_found", "Not found.");
  }
  return context;
}

function requireRead(context: AuthContext): AuthContext {
  if (!context.can("finance:read")) {
    throw new ApiError("not_found", "Not found.");
  }
  return context;
}

function invalid(message: string): never {
  throw new ApiError("validation_failed", message);
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

export interface CatalogAdminView {
  features: CatalogFeature[];
  tiers: CatalogTier[];
  currencies: CatalogCurrency[];
  discounts: Discount[];
  /** True when nothing has been imported and the shipped defaults are live. */
  usingShippedDefaults: {
    features: boolean;
    tiers: boolean;
    currencies: boolean;
  };
}

export async function readCatalogForAdmin(
  context: AuthContext,
): Promise<CatalogAdminView> {
  requireRead(context);

  const [features, tiers, currencies, codes] = await Promise.all([
    db
      .select()
      .from(catalogFeatures)
      .orderBy(asc(catalogFeatures.sortOrder), asc(catalogFeatures.key)),
    db
      .select()
      .from(catalogTiers)
      .orderBy(asc(catalogTiers.buildType), asc(catalogTiers.pointThreshold)),
    db.select().from(catalogCurrencies).orderBy(asc(catalogCurrencies.code)),
    db.select().from(discounts).orderBy(asc(discounts.code)),
  ]);

  return {
    features,
    tiers,
    currencies,
    discounts: codes,
    usingShippedDefaults: {
      features: features.length === 0,
      tiers: tiers.length === 0,
      currencies: currencies.length === 0,
    },
  };
}

/* -------------------------------------------------------------------------
 * Importing the shipped defaults
 * ---------------------------------------------------------------------- */

/**
 * Copies the shipped catalogue into the tables so it can be edited.
 *
 * An empty table means "use what shipped", so this is not required for the
 * platform to price correctly -- it is the step that makes those figures
 * editable. Done here rather than in a seed script because it is a privileged,
 * audited act, and because it reads the same `config/` constants the engine
 * falls back to, so there is no second copy of the numbers to drift.
 *
 * Refuses when rows already exist. Overwriting an administrator's edits with
 * the shipped figures is a destructive act disguised as a convenience.
 */
export async function importShippedDefaults(context: AuthContext): Promise<{
  features: number;
  tiers: number;
  currencies: number;
}> {
  requireSettings(context);

  const existing = await readCatalogForAdmin(context);
  const shipped = defaultCatalog();

  const written = { features: 0, tiers: 0, currencies: 0 };

  await db.transaction(async (tx) => {
    if (existing.usingShippedDefaults.features) {
      await tx.insert(catalogFeatures).values(
        shipped.features.map((feature, index) => ({
          key: feature.key,
          categoryId: feature.categoryId,
          points: feature.points,
          minimumTier: feature.minimumTier,
          implies: [...feature.implies],
          appliesTo: [...feature.appliesTo],
          surchargeMinorUnits: feature.surchargeMinorUnits,
          isActive: feature.isActive,
          sortOrder: index,
        })),
      );
      written.features = shipped.features.length;
    }

    if (existing.usingShippedDefaults.tiers) {
      await tx.insert(catalogTiers).values(
        shipped.tiers.map((tier) => ({
          buildType: tier.buildType,
          tier: tier.tier,
          priceMinorUnits: tier.priceMinorUnits,
          guaranteedDays: tier.guaranteedDays,
          pointThreshold: tier.pointThreshold,
          isActive: tier.isActive,
        })),
      );
      written.tiers = shipped.tiers.length;
    }

    if (existing.usingShippedDefaults.currencies) {
      await tx.insert(catalogCurrencies).values(
        shipped.currencies.map((currency) => ({
          code: currency.code,
          rate: String(currency.rate),
          roundToMinorUnits: currency.roundToMinorUnits,
          isActive: currency.isActive,
          reviewedOn: currency.reviewedOn,
        })),
      );
      written.currencies = shipped.currencies.length;
    }
  });

  if (written.features + written.tiers + written.currencies === 0) {
    invalid("The catalogue has already been imported.");
  }

  invalidateCatalogCache();

  await recordAudit({
    category: "configuration",
    action: "catalog.imported_defaults",
    actor: context,
    subjectType: "catalog",
    subjectId: null,
    subjectLabel: "Shipped defaults",
    after: written,
  });

  return written;
}

/* -------------------------------------------------------------------------
 * Tiers
 * ---------------------------------------------------------------------- */

/**
 * A tier edit.
 *
 * Price and days move together on purpose. A price with no deadline would sell
 * a fixed build with no promise attached; a deadline with no price would
 * publish a guarantee nobody priced. The database enforces the same pairing.
 */
const tierPatch = z
  .object({
    priceMinorUnits: z.number().int().positive().nullable(),
    guaranteedDays: z.number().int().min(1).max(365).nullable(),
    pointThreshold: z.number().int().min(0),
    isActive: z.boolean(),
  })
  .refine(
    (value) => (value.priceMinorUnits === null) === (value.guaranteedDays === null),
    {
      message:
        "A tier needs both a price and a guaranteed duration, or neither — a row with neither is a custom quote.",
    },
  );

export type TierPatch = z.infer<typeof tierPatch>;

export async function updateTier(
  id: string,
  patch: unknown,
  context: AuthContext,
  reason?: string,
): Promise<CatalogTier> {
  requireSettings(context);

  const parsed = tierPatch.safeParse(patch);
  if (!parsed.success) {
    invalid(parsed.error.issues[0]?.message ?? "That tier is not valid.");
  }

  const before = await db.query.catalogTiers.findFirst({
    where: eq(catalogTiers.id, id),
  });
  if (!before) throw new ApiError("not_found", "Not found.");

  const [after] = await db
    .update(catalogTiers)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(catalogTiers.id, id))
    .returning();

  if (!after) throw new ApiError("not_found", "Not found.");

  invalidateCatalogCache();

  const diff = diffFields(before as unknown as Record<string, unknown>, parsed.data);
  if (diff) {
    await recordAudit({
      category: "configuration",
      action: "catalog.tier_updated",
      actor: context,
      subjectType: "catalog_tier",
      subjectId: id,
      subjectLabel: `${before.buildType} · ${before.tier}`,
      before: diff.before,
      after: diff.after,
      reason: reason ?? null,
    });
  }

  return after;
}

/* -------------------------------------------------------------------------
 * Features
 * ---------------------------------------------------------------------- */

const featurePatch = z.object({
  points: z.number().int().min(0).max(100),
  minimumTier: z.enum(SCOPE_TIERS),
  surchargeMinorUnits: z.number().int().positive().nullable(),
  isActive: z.boolean(),
});

export type FeaturePatch = z.infer<typeof featurePatch>;

export async function updateFeature(
  id: string,
  patch: unknown,
  context: AuthContext,
  reason?: string,
): Promise<CatalogFeature> {
  requireSettings(context);

  const parsed = featurePatch.safeParse(patch);
  if (!parsed.success) {
    invalid(parsed.error.issues[0]?.message ?? "That feature is not valid.");
  }

  const before = await db.query.catalogFeatures.findFirst({
    where: eq(catalogFeatures.id, id),
  });
  if (!before) throw new ApiError("not_found", "Not found.");

  const [after] = await db
    .update(catalogFeatures)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(catalogFeatures.id, id))
    .returning();

  if (!after) throw new ApiError("not_found", "Not found.");

  invalidateCatalogCache();

  const diff = diffFields(before as unknown as Record<string, unknown>, parsed.data);
  if (diff) {
    await recordAudit({
      category: "configuration",
      action: "catalog.feature_updated",
      actor: context,
      subjectType: "catalog_feature",
      subjectId: id,
      subjectLabel: before.key,
      before: diff.before,
      after: diff.after,
      reason: reason ?? null,
    });
  }

  return after;
}

/* -------------------------------------------------------------------------
 * Currencies
 * ---------------------------------------------------------------------- */

/**
 * A published local price list, not a converter.
 *
 * `reviewedOn` is required on every edit because the figure it describes is a
 * human judgement about what to charge in a market, and a rate with no date is
 * a rate nobody can audit.
 */
const currencyPatch = z.object({
  rate: z.number().positive().max(1000),
  roundToMinorUnits: z.number().int().min(1).max(100_000),
  reviewedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date."),
  isActive: z.boolean(),
});

export type CurrencyPatch = z.infer<typeof currencyPatch>;

export async function updateCurrency(
  id: string,
  patch: unknown,
  context: AuthContext,
  reason?: string,
): Promise<CatalogCurrency> {
  requireSettings(context);

  const parsed = currencyPatch.safeParse(patch);
  if (!parsed.success) {
    invalid(parsed.error.issues[0]?.message ?? "That currency is not valid.");
  }

  const before = await db.query.catalogCurrencies.findFirst({
    where: eq(catalogCurrencies.id, id),
  });
  if (!before) throw new ApiError("not_found", "Not found.");

  // The base currency is never converted, so a rate on it is meaningless and
  // an inactive base currency would make the whole price list unreadable.
  if (before.code === "CAD" && (parsed.data.rate !== 1 || !parsed.data.isActive)) {
    invalid("The base currency is always active at a rate of exactly 1.");
  }

  const values = { ...parsed.data, rate: String(parsed.data.rate) };

  const [after] = await db
    .update(catalogCurrencies)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(catalogCurrencies.id, id))
    .returning();

  if (!after) throw new ApiError("not_found", "Not found.");

  invalidateCatalogCache();

  const diff = diffFields(before as unknown as Record<string, unknown>, values);
  if (diff) {
    await recordAudit({
      category: "configuration",
      action: "catalog.currency_updated",
      actor: context,
      subjectType: "catalog_currency",
      subjectId: id,
      subjectLabel: before.code,
      before: diff.before,
      after: diff.after,
      reason: reason ?? null,
    });
  }

  return after;
}

/* -------------------------------------------------------------------------
 * Discounts
 * ---------------------------------------------------------------------- */

const discountInput = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/, "Letters, digits, hyphens and underscores only."),
    description: z.string().trim().max(200).nullable(),
    kind: z.enum(["percentage", "fixed"]),
    value: z.number().int().positive(),
    maxDiscountMinorUnits: z.number().int().positive().nullable(),
    minOrderMinorUnits: z.number().int().min(0).nullable(),
    appliesToBuildTypes: z.array(z.enum(BUILD_TYPES)),
    startsAt: z.date().nullable(),
    endsAt: z.date().nullable(),
    maxRedemptions: z.number().int().positive().nullable(),
    isActive: z.boolean(),
  })
  .refine((value) => value.kind !== "percentage" || value.value <= 100, {
    message: "A percentage discount cannot exceed 100.",
  })
  .refine((value) => !value.startsAt || !value.endsAt || value.endsAt > value.startsAt, {
    message: "The end date must fall after the start date.",
  });

export type DiscountInput = z.infer<typeof discountInput>;

export async function createDiscount(
  input: unknown,
  context: AuthContext,
): Promise<Discount> {
  requireSettings(context);

  const parsed = discountInput.safeParse(input);
  if (!parsed.success) {
    invalid(parsed.error.issues[0]?.message ?? "That discount is not valid.");
  }

  const code = normaliseCode(parsed.data.code);
  if (!code) invalid("A discount needs a code.");

  try {
    const [created] = await db
      .insert(discounts)
      .values({ ...parsed.data, code })
      .returning();
    if (!created) throw new ApiError("internal_error", "That discount was not saved.");

    invalidateCatalogCache();

    await recordAudit({
      category: "configuration",
      action: "catalog.discount_created",
      actor: context,
      subjectType: "discount",
      subjectId: created.id,
      subjectLabel: code,
      after: {
        kind: created.kind,
        value: created.value,
        maxRedemptions: created.maxRedemptions,
        endsAt: created.endsAt,
      },
    });

    return created;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // The unique index is the real guard against two campaigns sharing a code.
    if (String(error).includes("discounts_code_key")) {
      invalid("That code is already in use.");
    }
    throw error;
  }
}

/**
 * Withdraws a discount.
 *
 * Deactivates rather than deletes. Orders already reference the code in their
 * frozen pricing snapshot, and deleting the row would leave a reduced total
 * with nothing explaining it. `times_used` is also the only record of how a
 * campaign performed.
 */
export async function setDiscountActive(
  id: string,
  isActive: boolean,
  context: AuthContext,
  reason?: string,
): Promise<Discount> {
  requireSettings(context);

  const before = await db.query.discounts.findFirst({ where: eq(discounts.id, id) });
  if (!before) throw new ApiError("not_found", "Not found.");

  const [after] = await db
    .update(discounts)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(discounts.id, id))
    .returning();

  if (!after) throw new ApiError("not_found", "Not found.");

  invalidateCatalogCache();

  await recordAudit({
    category: "configuration",
    action: isActive ? "catalog.discount_enabled" : "catalog.discount_disabled",
    actor: context,
    subjectType: "discount",
    subjectId: id,
    subjectLabel: before.code,
    before: { isActive: before.isActive },
    after: { isActive },
    reason: reason ?? null,
  });

  return after;
}

/** The currencies and build types the forms offer, so the UI invents neither. */
export const CATALOG_CHOICES = {
  currencies: SUPPORTED_CURRENCIES,
  buildTypes: BUILD_TYPES,
  tiers: SCOPE_TIERS,
} as const;
