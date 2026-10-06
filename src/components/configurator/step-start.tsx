"use client";

import { useId, useRef, useState, useTransition } from "react";

import { ClerkLoaded, ClerkLoading, Show } from "@clerk/nextjs";
import { ArrowRight, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  AssessmentError,
  type AssessmentFailure,
} from "@/components/configurator/assessment-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { Link, useRouter } from "@/i18n/navigation";
import type { ConfiguratorDraft, StepId } from "@/lib/configurator/draft";
import { formatMoney } from "@/lib/pricing/money";
import { totalPrice, type ProjectAssessment } from "@/lib/engine";
import { placeOrder } from "@/server/checkout-actions";

/**
 * Step 8 — start the build.
 *
 * The handoff into commerce. A project needing a quotation takes a different
 * route entirely: there is no price to charge, so sending it to a payment form
 * would be nonsense.
 *
 * Signed-out customers are sent to sign-in with a return path, because an
 * order has to belong to someone. The draft survives that round trip in local
 * storage, which is what makes leaving and coming back safe.
 */
export function StepStart({
  assessment,
  draft,
  discountCode,
  failed,
  onRetry,
  onEdit,
}: {
  assessment: ProjectAssessment | null;
  draft: ConfiguratorDraft;
  /** Passed through as a code. The server re-prices it from the database. */
  discountCode: string;
  failed: AssessmentFailure | null;
  onRetry: () => void;
  onEdit: (step: StepId) => void;
}) {
  const t = useTranslations("configurator.start");
  const tc = useTranslations("checkout");
  const router = useRouter();
  const locale = useLocale();
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /**
   * Stable for the lifetime of this screen, so a double click or a retried
   * request converges on one order instead of two. A genuine second purchase
   * is a fresh visit and therefore a fresh id.
   */
  const requestId = useId();
  const submitted = useRef(false);

  if (!assessment) {
    return (
      <AssessmentError
        reason={failed ?? "invalid_draft"}
        onRetry={onRetry}
        onEdit={onEdit}
      />
    );
  }

  const quote = assessment.requiresCustomQuote;
  const total = totalPrice(assessment);

  const sequence = quote
    ? (["account", "quote", "review"] as const)
    : (["account", "payment", "assets", "countdown"] as const);

  function checkout() {
    if (submitted.current) return;
    submitted.current = true;
    setError(null);

    start(async () => {
      const result = await placeOrder(draft, requestId, discountCode.trim() || null);
      if (!result.ok) {
        submitted.current = false;
        setError(result.message);
        return;
      }
      router.push(`/orders/${result.orderNumber}`);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <Card padding="lg" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-display-sm text-primary">
            {quote ? t("quoteTitle") : t("payTitle")}
          </h2>
          {!quote && total ? (
            <p className="text-display-md text-primary" data-numeric>
              {formatMoney(total, intlTag, { trimWholeDecimals: true })}
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

      {error ? <Callout tone="danger" live title={error} /> : null}

      {quote ? (
        /*
         * Still honest about state: there is no quotation workflow yet, so
         * this says so rather than offering a button that leads nowhere.
         */
        <>
          <Callout tone="info" title={t("pending.title")}>
            {t("pending.body")}
          </Callout>
          <Button disabled>{t("requestQuote")}</Button>
        </>
      ) : (
        <>
          <ClerkLoading>
            <Skeleton className="h-11 w-48" />
          </ClerkLoading>

          <ClerkLoaded>
            <Show
              when="signed-in"
              fallback={
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link
                    href="/sign-in"
                    className={buttonVariants({ variant: "primary", size: "lg" })}
                  >
                    {t("createAccount")}
                    <ArrowRight className="rtl-flip size-4" aria-hidden />
                  </Link>
                  <p className="text-caption text-tertiary">{t("draftKept")}</p>
                </div>
              }
            >
              <Button
                size="lg"
                onClick={checkout}
                loading={pending}
                loadingLabel={tc("paying")}
                className="self-start"
              >
                {t("payTitle")}
                <ArrowRight className="rtl-flip size-4" aria-hidden />
              </Button>
            </Show>
          </ClerkLoaded>
        </>
      )}
    </div>
  );
}
