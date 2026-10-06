import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { BUILD_TYPES } from "@/config/products";
import { TIER_OFFERS, TIER_ORDER } from "@/lib/scope";
import { formatMoney } from "@/lib/pricing/money";
import { requireAdminSection } from "@/server/admin/guard";

export const metadata: Metadata = {
  title: "Pricing",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The published price list.
 *
 * Read straight from `TIER_OFFERS`, so this screen cannot drift from what the
 * configurator actually quotes. The provisional warning is not decoration:
 * only the `essential` row of each build type comes from the agreed offer, and
 * anyone reading this page needs to know which numbers are still placeholders.
 */
export default async function AdminPricingPage({
  params,
}: PageProps<"/[locale]/admin/pricing">) {
  const context = await requireAdminSection("pricing");
  const { locale } = await params;

  const t = await getTranslations("adminConsole");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  return (
    <AdminShell role={context.user.role} active="pricing">
      <AdminPageHeader title={t("pricing.title")} subtitle={t("pricing.subtitle")} />

      <div className="mb-6">
        <Callout tone="warning" title={t("settings.provisional")}>
          {t("settings.readOnlyNote")}
        </Callout>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {BUILD_TYPES.map((buildType) => (
          <Card key={buildType} padding="lg" className="flex flex-col gap-4">
            <h2 className="text-body font-medium text-primary">{buildType}</h2>

            <ul className="flex flex-col gap-2.5">
              {TIER_ORDER.map((tier) => {
                const offer = TIER_OFFERS[buildType][tier];
                return (
                  <li
                    key={tier}
                    className="flex items-baseline justify-between gap-3 border-b border-line-subtle pb-2 last:border-0"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-body-sm text-secondary">{tier}</span>
                      {tier !== "essential" && offer.price ? (
                        <Badge tone="warning">·</Badge>
                      ) : null}
                    </span>

                    <span className="text-end">
                      <span className="block text-body-sm text-primary" data-numeric>
                        {offer.price
                          ? formatMoney(offer.price, intlTag, { trimWholeDecimals: true })
                          : t("pricing.quote")}
                      </span>
                      {offer.guaranteedDays ? (
                        <span className="block text-caption text-tertiary" data-numeric>
                          {offer.guaranteedDays} {t("pricing.days").toLowerCase()}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
