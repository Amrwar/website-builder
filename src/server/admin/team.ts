import "server-only";

import { eq } from "drizzle-orm";

import { canAssignRole, canManageUser, isUserRole, type UserRole } from "@/config/roles";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import type { AuthContext } from "@/server/auth";
import { recordAudit } from "./audit";

/**
 * Changing someone's role.
 *
 * The single most dangerous operation in the product, so it is the one with
 * the most checks, in this order:
 *
 *  1. The actor holds `user:manage` at all.
 *  2. The requested role is a real role -- narrowed, not cast.
 *  3. The actor outranks the role being granted, so nobody can promote
 *     themselves or a peer to their own level.
 *  4. The actor outranks the subject's *current* role, so two administrators
 *     cannot demote each other.
 *  5. Nobody can change their own role, at any rank, ever.
 *
 * Rule 5 is absolute rather than derived: an owner changing their own role is
 * how a company locks itself out of its own platform, and the rank ladder
 * alone would permit it.
 *
 * Every outcome writes an audit entry, including refusals -- an attempted
 * escalation is exactly the thing an audit log exists to show.
 */

export interface RoleChangeResult {
  userId: string;
  from: UserRole;
  to: UserRole;
}

export async function changeUserRole(
  subjectUserId: string,
  requestedRole: string,
  context: AuthContext,
  reason?: string,
): Promise<RoleChangeResult> {
  const actorRole = context.user.role;

  if (!context.can("user:manage")) {
    throw new ApiError("not_found", "Not found.");
  }

  if (!isUserRole(requestedRole)) {
    throw new ApiError("bad_request", "That is not a role.");
  }

  const subject = await db.query.users.findFirst({
    where: eq(users.id, subjectUserId),
  });
  if (!subject) throw new ApiError("not_found", "Not found.");

  // Rule 5, checked before the ladder so the refusal is unambiguous.
  if (subject.id === context.user.id) {
    await recordAudit({
      category: "security",
      action: "user.role_change_refused",
      actor: context,
      subjectType: "user",
      subjectId: subject.id,
      subjectLabel: subject.email,
      after: { attempted: requestedRole, refusal: "self" },
    });
    throw new ApiError("forbidden", "You cannot change your own role.");
  }

  if (!canManageUser(actorRole, subject.role)) {
    await recordAudit({
      category: "security",
      action: "user.role_change_refused",
      actor: context,
      subjectType: "user",
      subjectId: subject.id,
      subjectLabel: subject.email,
      after: { attempted: requestedRole, refusal: "outranked" },
    });
    throw new ApiError("forbidden", "You cannot change that person's role.");
  }

  if (!canAssignRole(actorRole, requestedRole)) {
    await recordAudit({
      category: "security",
      action: "user.role_change_refused",
      actor: context,
      subjectType: "user",
      subjectId: subject.id,
      subjectLabel: subject.email,
      after: { attempted: requestedRole, refusal: "rank" },
    });
    throw new ApiError("forbidden", "You cannot grant that role.");
  }

  if (subject.role === requestedRole) {
    return { userId: subject.id, from: subject.role, to: requestedRole };
  }

  await db
    .update(users)
    .set({ role: requestedRole, updatedAt: new Date() })
    .where(eq(users.id, subject.id));

  await recordAudit({
    category: "security",
    action: "user.role_changed",
    actor: context,
    subjectType: "user",
    subjectId: subject.id,
    subjectLabel: subject.email,
    before: { role: subject.role },
    after: { role: requestedRole },
    reason: reason ?? null,
  });

  logger.warn("user role changed", {
    subjectId: subject.id,
    from: subject.role,
    to: requestedRole,
    actorId: context.user.id,
  });

  return { userId: subject.id, from: subject.role, to: requestedRole };
}
