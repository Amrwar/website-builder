import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DataTable, type Column } from "@/components/admin/data-table";
import { RoleSelector } from "@/components/admin/role-selector";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { assignableRoles, canManageUser, type UserRole } from "@/config/roles";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { requireAdminSection } from "@/server/admin/guard";
import { staffList } from "@/server/admin/queries";

export const metadata: Metadata = {
  title: "Team",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The team, and who may change whose role.
 *
 * The selector offers only roles the signed-in actor can actually grant, and
 * rows for people who outrank them are read-only with the reason stated. Both
 * are conveniences: the server applies the same rank rules on every attempt,
 * and records refusals.
 */
export default async function AdminTeamPage({
  params,
}: PageProps<"/[locale]/admin/team">) {
  const context = await requireAdminSection("team");
  const { locale } = await params;

  const t = await getTranslations("adminConsole");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  const members = await staffList(context);
  const actorRole = context.user.role;

  const options = assignableRoles(actorRole).map((role) => ({
    value: role,
    label: t(`roleNames.${role}`),
  }));

  const when = (value: Date) =>
    new Intl.DateTimeFormat(intlTag, { dateStyle: "medium" }).format(value);

  type Row = (typeof members)[number];
  const columns: Column<Row>[] = [
    {
      id: "member",
      header: t("team.member"),
      mobile: "primary",
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          {row.displayName ?? row.email}
          {row.id === context.user.id ? (
            <Badge tone="info">{t("team.self")}</Badge>
          ) : null}
        </span>
      ),
    },
    {
      id: "email",
      header: t("customers.email"),
      mobile: "secondary",
      cell: (row) => row.email,
    },
    {
      id: "role",
      header: t("team.role"),
      mobile: "meta",
      cell: (row) => <Badge tone="neutral">{t(`roleNames.${row.role}`)}</Badge>,
    },
    {
      id: "joined",
      header: t("customers.joined"),
      mobile: "hidden",
      wide: true,
      cell: (row) => <span data-numeric>{when(row.createdAt)}</span>,
    },
    {
      id: "change",
      header: t("team.change"),
      mobile: "secondary",
      cell: (row) => (
        <RoleSelector
          userId={row.id}
          currentRole={row.role as UserRole}
          options={options}
          // Nobody edits their own role, and nobody edits someone who
          // outranks them. Both are re-checked server-side.
          disabled={
            row.id === context.user.id || !canManageUser(actorRole, row.role as UserRole)
          }
          // Two different refusals, two different sentences: "you cannot do
          // this to yourself" and "you cannot do this to them" are not the
          // same message, and conflating them reads as a bug.
          disabledReason={
            row.id === context.user.id
              ? t("team.cannotManageSelf")
              : t("team.cannotManage")
          }
        />
      ),
    },
  ];

  return (
    <AdminShell role={actorRole} active="team">
      <AdminPageHeader title={t("team.title")} subtitle={t("team.subtitle")} />

      <div className="mb-4">
        <Callout tone="info" title={t("team.changeBody")} />
      </div>

      <DataTable
        rows={members}
        columns={columns}
        rowKey={(row) => row.id}
        caption={t("team.title")}
        empty={{ title: t("table.empty") }}
      />
    </AdminShell>
  );
}
