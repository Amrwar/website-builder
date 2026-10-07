import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DataTable, TablePagination, type Column } from "@/components/admin/data-table";
import { AdminTableToolbar } from "@/components/admin/table-toolbar";
import { Badge } from "@/components/ui/badge";
import { viewerDates } from "@/server/i18n";
import { projectList } from "@/server/admin/lists";
import { requireAdminSection } from "@/server/admin/guard";

export const metadata: Metadata = {
  title: "Projects",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Every project, not only the live ones.
 *
 * The queue shows what is in flight; this is the archive, which is what you
 * need when a customer asks about something delivered last quarter.
 */
export default async function AdminProjectsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/projects">) {
  const context = await requireAdminSection("projects");
  const { locale } = await params;
  const query = await searchParams;

  const t = await getTranslations("adminConsole");
  const dates = await viewerDates(locale);

  const search = typeof query.q === "string" && query.q !== "" ? query.q : undefined;
  const status = typeof query.status === "string" ? query.status : undefined;
  const page =
    Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1;

  const result = await projectList({ search, status, page }, context);
  const date = (value: Date | null) => dates.date(value, "short");

  type Row = (typeof result.rows)[number];
  const columns: Column<Row>[] = [
    {
      id: "reference",
      header: t("queue.project"),
      mobile: "primary",
      cell: (row) => <span data-numeric>{row.reference}</span>,
    },
    {
      id: "customer",
      header: t("queue.customer"),
      mobile: "secondary",
      cell: (row) => row.customerName,
    },
    {
      id: "status",
      header: t("queue.stage"),
      mobile: "meta",
      cell: (row) => (
        <Badge tone="neutral">{t(`projectStatus.${row.status as "in_build"}`)}</Badge>
      ),
    },
    {
      id: "product",
      header: t("queue.product"),
      mobile: "secondary",
      wide: true,
      cell: (row) => row.productType,
    },
    {
      id: "deadline",
      header: t("queue.deadline"),
      mobile: "secondary",
      cell: (row) => <span data-numeric>{date(row.deadlineAt)}</span>,
    },
  ];

  const hrefFor = (next: number) => {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    if (status) qs.set("status", status);
    if (next > 1) qs.set("page", String(next));
    const value = qs.toString();
    return `/admin/projects${value ? `?${value}` : ""}`;
  };

  return (
    <AdminShell role={context.user.role} active="projects">
      <AdminPageHeader title={t("sections.projects")} />
      <DataTable
        rows={result.rows}
        columns={columns}
        rowKey={(row) => row.id}
        href={(row) => `/admin/projects/${row.reference}`}
        caption={t("sections.projects")}
        filtered={Boolean(search || status)}
        outOfRange={result.page > result.pageCount}
        empty={{ title: t("queue.empty") }}
        toolbar={<AdminTableToolbar basePath="/admin/projects" search={search} />}
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
