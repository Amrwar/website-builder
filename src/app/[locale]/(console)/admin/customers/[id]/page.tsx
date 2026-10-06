import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db/client";
import { orders, projects, users } from "@/db/schema";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { Link } from "@/i18n/navigation";
import { formatMoney, money, type Currency } from "@/lib/pricing/money";
import { viewerDates } from "@/server/i18n";
import { requireAdminSection } from "@/server/admin/guard";

export const metadata: Metadata = {
  title: "Customer",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * One customer.
 *
 * Commercial details -- billing country, tax identifier -- and order history
 * are fetched only when the viewer actually holds the permission for them. A
 * designer opening this page is never sent the data, so no template mistake
 * can leak it.
 */
export default async function AdminCustomerPage({
  params,
}: PageProps<"/[locale]/admin/customers/[id]">) {
  const context = await requireAdminSection("customers");
  const { locale, id } = await params;

  const t = await getTranslations("adminConsole");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));
  const dates = await viewerDates(locale);

  const customer = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!customer) notFound();

  const seesSensitive = context.can("customer:read:sensitive");
  const seesFinance = context.can("finance:read");

  const [projectRows, orderRows] = await Promise.all([
    db
      .select({
        id: projects.id,
        reference: projects.reference,
        status: projects.status,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(eq(projects.ownerId, customer.id))
      .orderBy(desc(projects.createdAt))
      .limit(50),

    seesFinance
      ? db
          .select({
            id: orders.id,
            number: orders.number,
            status: orders.status,
            totalMinorUnits: orders.totalMinorUnits,
            currency: orders.currency,
            placedAt: orders.placedAt,
          })
          .from(orders)
          .where(eq(orders.ownerId, customer.id))
          .orderBy(desc(orders.createdAt))
          .limit(50)
      : Promise.resolve([]),
  ]);

  const when = (value: Date | null) => (value ? dates.date(value) : t("common.none"));

  return (
    <AdminShell role={context.user.role} active="customers">
      <Link
        href="/admin/customers"
        className="mb-4 inline-flex w-fit items-center gap-1.5 text-body-sm text-secondary hover:text-primary"
      >
        <ArrowLeft className="rtl-flip size-4" aria-hidden />
        {t("sections.customers")}
      </Link>

      <AdminPageHeader
        title={customer.displayName ?? customer.email}
        subtitle={customer.email}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card padding="lg" className="flex flex-col gap-3">
          <h2 className="text-eyebrow text-tertiary uppercase">
            {t("customers.business")}
          </h2>
          <p className="text-body text-primary">
            {customer.businessName ?? t("common.notSet")}
          </p>
          <p className="text-caption text-tertiary">
            {t("customers.joined")}: {when(customer.createdAt)}
          </p>
        </Card>

        <Card padding="lg" className="flex flex-col gap-3 lg:col-span-2">
          <h2 className="text-eyebrow text-tertiary uppercase">
            {t("customers.country")} · {t("customers.taxId")}
          </h2>
          {seesSensitive ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-0.5">
                <dt className="text-caption text-tertiary">{t("customers.country")}</dt>
                <dd className="text-body-sm text-primary">
                  {customer.billingCountry ?? t("common.notSet")}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-caption text-tertiary">{t("customers.taxId")}</dt>
                <dd className="text-body-sm text-primary">
                  {customer.taxId ?? t("common.notSet")}
                </dd>
              </div>
            </dl>
          ) : (
            <Callout tone="info" title={t("customers.sensitiveHidden")} />
          )}
        </Card>
      </div>

      <Card padding="lg" className="mt-4 flex flex-col gap-4">
        <h2 className="text-eyebrow text-tertiary uppercase">
          {t("customers.projects")}
        </h2>
        {projectRows.length === 0 ? (
          <EmptyState size="sm" title={t("queue.empty")} />
        ) : (
          <ul className="flex flex-col gap-2">
            {projectRows.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/admin/projects/${project.reference}`}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle pb-2 hover:text-primary"
                >
                  <span className="text-body-sm text-primary" data-numeric>
                    {project.reference}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-caption text-tertiary" data-numeric>
                      {when(project.createdAt)}
                    </span>
                    <Badge tone="neutral">
                      {t(`projectStatus.${project.status as "in_build"}`)}
                    </Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {seesFinance ? (
        <Card padding="lg" className="mt-4 flex flex-col gap-4">
          <h2 className="text-eyebrow text-tertiary uppercase">{t("payments.title")}</h2>
          {orderRows.length === 0 ? (
            <EmptyState size="sm" title={t("payments.empty")} />
          ) : (
            <ul className="flex flex-col gap-2">
              {orderRows.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle pb-2"
                >
                  <span className="text-body-sm text-primary" data-numeric>
                    {order.number}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-body-sm text-secondary" data-numeric>
                      {formatMoney(
                        money(order.totalMinorUnits, order.currency as Currency),
                        intlTag,
                      )}
                    </span>
                    <Badge tone={order.status === "paid" ? "success" : "neutral"}>
                      {order.status}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </AdminShell>
  );
}
