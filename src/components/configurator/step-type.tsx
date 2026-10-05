"use client";

import { useLocale, useTranslations } from "next-intl";

import { ChoiceCard } from "@/components/ui/choice-card";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { BUILD_PRODUCT_LIST } from "@/config/products";
import { applyBuildType, type ConfiguratorDraft } from "@/lib/configurator/draft";
import { formatMoney } from "@/lib/pricing/money";

/**
 * Step 1 — what are you building?
 *
 * Changing the answer resets features and platforms, because both are scoped
 * to a build type. That is destructive, so the consequence is stated on screen
 * rather than discovered when a selection silently disappears.
 */
export function StepType({
  draft,
  onChange,
}: {
  draft: ConfiguratorDraft;
  onChange: (recipe: (draft: ConfiguratorDraft) => ConfiguratorDraft) => void;
}) {
  const t = useTranslations("configurator.type");
  const tProducts = useTranslations("home.products");
  const { intlTag } = getLocaleDefinition(resolveLocale(useLocale()));

  const hasSelections =
    draft.selectedCapabilities.length > 0 || draft.platforms.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 lg:grid-cols-3">
        {BUILD_PRODUCT_LIST.map((product) => (
          <ChoiceCard
            key={product.id}
            name="build-type"
            value={product.id}
            checked={draft.buildType === product.id}
            onChange={() => onChange((current) => applyBuildType(current, product.id))}
            title={tProducts(`${product.id}.name`)}
            description={tProducts(`${product.id}.summary`)}
            meta={
              <span className="text-body-sm whitespace-nowrap text-primary" data-numeric>
                {product.priceModel === "from" ? `${tProducts("fromLabel")} ` : ""}
                {formatMoney(product.basePrice, intlTag, { trimWholeDecimals: true })}
              </span>
            }
          />
        ))}
      </div>

      {draft.buildType && hasSelections ? (
        <p className="text-caption text-tertiary">{t("changeWarning")}</p>
      ) : null}
    </div>
  );
}
