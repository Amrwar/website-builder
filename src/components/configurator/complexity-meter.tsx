"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";
import type { ComplexityBand } from "@/lib/scope";

/**
 * Complexity indicator.
 *
 * Three bands, drawn as a filled segment meter. Each band carries its own
 * label, so the reading never depends on counting filled blocks or on telling
 * the colours apart.
 *
 * Presented as a measurement rather than a verdict: a project being "advanced"
 * is a fact about the work, not a judgement about the customer's idea, and the
 * accompanying copy says what it means for price and time instead of implying
 * the brief was too ambitious.
 */

const BANDS: readonly ComplexityBand[] = ["simple", "moderate", "advanced"];

const FILL: Record<ComplexityBand, string> = {
  simple: "bg-success",
  moderate: "bg-warning",
  advanced: "bg-action-accent",
};

export function ComplexityMeter({
  band,
  className,
}: {
  band: ComplexityBand;
  className?: string;
}) {
  const t = useTranslations("configurator.complexity");
  const activeIndex = BANDS.indexOf(band);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-eyebrow text-tertiary uppercase">{t("label")}</span>
        <span className="text-body-sm font-medium text-primary">
          {t(`bands.${band}`)}
        </span>
      </div>

      <div className="flex gap-1.5" aria-hidden>
        {BANDS.map((candidate, index) => (
          <span
            key={candidate}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              "duration-slow transition-colors ease-out-quint",
              index <= activeIndex ? FILL[band] : "bg-sunken",
            )}
          />
        ))}
      </div>

      {/* The meter is decorative; this is what is actually announced. */}
      <p className="text-body-sm text-secondary">
        <span className="sr-only">{t("announced", { band: t(`bands.${band}`) })} </span>
        {t(`explanation.${band}`)}
      </p>
    </div>
  );
}
