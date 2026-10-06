import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import {
  CommissionActions,
  PartnerActions,
} from "@/components/admin/growth/growth-controls";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COMMISSION_BASIS_POINTS, COMMISSION_HOLD_DAYS } from "@/config/growth";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { formatMoney, money, type Currency } from "@/lib/pricing/money";
import { requireAdminSection } from "@/server/admin/guard";
import { listCommissionRows } from "@/server/admin/growth-queries";
import { listAffiliates, listPartners } from "@/server/growth/partners";

export const metadata: Metadata = {
  title: "Partners",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Partners, affiliates and commissions.
 *
 * Three tabs rather than three pages: they are one relationship seen from
 * three angles, and an administrator deciding whether to approve a partner
 * usually wants to see what the last one earned.
 */
export default async function AdminPartnersPage({
  params,
}: PageProps<"/[locale]/admin/partners">) {
  const context = await requireAdminSection("partners");
  const { locale } = await params;

  const t = await getTranslations("adminConsole.partnersPage");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  const canSeeMoney = context.can("finance:read");

  const [partners, affiliates, commissions] = await Promise.all([
    listPartners(context),
    listAffiliates(context),
    canSeeMoney ? listCommissionRows(context) : Promise.resolve([]),
  ]);

  const date = (value: Date | null) =>
    value ? new Intl.DateTimeFormat(intlTag, { dateStyle: "medium" }).format(value) : "—";

  const amount = (minorUnits: number, currency: string) =>
    formatMoney(money(minorUnits, currency as Currency), intlTag, {
      trimWholeDecimals: true,
    });

  return (
    <AdminShell role={context.user.role} active="partners">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} />

      <Tabs defaultValue="partners">
        <TabsList className="mb-6">
          <TabsTrigger value="partners">{t("tabs.partners")}</TabsTrigger>
          <TabsTrigger value="affiliates">{t("tabs.affiliates")}</TabsTrigger>
          <TabsTrigger value="commissions">{t("tabs.commissions")}</TabsTrigger>
        </TabsList>

        <TabsContent value="partners">
          {partners.length === 0 ? (
            <EmptyState title={t("empty")} description={t("emptyBody")} />
          ) : (
            <ul className="flex flex-col gap-4">
              {partners.map((partner) => (
                <li key={partner.id}>
                  <Card
                    padding="lg"
                    className="flex flex-wrap items-start justify-between gap-4"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-body font-medium text-primary">
                        {partner.companyName}
                      </span>
                      <span className="text-caption text-tertiary">
                        {partner.contactName} · {partner.email} · {partner.kind}
                      </span>
                      {partner.pitch ? (
                        <p className="mt-2 max-w-xl text-body-sm text-secondary">
                          {partner.pitch}
                        </p>
                      ) : null}
                      {partner.statusNote ? (
                        <p className="mt-1 text-caption text-warning">
                          {partner.statusNote}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className="flex items-center gap-2">
                        <Badge
                          tone={partner.status === "approved" ? "success" : "neutral"}
                        >
                          {t(`status.${partner.status}`)}
                        </Badge>
                        <span className="text-caption text-tertiary" data-numeric>
                          {(partner.commissionBasisPoints / 100).toFixed(1)}% ·{" "}
                          {date(partner.createdAt)}
                        </span>
                      </span>

                      <PartnerActions
                        kind="partner"
                        id={partner.id}
                        status={partner.status}
                        defaultRate={COMMISSION_BASIS_POINTS.partner}
                      />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="affiliates">
          {affiliates.length === 0 ? (
            <EmptyState title={t("empty")} description={t("emptyBody")} />
          ) : (
            <ul className="flex flex-col gap-4">
              {affiliates.map((affiliate) => (
                <li key={affiliate.id}>
                  <Card
                    padding="lg"
                    className="flex flex-wrap items-start justify-between gap-4"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-body font-medium text-primary">
                        {affiliate.name}
                      </span>
                      <span className="text-caption text-tertiary">
                        {affiliate.email}
                        {affiliate.website ? ` · ${affiliate.website}` : ""}
                      </span>
                      {affiliate.statusNote ? (
                        <p className="mt-1 text-caption text-warning">
                          {affiliate.statusNote}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className="flex items-center gap-2">
                        <Badge
                          tone={affiliate.status === "approved" ? "success" : "neutral"}
                        >
                          {t(`status.${affiliate.status}`)}
                        </Badge>
                        <span className="text-caption text-tertiary" data-numeric>
                          {(affiliate.commissionBasisPoints / 100).toFixed(1)}%
                        </span>
                      </span>

                      <PartnerActions
                        kind="affiliate"
                        id={affiliate.id}
                        status={affiliate.status}
                        defaultRate={COMMISSION_BASIS_POINTS.affiliate}
                      />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="commissions">
          <div className="flex flex-col gap-4">
            <Callout tone="info" title={t("holdNote", { days: COMMISSION_HOLD_DAYS })} />

            {commissions.length === 0 ? (
              <EmptyState
                title={t("noCommissions")}
                description={t("noCommissionsBody")}
              />
            ) : (
              <Card padding="lg">
                <ul className="flex flex-col gap-4">
                  {commissions.map(({ commission, orderNumber, earnerName }) => (
                    <li
                      key={commission.id}
                      className="flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle pb-4 last:border-0 last:pb-0"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-body-sm text-primary">{earnerName}</span>
                        <span className="text-caption text-tertiary" data-numeric>
                          {orderNumber} · {(commission.rateBasisPoints / 100).toFixed(1)}%
                          of {amount(commission.grossMinorUnits, commission.currency)}
                        </span>
                        {commission.reversalReason ? (
                          <span className="text-caption text-warning">
                            {commission.reversalReason}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <span className="flex items-center gap-2">
                          <span className="text-body-sm text-primary" data-numeric>
                            {amount(commission.amountMinorUnits, commission.currency)}
                          </span>
                          <Badge
                            tone={
                              commission.state === "paid"
                                ? "success"
                                : commission.state === "reversed"
                                  ? "danger"
                                  : "neutral"
                            }
                          >
                            {t(`commissionState.${commission.state}`)}
                          </Badge>
                        </span>

                        <CommissionActions
                          commissionId={commission.id}
                          state={commission.state}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}
