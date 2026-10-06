import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { DataTable } from "@/components/admin/data-table";
import { ReferralActions } from "@/components/admin/growth/growth-controls";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import type { FraudRule } from "@/lib/growth/fraud";
import { formatMinutes } from "@/lib/credits";
import { requireAdminSection } from "@/server/admin/guard";
import { listReferrals, type ReferralRow } from "@/server/admin/growth-queries";

export const metadata: Metadata = {
  title: "Referrals",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Every referral, and what the anti-abuse rules concluded about it.
 *
 * The reasons a referral was held are listed in full rather than summarised as
 * a score. "Held: 0.72" tells whoever is reviewing it nothing; "same network as
 * the referrer" tells them exactly what to look at.
 */
export default async function AdminReferralsPage({
  params,
}: PageProps<"/[locale]/admin/referrals">) {
  const context = await requireAdminSection("referrals");
  const { locale } = await params;

  const t = await getTranslations("adminConsole.referralsPage");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  const rows = await listReferrals(context);
  const held = rows.filter((row) => row.referral.fraudState === "flagged").length;
  const canReverse = context.can("billing:manage");

  const date = (value: Date | null) =>
    value ? new Intl.DateTimeFormat(intlTag, { dateStyle: "medium" }).format(value) : "—";

  return (
    <AdminShell role={context.user.role} active="referrals">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} />

      {held > 0 ? (
        <div className="mb-6">
          <Callout tone="warning" title={t("flaggedNote", { count: held })} />
        </div>
      ) : null}

      <DataTable<ReferralRow>
        rows={rows}
        rowKey={(row) => row.referral.id}
        caption={t("title")}
        empty={{ title: t("empty"), description: t("emptyBody") }}
        columns={[
          {
            id: "referred",
            header: t("columns.referred"),
            mobile: "primary",
            cell: (row) => (
              <span className="flex flex-col">
                <span>{row.referredEmail}</span>
                <span className="text-caption text-tertiary" data-numeric>
                  {date(row.referral.createdAt)}
                </span>
              </span>
            ),
          },
          {
            id: "owner",
            header: t("columns.owner"),
            mobile: "secondary",
            cell: (row) => (
              <span className="flex flex-col">
                <span>{row.referrerEmail ?? "—"}</span>
                <span className="text-caption text-tertiary" data-numeric>
                  {row.code}
                </span>
              </span>
            ),
          },
          {
            id: "status",
            header: t("columns.status"),
            mobile: "meta",
            cell: (row) => (
              <span className="flex flex-col gap-1">
                <Badge tone={row.referral.status === "converted" ? "success" : "neutral"}>
                  {t(`status.${row.referral.status}`)}
                </Badge>
                {row.projectReference ? (
                  <span className="text-caption text-tertiary" data-numeric>
                    {row.projectReference}
                  </span>
                ) : null}
              </span>
            ),
          },
          {
            id: "fraud",
            header: t("columns.fraud"),
            wide: true,
            mobile: "meta",
            cell: (row) => (
              <span className="flex flex-col gap-1">
                <Badge
                  tone={
                    row.referral.fraudState === "blocked"
                      ? "danger"
                      : row.referral.fraudState === "flagged"
                        ? "warning"
                        : "success"
                  }
                >
                  {t(`fraud.${row.referral.fraudState}`)}
                </Badge>
                {/* Named in full. A held referral nobody can explain is a
                    support ticket the customer is right to open. */}
                {row.referral.fraudReasons.map((reason) => (
                  <span key={reason} className="text-caption text-tertiary">
                    {t(`reasons.${reason as FraudRule}`)}
                  </span>
                ))}
              </span>
            ),
          },
          {
            id: "reward",
            header: t("columns.reward"),
            align: "end",
            mobile: "meta",
            cell: (row) => {
              const minutes = formatMinutes(row.referral.rewardMinutes ?? 0);
              return (
                <span className="flex flex-col items-end gap-1">
                  <Badge
                    tone={
                      row.referral.rewardState === "granted"
                        ? "success"
                        : row.referral.rewardState === "clawed_back"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {t(`reward.${row.referral.rewardState}`)}
                  </Badge>
                  {row.referral.rewardMinutes ? (
                    <span className="text-caption text-tertiary" data-numeric>
                      {minutes.hours}h {minutes.minutes}m
                    </span>
                  ) : null}
                  <ReferralActions
                    referralId={row.referral.id}
                    canReverse={canReverse && row.referral.rewardState === "granted"}
                  />
                </span>
              );
            },
          },
        ]}
      />
    </AdminShell>
  );
}
