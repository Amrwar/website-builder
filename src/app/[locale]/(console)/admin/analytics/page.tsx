import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { MetricBar, MetricCard } from "@/components/admin/metric-card";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { formatMoney, money, type Currency } from "@/lib/pricing/money";
import { requireAdminSection } from "@/server/admin/guard";
import { dashboardMetrics } from "@/server/admin/queries";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Business figures.
 *
 * Deliberately not charts. There is no delivery history to draw a trend from
 * yet, and a line through two points is a decoration that implies knowledge
 * nobody has. When there is a year of deliveries behind these numbers, a
 * series becomes worth drawing; until then the figures are the figures, and
 * the empty state says so.
 */
export default async function AdminAnalyticsPage({
  params,
}: PageProps<"/[locale]/admin/analytics">) {
  const context = await requireAdminSection("analytics");
  const { locale } = await params;

  const t = await getTranslations("adminConsole");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));
  const metrics = await dashboardMetrics(context);

  const amount = (minorUnits: number, currency: string) =>
    formatMoney(money(minorUnits, currency as Currency), intlTag, {
      trimWholeDecimals: true,
    });

  const noHistory = metrics.guaranteeSampleSize === 0;

  return (
    <AdminShell role={context.user.role} active="analytics">
      <AdminPageHeader title={t("analytics.title")} subtitle={t("analytics.subtitle")} />

      {noHistory ? (
        <div className="mb-6">
          <EmptyState size="sm" title={t("analytics.noData")} />
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t("dashboard.completedProjects")}
          value={String(metrics.completedProjects)}
        />
        <MetricCard
          label={t("dashboard.activeProjects")}
          value={String(metrics.activeProjects)}
        />
        <MetricCard
          label={t("dashboard.activeCustomers")}
          value={String(metrics.activeCustomers)}
        />
        <MetricCard
          label={t("dashboard.averageDelivery")}
          value={
            metrics.averageDeliveryDays === null
              ? t("common.none")
              : t("dashboard.averageDeliveryUnit", {
                  days: metrics.averageDeliveryDays.toFixed(1),
                })
          }
        />
      </section>

      <section className="mt-4 grid gap-3 lg:grid-cols-3">
        {metrics.guaranteeSuccessRate === null ? (
          <MetricCard label={t("dashboard.guaranteeRate")} value={t("common.none")} />
        ) : (
          <MetricBar
            label={t("dashboard.guaranteeRate")}
            value={Math.round(metrics.guaranteeSuccessRate * metrics.guaranteeSampleSize)}
            total={metrics.guaranteeSampleSize}
            caption={t("dashboard.guaranteeSample", {
              count: metrics.guaranteeSampleSize,
            })}
          />
        )}

        {metrics.finance ? (
          <>
            <MetricCard
              label={t("dashboard.revenue")}
              value={amount(metrics.finance.revenueMinorUnits, metrics.finance.currency)}
            />
            <MetricCard
              label={t("dashboard.refunded")}
              value={amount(metrics.finance.refundedMinorUnits, metrics.finance.currency)}
            />
          </>
        ) : (
          <div className="lg:col-span-2">
            <Callout tone="info" title={t("dashboard.financeHidden")} />
          </div>
        )}
      </section>
    </AdminShell>
  );
}
