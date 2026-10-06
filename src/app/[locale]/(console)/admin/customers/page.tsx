import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DataTable, TablePagination, type Column } from "@/components/admin/data-table";
import { AdminTableToolbar } from "@/components/admin/table-toolbar";
import { Callout } from "@/components/ui/callout";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { customerList, type CustomerRow } from "@/server/admin/queries";
import { requireAdminSection } from "@/server/admin/guard";

export const metadata: Metadata = {
  title: "Customers",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Customer management.
 *
 * Commercial detail -- billing country, tax identifier -- is stripped in the
 * query for roles without `customer:read:sensitive`, not hidden in this
 * template. A designer opening this page is never sent the data in the first
 * place, so no rendering mistake can leak it.
 */
export default async function AdminCustomersPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/customers">) {
  const context = await requireAdminSection("customers");
  const { locale } = await params;
  const query = await searchParams;

  const t = await getTranslations("adminConsole");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  const search = typeof query.q === "string" && query.q !== "" ? query.q : undefined;
  const sort = query.sort === "name" ? "name" : "joined";
  const page =
    Number.parseInt(typeof query.page === "string" ? query.page : "1", 10) || 1;

  const seesSensitive = context.can("customer:read:sensitive");
  const result = await customerList({ search, sort, page }, context);

  const date = (value: Date) =>
    new Intl.DateTimeFormat(intlTag, { dateStyle: "medium" }).format(value);

  const columns: Column<CustomerRow>[] = [
    {
      id: "name",
      header: t("customers.name"),
      mobile: "primary",
      cell: (row) => row.displayName ?? row.email,
    },
    {
      id: "email",
      header: t("customers.email"),
      mobile: "secondary",
      cell: (row) => row.email,
    },
    {
      id: "business",
      header: t("customers.business"),
      mobile: "secondary",
      wide: true,
      cell: (row) => row.businessName ?? t("common.none"),
    },
    {
      id: "projects",
      header: t("customers.projects"),
      mobile: "meta",
      align: "end",
      cell: (row) => <span data-numeric>{row.projectCount}</span>,
    },
    ...(seesSensitive
      ? ([
          {
            id: "country",
            header: t("customers.country"),
            mobile: "hidden",
            wide: true,
            cell: (row: CustomerRow) => row.billingCountry ?? t("common.none"),
          },
        ] satisfies Column<CustomerRow>[])
      : []),
    {
      id: "joined",
      header: t("customers.joined"),
      mobile: "hidden",
      wide: true,
      cell: (row) => <span data-numeric>{date(row.createdAt)}</span>,
    },
  ];

  const hrefFor = (next: number) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (query.sort === "name") params.set("sort", "name");
    if (next > 1) params.set("page", String(next));
    const qs = params.toString();
    return `/admin/customers${qs ? `?${qs}` : ""}`;
  };

  return (
    <AdminShell role={context.user.role} active="customers">
      <AdminPageHeader title={t("customers.title")} subtitle={t("customers.subtitle")} />

      {!seesSensitive ? (
        <div className="mb-4">
          <Callout tone="info" title={t("customers.sensitiveHidden")} />
        </div>
      ) : null}

      <DataTable
        rows={result.rows}
        columns={columns}
        rowKey={(row) => row.id}
        href={(row) => `/admin/customers/${row.id}`}
        caption={t("customers.title")}
        filtered={Boolean(search)}
        empty={{ title: t("customers.empty") }}
        toolbar={
          <AdminTableToolbar
            basePath="/admin/customers"
            search={search}
            sorts={[
              { value: "joined", label: t("customers.joined") },
              { value: "name", label: t("customers.name") },
            ]}
            sort={typeof query.sort === "string" ? query.sort : undefined}
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
