import "server-only";

import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db/client";
import {
  changeRequests,
  deployments,
  invoices,
  orders,
  projectApprovals,
  projectFiles,
  projectMessages,
  notifications,
  projects,
  refunds,
  users,
} from "@/db/schema";
import { ApiError } from "@/lib/api/response";
import type { AuthContext } from "@/server/auth";
import type { Paged } from "./queries";

/**
 * Cross-project lists for the console.
 *
 * The Build Room answers "what is happening on this project". These answer
 * "what is waiting on us across every project", which is the question the
 * operations team actually has.
 *
 * Each applies its own permission. Two are narrower than the rest: files and
 * messages both carry a visibility flag, and the staff console is the one
 * place both halves are visible -- so they are gated on the permission that
 * implies a working relationship with the project, not merely console access.
 */

function page(filters: { page?: number; pageSize?: number }) {
  const current = Math.max(1, filters.page ?? 1);
  const size = Math.min(100, Math.max(1, filters.pageSize ?? 25));
  return { current, size, offset: (current - 1) * size };
}

function paged<T>(rows: T[], total: number, current: number, size: number): Paged<T> {
  return {
    rows,
    total,
    page: current,
    pageSize: size,
    pageCount: Math.max(1, Math.ceil(total / size)),
  };
}

function require(context: AuthContext, permission: Parameters<AuthContext["can"]>[0]) {
  if (!context.can(permission)) throw new ApiError("not_found", "Not found.");
}

function like(term: string): string {
  return `%${term.replace(/[%_]/g, "\\$&")}%`;
}

/* -------------------------------------------------------------------------
 * Projects
 * ---------------------------------------------------------------------- */

export interface AdminProjectRow {
  id: string;
  reference: string;
  status: string;
  productType: string;
  riskLevel: string;
  deadlineAt: Date | null;
  createdAt: Date;
  customerName: string;
}

export async function projectList(
  filters: { search?: string; status?: string; page?: number },
  context: AuthContext,
): Promise<Paged<AdminProjectRow>> {
  require(context, "project:read:all");
  const { current, size, offset } = page(filters);

  const where: SQL[] = [];
  if (filters.status) where.push(sql`${projects.status}::text = ${filters.status}`);
  if (filters.search) {
    const term = like(filters.search);
    const matcher = or(
      sql`${projects.reference} ilike ${term}`,
      sql`${users.displayName} ilike ${term}`,
      sql`${users.email} ilike ${term}`,
    );
    if (matcher) where.push(matcher);
  }
  const condition = where.length > 0 ? and(...where) : undefined;

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: projects.id,
        reference: projects.reference,
        status: projects.status,
        productType: projects.productType,
        riskLevel: projects.riskLevel,
        deadlineAt: projects.deadlineAt,
        createdAt: projects.createdAt,
        name: users.displayName,
        email: users.email,
      })
      .from(projects)
      .innerJoin(users, eq(users.id, projects.ownerId))
      .where(condition)
      .orderBy(desc(projects.createdAt))
      .limit(size)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(projects)
      .innerJoin(users, eq(users.id, projects.ownerId))
      .where(condition),
  ]);

  return paged(
    rows.map((row) => ({ ...row, customerName: row.name ?? row.email })),
    counted?.total ?? 0,
    current,
    size,
  );
}

/* -------------------------------------------------------------------------
 * Approvals, changes, deployments
 * ---------------------------------------------------------------------- */

export async function approvalList(
  filters: { status?: string; page?: number },
  context: AuthContext,
) {
  require(context, "project:read:all");
  const { current, size, offset } = page(filters);

  const where = filters.status
    ? sql`${projectApprovals.status}::text = ${filters.status}`
    : undefined;

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: projectApprovals.id,
        kind: projectApprovals.kind,
        status: projectApprovals.status,
        round: projectApprovals.round,
        requestedAt: projectApprovals.requestedAt,
        decidedAt: projectApprovals.decidedAt,
        reference: projects.reference,
      })
      .from(projectApprovals)
      .innerJoin(projects, eq(projects.id, projectApprovals.projectId))
      .where(where)
      .orderBy(desc(projectApprovals.requestedAt))
      .limit(size)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(projectApprovals)
      .where(where),
  ]);

  return paged(rows, counted?.total ?? 0, current, size);
}

export async function changeRequestList(
  filters: { status?: string; page?: number },
  context: AuthContext,
) {
  require(context, "project:read:all");
  const { current, size, offset } = page(filters);

  const where = filters.status
    ? sql`${changeRequests.status}::text = ${filters.status}`
    : undefined;

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: changeRequests.id,
        reference: changeRequests.reference,
        title: changeRequests.title,
        status: changeRequests.status,
        priceImpactMinorUnits: changeRequests.priceImpactMinorUnits,
        currency: changeRequests.currency,
        additionalDays: changeRequests.additionalDays,
        createdAt: changeRequests.createdAt,
        projectReference: projects.reference,
      })
      .from(changeRequests)
      .innerJoin(projects, eq(projects.id, changeRequests.projectId))
      .where(where)
      .orderBy(desc(changeRequests.createdAt))
      .limit(size)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(changeRequests)
      .where(where),
  ]);

  return paged(rows, counted?.total ?? 0, current, size);
}

export async function deploymentList(
  filters: { environment?: string; page?: number },
  context: AuthContext,
) {
  require(context, "project:read:all");
  const { current, size, offset } = page(filters);

  const where = filters.environment
    ? sql`${deployments.environment}::text = ${filters.environment}`
    : undefined;

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: deployments.id,
        environment: deployments.environment,
        state: deployments.state,
        version: deployments.version,
        url: deployments.url,
        startedAt: deployments.startedAt,
        readyAt: deployments.readyAt,
        projectReference: projects.reference,
      })
      .from(deployments)
      .innerJoin(projects, eq(projects.id, deployments.projectId))
      .where(where)
      .orderBy(desc(deployments.createdAt))
      .limit(size)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(deployments)
      .where(where),
  ]);

  return paged(rows, counted?.total ?? 0, current, size);
}

/* -------------------------------------------------------------------------
 * Files and messages
 * ---------------------------------------------------------------------- */

export async function fileList(
  filters: { kind?: string; page?: number },
  context: AuthContext,
) {
  require(context, "project:read:all");
  const { current, size, offset } = page(filters);

  const where: SQL[] = [sql`${projectFiles.deletedAt} is null`];
  if (filters.kind) where.push(sql`${projectFiles.kind}::text = ${filters.kind}`);
  const condition = and(...where);

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: projectFiles.id,
        name: projectFiles.name,
        kind: projectFiles.kind,
        visibility: projectFiles.visibility,
        version: projectFiles.version,
        sizeBytes: projectFiles.sizeBytes,
        createdAt: projectFiles.createdAt,
        projectReference: projects.reference,
      })
      .from(projectFiles)
      .innerJoin(projects, eq(projects.id, projectFiles.projectId))
      .where(condition)
      .orderBy(desc(projectFiles.createdAt))
      .limit(size)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(projectFiles)
      .where(condition),
  ]);

  return paged(rows, counted?.total ?? 0, current, size);
}

export async function messageList(
  filters: { visibility?: string; page?: number },
  context: AuthContext,
) {
  // Gated on support:respond rather than console access: the staff view shows
  // internal notes alongside customer replies, and not every console role
  // should be reading either.
  require(context, "support:respond");
  const { current, size, offset } = page(filters);

  const where = filters.visibility
    ? sql`${projectMessages.visibility}::text = ${filters.visibility}`
    : undefined;

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: projectMessages.id,
        body: projectMessages.body,
        authorName: projectMessages.authorName,
        authorType: projectMessages.authorType,
        visibility: projectMessages.visibility,
        createdAt: projectMessages.createdAt,
        projectReference: projects.reference,
      })
      .from(projectMessages)
      .innerJoin(projects, eq(projects.id, projectMessages.projectId))
      .where(where)
      .orderBy(desc(projectMessages.createdAt))
      .limit(size)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(projectMessages)
      .where(where),
  ]);

  return paged(rows, counted?.total ?? 0, current, size);
}

/**
 * Notifications the platform has sent, newest first.
 *
 * Gated on `settings:manage` rather than general console access. The rows name
 * a recipient and carry the parameters a message was built from, which can
 * include a project reference or an excerpt — the same reasoning that puts the
 * message list behind `support:respond`.
 *
 * The body is deliberately not reconstructed here. What is useful to staff is
 * whether a notification was sent, in what language, and whether the email got
 * out; rendering the sentence would mean resolving the catalogue per row for
 * a view nobody reads prose in.
 */
export async function notificationList(
  filters: { kind?: string; page?: number },
  context: AuthContext,
) {
  require(context, "settings:manage");
  const { current, size, offset } = page(filters);

  const where = filters.kind
    ? sql`${notifications.kind}::text = ${filters.kind}`
    : undefined;

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: notifications.id,
        kind: notifications.kind,
        locale: notifications.locale,
        createdAt: notifications.createdAt,
        readAt: notifications.readAt,
        emailAttemptedAt: notifications.emailAttemptedAt,
        emailSentAt: notifications.emailSentAt,
        emailFailedAt: notifications.emailFailedAt,
        emailError: notifications.emailError,
        recipientEmail: users.email,
        recipientName: users.displayName,
      })
      .from(notifications)
      .innerJoin(users, eq(users.id, notifications.recipientId))
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(size)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(notifications)
      .where(where),
  ]);

  return paged(rows, counted?.total ?? 0, current, size);
}

export type AdminNotificationRow = Awaited<
  ReturnType<typeof notificationList>
>["rows"][number];

/* -------------------------------------------------------------------------
 * Commerce
 * ---------------------------------------------------------------------- */

export async function orderList(
  filters: { status?: string; search?: string; page?: number },
  context: AuthContext,
) {
  require(context, "finance:read");
  const { current, size, offset } = page(filters);

  const where: SQL[] = [];
  if (filters.status) where.push(sql`${orders.status}::text = ${filters.status}`);
  if (filters.search) {
    const term = like(filters.search);
    const matcher = or(
      sql`${orders.number} ilike ${term}`,
      sql`${users.email} ilike ${term}`,
    );
    if (matcher) where.push(matcher);
  }
  const condition = where.length > 0 ? and(...where) : undefined;

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        totalMinorUnits: orders.totalMinorUnits,
        refundedMinorUnits: orders.refundedMinorUnits,
        currency: orders.currency,
        placedAt: orders.placedAt,
        paidAt: orders.paidAt,
        customerEmail: users.email,
        customerName: users.displayName,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.ownerId))
      .where(condition)
      .orderBy(desc(orders.createdAt))
      .limit(size)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.ownerId))
      .where(condition),
  ]);

  return paged(rows, counted?.total ?? 0, current, size);
}

export async function invoiceList(
  filters: { search?: string; page?: number },
  context: AuthContext,
) {
  require(context, "finance:read");
  const { current, size, offset } = page(filters);

  const where = filters.search
    ? sql`${invoices.number} ilike ${like(filters.search)}`
    : undefined;

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: invoices.id,
        number: invoices.number,
        status: invoices.status,
        billToName: invoices.billToName,
        totalMinorUnits: invoices.totalMinorUnits,
        currency: invoices.currency,
        issuedAt: invoices.issuedAt,
      })
      .from(invoices)
      .where(where)
      .orderBy(desc(invoices.createdAt))
      .limit(size)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(invoices)
      .where(where),
  ]);

  return paged(rows, counted?.total ?? 0, current, size);
}

export async function refundList(
  filters: { status?: string; page?: number },
  context: AuthContext,
) {
  // `billing:manage`, not `finance:read`: seeing the money is one thing,
  // seeing who asked for it back and who released it is another.
  require(context, "billing:manage");
  const { current, size, offset } = page(filters);

  const where = filters.status
    ? sql`${refunds.status}::text = ${filters.status}`
    : undefined;

  const requester = sql<string>`(
    select ${users.email} from ${users} where ${users.id} = ${refunds.requestedByUserId}
  )`;

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: refunds.id,
        reference: refunds.reference,
        status: refunds.status,
        reason: refunds.reason,
        amountMinorUnits: refunds.amountMinorUnits,
        currency: refunds.currency,
        requestedAt: refunds.requestedAt,
        requestedByUserId: refunds.requestedByUserId,
        requestedBy: requester,
        orderNumber: orders.number,
      })
      .from(refunds)
      .innerJoin(orders, eq(orders.id, refunds.orderId))
      .where(where)
      .orderBy(desc(refunds.requestedAt))
      .limit(size)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(refunds)
      .where(where),
  ]);

  return paged(rows, counted?.total ?? 0, current, size);
}

/** Projects with a scope assessment, for the scope section. */
export async function scopeList(
  filters: { tier?: string; page?: number },
  context: AuthContext,
) {
  require(context, "project:read:all");
  const { current, size, offset } = page(filters);

  const where: SQL[] = [sql`${projects.scopeTier} is not null`];
  if (filters.tier) where.push(sql`${projects.scopeTier}::text = ${filters.tier}`);
  const condition = and(...where);

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: projects.id,
        reference: projects.reference,
        scopeTier: projects.scopeTier,
        productType: projects.productType,
        guaranteedDays: projects.guaranteedDays,
        priceMinorUnits: projects.priceMinorUnits,
        currency: projects.currency,
        status: projects.status,
        changeCount: sql<number>`(
          select count(*)::int from ${changeRequests}
          where ${changeRequests.projectId} = ${projects.id}
        )`,
      })
      .from(projects)
      .where(condition)
      .orderBy(desc(projects.createdAt))
      .limit(size)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(projects)
      .where(condition),
  ]);

  return paged(rows, counted?.total ?? 0, current, size);
}
