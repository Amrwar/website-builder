import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  NotificationList,
  type NotificationView,
} from "@/components/account/notification-list";
import { Container } from "@/components/layout/container";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/config/locales";
import { notificationKind, type NotificationKind } from "@/config/notifications";
import { getAuthContext } from "@/server/auth";
import { viewerDates } from "@/server/i18n";
import { notificationsFor, unreadCountFor } from "@/server/notifications";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Everything the platform has told this person.
 *
 * Exists because a notification nobody can go back and read is not a
 * notification: email is best-effort, filters eat it, and the one that matters
 * most -- a missed deadline and the refund choice it triggers -- is the one a
 * customer will come looking for.
 */
export default async function NotificationsPage({
  params,
}: PageProps<"/[locale]/notifications">) {
  const context = await getAuthContext();
  if (!context) redirect("/sign-in");

  const { locale } = await params;
  const t = await getTranslations("notifications.page");

  const [rows, unreadCount, dates] = await Promise.all([
    notificationsFor(context),
    unreadCountFor(context),
    viewerDates(locale),
  ]);

  /**
   * The timestamp is formatted here, in the viewer's zone, while the sentence
   * is rendered on the client in the notification's own language. Those are
   * two different things on purpose: when it happened is a fact about the
   * reader's day, what it says is a property of the message.
   */
  const items: NotificationView[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    locale: row.locale,
    params: paramsOf(row.params),
    when: dates.dateTime(row.createdAt),
    unread: row.readAt === null,
    href: hrefFor(row),
  }));

  return (
    <Container width="content" className="py-12 sm:py-16">
      <header className="mb-8 flex flex-col gap-3">
        <h1 className="text-display-lg text-primary">{t("title")}</h1>
        <p className="max-w-2xl text-body-lg text-secondary">{t("subtitle")}</p>
        <Link
          href="/account"
          className="duration-fast self-start text-body-sm text-secondary underline decoration-line underline-offset-4 transition-colors ease-out-quint hover:text-primary hover:decoration-current"
        >
          {t("preferences")}
        </Link>
      </header>

      <NotificationList
        items={items}
        unreadCount={unreadCount}
        viewerLocale={resolveLocale(locale)}
      />
    </Container>
  );
}

/**
 * The stored parameters are `jsonb`, so they are whatever was written. Coerced
 * to strings here rather than trusted, because they go straight into ICU
 * arguments and a nested object there renders as "[object Object]" to a
 * customer.
 */
function paramsOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      typeof entry === "string" ? entry : String(entry ?? ""),
    ]),
  );
}

/**
 * Where a notification points.
 *
 * Rebuilt from the kind and the stored parameters rather than stored as a URL.
 * A stored link outlives the route it pointed at; a reference does not, and
 * the only kinds with a destination are the ones whose reference we have.
 */
function hrefFor(row: { kind: NotificationKind; params: unknown }): string | null {
  const params = paramsOf(row.params);
  if (!notificationKind(row.kind).email) return null;

  if (row.kind === "invoice_issued") {
    return params.number ? `/invoices/${params.number}` : null;
  }
  return params.reference ? `/projects/${params.reference}` : null;
}
