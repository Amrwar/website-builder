import "server-only";

import { getTranslations } from "next-intl/server";

import {
  BUSINESS_FEATURES,
  BUSINESS_GOALS,
  isShippedBlueprintKey,
} from "@/config/business";
import type { Locale } from "@/config/locales";
import type { BlueprintDefinition, ResolvedBlueprint } from "@/lib/business/blueprint";
import type { StartCatalog } from "@/components/business/start-business";
import {
  loadBusinessCatalog,
  offeredBlueprints,
  type BusinessCatalog,
  type CatalogBlueprint,
} from "./blueprints";

type Translate = Awaited<ReturnType<typeof getTranslations<"blueprints">>>;

/**
 * A blueprint's words in one language.
 *
 * A version's own copy wins, so an administrator can reword a shipped
 * blueprint; a shipped blueprint without any falls back to the catalogues.
 * Null for neither, which only a hand-edited row could produce -- such a
 * blueprint is left out rather than shown with a raw key for a name.
 */
export function blueprintCopy(
  key: string,
  definition: BlueprintDefinition,
  locale: Locale,
  t: Translate,
): { name: string; summary: string } | null {
  const own = definition.copy?.[locale];
  if (own) return own;
  if (!isShippedBlueprintKey(key)) return null;
  return { name: t(`items.${key}.name`), summary: t(`items.${key}.summary`) };
}

export function resolveBlueprint(
  entry: CatalogBlueprint,
  locale: Locale,
  t: Translate,
): ResolvedBlueprint | null {
  const copy = blueprintCopy(entry.key, entry.definition, locale, t);
  if (!copy) return null;
  return {
    key: entry.key,
    version: entry.version,
    categoryKey: entry.definition.categoryKey,
    buildType: entry.definition.buildType,
    recommended: entry.definition.recommended,
    optional: entry.definition.optional,
    ...copy,
  };
}

export function categoryName(
  category: BusinessCatalog["categories"][number],
  locale: Locale,
  t: Translate,
): string {
  return category.names?.[locale] ?? t(`categories.${category.key}` as never);
}

/** Everything the Start my business screen shows, in the viewer's language. */
export async function startCatalog(locale: Locale): Promise<StartCatalog> {
  const [catalog, t] = await Promise.all([
    loadBusinessCatalog(),
    getTranslations({ locale, namespace: "blueprints" }),
  ]);

  const blueprints = offeredBlueprints(catalog)
    .map((entry) => resolveBlueprint(entry, locale, t))
    .filter((entry): entry is ResolvedBlueprint => entry !== null);
  const used = new Set(blueprints.map((entry) => entry.categoryKey));

  return {
    categories: catalog.categories
      .filter((category) => category.isActive && used.has(category.key))
      .map((category) => ({
        key: category.key,
        name: categoryName(category, locale, t),
      })),
    blueprints,
    features: Object.fromEntries(
      BUSINESS_FEATURES.map((feature) => [
        feature.id,
        {
          name: t(`features.${feature.id}.name`),
          description: t(`features.${feature.id}.description`),
        },
      ]),
    ),
    goals: BUSINESS_GOALS.map((goal) => ({ id: goal.id, label: t(`goals.${goal.id}`) })),
  };
}
