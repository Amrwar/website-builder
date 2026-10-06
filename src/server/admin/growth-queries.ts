import "server-only";

import { aliasedTable, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  commissions,
  orders,
  projects,
  referralCodes,
  referrals,
  showcaseEntries,
  users,
  type Commission,
  type Referral,
  type ShowcaseEntry,
} from "@/db/schema";
import { ApiError } from "@/lib/api/response";
import type { AuthContext } from "@/server/auth";

/**
 * Admin reads for the growth console.
 *
 * Staff do see who referred whom, because that is the only way a flagged
 * referral can be judged. That is also why these are gated on `analytics:read`
 * and `finance:read` rather than on `admin:access`: the ability to reach the
 * console is not the ability to see who somebody's friends are.
 */

export interface ReferralRow {
  referral: Referral;
  code: string;
  referrerEmail: string | null;
  referredEmail: string;
  projectReference: string | null;
}

/**
 * Every referral, newest first.
 *
 * Joins the users table twice — once for each side — through an alias. Without
 * the alias the second join silently reuses the first, and every row would
 * report the referrer's address as the referred customer's.
 */
export async function listReferrals(context: AuthContext): Promise<ReferralRow[]> {
  if (!context.can("analytics:read")) throw new ApiError("not_found", "Not found.");

  const referrer = aliasedTable(users, "referrer");
  const referred = aliasedTable(users, "referred");

  const rows = await db
    .select({
      referral: referrals,
      code: referralCodes.code,
      referrerEmail: referrer.email,
      referredEmail: referred.email,
      projectReference: projects.reference,
    })
    .from(referrals)
    .innerJoin(referralCodes, eq(referralCodes.id, referrals.codeId))
    .leftJoin(referrer, eq(referrer.id, referrals.referrerUserId))
    .innerJoin(referred, eq(referred.id, referrals.referredUserId))
    .leftJoin(projects, eq(projects.id, referrals.convertedProjectId))
    .orderBy(desc(referrals.createdAt))
    .limit(200);

  return rows;
}

export interface CommissionRow {
  commission: Commission;
  orderNumber: string;
  earnerName: string;
}

/** Commissions with who earned them and which order they came from. */
export async function listCommissionRows(context: AuthContext): Promise<CommissionRow[]> {
  if (!context.can("finance:read")) throw new ApiError("not_found", "Not found.");

  const rows = await db
    .select({ commission: commissions, orderNumber: orders.number })
    .from(commissions)
    .innerJoin(orders, eq(orders.id, commissions.orderId))
    .orderBy(desc(commissions.createdAt))
    .limit(200);

  if (rows.length === 0) return [];

  // Resolved in one pass rather than two more joins: a commission has exactly
  // one earner, and which table it is in is already on the row.
  const { partners, affiliates } = await import("@/db/schema");
  const [partnerRows, affiliateRows] = await Promise.all([
    db.select({ id: partners.id, name: partners.companyName }).from(partners),
    db.select({ id: affiliates.id, name: affiliates.name }).from(affiliates),
  ]);

  const names = new Map<string, string>();
  for (const row of partnerRows) names.set(row.id, row.name);
  for (const row of affiliateRows) names.set(row.id, row.name);

  return rows.map((row) => ({
    commission: row.commission,
    orderNumber: row.orderNumber,
    earnerName:
      names.get(row.commission.partnerId ?? row.commission.affiliateId ?? "") ?? "—",
  }));
}

export interface ShowcaseRow {
  entry: ShowcaseEntry;
  projectReference: string;
}

export async function listShowcaseRows(context: AuthContext): Promise<ShowcaseRow[]> {
  if (!context.can("customer:read")) throw new ApiError("not_found", "Not found.");

  return db
    .select({ entry: showcaseEntries, projectReference: projects.reference })
    .from(showcaseEntries)
    .innerJoin(projects, eq(projects.id, showcaseEntries.projectId))
    .orderBy(desc(showcaseEntries.createdAt));
}
