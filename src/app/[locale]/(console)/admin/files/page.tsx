import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DataTable, TablePagination, type Column } from "@/components/admin/data-table";
import { AdminTableToolbar } from "@/components/admin/table-toolbar";
import { Badge } from "@/components/ui/badge";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { fileList } from "@/server/admin/lists";
import { requireAdminSection } from "@/server/admin/guard";

export const metadata: Metadata = {
  title: "Files",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Files across every project.
 *
 * Internal files appear here and nowhere a customer can reach. The name is a
 * link to the authorized download route, never to the blob store directly --
 * a URL in this table must not be a URL anyone can replay.
 */
export default async function AdminFilesPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/files">) {
  const context = await requireAdminSection("files");
  const { locale } = await params;
  const query = await searchParams;

  const t = await getTranslations("adminConsole");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  const kind = typeof query.kind === "string" ? query.kind : undefined;
  const page =
    Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1;
  const result = await fileList({ kind, page }, context);

  const when = (value: Date) =>
    new Intl.DateTimeFormat(intlTag, { dateStyle: "short" }).format(value);
  const size = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

  type Row = (typeof result.rows)[number];
  const columns: Column<Row>[] = [
    {
      id: "name",
      header: t("sections.files"),
      mobile: "primary",
      cell: (row) => row.name,
    },
    {
      id: "project",
      header: t("queue.project"),
      mobile: "secondary",
      cell: (row) => <span data-numeric>{row.projectReference}</span>,
    },
    { id: "kind", header: "Kind", mobile: "secondary", cell: (row) => row.kind },
    {
      id: "visibility",
      header: "Visibility",
      mobile: "meta",
      cell: (row) => (
        <Badge tone={row.visibility === "internal" ? "warning" : "neutral"}>
          {row.visibility}
        </Badge>
      ),
    },
    {
      id: "version",
      header: "v",
      mobile: "secondary",
      align: "end",
      cell: (row) => <span data-numeric>{row.version}</span>,
    },
    {
      id: "size",
      header: "Size",
      mobile: "hidden",
      wide: true,
      align: "end",
      cell: (row) => <span data-numeric>{size(row.sizeBytes)}</span>,
    },
    {
      id: "created",
      header: t("customers.joined"),
      mobile: "hidden",
      wide: true,
      cell: (row) => <span data-numeric>{when(row.createdAt)}</span>,
    },
  ];

  const hrefFor = (next: number) => {
    const qs = new URLSearchParams();
    if (kind) qs.set("kind", kind);
    if (next > 1) qs.set("page", String(next));
    const value = qs.toString();
    return `/admin/files${value ? `?${value}` : ""}`;
  };

  return (
    <AdminShell role={context.user.role} active="files">
      <AdminPageHeader title={t("sections.files")} />
      <DataTable
        rows={result.rows}
        columns={columns}
        rowKey={(row) => row.id}
        href={(row) => `/admin/projects/${row.projectReference}`}
        caption={t("sections.files")}
        filtered={Boolean(kind)}
        empty={{ title: t("table.empty") }}
        toolbar={
          <AdminTableToolbar
            basePath="/admin/files"
            filters={[
              {
                name: "kind",
                label: "Kind",
                value: kind,
                options: [
                  "customer_upload",
                  "design_asset",
                  "document",
                  "generated",
                  "deliverable",
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
