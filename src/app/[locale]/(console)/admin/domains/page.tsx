import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { SSL_EXPIRY_WARNING_DAYS } from "@/config/launch";
import { viewerDates } from "@/server/i18n";
import { requireAdminSection } from "@/server/admin/guard";
import { listDomains, type DomainRow } from "@/server/admin/launch-queries";

export const metadata: Metadata = {
  title: "Domains",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Every domain on the platform.
 *
 * Sorted by certificate expiry, so the rows that will take a site down are at
 * the top rather than buried alphabetically. Verification, DNS and SSL are
 * three separate columns because they fail for three different reasons and are
 * fixed three different ways.
 */
export default async function AdminDomainsPage({
  params,
}: PageProps<"/[locale]/admin/domains">) {
  const context = await requireAdminSection("domains");
  const { locale } = await params;

  const t = await getTranslations("adminConsole.domainsPage");
  const tState = await getTranslations("workspace.launch.domainState");
  const dates = await viewerDates(locale);

  const rows = await listDomains(context);

  const atRisk = rows.filter(
    (row) =>
      row.certificateDaysRemaining !== null &&
      row.certificateDaysRemaining <= SSL_EXPIRY_WARNING_DAYS,
  );

  const date = (value: Date | null) => dates.date(value);

  return (
    <AdminShell role={context.user.role} active="domains">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} />

      {atRisk.length > 0 ? (
        <div className="mb-6">
          <Callout tone="warning" title={t("expiringSoon", { count: atRisk.length })}>
            {t("expiringBody")}
          </Callout>
        </div>
      ) : null}

      <DataTable<DomainRow>
        rows={rows}
        rowKey={(row) => row.domain.id}
        caption={t("title")}
        empty={{ title: t("empty"), description: t("emptyBody") }}
        columns={[
          {
            id: "name",
            header: t("columns.domain"),
            mobile: "primary",
            cell: (row) => (
              <span className="flex items-center gap-2">
                <span data-numeric>{row.domain.name}</span>
                {row.domain.isPrimary ? <Badge tone="info">{t("primary")}</Badge> : null}
              </span>
            ),
          },
          {
            id: "project",
            header: t("columns.project"),
            mobile: "secondary",
            cell: (row) => (
              <span className="flex flex-col">
                <span data-numeric>{row.projectReference}</span>
                <span className="text-caption text-tertiary">{row.ownerName ?? "—"}</span>
              </span>
            ),
          },
          {
            id: "verification",
            header: t("columns.verification"),
            wide: true,
            mobile: "meta",
            cell: (row) => (
              <Badge
                tone={row.domain.verification === "verified" ? "success" : "neutral"}
              >
                {tState(`verification.${row.domain.verification}`)}
              </Badge>
            ),
          },
          {
            id: "dns",
            header: t("columns.dns"),
            wide: true,
            mobile: "meta",
            cell: (row) => (
              <Badge tone={row.domain.dnsState === "configured" ? "success" : "neutral"}>
                {tState(`dns.${row.domain.dnsState}`)}
              </Badge>
            ),
          },
          {
            id: "ssl",
            header: t("columns.certificate"),
            mobile: "meta",
            align: "end",
            cell: (row) => {
              const days = row.certificateDaysRemaining;
              const tone =
                days === null
                  ? "neutral"
                  : days < 0
                    ? "danger"
                    : days <= SSL_EXPIRY_WARNING_DAYS
                      ? "warning"
                      : "success";

              return (
                <span className="flex flex-col items-end gap-1">
                  <Badge tone={tone}>{tState(`ssl.${row.domain.sslState}`)}</Badge>
                  <span className="text-caption text-tertiary" data-numeric>
                    {date(row.domain.sslExpiresAt)}
                  </span>
                </span>
              );
            },
          },
        ]}
      />
    </AdminShell>
  );
}
