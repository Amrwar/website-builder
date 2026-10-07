import { AlertTriangle, Check, Clock, Minus, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { buildProduct } from "@/config/products";
import { MISSED_DEADLINE_REFUND } from "@/config/brand";
import { TAX } from "@/config/commerce";
import { getLocaleDefinition, resolveLocale, type Locale } from "@/config/locales";
import type { Order, OrderItem } from "@/db/schema";
import { formatMoney, money, type Currency } from "@/lib/pricing/money";
import { CAPABILITIES } from "@/lib/scope";
import { readSnapshot } from "@/lib/engine";
import { cn } from "@/lib/cn";

/**
 * What the customer is about to buy.
 *
 * The brief for this screen was that nothing important may hide behind fine
 * print, so the parts a customer would otherwise discover late are given the
 * same weight as the price:
 *
 *  - every capability included, listed by name;
 *  - **every capability not included**, listed by name, which is the half
 *    that is normally omitted and the half that causes disputes;
 *  - the delivery target, and for mobile builds the explicit statement that
 *    app store review sits outside it;
 *  - both refund outcomes, in full;
 *  - that the countdown has not started and what starts it.
 */

interface CheckoutSummaryProps {
  order: Order & { items: OrderItem[] };
  locale: Locale;
}

/**
 * Order lines store a product key and a snapshotted internal name. The key is
 * what gets translated; the stored name is the fallback, so a one-off line
 * added without a catalogue entry still reads sensibly rather than throwing.
 */
const PRODUCT_LABELS: Record<string, "website" | "system" | "mobileApp" | "design"> = {
  "build.website": "website",
  "build.system": "system",
  "build.mobileApp": "mobileApp",
  "service.design": "design",
};

function Line({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <span
        className={cn(
          "text-body-sm",
          strong
            ? "font-medium text-primary"
            : muted
              ? "text-tertiary"
              : "text-secondary",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          strong ? "text-body font-medium text-primary" : "text-body-sm text-secondary",
        )}
        data-numeric
      >
        {value}
      </span>
    </div>
  );
}

export async function CheckoutSummary({ order, locale }: CheckoutSummaryProps) {
  const t = await getTranslations("checkout");
  const tCap = await getTranslations("capabilities");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  const currency = order.currency as Currency;
  const fmt = (minorUnits: number) => formatMoney(money(minorUnits, currency), intlTag);

  const buildLine = order.items.find((item) => item.productType === "build");
  const assessment = readSnapshot(buildLine?.scopeSnapshot);

  const includedKeys = new Set(
    (buildLine?.selectedCapabilities as string[] | undefined) ?? [],
  );
  // Everything the engine found, selected or inferred, is "in scope".
  for (const key of assessment?.capabilityKeys ?? []) includedKeys.add(key);

  const included = CAPABILITIES.filter((capability) => includedKeys.has(capability.key));
  const excluded = CAPABILITIES.filter((capability) => !includedKeys.has(capability.key));

  // The declared capability, not the product id. "Is it mobile?" and "does a
  // third party review it outside our deadline?" happen to coincide for the
  // three products sold today, and there is no reason a fourth would respect
  // that coincidence.
  const hasExternalReview =
    buildProduct(assessment?.buildType)?.hasExternalReviewStep ?? false;
  const days = buildLine?.guaranteedDays ?? assessment?.guaranteedDays ?? null;

  return (
    <div className="flex flex-col gap-8">
      {/* --- What is being bought ----------------------------------------- */}
      <Card padding="lg" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-display-sm text-primary">{t("items")}</h2>
          {assessment?.tier ? (
            <Badge tone="info">{t(`scope.tierValue.${assessment.tier}`)}</Badge>
          ) : null}
        </div>

        <ul className="flex flex-col gap-4">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-6">
              <div className="flex flex-col gap-1">
                <span className="text-body font-medium text-primary">
                  {PRODUCT_LABELS[item.productKey]
                    ? t(`products.${PRODUCT_LABELS[item.productKey]!}`)
                    : item.productName}
                </span>
                {item.guaranteedDays ? (
                  <span className="text-caption text-tertiary">
                    {t("delivery.days", { days: item.guaranteedDays })}
                  </span>
                ) : null}
              </div>
              <span className="shrink-0 text-body text-primary" data-numeric>
                {fmt(item.unitAmountMinorUnits)}
              </span>
            </li>
          ))}
        </ul>

        <Separator />

        <div className="flex flex-col gap-2">
          <Line label={t("totals.subtotal")} value={fmt(order.subtotalMinorUnits)} />
          {order.discountMinorUnits > 0 ? (
            <Line
              label={t("totals.discount")}
              value={`−${fmt(order.discountMinorUnits)}`}
            />
          ) : null}
          <Line
            label={
              TAX.enabled
                ? t("totals.tax")
                : `${t("totals.tax")} — ${t(`totals.taxNote.${TAX.noteKey}`)}`
            }
            value={fmt(order.taxMinorUnits)}
            muted={!TAX.enabled}
          />
          <Separator />
          <Line
            label={`${t("totals.total")} (${currency})`}
            value={fmt(order.totalMinorUnits)}
            strong
          />
        </div>
      </Card>

      {/* --- Scope, both halves ------------------------------------------- */}
      <Card padding="lg" className="flex flex-col gap-6">
        <h2 className="text-display-sm text-primary">{t("scope.title")}</h2>

        <div className="grid gap-8 sm:grid-cols-2">
          <section className="flex flex-col gap-3">
            <h3 className="text-eyebrow text-tertiary uppercase">
              {t("included.title")}
            </h3>
            {included.length === 0 ? (
              <p className="text-body-sm text-secondary">{t("included.none")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {included.map((capability) => (
                  <li
                    key={capability.key}
                    className="flex items-start gap-2 text-body-sm text-secondary"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    {tCap(`${capability.key}.name`)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/*
           * The excluded list is shown in full rather than summarised. A
           * customer who assumed something was in scope finds out here, while
           * they can still change their mind, instead of on handover.
           */}
          <section className="flex flex-col gap-3">
            <h3 className="text-eyebrow text-tertiary uppercase">
              {t("excluded.title")}
            </h3>
            <p className="text-caption text-tertiary">{t("excluded.note")}</p>
            <ul className="flex flex-col gap-2">
              {excluded.map((capability) => (
                <li
                  key={capability.key}
                  className="flex items-start gap-2 text-body-sm text-tertiary"
                >
                  <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {tCap(`${capability.key}.name`)}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </Card>

      {/* --- Delivery and the guarantee ----------------------------------- */}
      <Card padding="lg" className="flex flex-col gap-5">
        <h2 className="text-display-sm text-primary">{t("delivery.title")}</h2>

        {days ? (
          <p className="flex items-center gap-2.5 text-body text-primary">
            <Clock className="size-4 shrink-0 text-secondary" aria-hidden />
            {t("delivery.days", { days })}
          </p>
        ) : null}

        <div className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <div className="flex flex-col gap-2">
            <p className="text-body-sm text-secondary">{t("guarantee.body")}</p>
            <ul className="flex flex-col gap-1.5 text-body-sm text-secondary">
              <li>
                {t("guarantee.refundCancel", {
                  percent: MISSED_DEADLINE_REFUND.cancelPercent,
                })}
              </li>
              <li>
                {t("guarantee.refundContinue", {
                  percent: MISSED_DEADLINE_REFUND.continuePercent,
                })}
              </li>
            </ul>
          </div>
        </div>

        {hasExternalReview ? (
          <Callout tone="warning" title={t("delivery.storeReviewTitle")}>
            {t("delivery.storeReview")}
          </Callout>
        ) : null}

        {/* The single most misread fact about the offer, stated before payment. */}
        <Callout tone="info" title={t("guarantee.clockTitle")}>
          {t("guarantee.clockNote")}
        </Callout>
      </Card>

      {order.pricingSnapshot &&
      (order.pricingSnapshot as { chargeCurrency?: string }).chargeCurrency !== "CAD" ? (
        <p className="flex items-start gap-2 text-caption text-tertiary">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("conversionNote", { currency })}
        </p>
      ) : null}
    </div>
  );
}
