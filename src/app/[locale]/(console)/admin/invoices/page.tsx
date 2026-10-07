import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DataTable, TablePagination, type Column } from "@/components/admin/data-table";
import { AdminTableToolbar } from "@/components/admin/table-toolbar";
import { Badge } from "@/components/ui/badge";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { viewerDates } from "@/server/i18n";
import { invoiceList } from "@/server/admin/lists";
import { requireAdminSection } from "@/server/admin/guard";

export const metadata: Metadata = {
  title: "Invoices",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
import { formatMoney, money, type Currency } from "@/lib/pricing/money";

/** Issued invoices. Immutable once issued; this view is read-only. */
export default async function AdminInvoicesPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/invoices">) {
  const context = await requireAdminSection("invoices");
  const { locale } = await params;
  const query = await searchParams;

  const t = await getTranslations("adminConsole");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));
  const dates = await viewerDates(locale);

  const search = typeof query.q === "string" && query.q !== "" ? query.q : undefined;
  const page =
    Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1;
  const result = await invoiceList({ search, page }, context);

  const when = (value: Date | null) => dates.date(value, "short");

  type Row = (typeof result.rows)[number];
  const columns: Column<Row>[] = [
    {
      id: "number",
      header: t("invoices.number"),
      mobile: "primary",
      cell: (row) => <span data-numeric>{row.number}</span>,
    },
    {
      id: "billedTo",
      header: t("invoices.billedTo"),
      mobile: "secondary",
      cell: (row) => row.billToName,
    },
    {
      id: "total",
      header: t("invoices.total"),
      mobile: "secondary",
      align: "end",
      cell: (row) => (
        <span data-numeric>
          {formatMoney(money(row.totalMinorUnits, row.currency as Currency), intlTag)}
        </span>
      ),
    },
    {
      id: "status",
      header: t("invoices.status"),
      mobile: "meta",
      cell: (row) => (
        <Badge tone={row.status === "paid" ? "success" : "neutral"}>{row.status}</Badge>
      ),
    },
    {
      id: "issued",
      header: t("invoices.issued"),
      mobile: "secondary",
      wide: true,
      cell: (row) => <span data-numeric>{when(row.issuedAt)}</span>,
    },
  ];

  const hrefFor = (next: number) => {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    if (next > 1) qs.set("page", String(next));
    const value = qs.toString();
    return `/admin/invoices${value ? `?${value}` : ""}`;
  };

  return (
    <AdminShell role={context.user.role} active="invoices">
      <AdminPageHeader title={t("invoices.title")} subtitle={t("invoices.subtitle")} />
      <DataTable
        rows={result.rows}
        columns={columns}
        rowKey={(row) => row.id}
        caption={t("invoices.title")}
        filtered={Boolean(search)}
        outOfRange={result.page > result.pageCount}
        empty={{ title: t("invoices.empty") }}
        toolbar={<AdminTableToolbar basePath="/admin/invoices" search={search} />}
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
