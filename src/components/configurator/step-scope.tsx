"use client";

import { useLocale, useTranslations } from "next-intl";
import type { StepId } from "@/lib/configurator/draft";
import {
  AssessmentError,
  type AssessmentFailure,
} from "@/components/configurator/assessment-error";

import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { formatMoney } from "@/lib/pricing/money";
import {
  complexityBand,
  designFee,
  guaranteedDays,
  totalPrice,
  type ProjectAssessment,
} from "@/lib/engine";
import { ComplexityMeter } from "./complexity-meter";

/**
 * Step 6 — scope analysis.
 *
 * Purely presentational: the assessment is produced on the server and handed
 * in. The important property of this screen is that every conclusion is
 * accompanied by its evidence -- the phrase that matched, or the fact that the
 * customer selected it themselves -- so the result can be argued with rather
 * than only accepted.
 *
 * Nothing here is dressed up as intelligence. The copy says which published
 * rules matched.
 */
export function StepScopeResult({
  assessment,
  pending,
  failed,
  onRetry,
  onEdit,
}: {
  assessment: ProjectAssessment | null;
  pending: boolean;
  failed: AssessmentFailure | null;
  /** Sends the customer back to the step that can fix the problem. */
  onEdit: (step: StepId) => void;
  onRetry: () => void;
}) {
  const t = useTranslations("configurator.scope");
  const tCapability = useTranslations("capabilities");
  const tReason = useTranslations("scopeReasons");
  const { intlTag } = getLocaleDefinition(resolveLocale(useLocale()));

  if (pending) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true" role="status">
        <span className="sr-only">{t("analysing")}</span>
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <SkeletonText lines={3} />
      </div>
    );
  }

  if (failed || !assessment) {
    return (
      <AssessmentError reason={failed ?? "failed"} onRetry={onRetry} onEdit={onEdit} />
    );
  }

  const quote = assessment.requiresCustomQuote;
  const total = totalPrice(assessment);
  const design = designFee(assessment);
  const days = guaranteedDays(assessment);

  return (
    <div className="flex flex-col gap-8">
      <Card padding="lg" className="flex flex-col gap-6">
        <ComplexityMeter band={complexityBand(assessment)} />

        <dl className="grid gap-5 border-t border-line-subtle pt-6 sm:grid-cols-3">
          <Figure
            label={t("figures.price")}
            value={
              quote || !total
                ? t("customQuote")
                : formatMoney(total, intlTag, { trimWholeDecimals: true })
            }
            note={
              !quote && design
                ? t("figures.includesDesign", {
                    fee: formatMoney(design, intlTag, { trimWholeDecimals: true }),
                  })
                : undefined
            }
          />
          <Figure
            label={t("figures.time")}
            value={
              quote || days === null ? t("figures.quoted") : t("figures.days", { days })
            }
          />
          <Figure
            label={t("figures.guarantee")}
            value={quote ? t("figures.notEligible") : t("figures.eligible")}
            note={quote ? t("figures.notEligibleNote") : t("figures.eligibleNote")}
          />
        </dl>
      </Card>

      {quote ? (
        <Callout tone="warning" title={t("exceeds.title")}>
          {t("exceeds.body")}
        </Callout>
      ) : null}

      {assessment.explanation.reasons.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-display-sm text-primary">{t("why.title")}</h2>
          <ul className="flex flex-col gap-2">
            {assessment.explanation.reasons.map((reason) => (
              <li key={reason.code} className="flex flex-col gap-1">
                <span className="text-body-sm text-primary">
                  {tReason(`${reason.code}.title`)}
                </span>
                <span className="text-caption text-secondary">
                  {tReason(`${reason.code}.body`)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-display-sm text-primary">{t("detected.title")}</h2>
        {assessment.capabilities.length === 0 ? (
          <p className="text-body-sm text-secondary">{t("detected.none")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {assessment.capabilities.map((capability) => (
              <li
                key={capability.key}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-subtle pb-2"
              >
                <span className="text-body-sm text-primary">
                  {tCapability(`${capability.key}.name`)}
                </span>
                <Badge tone={capability.method === "selected" ? "info" : "neutral"}>
                  {t(`method.${capability.method}`)}
                </Badge>
                {/* The exact phrase that triggered a text match, quoted back
                    so the customer can see what we read into their words. */}
                {capability.evidence ? (
                  <span className="text-caption text-tertiary italic">
                    “{capability.evidence}”
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="text-caption text-tertiary">{t("detected.note")}</p>
      </section>
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-eyebrow text-tertiary uppercase">{label}</dt>
      <dd className="text-display-sm text-primary" data-numeric>
        {value}
      </dd>
      {note ? <dd className="text-caption text-secondary">{note}</dd> : null}
    </div>
  );
}
