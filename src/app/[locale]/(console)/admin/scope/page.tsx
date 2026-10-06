import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DataTable, TablePagination, type Column } from "@/components/admin/data-table";
import { AdminTableToolbar } from "@/components/admin/table-toolbar";
import { Badge } from "@/components/ui/badge";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { scopeList } from "@/server/admin/lists";
import { requireAdminSection } from "@/server/admin/guard";

export const metadata: Metadata = {
  title: "Scope",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Scope across every project.
 *
 * Assessments are append-only, so what is shown is what was agreed at the time
 * -- not a recomputation against today's rules. The change count is the number
 * that matters: a project with four approved changes no longer matches the
 * scope it was sold at, and that has to be visible.
 */
export default async function AdminScopePage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/scope">) {
  const context = await requireAdminSection("scope");
  const { locale } = await params;
  const query = await searchParams;

  const t = await getTranslations("adminConsole");
  const tTier = await getTranslations("orderLines.tier");
  getLocaleDefinition(resolveLocale(locale));

  const tier = typeof query.tier === "string" ? query.tier : undefined;
  const page =
    Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1;
  const result = await scopeList({ tier, page }, context);

  type Row = (typeof result.rows)[number];
  const columns: Column<Row>[] = [
    {
      id: "reference",
      header: t("queue.project"),
      mobile: "primary",
      cell: (row) => <span data-numeric>{row.reference}</span>,
    },
    {
      id: "tier",
      header: t("scopeView.tier"),
      mobile: "meta",
      cell: (row) => (
        <Badge tone="info">{row.scopeTier ? tTier(row.scopeTier) : "—"}</Badge>
      ),
    },
    {
      id: "product",
      header: t("queue.product"),
      mobile: "secondary",
      cell: (row) => row.productType,
    },
    {
      id: "days",
      header: t("pricing.days"),
      mobile: "secondary",
      align: "end",
      cell: (row) => <span data-numeric>{row.guaranteedDays ?? "—"}</span>,
    },
    {
      id: "changes",
      header: t("scopeView.changes"),
      mobile: "secondary",
      align: "end",
      wide: true,
      cell: (row) => <span data-numeric>{row.changeCount}</span>,
    },
  ];

  const hrefFor = (next: number) => {
    const qs = new URLSearchParams();
    if (tier) qs.set("tier", tier);
    if (next > 1) qs.set("page", String(next));
    const value = qs.toString();
    return `/admin/scope${value ? `?${value}` : ""}`;
  };

  return (
    <AdminShell role={context.user.role} active="scope">
      <AdminPageHeader title={t("scopeView.title")} subtitle={t("scopeView.subtitle")} />
      <DataTable
        rows={result.rows}
        columns={columns}
        rowKey={(row) => row.id}
        href={(row) => `/admin/projects/${row.reference}`}
        caption={t("scopeView.title")}
        filtered={Boolean(tier)}
        empty={{ title: t("queue.empty"), description: t("scopeView.historical") }}
        toolbar={
          <AdminTableToolbar
            basePath="/admin/scope"
            filters={[
              {
                name: "tier",
                label: t("scopeView.tier"),
                value: tier,
                options: ["essential", "extended", "advanced", "custom"].map((value) => ({
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
