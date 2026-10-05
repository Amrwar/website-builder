"use client";

import { Check, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { formatMoney } from "@/lib/pricing/money";
import type { ScopeAssessment } from "@/lib/scope";

/**
 * Step 8 — start the build.
 *
 * The handoff to authentication and payment. Both are provisioned (Clerk and
 * Stripe) but not yet wired, so this screen states exactly what happens next
 * rather than presenting a button that would not work.
 *
 * A project that needs a quotation takes a different route entirely: there is
 * no price to charge, so sending it to a payment form would be nonsense.
 */
export function StepStart({ assessment }: { assessment: ScopeAssessment | null }) {
  const t = useTranslations("configurator.start");
  const { intlTag } = getLocaleDefinition(resolveLocale(useLocale()));

  if (!assessment) return null;

  const quote = assessment.requiresCustomQuote;

  const sequence = quote
    ? (["account", "quote", "review"] as const)
    : (["account", "payment", "assets", "countdown"] as const);

  return (
    <div className="flex flex-col gap-8">
      <Card padding="lg" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-display-sm text-primary">
            {quote ? t("quoteTitle") : t("payTitle")}
          </h2>
          {!quote ? (
            <p className="text-display-md text-primary" data-numeric>
              {formatMoney(assessment.totalPrice!, intlTag, { trimWholeDecimals: true })}
            </p>
          ) : null}
        </div>

        <ol className="flex flex-col gap-3">
          {sequence.map((key, index) => (
            <li key={key} className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-line text-caption text-tertiary tabular-nums"
              >
                {index + 1}
              </span>
              <span className="text-body-sm text-secondary">{t(`sequence.${key}`)}</span>
            </li>
          ))}
        </ol>

        {!quote ? (
          <p className="flex items-center gap-2 text-caption text-tertiary">
            <Lock className="size-3.5" aria-hidden />
            {t("countdownNote")}
          </p>
        ) : null}
      </Card>

      {/*
       * Honest about state. Clerk and Stripe are provisioned against this
       * project but no sign-in or checkout route exists yet, so this says so
       * instead of offering a button that leads nowhere.
       */}
      <Callout tone="info" title={t("pending.title")}>
        {t("pending.body")}
      </Callout>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button disabled startIcon={<Check className="size-4" />}>
          {quote ? t("requestQuote") : t("createAccount")}
        </Button>
        <p className="self-center text-caption text-tertiary">{t("draftKept")}</p>
      </div>
    </div>
  );
}
