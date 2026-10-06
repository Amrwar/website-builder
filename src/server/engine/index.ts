import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { catalogCurrencies, catalogFeatures, catalogTiers, discounts } from "@/db/schema";
import type { BuildType } from "@/config/products";
import { platformConflict } from "@/config/platforms";
import type { ConfiguratorDraft } from "@/lib/configurator/draft";
import {
  defaultCatalog,
  evaluateProject,
  normaliseCode,
  type Catalog,
  type CurrencyRule,
  type DiscountRule,
  type FeatureRule,
  type ProjectAssessment,
  type TierRule,
} from "@/lib/engine";
import { logger } from "@/lib/logger";
import type { Currency } from "@/lib/pricing/money";
import { assessScope } from "@/lib/scope";

/**
 * The server side of the engine.
 *
 * Loads the catalogue, runs the scope assessor, and hands both to the pure
 * evaluator. This is the only place the configurator, checkout, the Build Room
 * and the admin console go for a price -- before it existed, two call sites
 * assembled scope and price independently, which is two places for the same
 * figure to drift.
 *
 * Administrator edits overlay the shipped defaults rather than replacing them.
 * An empty table means "use what shipped", so the platform prices correctly
 * before anyone has opened the admin screens, and a half-populated table
 * cannot produce a catalogue with holes in it.
 */

/**
 * Catalogue cache.
 *
 * Deliberately short. Pricing has to reflect an administrator's edit within
 * seconds -- a stale price is a wrong price -- but reloading four tables on
 * every keystroke of a configurator would be absurd.
 */
const CACHE_MS = 15_000;
let cached: { at: number; catalog: Catalog } | null = null;

export function invalidateCatalogCache(): void {
  cached = null;
}

async function loadOverlay(): Promise<Catalog> {
  const base = defaultCatalog();

  // Ordered in SQL rather than left to row order. An UPDATE moves a row to
  // the end of a heap, so without this the published price list silently
  // reorders itself the moment somebody edits a tier.
  const [featureRows, tierRows, currencyRows] = await Promise.all([
    db
      .select()
      .from(catalogFeatures)
      .orderBy(asc(catalogFeatures.sortOrder), asc(catalogFeatures.key)),
    db
      .select()
      .from(catalogTiers)
      .orderBy(asc(catalogTiers.buildType), asc(catalogTiers.pointThreshold)),
    db.select().from(catalogCurrencies).orderBy(asc(catalogCurrencies.code)),
  ]);

  const features: readonly FeatureRule[] =
    featureRows.length === 0
      ? base.features
      : featureRows.map((row) => ({
          key: row.key,
          categoryId: row.categoryId,
          points: row.points,
          minimumTier: row.minimumTier,
          implies: row.implies,
          appliesTo: row.appliesTo,
          surchargeMinorUnits: row.surchargeMinorUnits,
          isActive: row.isActive,
        }));

  const tiers: readonly TierRule[] =
    tierRows.length === 0
      ? base.tiers
      : tierRows.map((row) => ({
          buildType: row.buildType,
          tier: row.tier,
          priceMinorUnits: row.priceMinorUnits,
          guaranteedDays: row.guaranteedDays,
          pointThreshold: row.pointThreshold,
          isActive: row.isActive,
        }));

  const currencies: readonly CurrencyRule[] =
    currencyRows.length === 0
      ? base.currencies
      : currencyRows.map((row) => ({
          code: row.code,
          rate: Number(row.rate),
          roundToMinorUnits: row.roundToMinorUnits,
          isActive: row.isActive,
          reviewedOn: row.reviewedOn ?? "",
        }));

  return { ...base, features, tiers, currencies };
}

export async function loadCatalog(force = false): Promise<Catalog> {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.catalog;

  try {
    const catalog = await loadOverlay();
    cached = { at: Date.now(), catalog };
    return catalog;
  } catch (error) {
    // A catalogue that cannot be read must not take pricing down with it: the
    // shipped defaults are a correct price list, just not the latest one.
    logger.error("catalogue load failed; using shipped defaults", { error });
    return defaultCatalog();
  }
}

/**
 * Loads the one discount the customer actually named.
 *
 * Never loads the table. A list of valid codes returned to a browser is a list
 * of valid codes, whatever the UI does with it.
 */
async function loadDiscount(code: string | null): Promise<DiscountRule | null> {
  const normalised = normaliseCode(code);
  if (!normalised) return null;

  const row = await db.query.discounts.findFirst({
    where: and(eq(discounts.code, normalised), eq(discounts.isActive, true)),
  });
  if (!row) return null;

  return {
    code: row.code,
    description: row.description,
    kind: row.kind,
    value: row.value,
    maxDiscountMinorUnits: row.maxDiscountMinorUnits,
    minOrderMinorUnits: row.minOrderMinorUnits,
    appliesToBuildTypes: row.appliesToBuildTypes,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxRedemptions: row.maxRedemptions,
    timesUsed: row.timesUsed,
    isActive: row.isActive,
  };
}

export type ConfiguredDraft = ConfiguratorDraft & { buildType: BuildType };

export type AssessResult =
  | { ok: true; assessment: ProjectAssessment }
  | { ok: false; reason: "invalid_platforms" | "failed" };

export interface AssessOptions {
  currency: Currency;
  discountCode?: string | null;
  now?: Date;
}

/**
 * Assesses and prices a configured draft.
 *
 * The draft must already have been validated by the caller; this re-checks the
 * one rule that cannot be expressed in the schema -- a platform combination
 * that cannot be built -- because the configurator's disabled button is a
 * convenience, not a control.
 */
export async function assessAndPrice(
  draft: ConfiguredDraft,
  options: AssessOptions,
): Promise<AssessResult> {
  if (platformConflict(draft.buildType, draft.platforms) !== "none") {
    return { ok: false, reason: "invalid_platforms" };
  }

  try {
    const [catalog, discount, scope] = await Promise.all([
      loadCatalog(),
      loadDiscount(options.discountCode ?? null),
      assessScope({
        buildType: draft.buildType,
        ideaText: draft.intake.description,
        locale: draft.locale,
        selectedCapabilities: draft.selectedCapabilities,
        estimatedScreens: draft.estimatedScreens ?? undefined,
        platforms: draft.platforms,
        designApproach: draft.design.approach ?? undefined,
        context: {
          businessName: draft.intake.businessName,
          industry: draft.intake.industry,
          targetCustomers: draft.intake.targetCustomers,
          desiredOutcome: draft.intake.desiredOutcome,
        },
      }),
    ]);

    const assessment = evaluateProject({
      assessment: scope,
      catalog: { ...catalog, discount },
      currency: options.currency,
      selectedCapabilities: draft.selectedCapabilities,
      wantsDesignService: draft.design.approach === "design_for_me",
      discountCode: options.discountCode ?? null,
      now: options.now,
    });

    return { ok: true, assessment };
  } catch (error) {
    // A pricing failure must never surface as a broken page on the one screen
    // a customer is trying to buy from.
    logger.error("engine evaluation failed", { error });
    return { ok: false, reason: "failed" };
  }
}

/** Marks a coupon as used. Called once an order is actually placed. */
export async function recordDiscountRedemption(code: string): Promise<void> {
  const normalised = normaliseCode(code);
  if (!normalised) return;

  await db
    .update(discounts)
    .set({ timesUsed: sql`${discounts.timesUsed} + 1`, updatedAt: new Date() })
    .where(eq(discounts.code, normalised));
}
