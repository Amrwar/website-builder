import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import {
  ChecklistItemEditor,
  CurrencyEditor,
  DiscountToggle,
  FeatureEditor,
  ImportDefaults,
  ImportLifecycleDefaults,
  NewDiscount,
  PlanEditor,
  TierEditor,
} from "@/components/admin/pricing/catalog-editors";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { BUILD_TYPES, type BuildType } from "@/config/products";
import type { ScopeTierId } from "@/db/schema/enums";
import { defaultCatalog, tierRule, type Catalog } from "@/lib/engine";
import { BASE_CURRENCY, formatMoney, money } from "@/lib/pricing/money";
import { requireAdminSection } from "@/server/admin/guard";
import { readCatalogForAdmin } from "@/server/admin/catalog";
import { readLifecycleCatalog } from "@/server/admin/lifecycle";
import { loadCatalog } from "@/server/engine";

export const metadata: Metadata = {
  title: "Pricing",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The commercial catalogue.
 *
 * Shows what the engine is **actually** pricing with, not what is written in
 * configuration: the same `loadCatalog()` the configurator and checkout call.
 * A pricing screen that reads a different source from the one that quotes
 * customers is a screen that will eventually lie.
 *
 * Reading needs `finance:read`; editing needs `settings:manage`, which only
 * the owner holds. Someone who can read sees the figures without the controls,
 * and the server refuses the write regardless of what the page rendered.
 */
export default async function AdminPricingPage({
  params,
}: PageProps<"/[locale]/admin/pricing">) {
  const context = await requireAdminSection("pricing");
  const { locale } = await params;

  const t = await getTranslations("adminConsole.pricing");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  const [live, stored, lifecycle] = await Promise.all([
    loadCatalog(true),
    readCatalogForAdmin(context),
    readLifecycleCatalog(context),
  ]);

  const canEdit = context.can("settings:manage");
  const shipped = defaultCatalog();

  const base = (minorUnits: number) =>
    formatMoney(money(minorUnits, BASE_CURRENCY), intlTag, { trimWholeDecimals: true });

  /** True while a row still matches the figure that shipped unapproved. */
  const isProvisional = (
    catalog: Catalog,
    buildType: BuildType,
    tier: ScopeTierId,
  ): boolean => {
    if (tier === "essential" || tier === "custom") return false;
    const current = tierRule(catalog, buildType, tier);
    const original = tierRule(shipped, buildType, tier);
    return (
      current?.priceMinorUnits != null &&
      current.priceMinorUnits === original?.priceMinorUnits
    );
  };

  return (
    <AdminShell role={context.user.role} active="pricing">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="mb-6 flex flex-col gap-3">
        {!canEdit ? <Callout tone="info" title={t("readOnly")} /> : null}

        {canEdit &&
        (stored.usingShippedDefaults.tiers ||
          stored.usingShippedDefaults.features ||
          stored.usingShippedDefaults.currencies) ? (
          <ImportDefaults />
        ) : null}

        {canEdit &&
        (lifecycle.usingShippedDefaults.plans ||
          lifecycle.usingShippedDefaults.checklist) ? (
          <ImportLifecycleDefaults />
        ) : null}

        <Callout tone="neutral" title={t("historyNote")}>
          {t("auditedNote")}
        </Callout>
      </div>

      <Tabs defaultValue="tiers">
        <TabsList className="mb-6">
          <TabsTrigger value="tiers">{t("tabs.tiers")}</TabsTrigger>
          <TabsTrigger value="features">{t("tabs.features")}</TabsTrigger>
          <TabsTrigger value="currencies">{t("tabs.currencies")}</TabsTrigger>
          <TabsTrigger value="discounts">{t("tabs.discounts")}</TabsTrigger>
          <TabsTrigger value="plans">{t("tabs.plans")}</TabsTrigger>
          <TabsTrigger value="checklist">{t("tabs.checklist")}</TabsTrigger>
        </TabsList>

        {/* --- Tiers ------------------------------------------------------ */}
        <TabsContent value="tiers">
          <div className="mb-4">
            <Callout tone="warning" title={t("provisional")}>
              {t("provisionalNote")}
            </Callout>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {BUILD_TYPES.map((buildType) => (
              <Card key={buildType} padding="lg" className="flex flex-col gap-4">
                <h2 className="text-body font-medium text-primary">{buildType}</h2>

                <ul className="flex flex-col gap-4">
                  {live.tiers
                    .filter((rule) => rule.buildType === buildType)
                    .map((rule) => {
                      const row = stored.tiers.find(
                        (entry) =>
                          entry.buildType === buildType && entry.tier === rule.tier,
                      );

                      return (
                        <li
                          key={rule.tier}
                          className="flex flex-col gap-1.5 border-b border-line-subtle pb-4 last:border-0 last:pb-0"
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-body-sm text-secondary">
                              {rule.tier}
                            </span>
                            <span className="text-body-sm text-primary" data-numeric>
                              {rule.priceMinorUnits === null
                                ? t("quote")
                                : base(rule.priceMinorUnits)}
                            </span>
                          </div>

                          <span className="text-caption text-tertiary" data-numeric>
                            {rule.guaranteedDays
                              ? `${rule.guaranteedDays} ${t("days").toLowerCase()} · `
                              : ""}
                            {t("threshold")} {rule.pointThreshold}
                          </span>

                          <div className="flex flex-wrap items-center gap-2">
                            {isProvisional(live, buildType, rule.tier) ? (
                              <Badge tone="warning">{t("provisional")}</Badge>
                            ) : null}
                            {!rule.isActive ? (
                              <Badge tone="neutral">{t("inactive")}</Badge>
                            ) : null}

                            {row ? (
                              <TierEditor
                                row={{
                                  id: row.id,
                                  buildType: row.buildType,
                                  tier: row.tier,
                                  priceMinorUnits: row.priceMinorUnits,
                                  guaranteedDays: row.guaranteedDays,
                                  pointThreshold: row.pointThreshold,
                                  isActive: row.isActive,
                                }}
                                canEdit={canEdit}
                              />
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* --- Features --------------------------------------------------- */}
        <TabsContent value="features">
          {stored.features.length === 0 ? (
            <EmptyState title={t("empty")} description={t("usingDefaults.body")} />
          ) : (
            <Card padding="lg">
              <ul className="flex flex-col gap-4">
                {stored.features.map((feature) => (
                  <li
                    key={feature.id}
                    className="flex flex-col gap-2 border-b border-line-subtle pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-body-sm text-primary">{feature.key}</span>
                        <span className="text-caption text-tertiary">
                          {feature.categoryId}
                        </span>
                        {!feature.isActive ? (
                          <Badge tone="neutral">{t("inactive")}</Badge>
                        ) : null}
                      </span>

                      <span className="text-caption text-secondary" data-numeric>
                        {feature.points} {t("points").toLowerCase()} · {t("minimumTier")}{" "}
                        {feature.minimumTier}
                        {feature.surchargeMinorUnits
                          ? ` · ${base(feature.surchargeMinorUnits)}`
                          : ""}
                      </span>
                    </div>

                    <FeatureEditor
                      row={{
                        id: feature.id,
                        key: feature.key,
                        points: feature.points,
                        minimumTier: feature.minimumTier,
                        surchargeMinorUnits: feature.surchargeMinorUnits,
                        isActive: feature.isActive,
                      }}
                      canEdit={canEdit}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </TabsContent>

        {/* --- Currencies ------------------------------------------------- */}
        <TabsContent value="currencies">
          <Card padding="lg">
            <ul className="flex flex-col gap-4">
              {live.currencies.map((rule) => {
                const row = stored.currencies.find((entry) => entry.code === rule.code);

                return (
                  <li
                    key={rule.code}
                    className="flex flex-col gap-2 border-b border-line-subtle pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <span className="flex items-center gap-2">
                        <span className="text-body-sm text-primary">{rule.code}</span>
                        {!rule.isActive ? (
                          <Badge tone="neutral">{t("inactive")}</Badge>
                        ) : null}
                      </span>

                      <span className="text-caption text-secondary" data-numeric>
                        {t("rate")} {rule.rate} · {t("rounding")} {rule.roundToMinorUnits}{" "}
                        · {t("reviewedOn")} {rule.reviewedOn}
                      </span>
                    </div>

                    {row ? (
                      <CurrencyEditor
                        row={{
                          id: row.id,
                          code: row.code,
                          rate: row.rate,
                          roundToMinorUnits: row.roundToMinorUnits,
                          reviewedOn: row.reviewedOn,
                          isActive: row.isActive,
                        }}
                        canEdit={canEdit}
                        isBase={rule.code === BASE_CURRENCY}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        </TabsContent>

        {/* --- Discounts -------------------------------------------------- */}
        <TabsContent value="discounts">
          <div className="flex flex-col gap-4">
            {canEdit ? <NewDiscount /> : null}

            {stored.discounts.length === 0 ? (
              <EmptyState title={t("empty")} />
            ) : (
              <Card padding="lg">
                <ul className="flex flex-col gap-4">
                  {stored.discounts.map((discount) => (
                    <li
                      key={discount.id}
                      className="flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle pb-4 last:border-0 last:pb-0"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-body-sm text-primary" data-numeric>
                          {discount.code}
                        </span>
                        <span className="text-caption text-secondary">
                          {discount.kind === "percentage"
                            ? `${discount.value}%`
                            : base(discount.value)}
                          {discount.maxDiscountMinorUnits
                            ? ` · ${t("maxDiscount")} ${base(discount.maxDiscountMinorUnits)}`
                            : ""}
                          {discount.minOrderMinorUnits
                            ? ` · ${t("minOrder")} ${base(discount.minOrderMinorUnits)}`
                            : ""}
                        </span>
                        <span className="text-caption text-tertiary" data-numeric>
                          {discount.timesUsed}
                          {discount.maxRedemptions === null
                            ? ` / ${t("unlimited").toLowerCase()}`
                            : ` / ${discount.maxRedemptions}`}{" "}
                          · {t("appliesTo")}{" "}
                          {discount.appliesToBuildTypes.length === 0
                            ? t("allBuilds").toLowerCase()
                            : discount.appliesToBuildTypes.join(", ")}
                        </span>
                        {discount.description ? (
                          <span className="text-caption text-tertiary">
                            {discount.description}
                          </span>
                        ) : null}
                      </div>

                      <DiscountToggle
                        id={discount.id}
                        code={discount.code}
                        isActive={discount.isActive}
                        canEdit={canEdit}
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* --- Maintenance plans ------------------------------------------ */}
        <TabsContent value="plans">
          <div className="flex flex-col gap-4">
            <Callout tone="neutral" title={t("planNote")} />

            {lifecycle.plans.length === 0 ? (
              <EmptyState title={t("empty")} description={t("usingDefaults.body")} />
            ) : (
              <Card padding="lg">
                <ul className="flex flex-col gap-4">
                  {lifecycle.plans.map((plan) => (
                    <li
                      key={plan.id}
                      className="flex flex-col gap-2 border-b border-line-subtle pb-4 last:border-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-body-sm text-primary">{plan.key}</span>
                          {plan.isRecommended ? (
                            <Badge tone="info">{t("recommended")}</Badge>
                          ) : null}
                          {!plan.isActive ? (
                            <Badge tone="neutral">{t("inactive")}</Badge>
                          ) : null}
                        </span>

                        <span className="text-caption text-secondary" data-numeric>
                          {base(plan.priceMinorUnits)} · {plan.interval}
                          {plan.includedCreditMinutes > 0
                            ? ` · ${plan.includedCreditMinutes} min`
                            : ""}
                          {plan.trialDays > 0 ? ` · ${plan.trialDays}d` : ""}
                        </span>
                      </div>

                      <PlanEditor
                        row={{
                          id: plan.id,
                          key: plan.key,
                          priceMinorUnits: plan.priceMinorUnits,
                          includedCreditMinutes: plan.includedCreditMinutes,
                          trialDays: plan.trialDays,
                          isRecommended: plan.isRecommended,
                          isActive: plan.isActive,
                        }}
                        canEdit={canEdit}
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* --- The launch checklist --------------------------------------- */}
        <TabsContent value="checklist">
          {lifecycle.checklist.length === 0 ? (
            <EmptyState title={t("empty")} description={t("usingDefaults.body")} />
          ) : (
            <Card padding="lg">
              <ul className="flex flex-col gap-4">
                {lifecycle.checklist.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-2 border-b border-line-subtle pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-body-sm text-primary">{item.key}</span>
                        <span className="text-caption text-tertiary">{item.group}</span>
                        {!item.isActive ? (
                          <Badge tone="neutral">{t("inactive")}</Badge>
                        ) : null}
                      </span>

                      <span className="text-caption text-secondary">
                        {item.isRequired ? t("requiredItem") : t("optional")}
                        {item.customerVisible ? ` · ${t("customerVisible")}` : ""}
                      </span>
                    </div>

                    <ChecklistItemEditor
                      row={{
                        id: item.id,
                        key: item.key,
                        group: item.group,
                        isRequired: item.isRequired,
                        customerVisible: item.customerVisible,
                        sortOrder: item.sortOrder,
                        isActive: item.isActive,
                      }}
                      canEdit={canEdit}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}
