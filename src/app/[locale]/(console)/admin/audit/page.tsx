import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DataTable, TablePagination, type Column } from "@/components/admin/data-table";
import { AdminTableToolbar } from "@/components/admin/table-toolbar";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { AUDIT_CATEGORIES, type AuditCategory } from "@/db/schema/enums";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { readAuditLog } from "@/server/admin/audit";
import { requireAdminSection } from "@/server/admin/guard";
import type { AuditEvent } from "@/db/schema";

export const metadata: Metadata = {
  title: "Audit log",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Row = AuditEvent & { actorName: string | null };

/**
 * The audit log.
 *
 * Read-only, and visibly so. There is no edit control on this page and no
 * update path behind it -- a log the console can amend is not evidence of
 * anything.
 */
export default async function AdminAuditPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/audit">) {
  const context = await requireAdminSection("audit");
  const { locale } = await params;
  const query = await searchParams;

  const t = await getTranslations("adminConsole");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  const rawCategory = typeof query.category === "string" ? query.category : undefined;
  const category = AUDIT_CATEGORIES.includes(rawCategory as AuditCategory)
    ? (rawCategory as AuditCategory)
    : undefined;
  const search = typeof query.q === "string" && query.q !== "" ? query.q : undefined;
  const page =
    Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1;

  const result = await readAuditLog({ category, search, page }, context);

  const when = (value: Date) =>
    new Intl.DateTimeFormat(intlTag, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(value);

  const columns: Column<Row>[] = [
    {
      id: "action",
      header: t("audit.action"),
      mobile: "primary",
      cell: (row) => <span className="font-mono text-caption">{row.action}</span>,
    },
    {
      id: "actor",
      header: t("audit.actor"),
      mobile: "secondary",
      cell: (row) => row.actorName ?? row.actorEmail ?? t("common.none"),
    },
    {
      id: "subject",
      header: t("audit.subject"),
      mobile: "secondary",
      cell: (row) => row.subjectLabel ?? row.subjectType,
    },
    {
      id: "category",
      header: t("audit.category"),
      mobile: "meta",
      cell: (row) => (
        <Badge tone={row.category === "security" ? "warning" : "neutral"}>
          {t(`audit.categories.${row.category}`)}
        </Badge>
      ),
    },
    {
      id: "when",
      header: t("audit.when"),
      mobile: "secondary",
      cell: (row) => <span data-numeric>{when(row.occurredAt)}</span>,
    },
    {
      id: "reason",
      header: t("audit.reason"),
      mobile: "hidden",
      wide: true,
      cell: (row) => row.reason ?? t("common.none"),
    },
  ];

  const hrefFor = (next: number) => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (search) params.set("q", search);
    if (next > 1) params.set("page", String(next));
    const qs = params.toString();
    return `/admin/audit${qs ? `?${qs}` : ""}`;
  };

  return (
    <AdminShell role={context.user.role} active="audit">
      <AdminPageHeader title={t("audit.title")} subtitle={t("audit.subtitle")} />

      <div className="mb-4">
        <Callout tone="info" title={t("audit.immutable")}>
          <Lock className="size-3.5" aria-hidden />
        </Callout>
      </div>

      <DataTable
        rows={result.rows}
        columns={columns}
        rowKey={(row) => row.id}
        caption={t("audit.title")}
        filtered={Boolean(category || search)}
        empty={{ title: t("audit.empty") }}
        toolbar={
          <AdminTableToolbar
            basePath="/admin/audit"
            search={search}
            filters={[
              {
                name: "category",
                label: t("audit.category"),
                value: category,
                options: AUDIT_CATEGORIES.map((value) => ({
                  value,
                  label: t(`audit.categories.${value}`),
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
