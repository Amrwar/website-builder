import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DataTable, TablePagination, type Column } from "@/components/admin/data-table";
import { AdminTableToolbar } from "@/components/admin/table-toolbar";
import { Badge } from "@/components/ui/badge";
import { viewerDates } from "@/server/i18n";
import { messageList } from "@/server/admin/lists";
import { requireAdminSection } from "@/server/admin/guard";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Conversations across every project.
 *
 * Internal notes and customer replies share a table, so the visibility badge
 * is the most important column on the page: a note written for the team and a
 * message sent to the customer must never look alike at a glance.
 */
export default async function AdminMessagesPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/messages">) {
  const context = await requireAdminSection("messages");
  const { locale } = await params;
  const query = await searchParams;

  const t = await getTranslations("adminConsole");
  const dates = await viewerDates(locale);

  const visibility = typeof query.visibility === "string" ? query.visibility : undefined;
  const page =
    Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1;
  const result = await messageList({ visibility, page }, context);

  const when = (value: Date | null) => dates.dateTime(value);

  type Row = (typeof result.rows)[number];
  const columns: Column<Row>[] = [
    {
      id: "body",
      header: t("sections.messages"),
      mobile: "primary",
      cell: (row) => <span className="line-clamp-2 max-w-md">{row.body}</span>,
    },
    {
      id: "project",
      header: t("queue.project"),
      mobile: "secondary",
      cell: (row) => <span data-numeric>{row.projectReference}</span>,
    },
    { id: "author", header: "From", mobile: "secondary", cell: (row) => row.authorName },
    {
      id: "visibility",
      header: "Visibility",
      mobile: "meta",
      cell: (row) => (
        <Badge tone={row.visibility === "internal" ? "warning" : "success"}>
          {row.visibility}
        </Badge>
      ),
    },
    {
      id: "when",
      header: t("audit.when"),
      mobile: "secondary",
      wide: true,
      cell: (row) => <span data-numeric>{when(row.createdAt)}</span>,
    },
  ];

  const hrefFor = (next: number) => {
    const qs = new URLSearchParams();
    if (visibility) qs.set("visibility", visibility);
    if (next > 1) qs.set("page", String(next));
    const value = qs.toString();
    return `/admin/messages${value ? `?${value}` : ""}`;
  };

  return (
    <AdminShell role={context.user.role} active="messages">
      <AdminPageHeader title={t("sections.messages")} />
      <DataTable
        rows={result.rows}
        columns={columns}
        rowKey={(row) => row.id}
        href={(row) => `/admin/projects/${row.projectReference}`}
        caption={t("sections.messages")}
        filtered={Boolean(visibility)}
        outOfRange={result.page > result.pageCount}
        empty={{ title: t("table.empty") }}
        toolbar={
          <AdminTableToolbar
            basePath="/admin/messages"
            filters={[
              {
                name: "visibility",
                label: "Visibility",
                value: visibility,
                options: [
                  { value: "customer", label: "customer" },
                  { value: "internal", label: "internal" },
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
