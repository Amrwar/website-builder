import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { resolveLocale } from "@/config/locales";
import { notificationKind, type NotificationKind } from "@/config/notifications";
import { db } from "@/db/client";
import { notifications, users } from "@/db/schema";
import { logger } from "@/lib/logger";
import type { AuthContext } from "@/server/auth";
import { renderNotificationEmail } from "@/server/email/render";
import { emailTransport } from "@/server/email/transport";

/**
 * Telling one person one thing, in their language.
 *
 * The locale is resolved from the *recipient's* row, never from the request.
 * Almost every notification is triggered by someone else -- a staff member
 * moving a project along, a Stripe webhook with no locale at all -- so taking
 * the ambient locale would have written to customers in whatever language the
 * person who caused the event happened to be using.
 *
 * Whether a notification is sent at all is decided here from the recipient's
 * own flags, with transactional kinds exempt. See `config/notifications.ts`
 * for why that exemption exists and which kinds have it.
 */
export interface NotifyInput {
  recipientId: string;
  kind: NotificationKind;
  /** ICU arguments. Stored, not rendered, so the copy can be corrected later. */
  params?: Record<string, string>;
  projectId?: string | null;
  /**
   * Natural key for the event, e.g. `order_paid:<orderId>`. A duplicate is
   * dropped silently, which is what makes this safe to call from a webhook
   * that may be delivered more than once.
   */
  dedupeKey?: string | null;
  /** Relative path the message links to, e.g. `/projects/BL-2026-0001`. */
  path?: string | null;
  /** Absolute origin, for the email's link. Omit to send without one. */
  origin?: string | null;
}

export type NotifyOutcome =
  | { sent: true; id: string; emailed: boolean }
  | { sent: false; reason: "no_recipient" | "muted" | "duplicate" };

export async function notify(input: NotifyInput): Promise<NotifyOutcome> {
  const definition = notificationKind(input.kind);

  const recipient = await db.query.users.findFirst({
    where: eq(users.id, input.recipientId),
    columns: {
      id: true,
      email: true,
      displayName: true,
      preferredLocale: true,
      notifyBuildUpdates: true,
      notifyMessages: true,
      notifyDeadlineAlerts: true,
      notifyProductNews: true,
    },
  });

  if (!recipient) {
    // Not an exception: a user can be deleted between an event and its
    // notification, and that must not fail the thing that caused the event.
    logger.warn("notification skipped: no such recipient", {
      recipientId: input.recipientId,
      kind: input.kind,
    });
    return { sent: false, reason: "no_recipient" };
  }

  if (definition.preference !== null && !recipient[definition.preference]) {
    return { sent: false, reason: "muted" };
  }

  const locale = resolveLocale(recipient.preferredLocale);
  const params = input.params ?? {};

  const [row] = await db
    .insert(notifications)
    .values({
      recipientId: recipient.id,
      kind: input.kind,
      locale,
      params,
      projectId: input.projectId ?? null,
      dedupeKey: input.dedupeKey ?? null,
    })
    // The unique index on `dedupeKey` is what makes this idempotent; the
    // conflict is the expected outcome of a redelivered webhook, not an error.
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning();

  if (!row) return { sent: false, reason: "duplicate" };

  const emailed = definition.email
    ? await deliverEmail({
        notificationId: row.id,
        kind: input.kind,
        locale,
        params,
        recipient: { email: recipient.email, name: recipient.displayName },
        actionUrl:
          input.origin && input.path
            ? `${input.origin}${localised(input.path, locale)}`
            : null,
      })
    : false;

  return { sent: true, id: row.id, emailed };
}

/**
 * Prefixes the recipient's locale onto the link.
 *
 * The routing uses `as-needed`, so English has no prefix. Building the link
 * here rather than letting the client resolve it means the email opens in the
 * language the email was written in, which is the one thing the reader has
 * already been given.
 */
function localised(path: string, locale: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return locale === "en" ? clean : `/${locale}${clean}`;
}

async function deliverEmail(input: {
  notificationId: string;
  kind: NotificationKind;
  locale: ReturnType<typeof resolveLocale>;
  params: Record<string, string>;
  recipient: { email: string; name: string | null };
  actionUrl: string | null;
}): Promise<boolean> {
  const transport = emailTransport();

  if (!transport.canDeliver) {
    // Left entirely unmarked rather than marked failed. "No provider is
    // configured" is a deployment fact, not a delivery failure, and recording
    // it as one would make the first real provider look like a fix for a
    // backlog of errors that never happened.
    return false;
  }

  const now = new Date();
  await db
    .update(notifications)
    .set({ emailAttemptedAt: now })
    .where(eq(notifications.id, input.notificationId));

  try {
    const message = await renderNotificationEmail({
      kind: input.kind,
      locale: input.locale,
      params: input.params,
      recipient: input.recipient,
      actionUrl: input.actionUrl,
      // The row's id, so a resend of the same notification cannot reach the
      // customer twice even if it slips past the database's own dedupe.
      idempotencyKey: input.notificationId,
    });

    const result = await transport.send(message);

    if (result.ok) {
      await db
        .update(notifications)
        .set({ emailSentAt: new Date() })
        .where(eq(notifications.id, input.notificationId));
      return true;
    }

    await db
      .update(notifications)
      .set({ emailFailedAt: new Date(), emailError: result.reason })
      .where(eq(notifications.id, input.notificationId));
    return false;
  } catch (error) {
    // A broken template must not break the thing that triggered it. The
    // in-app notification is already recorded and still readable.
    const reason = error instanceof Error ? error.message : "render_failed";
    logger.error("notification email failed", { kind: input.kind, reason });
    await db
      .update(notifications)
      .set({ emailFailedAt: new Date(), emailError: reason.slice(0, 500) })
      .where(eq(notifications.id, input.notificationId));
    return false;
  }
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

/**
 * The caller's own notifications.
 *
 * Scoped by the session's user id in the SQL, never by anything in a payload:
 * the id is the only thing standing between one customer's notifications and
 * another's, and a filter that is part of the query cannot be dropped later.
 */
export async function notificationsFor(
  context: AuthContext,
  options: { limit?: number } = {},
) {
  return db.query.notifications.findMany({
    where: eq(notifications.recipientId, context.user.id),
    orderBy: [desc(notifications.createdAt)],
    limit: Math.min(Math.max(options.limit ?? 50, 1), 100),
  });
}

export async function unreadCountFor(context: AuthContext): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(eq(notifications.recipientId, context.user.id), isNull(notifications.readAt)),
    );
  return row?.count ?? 0;
}

/**
 * Marks everything currently unread as read.
 *
 * Scoped to the session's own rows and conditional on `readAt` being null, so
 * a double submit cannot rewrite the moment someone read something.
 */
export async function markAllRead(context: AuthContext): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.recipientId, context.user.id), isNull(notifications.readAt)),
    )
    .returning({ id: notifications.id });
  return updated.length;
}
