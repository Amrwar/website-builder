import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DataTable, TablePagination, type Column } from "@/components/admin/data-table";
import { AdminTableToolbar } from "@/components/admin/table-toolbar";
import { Badge } from "@/components/ui/badge";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { viewerDates } from "@/server/i18n";
import { orderList } from "@/server/admin/lists";
import { requireAdminSection } from "@/server/admin/guard";

export const metadata: Metadata = {
  title: "Payments",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
import { formatMoney, money, type Currency } from "@/lib/pricing/money";

/** Orders and what has been collected against them. */
export default async function AdminPaymentsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/payments">) {
  const context = await requireAdminSection("payments");
  const { locale } = await params;
  const query = await searchParams;

  const t = await getTranslations("adminConsole");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));
  const dates = await viewerDates(locale);

  const search = typeof query.q === "string" && query.q !== "" ? query.q : undefined;
  const status = typeof query.status === "string" ? query.status : undefined;
  const page =
    Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1;
  const result = await orderList({ search, status, page }, context);

  const when = (value: Date | null) => dates.date(value, "short");

  type Row = (typeof result.rows)[number];
  const columns: Column<Row>[] = [
    {
      id: "number",
      header: t("payments.order"),
      mobile: "primary",
      cell: (row) => <span data-numeric>{row.number}</span>,
    },
    {
      id: "customer",
      header: t("payments.customer"),
      mobile: "secondary",
      cell: (row) => row.customerName ?? row.customerEmail,
    },
    {
      id: "total",
      header: t("payments.total"),
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
      header: t("payments.status"),
      mobile: "meta",
      cell: (row) => (
        <Badge
          tone={
            row.status === "paid" || row.status === "completed"
              ? "success"
              : row.status === "failed" || row.status === "cancelled"
                ? "danger"
                : "neutral"
          }
        >
          {row.status}
        </Badge>
      ),
    },
    {
      id: "paid",
      header: t("payments.paid"),
      mobile: "secondary",
      wide: true,
      cell: (row) => <span data-numeric>{when(row.paidAt)}</span>,
    },
  ];

  const hrefFor = (next: number) => {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    if (status) qs.set("status", status);
    if (next > 1) qs.set("page", String(next));
    const value = qs.toString();
    return `/admin/payments${value ? `?${value}` : ""}`;
  };

  return (
    <AdminShell role={context.user.role} active="payments">
      <AdminPageHeader title={t("payments.title")} subtitle={t("payments.subtitle")} />
      <DataTable
        rows={result.rows}
        columns={columns}
        rowKey={(row) => row.id}
        caption={t("payments.title")}
        filtered={Boolean(search || status)}
        outOfRange={result.page > result.pageCount}
        empty={{ title: t("payments.empty") }}
        toolbar={
          <AdminTableToolbar
            basePath="/admin/payments"
            search={search}
            filters={[
              {
                name: "status",
                label: t("payments.status"),
                value: status,
                options: [
                  "pending_payment",
                  "paid",
                  "failed",
                  "refunded",
                  "partially_refunded",
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
