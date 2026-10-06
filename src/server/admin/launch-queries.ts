import "server-only";

import { and, asc, desc, eq, inArray, lte, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  deployments,
  domains,
  projectHosting,
  projects,
  subscriptions,
  users,
  type Domain,
  type ProjectHosting,
} from "@/db/schema";
import { ApiError } from "@/lib/api/response";
import type { AuthContext } from "@/server/auth";

/**
 * Admin reads for hosting, domains and subscriptions.
 *
 * Every query joins through to the project and its owner, because a row that
 * says "example.com — certificate expired" without saying whose site it is
 * cannot be acted on.
 *
 * Nothing here writes. The admin console reads these and acts through the
 * services in `server/launch` and `server/subscriptions`, which apply their
 * own permissions.
 */

function requireProjectAccess(context: AuthContext): void {
  if (!context.can("project:manage")) {
    throw new ApiError("not_found", "Not found.");
  }
}

export interface DomainRow {
  domain: Domain;
  projectReference: string;
  projectStatus: string;
  ownerName: string | null;
  /** Days until the certificate expires. Negative means it already has. */
  certificateDaysRemaining: number | null;
}

/**
 * Every domain on the platform.
 *
 * Sorted by certificate expiry ascending with nulls last, so the ones about to
 * go dark are the first thing on the page. A list sorted by name would bury
 * the only row that needs attention today.
 */
export async function listDomains(context: AuthContext): Promise<DomainRow[]> {
  requireProjectAccess(context);

  const rows = await db
    .select({
      domain: domains,
      reference: projects.reference,
      status: projects.status,
      ownerName: users.displayName,
    })
    .from(domains)
    .innerJoin(projects, eq(projects.id, domains.projectId))
    .leftJoin(users, eq(users.id, projects.ownerId))
    // Raw rather than `asc(...)`: the direction has to come before NULLS LAST,
    // and wrapping produces "... nulls last asc", which Postgres rejects.
    .orderBy(sql`${domains.sslExpiresAt} asc nulls last`, asc(domains.name));

  const now = Date.now();

  return rows.map((row) => ({
    domain: row.domain,
    projectReference: row.reference,
    projectStatus: row.status,
    ownerName: row.ownerName,
    certificateDaysRemaining: row.domain.sslExpiresAt
      ? Math.floor((row.domain.sslExpiresAt.getTime() - now) / 86_400_000)
      : null,
  }));
}

export interface HostingRow {
  hosting: ProjectHosting;
  projectReference: string;
  ownerName: string | null;
  primaryDomain: string | null;
  /** The confirmed production deployment, if there is one. */
  liveVersion: string | null;
  liveConfirmedAt: Date | null;
}

/**
 * Every hosted project.
 *
 * `liveVersion` is read from a deployment the provider confirmed. A project
 * whose hosting row says "active" but which has no confirmed deployment shows
 * an empty version, which is the honest answer and the one worth investigating.
 */
export async function listHosting(context: AuthContext): Promise<HostingRow[]> {
  requireProjectAccess(context);

  const rows = await db
    .select({
      hosting: projectHosting,
      reference: projects.reference,
      ownerName: users.displayName,
    })
    .from(projectHosting)
    .innerJoin(projects, eq(projects.id, projectHosting.projectId))
    .leftJoin(users, eq(users.id, projects.ownerId))
    .orderBy(asc(projects.reference));

  if (rows.length === 0) return [];

  const projectIds = rows.map((row) => row.hosting.projectId);

  // Both scoped to the projects on this page. Reading every domain and every
  // production deployment on the platform to fill in a handful of columns is a
  // scan that only grows, and a query should not read rows nobody asked for.
  const [primaries, live] = await Promise.all([
    db
      .select({ projectId: domains.projectId, name: domains.name })
      .from(domains)
      .where(and(eq(domains.isPrimary, true), inArray(domains.projectId, projectIds))),
    db
      .select({
        projectId: deployments.projectId,
        version: deployments.version,
        confirmedAt: deployments.providerConfirmedAt,
      })
      .from(deployments)
      .where(
        and(
          eq(deployments.environment, "production"),
          eq(deployments.state, "ready"),
          inArray(deployments.projectId, projectIds),
        ),
      )
      .orderBy(desc(deployments.providerConfirmedAt)),
  ]);

  const domainByProject = new Map(primaries.map((row) => [row.projectId, row.name]));
  const liveByProject = new Map<string, (typeof live)[number]>();
  for (const row of live) {
    // Ordered newest first, so the first one seen for a project is the live one.
    if (!liveByProject.has(row.projectId)) liveByProject.set(row.projectId, row);
  }

  return rows.map((row) => {
    const deployment = liveByProject.get(row.hosting.projectId);
    return {
      hosting: row.hosting,
      projectReference: row.reference,
      ownerName: row.ownerName,
      primaryDomain: domainByProject.get(row.hosting.projectId) ?? null,
      liveVersion: deployment?.version ?? null,
      liveConfirmedAt: deployment?.confirmedAt ?? null,
    };
  });
}

export interface SubscriptionRow {
  id: string;
  reference: string;
  planKey: string;
  status: string;
  priceMinorUnits: number;
  currency: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  projectReference: string | null;
  ownerName: string | null;
}

/**
 * Every subscription, for the finance view.
 *
 * Needs `finance:read` rather than `project:manage`: this is revenue, and a
 * project manager who may change a deadline has no reason to see what every
 * customer pays.
 */
export async function listSubscriptions(
  context: AuthContext,
): Promise<SubscriptionRow[]> {
  if (!context.can("finance:read")) {
    throw new ApiError("not_found", "Not found.");
  }

  const rows = await db
    .select({
      subscription: subscriptions,
      reference: projects.reference,
      ownerName: users.displayName,
    })
    .from(subscriptions)
    .leftJoin(projects, eq(projects.id, subscriptions.projectId))
    .leftJoin(users, eq(users.id, subscriptions.ownerId))
    .orderBy(asc(subscriptions.currentPeriodEnd));

  return rows.map((row) => ({
    id: row.subscription.id,
    reference: row.subscription.reference,
    planKey: row.subscription.planKey,
    status: row.subscription.status,
    priceMinorUnits: row.subscription.priceMinorUnits,
    currency: row.subscription.currency,
    currentPeriodEnd: row.subscription.currentPeriodEnd,
    cancelAtPeriodEnd: row.subscription.cancelAtPeriodEnd,
    projectReference: row.reference,
    ownerName: row.ownerName,
  }));
}

/**
 * Subscriptions due to renew, for the sweep that bills them.
 *
 * Not permission-gated, because its caller is the scheduler rather than a
 * person. It is not exported through any route.
 */
export async function dueForRenewal(now: Date = new Date(), limit = 100) {
  return db
    .select()
    .from(subscriptions)
    .where(
      and(
        lte(subscriptions.currentPeriodEnd, now),
        or(
          eq(subscriptions.status, "active"),
          eq(subscriptions.status, "trialing"),
          eq(subscriptions.status, "past_due"),
        ),
      ),
    )
    .orderBy(asc(subscriptions.currentPeriodEnd))
    .limit(limit);
}
