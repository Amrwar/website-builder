import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db/client";
import {
  invoices,
  orders,
  productionTasks,
  projects,
  refunds,
  users,
  type Project,
} from "@/db/schema";
import type { RiskLevel } from "@/lib/production/risk";
import type { ProjectStatus } from "@/db/schema/enums";
import { ApiError } from "@/lib/api/response";
import type { AuthContext } from "@/server/auth";

/**
 * Reading for the admin console.
 *
 * Every function takes the caller's context and applies the permission itself
 * rather than trusting the page to have done it. A page is one refactor away
 * from losing its guard; a query that refuses without the permission is not.
 *
 * Figures here are computed from the real tables -- orders, projects,
 * invoices, refunds. Nothing is seeded, estimated or illustrative, so a metric
 * reading zero means zero happened, which is the only way a dashboard is worth
 * looking at.
 */

/** Statuses where a project is live work rather than history. */
const ACTIVE_STATUSES: readonly ProjectStatus[] = [
  "awaiting_assets",
  "in_build",
  "in_preview",
  "awaiting_approval",
  "approved",
  "launching",
];

function requirePermission(
  context: AuthContext,
  permission: Parameters<AuthContext["can"]>[0],
) {
  if (!context.can(permission)) throw new ApiError("not_found", "Not found.");
}

function startOfDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/* -------------------------------------------------------------------------
 * Dashboard
 * ---------------------------------------------------------------------- */

export interface DashboardMetrics {
  activeProjects: number;
  startingToday: number;
  dueToday: number;
  atRisk: number;
  overdue: number;
  newOrders: number;
  completedProjects: number;
  activeCustomers: number;
  /** Null when nothing has been delivered yet, rather than a misleading 0. */
  averageDeliveryDays: number | null;
  guaranteeSuccessRate: number | null;
  guaranteeSampleSize: number;
  /** Finance figures are omitted entirely without `finance:read`. */
  finance: {
    revenueMinorUnits: number;
    pendingMinorUnits: number;
    refundedMinorUnits: number;
    currency: string;
  } | null;
}

export async function dashboardMetrics(
  context: AuthContext,
  now: Date = new Date(),
): Promise<DashboardMetrics> {
  requirePermission(context, "admin:access");

  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const [
    activeRows,
    startingRows,
    dueRows,
    riskRows,
    overdueRows,
    orderRows,
    completedRows,
    customerRows,
    deliveredRows,
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(projects)
      .where(inArray(projects.status, [...ACTIVE_STATUSES])),

    db
      .select({ n: count() })
      .from(projects)
      .where(
        and(gte(projects.buildStartedAt, today), lte(projects.buildStartedAt, tomorrow)),
      ),

    db
      .select({ n: count() })
      .from(projects)
      .where(
        and(
          gte(projects.deadlineAt, today),
          lte(projects.deadlineAt, tomorrow),
          inArray(projects.status, ["in_build", "in_preview"]),
        ),
      ),

    db
      .select({ n: count() })
      .from(projects)
      .where(
        and(
          inArray(projects.riskLevel, ["yellow", "red"]),
          inArray(projects.status, [...ACTIVE_STATUSES]),
        ),
      ),

    db
      .select({ n: count() })
      .from(projects)
      .where(
        and(
          lte(projects.deadlineAt, now),
          inArray(projects.status, ["in_build", "in_preview"]),
        ),
      ),

    db.select({ n: count() }).from(orders).where(gte(orders.placedAt, today)),

    db.select({ n: count() }).from(projects).where(eq(projects.status, "launched")),

    // "Active" means has a live project, not merely registered: a count of
    // sign-ups is a vanity number.
    db
      .select({ n: sql<number>`count(distinct ${projects.ownerId})::int` })
      .from(projects)
      .where(inArray(projects.status, [...ACTIVE_STATUSES])),

    db
      .select({
        buildStartedAt: projects.buildStartedAt,
        deliveredAt: projects.deliveredAt,
        deadlineAt: projects.deadlineAt,
      })
      .from(projects)
      .where(
        and(
          sql`${projects.deliveredAt} is not null`,
          sql`${projects.buildStartedAt} is not null`,
        ),
      ),
  ]);

  const delivered = deliveredRows.filter((row) => row.buildStartedAt && row.deliveredAt);

  const averageDeliveryDays =
    delivered.length > 0
      ? delivered.reduce(
          (sum, row) =>
            sum +
            (row.deliveredAt!.getTime() - row.buildStartedAt!.getTime()) / 86_400_000,
          0,
        ) / delivered.length
      : null;

  const withDeadline = delivered.filter((row) => row.deadlineAt);
  const metOnTime = withDeadline.filter(
    (row) => row.deliveredAt!.getTime() <= row.deadlineAt!.getTime(),
  ).length;

  let finance: DashboardMetrics["finance"] = null;
  if (context.can("finance:read")) {
    const [[paid], [pending], [refunded]] = await Promise.all([
      db
        .select({ total: sql<number>`coalesce(sum(${orders.totalMinorUnits}), 0)::int` })
        .from(orders)
        .where(inArray(orders.status, ["paid", "completed"])),
      db
        .select({ total: sql<number>`coalesce(sum(${orders.totalMinorUnits}), 0)::int` })
        .from(orders)
        .where(eq(orders.status, "pending_payment")),
      db
        .select({
          total: sql<number>`coalesce(sum(${refunds.amountMinorUnits}), 0)::int`,
        })
        .from(refunds)
        .where(eq(refunds.status, "completed")),
    ]);

    finance = {
      revenueMinorUnits: paid?.total ?? 0,
      pendingMinorUnits: pending?.total ?? 0,
      refundedMinorUnits: refunded?.total ?? 0,
      currency: "CAD",
    };
  }

  return {
    activeProjects: activeRows[0]?.n ?? 0,
    startingToday: startingRows[0]?.n ?? 0,
    dueToday: dueRows[0]?.n ?? 0,
    atRisk: riskRows[0]?.n ?? 0,
    overdue: overdueRows[0]?.n ?? 0,
    newOrders: orderRows[0]?.n ?? 0,
    completedProjects: completedRows[0]?.n ?? 0,
    activeCustomers: customerRows[0]?.n ?? 0,
    averageDeliveryDays,
    // Null rather than 100% when nothing has shipped: a success rate with no
    // sample is the most misleading number a dashboard can show.
    guaranteeSuccessRate:
      withDeadline.length > 0 ? metOnTime / withDeadline.length : null,
    guaranteeSampleSize: withDeadline.length,
    finance,
  };
}

/* -------------------------------------------------------------------------
 * Production queue
 * ---------------------------------------------------------------------- */

export interface QueueRow {
  project: Project;
  customerName: string;
  customerEmail: string;
  taskTotal: number;
  taskDone: number;
  orderStatus: string | null;
  orderNumber: string | null;
}

export interface QueueFilters {
  risk?: RiskLevel[];
  status?: ProjectStatus[];
  search?: string;
  sort?: "deadline" | "risk" | "started" | "reference";
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const RISK_ORDER = sql`case ${projects.riskLevel} when 'red' then 0 when 'yellow' then 1 else 2 end`;

/**
 * The production queue.
 *
 * Sorted by deadline by default, because the only question this screen exists
 * to answer is "what needs attention first". Risk sorting puts red at the top;
 * both are stable through pagination.
 */
export async function productionQueue(
  filters: QueueFilters,
  context: AuthContext,
): Promise<Paged<QueueRow>> {
  requirePermission(context, "project:read:all");

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));

  const where: SQL[] = [inArray(projects.status, [...ACTIVE_STATUSES])];
  if (filters.risk?.length) where.push(inArray(projects.riskLevel, filters.risk));
  if (filters.status?.length) where.push(inArray(projects.status, filters.status));

  if (filters.search) {
    const term = `%${filters.search.replace(/[%_]/g, "\\$&")}%`;
    // Named columns only, never a scan across raw jsonb.
    const matcher = or(
      sql`${projects.reference} ilike ${term}`,
      sql`${users.displayName} ilike ${term}`,
      sql`${users.email} ilike ${term}`,
    );
    if (matcher) where.push(matcher);
  }

  const condition = and(...where);

  const sortColumn =
    filters.sort === "risk"
      ? RISK_ORDER
      : filters.sort === "started"
        ? projects.buildStartedAt
        : filters.sort === "reference"
          ? projects.reference
          : projects.deadlineAt;

  const ordered = filters.direction === "desc" ? desc(sortColumn) : asc(sortColumn);

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        project: projects,
        customerName: users.displayName,
        customerEmail: users.email,
        orderStatus: orders.status,
        orderNumber: orders.number,
        taskTotal: sql<number>`(
          select count(*)::int from ${productionTasks}
          where ${productionTasks.projectId} = ${projects.id}
            and ${productionTasks.status} <> 'cancelled'
        )`,
        taskDone: sql<number>`(
          select count(*)::int from ${productionTasks}
          where ${productionTasks.projectId} = ${projects.id}
            and ${productionTasks.status} = 'done'
        )`,
      })
      .from(projects)
      .innerJoin(users, eq(users.id, projects.ownerId))
      .leftJoin(orders, eq(orders.projectId, projects.id))
      .where(condition)
      // Reference is the tiebreak so pagination is stable when two projects
      // share a deadline.
      .orderBy(ordered, asc(projects.reference))
      .limit(pageSize)
      .offset((page - 1) * pageSize),

    db
      .select({ total: sql<number>`count(*)::int` })
      .from(projects)
      .innerJoin(users, eq(users.id, projects.ownerId))
      .where(condition),
  ]);

  const total = counted?.total ?? 0;

  return {
    rows: rows.map((row) => ({
      project: row.project,
      customerName: row.customerName ?? row.customerEmail,
      customerEmail: row.customerEmail,
      taskTotal: row.taskTotal,
      taskDone: row.taskDone,
      orderStatus: row.orderStatus,
      orderNumber: row.orderNumber,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/* -------------------------------------------------------------------------
 * Customers
 * ---------------------------------------------------------------------- */

export interface CustomerRow {
  id: string;
  displayName: string | null;
  email: string;
  businessName: string | null;
  /** Omitted without `customer:read:sensitive`. */
  billingCountry: string | null;
  taxId: string | null;
  projectCount: number;
  createdAt: Date;
}

export async function customerList(
  filters: {
    search?: string;
    page?: number;
    pageSize?: number;
    sort?: "name" | "joined";
  },
  context: AuthContext,
): Promise<Paged<CustomerRow>> {
  requirePermission(context, "customer:read");

  const seesSensitive = context.can("customer:read:sensitive");

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));

  const where: SQL[] = [eq(users.role, "customer")];
  if (filters.search) {
    const term = `%${filters.search.replace(/[%_]/g, "\\$&")}%`;
    const matcher = or(
      sql`${users.displayName} ilike ${term}`,
      sql`${users.email} ilike ${term}`,
      sql`${users.businessName} ilike ${term}`,
    );
    if (matcher) where.push(matcher);
  }

  const condition = and(...where);

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        businessName: users.businessName,
        billingCountry: users.billingCountry,
        taxId: users.taxId,
        createdAt: users.createdAt,
        projectCount: sql<number>`(
          select count(*)::int from ${projects} where ${projects.ownerId} = ${users.id}
        )`,
      })
      .from(users)
      .where(condition)
      .orderBy(filters.sort === "name" ? asc(users.displayName) : desc(users.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),

    db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .where(condition),
  ]);

  const total = counted?.total ?? 0;

  return {
    // Commercial detail is stripped here, in the query, rather than hidden in
    // the template. A component that forgets to check cannot leak what it was
    // never given.
    rows: rows.map((row) => ({
      ...row,
      billingCountry: seesSensitive ? row.billingCountry : null,
      taxId: seesSensitive ? row.taxId : null,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/* -------------------------------------------------------------------------
 * Global search
 * ---------------------------------------------------------------------- */

export interface SearchHit {
  type: "project" | "customer" | "order" | "invoice";
  id: string;
  label: string;
  detail: string;
  href: string;
}

/**
 * Global search.
 *
 * Searches named, indexed columns across the entities the caller is permitted
 * to see -- never a scan across raw table content. A staff member without
 * `finance:read` searching an invoice number gets nothing back, rather than a
 * result they cannot open.
 */
export async function adminSearch(
  term: string,
  context: AuthContext,
  limit = 5,
): Promise<SearchHit[]> {
  const trimmed = term.trim();
  if (trimmed.length < 2) return [];

  const pattern = `%${trimmed.replace(/[%_]/g, "\\$&")}%`;
  const hits: SearchHit[] = [];

  if (context.can("project:read:all")) {
    const found = await db
      .select({ id: projects.id, reference: projects.reference, status: projects.status })
      .from(projects)
      .where(sql`${projects.reference} ilike ${pattern}`)
      .limit(limit);

    hits.push(
      ...found.map((row) => ({
        type: "project" as const,
        id: row.id,
        label: row.reference,
        detail: row.status,
        href: `/admin/projects/${row.reference}`,
      })),
    );
  }

  if (context.can("customer:read")) {
    const found = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
      })
      .from(users)
      .where(
        and(
          eq(users.role, "customer"),
          or(
            sql`${users.displayName} ilike ${pattern}`,
            sql`${users.email} ilike ${pattern}`,
            sql`${users.businessName} ilike ${pattern}`,
          ),
        ),
      )
      .limit(limit);

    hits.push(
      ...found.map((row) => ({
        type: "customer" as const,
        id: row.id,
        label: row.displayName ?? row.email,
        detail: row.email,
        href: `/admin/customers/${row.id}`,
      })),
    );
  }

  if (context.can("finance:read")) {
    const [foundOrders, foundInvoices] = await Promise.all([
      db
        .select({ id: orders.id, number: orders.number, status: orders.status })
        .from(orders)
        .where(sql`${orders.number} ilike ${pattern}`)
        .limit(limit),
      db
        .select({ id: invoices.id, number: invoices.number, status: invoices.status })
        .from(invoices)
        .where(sql`${invoices.number} ilike ${pattern}`)
        .limit(limit),
    ]);

    hits.push(
      ...foundOrders.map((row) => ({
        type: "order" as const,
        id: row.id,
        label: row.number,
        detail: row.status,
        href: `/admin/payments?order=${row.number}`,
      })),
      ...foundInvoices.map((row) => ({
        type: "invoice" as const,
        id: row.id,
        label: row.number,
        detail: row.status,
        href: `/admin/invoices?invoice=${row.number}`,
      })),
    );
  }

  return hits;
}

/* -------------------------------------------------------------------------
 * Team
 * ---------------------------------------------------------------------- */

export async function staffList(context: AuthContext) {
  requirePermission(context, "user:manage");

  return db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(ne(users.role, "customer"))
    .orderBy(asc(users.email));
}
