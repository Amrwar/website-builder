"use client";

import { useTranslations } from "next-intl";

import { Callout } from "@/components/ui/callout";
import { ChoiceCard } from "@/components/ui/choice-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  allowsMultiplePlatforms,
  platformConflict,
  platformsFor,
  type PlatformId,
} from "@/config/platforms";
import type { ConfiguratorDraft } from "@/lib/configurator/draft";

type Update = (recipe: (draft: ConfiguratorDraft) => ConfiguratorDraft) => void;

/**
 * Step 5 — platform.
 *
 * Websites and systems have one option, shown selected and explained rather
 * than hidden. Skipping the step entirely would leave the customer wondering
 * whether a choice was made for them.
 *
 * Mobile allows several, and this is where an impossible scope can be built by
 * hand: cross-platform means one codebase for both stores, so pairing it with
 * a named native target is a contradiction. Selecting cross-platform clears
 * the native choices rather than letting the two coexist and failing later.
 */
export function StepPlatform({
  draft,
  onChange,
}: {
  draft: ConfiguratorDraft;
  onChange: Update;
}) {
  const t = useTranslations("configurator.platform");

  if (!draft.buildType) {
    return <EmptyState size="sm" title={t("chooseTypeFirst")} />;
  }

  const options = platformsFor(draft.buildType);
  const multiple = allowsMultiplePlatforms(draft.buildType);
  const selected = new Set(draft.platforms);

  function choose(id: PlatformId) {
    onChange((current) => {
      if (!multiple) return { ...current, platforms: [id] };

      // Cross-platform is exclusive by definition.
      if (id === "cross_platform") return { ...current, platforms: ["cross_platform"] };

      const next = new Set(current.platforms);
      next.delete("cross_platform");
      if (next.has(id)) next.delete(id);
      else next.add(id);

      return { ...current, platforms: [...next] };
    });
  }

  const conflict = platformConflict(draft.buildType, draft.platforms);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 lg:grid-cols-3">
        {options.map((option) => (
          <ChoiceCard
            key={option.id}
            type={multiple ? "checkbox" : "radio"}
            name="platform"
            value={option.id}
            checked={selected.has(option.id)}
            onChange={() => choose(option.id)}
            title={t(`options.${option.id}.title`)}
            description={t(`options.${option.id}.body`)}
          />
        ))}
      </div>

      {options.length === 1 ? (
        <p className="text-caption text-tertiary">{t("singleOption")}</p>
      ) : null}

      {conflict === "empty" ? (
        <Callout tone="warning" live title={t("conflict.empty")} />
      ) : null}
      {conflict === "cross_platform_with_native" ? (
        <Callout tone="warning" live title={t("conflict.crossNative")} />
      ) : null}
    </div>
  );
}
