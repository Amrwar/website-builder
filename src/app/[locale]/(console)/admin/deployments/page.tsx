import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DataTable, TablePagination, type Column } from "@/components/admin/data-table";
import { AdminTableToolbar } from "@/components/admin/table-toolbar";
import { Badge } from "@/components/ui/badge";
import { viewerDates } from "@/server/i18n";
import { deploymentList } from "@/server/admin/lists";
import { requireAdminSection } from "@/server/admin/guard";

export const metadata: Metadata = {
  title: "Deployments",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Every deployment, newest first. */
export default async function AdminDeploymentsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/deployments">) {
  const context = await requireAdminSection("deployments");
  const { locale } = await params;
  const query = await searchParams;

  const t = await getTranslations("adminConsole");
  const dates = await viewerDates(locale);

  const environment =
    typeof query.environment === "string" ? query.environment : undefined;
  const page =
    Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1;
  const result = await deploymentList({ environment, page }, context);

  const when = (value: Date | null) => dates.dateTime(value);

  type Row = (typeof result.rows)[number];
  const columns: Column<Row>[] = [
    {
      id: "project",
      header: t("queue.project"),
      mobile: "primary",
      cell: (row) => <span data-numeric>{row.projectReference}</span>,
    },
    {
      id: "version",
      header: "Version",
      mobile: "secondary",
      cell: (row) => <span data-numeric>{row.version}</span>,
    },
    {
      id: "environment",
      header: "Environment",
      mobile: "secondary",
      cell: (row) => row.environment,
    },
    {
      id: "state",
      header: t("queue.stage"),
      mobile: "meta",
      cell: (row) => (
        <Badge
          tone={
            row.state === "ready"
              ? "success"
              : row.state === "failed"
                ? "danger"
                : "neutral"
          }
        >
          {row.state}
        </Badge>
      ),
    },
    {
      id: "started",
      header: t("queue.started"),
      mobile: "secondary",
      wide: true,
      cell: (row) => <span data-numeric>{when(row.startedAt)}</span>,
    },
  ];

  const hrefFor = (next: number) => {
    const qs = new URLSearchParams();
    if (environment) qs.set("environment", environment);
    if (next > 1) qs.set("page", String(next));
    const value = qs.toString();
    return `/admin/deployments${value ? `?${value}` : ""}`;
  };

  return (
    <AdminShell role={context.user.role} active="deployments">
      <AdminPageHeader title={t("sections.deployments")} />
      <DataTable
        rows={result.rows}
        columns={columns}
        rowKey={(row) => row.id}
        href={(row) => `/admin/projects/${row.projectReference}`}
        caption={t("sections.deployments")}
        filtered={Boolean(environment)}
        empty={{ title: t("table.empty") }}
        toolbar={
          <AdminTableToolbar
            basePath="/admin/deployments"
            filters={[
              {
                name: "environment",
                label: "Environment",
                value: environment,
                options: [
                  { value: "preview", label: "preview" },
                  { value: "production", label: "production" },
                ],
              },
            ]}
          />
        }
        pagination={
          <TablePagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            pageSize={result.pageSize}
            hrefFor={hrefFor}
          />
        }
      />
    </AdminShell>
  );
}
