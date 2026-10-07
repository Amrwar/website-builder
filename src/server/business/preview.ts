import "server-only";

import type { Locale } from "@/config/locales";
import {
  draftFromBlueprint,
  type BlueprintDefinition,
  type ResolvedBlueprint,
} from "@/lib/business/blueprint";
import { guaranteedDays, totalPrice } from "@/lib/engine";
import { BASE_CURRENCY, type Money } from "@/lib/pricing/money";
import { assessAndPrice, type ConfiguredDraft } from "@/server/engine";

export interface BlueprintEstimate {
  total: Money | null;
  days: number | null;
  quote: boolean;
}

/**
 * What the engine quotes for a blueprint's recommended set.
 *
 * The real `assessAndPrice`, on the same draft a customer who changed
 * nothing would hand in -- except that the description is empty, so the
 * figure is the blueprint's alone and not whatever a customer's own words
 * would add. Base currency, no design fee: the console compares blueprints
 * with each other, and both of those vary by customer.
 */
export async function estimateBlueprint(
  key: string,
  definition: BlueprintDefinition,
  locale: Locale,
): Promise<BlueprintEstimate | null> {
  const blueprint: ResolvedBlueprint = {
    key,
    version: 0,
    categoryKey: definition.categoryKey,
    buildType: definition.buildType,
    recommended: definition.recommended,
    optional: definition.optional,
    name: key,
    summary: "",
  };
  const draft = draftFromBlueprint({
    blueprint,
    details: {
      businessName: key,
      location: "",
      targetCustomers: "",
      offering: "",
      goals: [],
    },
    selected: definition.recommended,
    locale,
    goalSummary: "",
  });

  const result = await assessAndPrice(draft as ConfiguredDraft, {
    currency: BASE_CURRENCY,
  });
  if (!result.ok) return null;
  return {
    total: totalPrice(result.assessment),
    days: guaranteedDays(result.assessment),
    quote: result.assessment.requiresCustomQuote,
  };
}
