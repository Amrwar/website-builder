import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DataTable, TablePagination, type Column } from "@/components/admin/data-table";
import { RiskBadge } from "@/components/admin/risk-badge";
import { AdminTableToolbar } from "@/components/admin/table-toolbar";
import { Badge } from "@/components/ui/badge";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import type { RiskLevel } from "@/lib/production/risk";
import { productionQueue, type QueueRow } from "@/server/admin/queries";
import { requireAdminSection } from "@/server/admin/guard";
import { workingDaysBetween } from "@/lib/schedule/deadline";

export const metadata: Metadata = {
  title: "Production queue",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const RISK_VALUES: RiskLevel[] = ["red", "yellow", "green"];

/**
 * The production queue.
 *
 * The screen the company runs on. Sorted by deadline by default, because the
 * only question it exists to answer is what needs attention first.
 *
 * Filtering and sorting are in the URL rather than in component state, so a
 * view can be linked to, reloaded and shared -- "look at the red ones" is a
 * message someone sends a colleague, and that should survive being pasted.
 */
export default async function ProductionQueuePage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/queue">) {
  const context = await requireAdminSection("queue");
  const { locale } = await params;
  const query = await searchParams;

  const t = await getTranslations("adminConsole");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  const read = (key: string): string | undefined => {
    const value = query[key];
    return typeof value === "string" && value !== "" ? value : undefined;
  };

  const risk = read("risk");
  const search = read("q");
  const sort = read("sort") as "deadline" | "risk" | "started" | "reference" | undefined;
  const page = Number.parseInt(read("page") ?? "1", 10) || 1;

  const result = await productionQueue(
    {
      risk:
        risk && RISK_VALUES.includes(risk as RiskLevel) ? [risk as RiskLevel] : undefined,
      search,
      sort,
      page,
    },
    context,
  );

  const date = (value: Date | null) =>
    value ? new Intl.DateTimeFormat(intlTag, { dateStyle: "short" }).format(value) : "—";

  const remaining = (deadlineAt: Date | null) => {
    if (!deadlineAt) return t("queue.noDeadline");
    const days = workingDaysBetween(new Date(), deadlineAt);
    return days < 0
      ? t("queue.overdueBy", { days: Math.abs(days) })
      : t("queue.daysLeft", { days });
  };

  const columns: Column<QueueRow>[] = [
    {
      id: "project",
      header: t("queue.project"),
      mobile: "primary",
      cell: (row) => <span data-numeric>{row.project.reference}</span>,
    },
    {
      id: "customer",
      header: t("queue.customer"),
      mobile: "secondary",
      cell: (row) => row.customerName,
    },
    {
      id: "product",
      header: t("queue.product"),
      mobile: "hidden",
      wide: true,
      cell: (row) => row.project.productType,
    },
    {
      id: "stage",
      header: t("queue.stage"),
      mobile: "secondary",
      cell: (row) => (
        <Badge tone="neutral">
          {t(`projectStatus.${row.project.status as "in_build"}`)}
        </Badge>
      ),
    },
    {
      id: "deadline",
      header: t("queue.deadline"),
      mobile: "secondary",
      cell: (row) => <span data-numeric>{date(row.project.deadlineAt)}</span>,
    },
    {
      id: "remaining",
      header: t("queue.remaining"),
      mobile: "hidden",
      cell: (row) => <span data-numeric>{remaining(row.project.deadlineAt)}</span>,
    },
    {
      id: "progress",
      header: t("queue.progress"),
      mobile: "secondary",
      wide: true,
      cell: (row) => (
        <span data-numeric>
          {row.taskTotal > 0 ? `${row.taskDone}/${row.taskTotal}` : "—"}
        </span>
      ),
    },
    {
      id: "risk",
      header: t("queue.risk"),
      mobile: "meta",
      cell: (row) => <RiskBadge level={row.project.riskLevel as RiskLevel} />,
    },
    {
      id: "payment",
      header: t("queue.payment"),
      mobile: "meta",
      wide: true,
      cell: (row) =>
        row.orderStatus ? (
          <Badge tone={row.orderStatus === "paid" ? "success" : "neutral"}>
            {row.orderStatus}
          </Badge>
        ) : (
          "—"
        ),
    },
  ];

  const hrefFor = (nextPage: number) => {
    const next = new URLSearchParams();
    if (risk) next.set("risk", risk);
    if (search) next.set("q", search);
    if (sort) next.set("sort", sort);
    if (nextPage > 1) next.set("page", String(nextPage));
    const qs = next.toString();
    return `/admin/queue${qs ? `?${qs}` : ""}`;
  };

  return (
    <AdminShell role={context.user.role} active="queue">
      <AdminPageHeader title={t("queue.title")} subtitle={t("queue.subtitle")} />

      <DataTable
        rows={result.rows}
        columns={columns}
        rowKey={(row) => row.project.id}
        href={(row) => `/admin/projects/${row.project.reference}`}
        caption={t("queue.title")}
        filtered={Boolean(risk || search)}
        empty={{ title: t("queue.empty"), description: t("queue.emptyHelp") }}
        toolbar={
          <AdminTableToolbar
            basePath="/admin/queue"
            search={search}
            filters={[
              {
                name: "risk",
                label: t("queue.risk"),
                value: risk,
                options: RISK_VALUES.map((value) => ({
                  value,
                  label: t(`risk.${value}`),
                })),
              },
            ]}
            sorts={[
              { value: "deadline", label: t("queue.deadline") },
              { value: "risk", label: t("queue.risk") },
              { value: "started", label: t("queue.started") },
              { value: "reference", label: t("queue.project") },
            ]}
            sort={sort}
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
