import "server-only";

import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";

import { db } from "@/db/client";
import { auditEvents, users, type AuditEvent } from "@/db/schema";
import type { AuditCategory } from "@/db/schema/enums";
import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import type { AuthContext } from "@/server/auth";

/**
 * The audit log.
 *
 * Write-only from the application's point of view. There is no update path and
 * no delete path, here or anywhere else -- the admin console can read this
 * table and nothing more, which is the only reason it is worth having.
 *
 * `recordAudit` never throws. An audit write failing must not roll back the
 * act it describes: a refund that succeeded and failed to log is a reconciled
 * problem, a refund that was rolled back because the log was unavailable is a
 * customer who did not get their money. The failure is logged loudly instead.
 */

export interface AuditInput {
  category: AuditCategory;
  /** Dotted action, e.g. "user.role_changed". */
  action: string;
  actor: AuthContext;
  subjectType: string;
  subjectId?: string | null;
  subjectLabel?: string | null;
  /** Changed fields only. Never whole records, never secrets. */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  requestId?: string | null;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      category: input.category,
      action: input.action,
      actorUserId: input.actor.user.id,
      // Snapshotted, so the entry still reads after the account is gone.
      actorEmail: input.actor.user.email,
      actorRole: input.actor.user.role,
      subjectType: input.subjectType,
      subjectId: input.subjectId ?? null,
      subjectLabel: input.subjectLabel ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      reason: input.reason ?? null,
      requestId: input.requestId ?? null,
    });
  } catch (error) {
    logger.error("AUDIT WRITE FAILED", {
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      actorId: input.actor.user.id,
      error,
    });
  }
}

/**
 * Records only the fields that actually changed.
 *
 * Keeps entries small and readable: an audit row listing forty unchanged
 * columns is one nobody reads, which defeats the purpose.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) {
      changedBefore[key] = before[key];
      changedAfter[key] = value;
    }
  }

  return Object.keys(changedAfter).length > 0
    ? { before: changedBefore, after: changedAfter }
    : null;
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

export interface AuditQuery {
  category?: AuditCategory;
  action?: string;
  subjectType?: string;
  subjectId?: string;
  actorUserId?: string;
  from?: Date;
  to?: Date;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditPage {
  rows: (AuditEvent & { actorName: string | null })[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const MAX_PAGE_SIZE = 100;

/**
 * Reads the log.
 *
 * Gated on `audit:read`, which only the owner and administrator hold. Answers
 * `not_found` to anyone else: a staff member probing for an audit endpoint
 * learns nothing about whether one exists.
 */
export async function readAuditLog(
  query: AuditQuery,
  context: AuthContext,
): Promise<AuditPage> {
  if (!context.can("audit:read")) {
    throw new ApiError("not_found", "Not found.");
  }

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? 25));

  const filters: SQL[] = [];
  if (query.category) filters.push(eq(auditEvents.category, query.category));
  if (query.action) filters.push(eq(auditEvents.action, query.action));
  if (query.subjectType) filters.push(eq(auditEvents.subjectType, query.subjectType));
  if (query.subjectId) filters.push(eq(auditEvents.subjectId, query.subjectId));
  if (query.actorUserId) filters.push(eq(auditEvents.actorUserId, query.actorUserId));
  if (query.from) filters.push(gte(auditEvents.occurredAt, query.from));
  if (query.to) filters.push(lte(auditEvents.occurredAt, query.to));

  if (query.search) {
    // Matched against named columns only. A free-text scan over jsonb would
    // search the recorded before/after values, which is how a log becomes a
    // way to go fishing for data rather than a record of who did what.
    const term = `%${query.search.replace(/[%_]/g, "\\$&")}%`;
    filters.push(
      sql`(${auditEvents.action} ilike ${term} or ${auditEvents.subjectLabel} ilike ${term} or ${auditEvents.actorEmail} ilike ${term})`,
    );
  }

  const where = filters.length > 0 ? and(...filters) : undefined;

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        event: auditEvents,
        actorName: users.displayName,
      })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorUserId))
      .where(where)
      .orderBy(desc(auditEvents.occurredAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),

    db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditEvents)
      .where(where),
  ]);

  const total = counted?.total ?? 0;

  return {
    rows: rows.map((row) => ({ ...row.event, actorName: row.actorName })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Everything recorded against one subject, for a detail page. */
export async function auditTrailFor(
  subjectType: string,
  subjectId: string,
  context: AuthContext,
  limit = 50,
): Promise<AuditEvent[]> {
  if (!context.can("audit:read")) return [];

  return db
    .select()
    .from(auditEvents)
    .where(
      and(eq(auditEvents.subjectType, subjectType), eq(auditEvents.subjectId, subjectId)),
    )
    .orderBy(desc(auditEvents.occurredAt))
    .limit(limit);
}
