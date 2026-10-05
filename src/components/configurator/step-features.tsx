"use client";

import { useTranslations } from "next-intl";

import { Checkbox } from "@/components/ui/checkbox";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CAPABILITY_CATEGORIES,
  capabilitiesFor,
  type CapabilityKey,
} from "@/lib/scope/capabilities";
import { tierRank } from "@/lib/scope";
import type { ConfiguratorDraft } from "@/lib/configurator/draft";

type Update = (recipe: (draft: ConfiguratorDraft) => ConfiguratorDraft) => void;

/**
 * Step 4 — features.
 *
 * Only capabilities that apply to the chosen build type are offered, so an
 * impossible combination cannot be assembled by hand. Capabilities that force
 * a larger build are marked as such before they are ticked: the customer
 * should be able to see the consequence of a choice while making it, not
 * discover it on the scope screen.
 */
export function StepFeatures({
  draft,
  onChange,
}: {
  draft: ConfiguratorDraft;
  onChange: Update;
}) {
  const t = useTranslations("configurator.features");
  const tCapability = useTranslations("capabilities");

  if (!draft.buildType) {
    return <EmptyState size="sm" title={t("chooseTypeFirst")} />;
  }

  const available = capabilitiesFor(draft.buildType);
  const selected = new Set(draft.selectedCapabilities);

  function toggle(key: CapabilityKey) {
    onChange((current) => ({
      ...current,
      selectedCapabilities: current.selectedCapabilities.includes(key)
        ? current.selectedCapabilities.filter((item) => item !== key)
        : [...current.selectedCapabilities, key],
    }));
  }

  const anyLarger = draft.selectedCapabilities.some((key) => {
    const capability = available.find((item) => item.key === key);
    return capability ? tierRank(capability.minimumTier) > 0 : false;
  });

  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-2xl text-body-sm text-secondary">{t("optional")}</p>

      {CAPABILITY_CATEGORIES.map((category) => {
        const items = available.filter((item) => item.categoryId === category.id);
        if (items.length === 0) return null;

        return (
          <fieldset key={category.id} className="flex flex-col gap-4">
            <legend className="text-eyebrow text-tertiary uppercase">
              {t(`categories.${category.labelKey}`)}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((capability) => (
                <Checkbox
                  key={capability.key}
                  label={tCapability(`${capability.key}.name`)}
                  description={
                    tierRank(capability.minimumTier) > 0
                      ? t("largerBuild", {
                          feature: tCapability(`${capability.key}.hint`),
                        })
                      : tCapability(`${capability.key}.hint`)
                  }
                  checked={selected.has(capability.key)}
                  onChange={() => toggle(capability.key)}
                />
              ))}
            </div>
          </fieldset>
        );
      })}

      {anyLarger ? (
        <Callout tone="info" title={t("noticeTitle")}>
          {t("noticeBody")}
        </Callout>
      ) : null}
    </div>
  );
}
