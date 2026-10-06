import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { MaintenancePanel } from "@/components/account/maintenance";
import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { formatMinutes } from "@/lib/credits";
import { formatMoney, money, type Currency } from "@/lib/pricing/money";
import { getAuthContext } from "@/server/auth";
import { statementFor } from "@/server/credits";
import { loadPlans, subscriptionsFor } from "@/server/subscriptions";

export const metadata: Metadata = {
  title: "Billing",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Maintenance and build credit.
 *
 * Separate from account settings on purpose: these are commitments and a
 * balance, not preferences, and burying a cancel button under notification
 * toggles is how people end up ringing instead of self-serving.
 *
 * Build credit is shown here rather than on a project, because credit is held
 * by the person. A balance rendered inside one project's workspace would imply
 * it belongs to that project, which is exactly what it does not.
 */
export default async function BillingPage({ params }: PageProps<"/[locale]/billing">) {
  const context = await getAuthContext();
  if (!context) redirect("/sign-in");

  const { locale } = await params;
  const t = await getTranslations("billing");
  const tMaintenance = await getTranslations("maintenance");
  const tCredit = await getTranslations("maintenance.credits");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  const [plans, subscriptions, credit] = await Promise.all([
    loadPlans(),
    subscriptionsFor(context.user.id, context),
    statementFor(context.user.id, context),
  ]);

  const date = (value: Date) =>
    new Intl.DateTimeFormat(intlTag, { dateStyle: "medium" }).format(value);

  const price = (minorUnits: number, currency: string) =>
    formatMoney(money(minorUnits, currency as Currency), intlTag, {
      trimWholeDecimals: true,
    });

  // The one that is actually being served. A cancelled subscription from last
  // year is history, not the current plan.
  const current =
    subscriptions.find((subscription) =>
      ["trialing", "active", "past_due", "paused"].includes(subscription.status),
    ) ?? null;

  const balance = formatMinutes(credit.balanceMinutes);

  return (
    <Container width="content" className="py-12 sm:py-16">
      <header className="mb-10 flex flex-col gap-3">
        <h1 className="text-display-lg text-primary">{t("title")}</h1>
        <p className="max-w-2xl text-body-lg text-secondary">{t("lede")}</p>
      </header>

      <div className="flex flex-col gap-12">
        <MaintenancePanel
          plans={plans.map((plan) => ({
            key: plan.key,
            priceLabel: price(plan.priceMinorUnits, plan.currency),
            featureKeys: plan.featureKeys,
            isRecommended: plan.isRecommended,
          }))}
          current={
            current
              ? {
                  id: current.id,
                  reference: current.reference,
                  planKey: current.planKey,
                  status: current.status,
                  priceLabel: price(current.priceMinorUnits, current.currency),
                  periodEndLabel: date(current.currentPeriodEnd),
                  trialEndsLabel:
                    current.status === "trialing" && current.trialEndsAt
                      ? date(current.trialEndsAt)
                      : null,
                  cancelAtPeriodEnd: current.cancelAtPeriodEnd,
                }
              : null
          }
          projectId={current?.projectId ?? null}
        />

        {/* --- Build credit ------------------------------------------------ */}
        <section className="flex flex-col gap-5">
          <h2 className="text-display-sm text-primary">{tCredit("title")}</h2>

          <Card padding="lg" className="flex flex-col gap-3">
            <p className="text-display-md text-primary" data-numeric>
              {credit.balanceMinutes > 0
                ? tCredit("balance", {
                    hours: balance.hours,
                    minutes: balance.minutes,
                  })
                : tCredit("empty")}
            </p>
            {/* Said explicitly, because the natural assumption is the opposite:
                most platforms tie credit to the thing it was bought for. */}
            <p className="text-body-sm text-secondary">{tCredit("body")}</p>
          </Card>

          <div className="flex flex-col gap-3">
            <h3 className="text-caption text-secondary">{tCredit("statement")}</h3>

            {credit.entries.length === 0 ? (
              <Callout tone="neutral" title={tMaintenance("noHistory")} />
            ) : (
              <ul className="flex flex-col gap-3">
                {credit.entries.map((entry) => {
                  const amount = formatMinutes(Math.abs(entry.minutes));

                  return (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line-subtle pb-3 last:border-0"
                    >
                      <span className="flex flex-col gap-0.5">
                        <span className="text-body-sm text-primary">
                          {entry.description ?? tCredit(`kind.${entry.kind}`)}
                        </span>
                        <span className="text-caption text-tertiary" data-numeric>
                          {date(entry.occurredAt)}
                          {entry.expiresAt
                            ? ` · ${tCredit("expires", { date: date(entry.expiresAt) })}`
                            : ""}
                        </span>
                      </span>

                      <span className="flex items-center gap-3">
                        <Badge tone={entry.minutes > 0 ? "success" : "neutral"}>
                          {tCredit(`kind.${entry.kind}`)}
                        </Badge>
                        <span className="text-body-sm text-primary" data-numeric>
                          {entry.minutes > 0 ? "+" : "−"}
                          {amount.hours > 0 ? `${amount.hours}h ` : ""}
                          {amount.minutes}m
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </Container>
  );
}
