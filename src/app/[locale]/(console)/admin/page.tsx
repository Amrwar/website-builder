import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { MetricBar, MetricCard } from "@/components/admin/metric-card";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { formatMoney, money, type Currency } from "@/lib/pricing/money";
import { dashboardMetrics } from "@/server/admin/queries";
import { requireAdminSection } from "@/server/admin/guard";

export const metadata: Metadata = {
  title: "Production factory",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The executive dashboard.
 *
 * Every figure is counted from the real tables. Nothing is seeded or
 * illustrative, so a zero means zero happened -- which is the only condition
 * under which a dashboard is worth looking at.
 *
 * Financial figures are omitted entirely for roles without `finance:read`,
 * and the omission is stated rather than silently leaving a gap: a developer
 * should know the number exists and is not theirs, not wonder whether the
 * company made no money.
 */
export default async function AdminDashboardPage({
  params,
}: PageProps<"/[locale]/admin">) {
  const context = await requireAdminSection("dashboard");
  const { locale } = await params;

  const t = await getTranslations("adminConsole");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));
  const metrics = await dashboardMetrics(context);

  const amount = (minorUnits: number, currency: string) =>
    formatMoney(money(minorUnits, currency as Currency), intlTag, {
      trimWholeDecimals: true,
    });

  const nothingYet =
    metrics.activeProjects === 0 &&
    metrics.completedProjects === 0 &&
    metrics.newOrders === 0;

  return (
    <AdminShell role={context.user.role} active="dashboard">
      <AdminPageHeader title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />

      {nothingYet ? (
        <EmptyState
          title={t("dashboard.noData")}
          description={t("dashboard.noDataHelp")}
        />
      ) : null}

      {/* --- What needs attention today --------------------------------- */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label={t("dashboard.activeProjects")}
          value={String(metrics.activeProjects)}
        />
        <MetricCard
          label={t("dashboard.startingToday")}
          value={String(metrics.startingToday)}
        />
        <MetricCard label={t("dashboard.dueToday")} value={String(metrics.dueToday)} />
        <MetricCard
          label={t("dashboard.atRisk")}
          value={String(metrics.atRisk)}
          tone={metrics.atRisk > 0 ? "warning" : "neutral"}
        />
        <MetricCard
          label={t("dashboard.overdue")}
          value={String(metrics.overdue)}
          // The only figure on this page where any non-zero value is an
          // incident: every overdue project is a refund the company owes.
          tone={metrics.overdue > 0 ? "danger" : "neutral"}
        />
      </section>

      {/* --- Delivery ---------------------------------------------------- */}
      <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={t("dashboard.newOrders")} value={String(metrics.newOrders)} />
        <MetricCard
          label={t("dashboard.completedProjects")}
          value={String(metrics.completedProjects)}
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

      {/* --- The guarantee ----------------------------------------------- */}
      <section className="mt-4 grid gap-3 lg:grid-cols-3">
        {metrics.guaranteeSuccessRate === null ? (
          <MetricCard
            label={t("dashboard.guaranteeRate")}
            value={t("common.none")}
            hint={t("dashboard.noDataHelp")}
          />
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
            <div className="grid gap-3 sm:grid-cols-2 lg:contents">
              <MetricCard
                label={t("dashboard.pending")}
                value={amount(
                  metrics.finance.pendingMinorUnits,
                  metrics.finance.currency,
                )}
              />
              <MetricCard
                label={t("dashboard.refunded")}
                value={amount(
                  metrics.finance.refundedMinorUnits,
                  metrics.finance.currency,
                )}
              />
            </div>
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
