import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DataTable, TablePagination, type Column } from "@/components/admin/data-table";
import { RefundActions } from "@/components/admin/refund-actions";
import { AdminTableToolbar } from "@/components/admin/table-toolbar";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { formatMoney, money, type Currency } from "@/lib/pricing/money";
import { requireAdminSection } from "@/server/admin/guard";
import { refundList } from "@/server/admin/lists";

export const metadata: Metadata = {
  title: "Refunds",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Refunds.
 *
 * Reachable by anyone with `billing:manage`, but only `refund:execute` sees
 * the release controls -- and never on a request they raised themselves. Both
 * rules are applied again on the server; what is rendered here only decides
 * whether someone is shown a button they would have been refused anyway.
 */
export default async function AdminRefundsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/refunds">) {
  const context = await requireAdminSection("refunds");
  const { locale } = await params;
  const query = await searchParams;

  const t = await getTranslations("adminConsole");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  const status = typeof query.status === "string" ? query.status : undefined;
  const page =
    Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1;
  const result = await refundList({ status, page }, context);

  const canExecute = context.can("refund:execute");

  const when = (value: Date) =>
    new Intl.DateTimeFormat(intlTag, { dateStyle: "short" }).format(value);

  type Row = (typeof result.rows)[number];
  const columns: Column<Row>[] = [
    {
      id: "reference",
      header: t("refunds.reference"),
      mobile: "primary",
      cell: (row) => <span data-numeric>{row.reference}</span>,
    },
    {
      id: "order",
      header: t("refunds.order"),
      mobile: "secondary",
      cell: (row) => <span data-numeric>{row.orderNumber}</span>,
    },
    {
      id: "amount",
      header: t("refunds.amount"),
      mobile: "secondary",
      align: "end",
      cell: (row) => (
        <span data-numeric>
          {formatMoney(money(row.amountMinorUnits, row.currency as Currency), intlTag)}
        </span>
      ),
    },
    {
      id: "reason",
      header: t("refunds.reason"),
      mobile: "secondary",
      wide: true,
      cell: (row) => t(`refunds.reasons.${row.reason}`),
    },
    {
      id: "status",
      header: t("refunds.status"),
      mobile: "meta",
      cell: (row) => (
        <Badge
          tone={
            row.status === "completed"
              ? "success"
              : row.status === "failed" || row.status === "rejected"
                ? "danger"
                : "warning"
          }
        >
          {t(`refunds.statuses.${row.status}`)}
        </Badge>
      ),
    },
    {
      id: "requestedBy",
      header: t("refunds.requestedBy"),
      mobile: "hidden",
      wide: true,
      cell: (row) => row.requestedBy ?? t("common.none"),
    },
    {
      id: "requested",
      header: t("refunds.requested"),
      mobile: "hidden",
      wide: true,
      cell: (row) => <span data-numeric>{when(row.requestedAt)}</span>,
    },
    {
      id: "actions",
      header: t("table.actions"),
      mobile: "secondary",
      cell: (row) =>
        row.status === "requested" || row.status === "approved" ? (
          <RefundActions
            refundId={row.id}
            canExecute={canExecute}
            isOwnRequest={row.requestedByUserId === context.user.id}
          />
        ) : (
          <span className="text-caption text-tertiary">{t("common.none")}</span>
        ),
    },
  ];

  const hrefFor = (next: number) => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (next > 1) qs.set("page", String(next));
    const value = qs.toString();
    return `/admin/refunds${value ? `?${value}` : ""}`;
  };

  return (
    <AdminShell role={context.user.role} active="refunds">
      <AdminPageHeader title={t("refunds.title")} subtitle={t("refunds.subtitle")} />

      {!canExecute ? (
        <div className="mb-4">
          <Callout tone="info" title={t("refunds.cannotExecute")} />
        </div>
      ) : null}

      <DataTable
        rows={result.rows}
        columns={columns}
        rowKey={(row) => row.id}
        caption={t("refunds.title")}
        filtered={Boolean(status)}
        empty={{ title: t("refunds.empty") }}
        toolbar={
          <AdminTableToolbar
            basePath="/admin/refunds"
            filters={[
              {
                name: "status",
                label: t("refunds.status"),
                value: status,
                options: (
                  [
                    "requested",
                    "approved",
                    "rejected",
                    "processing",
                    "completed",
                    "failed",
                  ] as const
                ).map((value) => ({ value, label: t(`refunds.statuses.${value}`) })),
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
