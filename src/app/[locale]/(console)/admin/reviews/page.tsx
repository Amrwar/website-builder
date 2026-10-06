import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { ReviewActions } from "@/components/admin/growth/growth-controls";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { requireAdminSection } from "@/server/admin/guard";
import { reviewQueue } from "@/server/growth/reviews";

export const metadata: Metadata = {
  title: "Reviews",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Review moderation.
 *
 * Rendered as cards rather than a table because the thing being judged is a
 * paragraph of somebody's writing, and a table cell truncates exactly the part
 * a moderator needs to read.
 */
export default async function AdminReviewsPage({
  params,
}: PageProps<"/[locale]/admin/reviews">) {
  const context = await requireAdminSection("reviews");
  const { locale } = await params;

  const t = await getTranslations("adminConsole.reviewsPage");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  const rows = await reviewQueue(context);

  const date = (value: Date | null) =>
    value ? new Intl.DateTimeFormat(intlTag, { dateStyle: "medium" }).format(value) : "—";

  return (
    <AdminShell role={context.user.role} active="reviews">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="mb-6">
        <Callout tone="info" title={t("moderationNote")} />
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyBody")} />
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map(({ review, projectReference, authorEmail }) => (
            <li key={review.id}>
              <Card padding="lg" className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-body-sm text-primary" data-numeric>
                        {projectReference}
                      </span>
                      <Badge
                        tone={
                          review.status === "approved"
                            ? "success"
                            : review.status === "rejected"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {t(`columns.status`)}: {review.status}
                      </Badge>
                      {review.publishedAt ? (
                        <Badge tone="success">{t("columns.published")}</Badge>
                      ) : null}
                    </span>
                    <span className="text-caption text-tertiary">
                      {authorEmail} ·{" "}
                      {review.consentToPublish
                        ? (review.authorDisplayName ?? t("anonymous"))
                        : t("noConsent")}
                      {" · "}
                      {date(review.submittedAt)}
                    </span>
                  </div>

                  {review.rating ? (
                    <span className="text-display-sm text-primary" data-numeric>
                      {review.rating}/5
                    </span>
                  ) : null}
                </div>

                {review.body ? (
                  <p className="text-body-sm whitespace-pre-line text-secondary">
                    {review.body}
                  </p>
                ) : null}

                {review.moderationNote ? (
                  <p className="text-caption text-warning">{review.moderationNote}</p>
                ) : null}

                <ReviewActions
                  reviewId={review.id}
                  status={review.status}
                  published={review.publishedAt !== null}
                />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
