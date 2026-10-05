import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { DEFAULT_ROLE } from "@/config/roles";
import { createHandler } from "@/lib/api/handler";
import { ApiError, apiSuccess } from "@/lib/api/response";
import { logger } from "@/lib/logger";

/**
 * Clerk webhook.
 *
 * Keeps the local `users` projection in step with Clerk. Delivery is
 * asynchronous and retried, so nothing in a synchronous flow may depend on it
 * -- `getAuthContext` provisions a row on first sight precisely so sign-up
 * does not race this endpoint.
 *
 * `verifyWebhook` checks the Svix signature and throws on a bad one. That
 * check is the only thing standing between this route and anyone on the
 * internet creating or deleting user rows, so it runs before the payload is
 * read, and a missing signing secret fails the request rather than skipping
 * verification.
 */

export const dynamic = "force-dynamic";

interface ClerkUserPayload {
  id?: string;
  email_addresses?: { id: string; email_address: string }[];
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

function primaryEmail(data: ClerkUserPayload): string | null {
  const addresses = data.email_addresses ?? [];
  const primary = addresses.find((a) => a.id === data.primary_email_address_id);
  return primary?.email_address ?? addresses[0]?.email_address ?? null;
}

function fullName(data: ClerkUserPayload): string | null {
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();
  return name === "" ? null : name;
}

export const POST = createHandler(async (request) => {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) {
    // Refusing is the safe failure: accepting unverified events would let
    // anyone who finds this URL write to the users table.
    logger.error("clerk webhook called without a signing secret configured");
    throw new ApiError("service_unavailable", "Webhook is not configured.");
  }

  let event;
  try {
    event = await verifyWebhook(request);
  } catch (error) {
    logger.warn("clerk webhook signature rejected", { error });
    throw new ApiError("unauthorized", "Invalid signature.");
  }

  const type = event.type;
  const data = event.data as ClerkUserPayload;
  const clerkUserId = data.id;

  if (!clerkUserId) {
    throw new ApiError("bad_request", "Event carried no user id.");
  }

  const log = logger.child({ webhook: "clerk", type, clerkUserId });

  switch (type) {
    case "user.created":
    case "user.updated": {
      const email = primaryEmail(data);
      if (!email) {
        log.warn("user event without an email address; ignoring");
        break;
      }

      await db
        .insert(users)
        .values({
          clerkUserId,
          email,
          displayName: fullName(data),
          // A webhook can create an account but never grant privilege: role is
          // set to the default on insert and deliberately left untouched on
          // update, so an elevated role survives a profile edit in Clerk and
          // cannot be set from outside the application.
          role: DEFAULT_ROLE,
        })
        .onConflictDoUpdate({
          target: users.clerkUserId,
          set: { email, displayName: fullName(data), updatedAt: new Date() },
        });

      log.info("user synced");
      break;
    }

    case "user.deleted": {
      const existing = await db.query.users.findFirst({
        where: eq(users.clerkUserId, clerkUserId),
      });
      if (!existing) break;

      try {
        await db.delete(users).where(eq(users.id, existing.id));
        log.info("user removed");
      } catch {
        // `projects.owner_id` restricts deletion. A customer with builds is a
        // financial and contractual record, so the row stays and the account
        // is simply no longer reachable, Clerk having removed the identity.
        log.warn("user retained: existing projects reference this account");
      }
      break;
    }

    default:
      // Clerk sends many event types; acknowledging the ones we ignore keeps
      // them from being retried indefinitely.
      log.debug("ignored clerk event");
  }

  return apiSuccess({ received: true });
});
