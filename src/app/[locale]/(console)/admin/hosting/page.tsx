import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { viewerDates } from "@/server/i18n";
import { requireAdminSection } from "@/server/admin/guard";
import { listHosting, type HostingRow } from "@/server/admin/launch-queries";

export const metadata: Metadata = {
  title: "Hosting",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Every hosted project.
 *
 * The live version column reads from a deployment the **provider confirmed**.
 * A row whose hosting says "active" with no live version is not a rendering
 * gap -- it is a project whose hosting record and whose actual deployments
 * disagree, which is exactly what somebody needs to see.
 */
export default async function AdminHostingPage({
  params,
}: PageProps<"/[locale]/admin/hosting">) {
  const context = await requireAdminSection("hosting");
  const { locale } = await params;

  const t = await getTranslations("adminConsole.hostingPage");
  const tStatus = await getTranslations("workspace.launch.hosting.status");
  const dates = await viewerDates(locale);

  const rows = await listHosting(context);

  const date = (value: Date | null) => dates.date(value);

  return (
    <AdminShell role={context.user.role} active="hosting">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} />

      <DataTable<HostingRow>
        rows={rows}
        rowKey={(row) => row.hosting.id}
        caption={t("title")}
        empty={{ title: t("empty"), description: t("emptyBody") }}
        columns={[
          {
            id: "project",
            header: t("columns.project"),
            mobile: "primary",
            cell: (row) => (
              <span className="flex flex-col">
                <span data-numeric>{row.projectReference}</span>
                <span className="text-caption text-tertiary">{row.ownerName ?? "—"}</span>
              </span>
            ),
          },
          {
            id: "domain",
            header: t("columns.domain"),
            mobile: "secondary",
            cell: (row) => <span data-numeric>{row.primaryDomain ?? t("noDomain")}</span>,
          },
          {
            id: "status",
            header: t("columns.status"),
            mobile: "meta",
            cell: (row) => (
              <Badge tone={row.hosting.status === "active" ? "success" : "neutral"}>
                {tStatus(row.hosting.status)}
              </Badge>
            ),
          },
          {
            id: "live",
            header: t("columns.live"),
            wide: true,
            mobile: "meta",
            cell: (row) =>
              row.liveVersion ? (
                <span className="flex flex-col">
                  <span data-numeric>{row.liveVersion}</span>
                  <span className="text-caption text-tertiary" data-numeric>
                    {date(row.liveConfirmedAt)}
                  </span>
                </span>
              ) : (
                // Never "—" alone: the absence of a confirmed deployment is a
                // statement, not a missing value.
                <span className="text-caption text-warning">{t("noConfirmed")}</span>
              ),
          },
          {
            id: "uptime",
            header: t("columns.uptime"),
            align: "end",
            mobile: "meta",
            cell: (row) =>
              row.hosting.uptimeBasisPoints !== null && row.hosting.uptimeCheckedAt ? (
                <span className="flex flex-col items-end">
                  <span data-numeric>
                    {(row.hosting.uptimeBasisPoints / 100).toFixed(2)}%
                  </span>
                  <span className="text-caption text-tertiary" data-numeric>
                    {date(row.hosting.uptimeCheckedAt)}
                  </span>
                </span>
              ) : (
                // A percentage with no measurement date would be a claim we
                // cannot support, so nothing is shown rather than a zero.
                <span className="text-caption text-tertiary">{t("notMeasured")}</span>
              ),
          },
        ]}
      />
    </AdminShell>
  );
}
