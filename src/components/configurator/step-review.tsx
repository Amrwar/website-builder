"use client";

import { Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import type { StepId, ConfiguratorDraft } from "@/lib/configurator/draft";
import { formatMoney } from "@/lib/pricing/money";
import {
  buildPrice,
  designFee,
  guaranteedDays,
  totalPrice,
  type ProjectAssessment,
} from "@/lib/engine";

/**
 * Step 7 — review.
 *
 * Every figure the customer is about to commit to, on one screen, each with a
 * route back to the step that produced it. Nothing is summarised loosely: the
 * price is the price, and the deadline is expressed the way the guarantee
 * actually works.
 *
 * The deadline is deliberately *not* shown as a calendar date. The countdown
 * starts when assets are submitted and the build is officially started, so a
 * date computed from today would be a promise we have not made.
 */
export function StepReview({
  draft,
  assessment,
  onEdit,
  discountCode,
  onDiscountCodeChange,
  onApplyDiscount,
  applying,
}: {
  draft: ConfiguratorDraft;
  assessment: ProjectAssessment | null;
  onEdit: (step: StepId) => void;
  discountCode: string;
  onDiscountCodeChange: (next: string) => void;
  onApplyDiscount: () => void;
  applying: boolean;
}) {
  const t = useTranslations("configurator.review");
  const tProducts = useTranslations("home.products");
  const tDesign = useTranslations("configurator.design");
  const tCapability = useTranslations("capabilities");
  const tPlatform = useTranslations("configurator.platform");
  const { intlTag } = getLocaleDefinition(resolveLocale(useLocale()));

  if (!assessment || !draft.buildType) return null;

  const quote = assessment.requiresCustomQuote;
  const total = totalPrice(assessment);
  const build = buildPrice(assessment);
  const design = designFee(assessment);
  const days = guaranteedDays(assessment);
  const applied = assessment.price?.appliedDiscount ?? null;
  // A code was typed, the server was asked, and nothing came back applied.
  const refused = discountCode.trim() !== "" && !applied;

  const rows: { key: string; step: StepId; label: string; value: React.ReactNode }[] = [
    {
      key: "project",
      step: "intake",
      label: t("rows.project"),
      value: draft.intake.businessName || t("untitled"),
    },
    {
      key: "type",
      step: "type",
      label: t("rows.type"),
      value: tProducts(`${draft.buildType}.name`),
    },
    {
      key: "platform",
      step: "platform",
      label: t("rows.platform"),
      value: draft.platforms.map((id) => tPlatform(`options.${id}.title`)).join(", "),
    },
    {
      key: "design",
      step: "design",
      label: t("rows.design"),
      value: draft.design.approach ? tDesign(`${draft.design.approach}.title`) : "—",
    },
    {
      key: "features",
      step: "features",
      label: t("rows.features"),
      value:
        draft.selectedCapabilities.length === 0
          ? t("noFeatures")
          : draft.selectedCapabilities
              .map((key) => tCapability(`${key}.name`))
              .join(", "),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <Card padding="none" className="overflow-hidden">
        <dl className="divide-y divide-line-subtle">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex flex-col gap-2 p-5 sm:flex-row sm:items-start sm:gap-6"
            >
              <dt className="text-body-sm text-tertiary sm:w-40 sm:shrink-0">
                {row.label}
              </dt>
              <dd className="flex-1 text-body-sm text-primary">{row.value}</dd>
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                startIcon={<Pencil className="size-3.5" />}
                onClick={() => onEdit(row.step)}
              >
                {t("edit")}
              </Button>
            </div>
          ))}
        </dl>
      </Card>

      <Card padding="lg" className="flex flex-col gap-5">
        <h2 className="text-display-sm text-primary">{t("commercials")}</h2>

        <dl className="flex flex-col gap-4">
          <Line label={t("rows.timeline")}>
            {quote || days === null ? t("quotedSeparately") : t("daysValue", { days })}
          </Line>

          <Line label={t("rows.deadline")}>
            {quote ? t("quotedSeparately") : t("deadlineRule")}
          </Line>

          <Separator />

          {design && build && !quote ? (
            <>
              <Line label={t("rows.buildPrice")}>
                {formatMoney(build, intlTag, { trimWholeDecimals: true })}
              </Line>
              <Line label={t("rows.designService")}>
                {formatMoney(design, intlTag, { trimWholeDecimals: true })}
              </Line>
              <Separator />
            </>
          ) : null}

          {!quote ? (
            <>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-end gap-2">
                  <Field label={t("rows.discountCode")} className="min-w-48 flex-1">
                    <Input
                      value={discountCode}
                      maxLength={32}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) =>
                        onDiscountCodeChange(event.target.value.toUpperCase())
                      }
                    />
                  </Field>
                  <Button
                    variant="secondary"
                    disabled={applying || discountCode.trim() === ""}
                    onClick={onApplyDiscount}
                  >
                    {t("applyDiscount")}
                  </Button>
                </div>

                {applied ? (
                  <Line label={applied.description ?? applied.code}>
                    −{formatMoney(applied.amount, intlTag, { trimWholeDecimals: true })}
                  </Line>
                ) : null}

                {refused && !applying ? (
                  <Callout tone="warning" live title={t("discountRefused")} />
                ) : null}
              </div>

              <Separator />
            </>
          ) : null}

          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <dt className="text-body font-semibold text-primary">{t("rows.total")}</dt>
            <dd className="text-display-md text-primary" data-numeric>
              {quote || !total
                ? t("customQuote")
                : formatMoney(total, intlTag, { trimWholeDecimals: true })}
            </dd>
          </div>

          <Line label={t("rows.guarantee")}>
            {quote ? t("guaranteeNotEligible") : t("guaranteeEligible")}
          </Line>
        </dl>
      </Card>
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-4">
      <dt className="text-body-sm text-tertiary">{label}</dt>
      <dd className="text-body-sm text-primary">{children}</dd>
    </div>
  );
}
