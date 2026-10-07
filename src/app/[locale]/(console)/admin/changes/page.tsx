import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DataTable, TablePagination, type Column } from "@/components/admin/data-table";
import { AdminTableToolbar } from "@/components/admin/table-toolbar";
import { Badge } from "@/components/ui/badge";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { changeRequestList } from "@/server/admin/lists";
import { requireAdminSection } from "@/server/admin/guard";

export const metadata: Metadata = {
  title: "Change requests",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
import { formatMoney, money, type Currency } from "@/lib/pricing/money";

/**
 * Change requests across every project.
 *
 * Price and time impact sit in the table because they are the whole point: a
 * change with neither has not been assessed yet, and one with both is a
 * commercial offer waiting on a customer.
 */
export default async function AdminChangesPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/changes">) {
  const context = await requireAdminSection("changes");
  const { locale } = await params;
  const query = await searchParams;

  const t = await getTranslations("adminConsole");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  const status = typeof query.status === "string" ? query.status : undefined;
  const page =
    Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1;
  const result = await changeRequestList({ status, page }, context);

  type Row = (typeof result.rows)[number];
  const columns: Column<Row>[] = [
    {
      id: "title",
      header: t("scopeView.changes"),
      mobile: "primary",
      cell: (row) => row.title,
    },
    {
      id: "project",
      header: t("queue.project"),
      mobile: "secondary",
      cell: (row) => <span data-numeric>{row.projectReference}</span>,
    },
    {
      id: "status",
      header: t("queue.stage"),
      mobile: "meta",
      cell: (row) => (
        <Badge tone={row.status === "quoted" ? "warning" : "neutral"}>{row.status}</Badge>
      ),
    },
    {
      id: "price",
      header: t("refunds.amount"),
      mobile: "secondary",
      align: "end",
      cell: (row) =>
        row.priceImpactMinorUnits === null ? (
          "—"
        ) : (
          <span data-numeric>
            {formatMoney(
              money(row.priceImpactMinorUnits, row.currency as Currency),
              intlTag,
            )}
          </span>
        ),
    },
    {
      id: "days",
      header: t("pricing.days"),
      mobile: "secondary",
      align: "end",
      wide: true,
      cell: (row) => <span data-numeric>{row.additionalDays ?? "—"}</span>,
    },
  ];

  const hrefFor = (next: number) => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (next > 1) qs.set("page", String(next));
    const value = qs.toString();
    return `/admin/changes${value ? `?${value}` : ""}`;
  };

  return (
    <AdminShell role={context.user.role} active="changes">
      <AdminPageHeader title={t("sections.changes")} />
      <DataTable
        rows={result.rows}
        columns={columns}
        rowKey={(row) => row.id}
        href={(row) => `/admin/projects/${row.projectReference}`}
        caption={t("sections.changes")}
        filtered={Boolean(status)}
        outOfRange={result.page > result.pageCount}
        empty={{ title: t("table.empty") }}
        toolbar={
          <AdminTableToolbar
            basePath="/admin/changes"
            filters={[
              {
                name: "status",
                label: t("queue.stage"),
                value: status,
                options: [
                  "submitted",
                  "under_review",
                  "quoted",
                  "approved",
                  "rejected",
                ].map((value) => ({ value, label: value })),
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
