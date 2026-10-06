"use server";

import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { getAuthContext } from "@/server/auth";
import { markAllRead } from "@/server/notifications";

/**
 * Marks the caller's unread notifications as read.
 *
 * A server action is a public HTTP endpoint, so it re-authenticates here. It
 * takes no arguments at all: the only id involved is the one from the session,
 * and an action that accepted a recipient id would be an action that could be
 * asked to mark someone else's notifications read.
 */
export async function markNotificationsRead(): Promise<
  { ok: true; count: number } | { ok: false }
> {
  const context = await getAuthContext();
  if (!context) return { ok: false };

  const count = await markAllRead(context);
  logger.info("notifications marked read", { userId: context.user.id, count });

  // The unread count lives in the shell, so the layout has to re-render too.
  revalidatePath("/[locale]/notifications", "page");
  revalidatePath("/[locale]", "layout");

  return { ok: true, count };
}
