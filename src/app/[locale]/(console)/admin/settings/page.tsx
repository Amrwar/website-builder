import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MISSED_DEADLINE_REFUND } from "@/config/brand";
import { TAX } from "@/config/commerce";
import { CURRENCY_PRESENTATION, RATES_REVIEWED_ON } from "@/config/currency";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { RISK_THRESHOLDS, RISK_RULESET_VERSION } from "@/lib/production/risk";
import { requireAdminSection } from "@/server/admin/guard";

export const metadata: Metadata = {
  title: "System settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Platform configuration.
 *
 * Read-only, deliberately. Every value here lives in version-controlled
 * configuration, which is what makes a pricing change reviewable, attributable
 * and revertable. An admin screen that could edit them would move those
 * decisions somewhere with no history and no review -- and the commercial
 * figures in this product are exactly the things that need both.
 *
 * So this screen's job is to show what the running configuration actually is,
 * including which parts are still provisional.
 */
export default async function AdminSettingsPage({
  params,
}: PageProps<"/[locale]/admin/settings">) {
  const context = await requireAdminSection("settings");
  const { locale } = await params;

  const t = await getTranslations("adminConsole");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  const reviewed = new Intl.DateTimeFormat(intlTag, { dateStyle: "medium" }).format(
    new Date(RATES_REVIEWED_ON),
  );

  return (
    <AdminShell role={context.user.role} active="settings">
      <AdminPageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <div className="mb-6">
        <Callout tone="info" title={t("settings.readOnlyNote")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* --- Currency ------------------------------------------------- */}
        <Card padding="lg" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-body font-medium text-primary">
              {t("settings.currency")}
            </h2>
            <Badge tone="warning">{t("settings.provisional")}</Badge>
          </div>

          <p className="text-caption text-tertiary">
            {t("settings.reviewedOn", { date: reviewed })}
          </p>

          <Separator />

          <dl className="flex flex-col gap-1.5">
            {Object.entries(CURRENCY_PRESENTATION).map(([code, rule]) => (
              <div key={code} className="flex items-baseline justify-between gap-4">
                <dt className="text-body-sm text-secondary" data-numeric>
                  {code}
                </dt>
                <dd className="text-body-sm text-primary" data-numeric>
                  × {rule.rate} · {rule.roundToMinorUnits}
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* --- Tax ------------------------------------------------------- */}
        <Card padding="lg" className="flex flex-col gap-3">
          <h2 className="text-body font-medium text-primary">{t("settings.tax")}</h2>
          {TAX.enabled ? (
            <p className="text-body-sm text-secondary" data-numeric>
              {TAX.rateBasisPoints / 100}%
            </p>
          ) : (
            <p className="text-body-sm text-secondary">{t("settings.taxDisabled")}</p>
          )}
        </Card>

        {/* --- Guarantee -------------------------------------------------- */}
        <Card padding="lg" className="flex flex-col gap-3">
          <h2 className="text-body font-medium text-primary">
            {t("settings.guarantee")}
          </h2>
          <dl className="flex flex-col gap-1.5 text-body-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-secondary">guarantee_cancel</dt>
              <dd className="text-primary" data-numeric>
                {MISSED_DEADLINE_REFUND.cancelPercent}%
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-secondary">guarantee_continue</dt>
              <dd className="text-primary" data-numeric>
                {MISSED_DEADLINE_REFUND.continuePercent}%
              </dd>
            </div>
          </dl>
        </Card>

        {/* --- Risk ------------------------------------------------------- */}
        <Card padding="lg" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-body font-medium text-primary">{t("settings.risk")}</h2>
            <span className="font-mono text-caption text-tertiary">
              {RISK_RULESET_VERSION}
            </span>
          </div>
          <dl className="flex flex-col gap-1.5 text-body-sm">
            {Object.entries(RISK_THRESHOLDS).map(([key, value]) => (
              <div key={key} className="flex items-baseline justify-between gap-4">
                <dt className="text-secondary">{key}</dt>
                <dd className="text-primary" data-numeric>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </AdminShell>
  );
}
