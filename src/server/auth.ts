import "server-only";

import { cache } from "react";

import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { users, type User } from "@/db/schema";
import { DEFAULT_ROLE, roleHasPermission, type Permission } from "@/config/roles";
import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";

/**
 * Server-side authentication and authorization.
 *
 * The single place the application decides who someone is and what they may
 * do. Three rules hold throughout:
 *
 *  1. Identity comes from Clerk's verified session, never from a request body,
 *     a header the client controls, or a cookie we parse ourselves.
 *  2. Permissions are derived from the role stored in *our* database, not from
 *     Clerk metadata. Metadata is client-readable and editable outside the
 *     application; authorization needs a source of truth we own.
 *  3. Nothing here is importable from a client component. `server-only` turns
 *     an accidental client import into a build error rather than a leak.
 */

/** A signed-in user together with the permission check for their role. */
export interface AuthContext {
  user: User;
  can: (permission: Permission) => boolean;
}

function contextFor(user: User): AuthContext {
  return {
    user,
    can: (permission) => roleHasPermission(user.role, permission),
  };
}

/**
 * Resolves the current user, provisioning a row on first sight.
 *
 * The Clerk webhook is the normal path for creating rows, but a webhook can be
 * delayed, retried or dropped. Without a fallback the very first page load
 * after sign-up would fail for reasons the user cannot act on, so a missing
 * row is created here instead.
 *
 * The role is never taken from Clerk: a new row always starts at the default,
 * least-privileged role, and is only ever elevated through an explicit
 * administrative action.
 *
 * Memoised per request with React's `cache`. A single page commonly asks twice
 * -- the layout decides whether to show the staff link, the page reads the
 * profile -- and without this each ask is another round trip for an answer
 * that cannot have changed within one request.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await db.query.users.findFirst({
    where: eq(users.clerkUserId, userId),
  });
  if (existing) return contextFor(existing);

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email = clerkUser.primaryEmailAddress?.emailAddress;
  if (!email) {
    // Clerk is configured to require a verified email, so this means the
    // session is in a state we do not understand; refusing is safer than
    // inventing an identity.
    logger.error("clerk session has no primary email", { clerkUserId: userId });
    return null;
  }

  const [created] = await db
    .insert(users)
    .values({
      clerkUserId: userId,
      email,
      displayName: clerkUser.fullName ?? null,
      role: DEFAULT_ROLE,
    })
    // The webhook may win the race; treat the row as already correct.
    .onConflictDoNothing({ target: users.clerkUserId })
    .returning();

  if (created) {
    logger.info("provisioned user on first request", { userId: created.id });
    return contextFor(created);
  }

  const afterRace = await db.query.users.findFirst({
    where: eq(users.clerkUserId, userId),
  });
  return afterRace ? contextFor(afterRace) : null;
});

/** True when someone is signed in. Cheap: no database round trip. */
export async function isSignedIn(): Promise<boolean> {
  const { userId } = await auth();
  return Boolean(userId);
}

/**
 * Requires a signed-in user.
 *
 * Throws an `ApiError` rather than redirecting, so the same helper serves
 * route handlers, server actions and server components. Callers that want a
 * redirect catch it and redirect; the API wrapper turns it into a 401.
 */
export async function requireUser(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) {
    throw new ApiError("unauthorized", "You need to be signed in to do that.");
  }
  return context;
}

/**
 * Requires a specific permission.
 *
 * Reports `not_found` rather than `forbidden` for staff-only surfaces: telling
 * an unauthorized caller that an admin endpoint exists is information they did
 * not have before. The log line keeps the real reason.
 */
export async function requirePermission(permission: Permission): Promise<AuthContext> {
  const context = await requireUser();

  if (!context.can(permission)) {
    logger.warn("permission denied", {
      userId: context.user.id,
      role: context.user.role,
      permission,
    });
    throw new ApiError("not_found", "Not found.");
  }

  return context;
}

/**
 * Confirms a user owns a record, or holds a permission that transcends
 * ownership.
 *
 * The check every customer-facing route needs: being signed in is not the same
 * as being allowed to read *this* project. Staff with `project:read:all` pass
 * regardless of ownership.
 */
export function assertOwnershipOr(
  context: AuthContext,
  ownerId: string,
  permission: Permission,
): void {
  if (context.user.id === ownerId) return;
  if (context.can(permission)) return;

  logger.warn("ownership check failed", {
    userId: context.user.id,
    role: context.user.role,
    ownerId,
    permission,
  });
  throw new ApiError("not_found", "Not found.");
}
