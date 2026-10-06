import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { ShowcaseActions } from "@/components/admin/growth/growth-controls";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { requireAdminSection } from "@/server/admin/guard";
import { listShowcaseRows } from "@/server/admin/growth-queries";

export const metadata: Metadata = {
  title: "Build wall",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The build wall, from the inside.
 *
 * Consent is the first thing each row states, because it is the thing that
 * decides whether the entry may exist publicly at all. An entry without it
 * shows no publish control: the server refuses anyway, but offering a button
 * that cannot work is its own small dishonesty.
 */
export default async function AdminShowcasePage({
  params,
}: PageProps<"/[locale]/admin/showcase">) {
  const context = await requireAdminSection("showcase");
  const { locale } = await params;

  const t = await getTranslations("adminConsole.showcasePage");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  const rows = await listShowcaseRows(context);

  const date = (value: Date | null) =>
    value ? new Intl.DateTimeFormat(intlTag, { dateStyle: "medium" }).format(value) : "—";

  return (
    <AdminShell role={context.user.role} active="showcase">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="mb-6">
        <Callout tone="info" title={t("consentNote")} />
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyBody")} />
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map(({ entry, projectReference }) => (
            <li key={entry.id}>
              <Card padding="lg" className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-body font-medium text-primary">
                      {entry.title}
                    </span>
                    <span className="text-caption text-tertiary" data-numeric>
                      {projectReference} · {entry.slug}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={entry.customerConsentAt ? "success" : "danger"}>
                      {entry.customerConsentAt
                        ? t("consented", { date: date(entry.customerConsentAt) })
                        : t("noConsent")}
                    </Badge>
                    <Badge tone={entry.status === "published" ? "success" : "neutral"}>
                      {entry.status}
                    </Badge>
                  </div>
                </div>

                {entry.summary ? (
                  <p className="text-body-sm text-secondary">{entry.summary}</p>
                ) : null}

                <ShowcaseActions
                  entryId={entry.id}
                  published={entry.status === "published"}
                  hasConsent={entry.customerConsentAt !== null}
                  values={{
                    title: entry.title,
                    summary: entry.summary,
                    industry: entry.industry ?? "",
                    technologies: entry.technologies.join(", "),
                    screenshots: entry.screenshots.join(", "),
                    customerLabel: entry.customerLabel ?? "",
                    sortOrder: entry.sortOrder,
                  }}
                />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
