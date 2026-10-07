import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DataTable, TablePagination, type Column } from "@/components/admin/data-table";
import { AdminTableToolbar } from "@/components/admin/table-toolbar";
import { Badge } from "@/components/ui/badge";
import { Numeric } from "@/components/ui/numeric";
import { NOTIFICATION_KIND_IDS } from "@/config/notifications";
import { notificationList, type AdminNotificationRow } from "@/server/admin/lists";
import { requireAdminSection } from "@/server/admin/guard";
import { viewerDates } from "@/server/i18n";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * What the platform has told people, and whether it reached them.
 *
 * This section was a declared-but-unbuilt placeholder promising "Phase 12".
 * Phase 12 shipped the growth engine and never covered notifications; the
 * notifications themselves arrived in Phase 13. So the page was claiming a
 * passed phase would deliver something that already existed — worse than an
 * empty table, because it was actively wrong.
 *
 * The useful question here is not what a message said, it is whether it got
 * out. Email delivery is best-effort and silent when it fails, so the delivery
 * column is the reason to open this page at all.
 */
export default async function AdminNotificationsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/notifications">) {
  const context = await requireAdminSection("notifications");
  const { locale } = await params;
  const query = await searchParams;

  const t = await getTranslations("adminConsole");
  // Short names for the list, not the message titles: a title is written
  // for the person it is sent to and carries their reference in it, so as a
  // column value it read "Invoice —" and as a filter chip, just "—".
  const tKind = await getTranslations("adminConsole.notificationsView.kinds");
  const dates = await viewerDates(locale);

  const kind = typeof query.kind === "string" ? query.kind : undefined;
  const page = Number(query.page) || 1;

  const result = await notificationList({ kind, page }, context);

  const hrefFor = (next: number) => {
    const search = new URLSearchParams();
    if (kind) search.set("kind", kind);
    if (next > 1) search.set("page", String(next));
    const qs = search.toString();
    return `/admin/notifications${qs ? `?${qs}` : ""}`;
  };

  /**
   * One of four states, and they are genuinely different: never attempted
   * (the kind does not email, or no provider is configured), sent, failed, or
   * still in flight. Collapsing "not attempted" into "failed" would make a
   * deployment without an email provider look like a backlog of errors.
   */
  const delivery = (row: AdminNotificationRow) => {
    if (row.emailSentAt) {
      return <Badge tone="success">{t("notificationsView.sent")}</Badge>;
    }
    if (row.emailFailedAt) {
      return (
        <span className="flex flex-col items-start gap-1">
          <Badge tone="danger">{t("notificationsView.failed")}</Badge>
          {/* The provider's reason, which is the only actionable part. A red
              badge on its own tells staff something is wrong and nothing about
              what, which means opening the logs for every row. */}
          {row.emailError ? (
            <span className="text-caption break-all text-tertiary">{row.emailError}</span>
          ) : null}
        </span>
      );
    }
    if (row.emailAttemptedAt) {
      return <Badge tone="info">{t("notificationsView.inFlight")}</Badge>;
    }
    return <Badge tone="neutral">{t("notificationsView.notEmailed")}</Badge>;
  };

  const columns: Column<AdminNotificationRow>[] = [
    {
      id: "kind",
      header: t("notificationsView.columns.kind"),
      mobile: "primary",
      cell: (row) => tKind(row.kind),
    },
    {
      id: "recipient",
      header: t("notificationsView.columns.recipient"),
      mobile: "secondary",
      cell: (row) => (
        <span className="flex flex-col">
          <span>{row.recipientName ?? "—"}</span>
          <Numeric className="text-caption text-tertiary">{row.recipientEmail}</Numeric>
        </span>
      ),
    },
    {
      id: "language",
      header: t("notificationsView.columns.language"),
      mobile: "meta",
      cell: (row) => <Numeric>{row.locale}</Numeric>,
    },
    {
      id: "delivery",
      header: t("notificationsView.columns.delivery"),
      mobile: "meta",
      cell: delivery,
    },
    {
      id: "read",
      header: t("notificationsView.columns.read"),
      mobile: "secondary",
      cell: (row) =>
        row.readAt ? (
          <Numeric>{dates.dateTime(row.readAt)}</Numeric>
        ) : (
          <span className="text-tertiary">{t("notificationsView.unread")}</span>
        ),
    },
    {
      id: "sent",
      header: t("notificationsView.columns.created"),
      mobile: "secondary",
      cell: (row) => <Numeric>{dates.dateTime(row.createdAt)}</Numeric>,
    },
  ];

  return (
    <AdminShell role={context.user.role} active="notifications">
      <AdminPageHeader
        title={t("sections.notifications")}
        subtitle={t("notificationsView.subtitle")}
      />

      <DataTable
        rows={result.rows}
        columns={columns}
        rowKey={(row) => row.id}
        caption={t("sections.notifications")}
        filtered={Boolean(kind)}
        outOfRange={result.page > result.pageCount}
        empty={{
          title: t("notificationsView.empty"),
          description: t("notificationsView.emptyBody"),
        }}
        toolbar={
          <AdminTableToolbar
            basePath="/admin/notifications"
            filters={[
              {
                name: "kind",
                label: t("notificationsView.columns.kind"),
                value: kind,
                options: NOTIFICATION_KIND_IDS.map((id) => ({
                  value: id,
                  label: tKind(id),
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
