import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DataTable, TablePagination, type Column } from "@/components/admin/data-table";
import { AdminTableToolbar } from "@/components/admin/table-toolbar";
import { Badge } from "@/components/ui/badge";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { approvalList } from "@/server/admin/lists";
import { requireAdminSection } from "@/server/admin/guard";

export const metadata: Metadata = {
  title: "Approvals",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Sign-offs waiting on customers, across every project. */
export default async function AdminApprovalsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/approvals">) {
  const context = await requireAdminSection("approvals");
  const { locale } = await params;
  const query = await searchParams;

  const t = await getTranslations("adminConsole");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  const status = typeof query.status === "string" ? query.status : undefined;
  const page =
    Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1;
  const result = await approvalList({ status, page }, context);

  const when = (value: Date | null) =>
    value ? new Intl.DateTimeFormat(intlTag, { dateStyle: "short" }).format(value) : "—";

  type Row = (typeof result.rows)[number];
  const columns: Column<Row>[] = [
    {
      id: "project",
      header: t("queue.project"),
      mobile: "primary",
      cell: (row) => <span data-numeric>{row.reference}</span>,
    },
    {
      id: "kind",
      header: t("sections.approvals"),
      mobile: "secondary",
      cell: (row) => row.kind,
    },
    {
      id: "status",
      header: t("queue.stage"),
      mobile: "meta",
      cell: (row) => (
        <Badge
          tone={
            row.status === "approved"
              ? "success"
              : row.status === "pending"
                ? "warning"
                : "neutral"
          }
        >
          {row.status}
        </Badge>
      ),
    },
    {
      id: "round",
      header: "#",
      mobile: "secondary",
      align: "end",
      cell: (row) => <span data-numeric>{row.round}</span>,
    },
    {
      id: "requested",
      header: t("refunds.requested"),
      mobile: "secondary",
      cell: (row) => <span data-numeric>{when(row.requestedAt)}</span>,
    },
  ];

  const hrefFor = (next: number) => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (next > 1) qs.set("page", String(next));
    const value = qs.toString();
    return `/admin/approvals${value ? `?${value}` : ""}`;
  };

  return (
    <AdminShell role={context.user.role} active="approvals">
      <AdminPageHeader title={t("sections.approvals")} />
      <DataTable
        rows={result.rows}
        columns={columns}
        rowKey={(row) => row.id}
        href={(row) => `/admin/projects/${row.reference}`}
        caption={t("sections.approvals")}
        filtered={Boolean(status)}
        empty={{ title: t("table.empty") }}
        toolbar={
          <AdminTableToolbar
            basePath="/admin/approvals"
            filters={[
              {
                name: "status",
                label: t("queue.stage"),
                value: status,
                options: ["pending", "approved", "changes_requested"].map((value) => ({
                  value,
                  label: value,
                })),
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
