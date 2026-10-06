import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { domains, projectHosting, type Domain, type ProjectHosting } from "@/db/schema";
import type { DnsState, SslState } from "@/db/schema/enums";
import { HOSTING_PROVIDER } from "@/config/launch";
import { ApiError } from "@/lib/api/response";
import type { AuthContext } from "@/server/auth";
import { emit } from "@/server/events/bus";

/**
 * Domains and hosting.
 *
 * Verification, DNS and SSL are tracked separately because they are three
 * failures with three different fixes, and the customer has to be told which
 * one they are looking at. A single "domain status" produces exactly the
 * support ticket this module exists to prevent: "it says error, what do I do?"
 *
 * Every state here is **observed and recorded**, never assumed. `recordDns`
 * and `recordCertificate` take the state somebody actually checked; nothing in
 * this file concludes that a certificate must have been issued because a
 * request to issue one was made.
 */

/** Lower-cased, trimmed, and without a scheme or a path. */
export function normaliseDomain(value: string): string | null {
  const trimmed = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  // Deliberately narrow. A hostname that needs punycode, a port or a path is
  // not something to guess at silently.
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(trimmed)
    ? trimmed
    : null;
}

export type DomainRefusal = "invalid_domain" | "already_claimed" | "not_found";

export type DomainResult<T> =
  { ok: true; value: T } | { ok: false; reason: DomainRefusal };

/**
 * Attaches a domain to a project.
 *
 * The verification token is generated here rather than accepted from a caller:
 * a token the requester chose proves nothing, because proving control of a
 * domain means publishing a value they could not have predicted.
 */
export async function addDomain(
  input: { projectId: string; name: string; isPrimary?: boolean },
  context: AuthContext,
): Promise<DomainResult<Domain>> {
  if (!context.can("build:execute")) {
    throw new ApiError("not_found", "Not found.");
  }

  const name = normaliseDomain(input.name);
  if (!name) return { ok: false, reason: "invalid_domain" };

  try {
    const created = await db.transaction(async (tx) => {
      if (input.isPrimary) {
        // One primary per project, enforced by a partial unique index. Demoting
        // the incumbent first is what makes the swap possible at all.
        await tx
          .update(domains)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(
            and(eq(domains.projectId, input.projectId), eq(domains.isPrimary, true)),
          );
      }

      const [row] = await tx
        .insert(domains)
        .values({
          projectId: input.projectId,
          name,
          isPrimary: input.isPrimary ?? false,
          verification: "pending",
          verificationToken: `buildline-verify=${crypto.randomUUID()}`,
        })
        .returning();

      return row;
    });

    if (!created) throw new ApiError("internal_error", "That domain was not saved.");
    return { ok: true, value: created };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // A hostname can only point at one project, and the unique index is what
    // stops two customers claiming the same one.
    if (String(error).includes("domains_name_key")) {
      return { ok: false, reason: "already_claimed" };
    }
    throw error;
  }
}

/**
 * Records that ownership was proved.
 *
 * Separate from DNS on purpose: a domain can be verifiably theirs while its
 * records still point somewhere else entirely, and telling somebody "verified"
 * when their site is still dark would be worse than saying nothing.
 */
export async function recordVerification(
  domainId: string,
  verified: boolean,
  context: AuthContext,
): Promise<DomainResult<Domain>> {
  if (!context.can("build:execute")) {
    throw new ApiError("not_found", "Not found.");
  }

  const [row] = await db
    .update(domains)
    .set({
      verification: verified ? "verified" : "failed",
      verifiedAt: verified ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(domains.id, domainId))
    .returning();

  if (!row) return { ok: false, reason: "not_found" };

  if (verified) {
    await emit({
      name: "domain.verified",
      projectId: row.projectId,
      actorType: "staff",
      actorId: context.user.id,
      payload: { domain: row.name },
    });
  }

  return { ok: true, value: row };
}

/** Records what DNS actually resolves to, with the moment it was checked. */
export async function recordDns(
  domainId: string,
  state: DnsState,
  context: AuthContext,
): Promise<DomainResult<Domain>> {
  if (!context.can("build:execute")) {
    throw new ApiError("not_found", "Not found.");
  }

  const [row] = await db
    .update(domains)
    .set({ dnsState: state, dnsCheckedAt: new Date(), updatedAt: new Date() })
    .where(eq(domains.id, domainId))
    .returning();

  if (!row) return { ok: false, reason: "not_found" };

  if (state === "configured") {
    await emit({
      name: "domain.dns_configured",
      projectId: row.projectId,
      actorType: "staff",
      actorId: context.user.id,
      payload: { domain: row.name },
    });
  }

  return { ok: true, value: row };
}

/**
 * Records a certificate.
 *
 * `expiresAt` is required for an issued certificate. A certificate with no
 * expiry recorded is one nobody will renew, and a site going dark at 3am
 * because an expiry was never written down is the most avoidable outage there
 * is.
 */
export async function recordCertificate(
  input: { domainId: string; state: SslState; expiresAt?: Date | null },
  context: AuthContext,
): Promise<DomainResult<Domain>> {
  if (!context.can("build:execute")) {
    throw new ApiError("not_found", "Not found.");
  }

  if (input.state === "issued" && !input.expiresAt) {
    throw new ApiError(
      "validation_failed",
      "An issued certificate needs the date it expires.",
    );
  }

  const [row] = await db
    .update(domains)
    .set({
      sslState: input.state,
      sslIssuedAt: input.state === "issued" ? new Date() : null,
      sslExpiresAt: input.expiresAt ?? null,
      updatedAt: new Date(),
    })
    .where(eq(domains.id, input.domainId))
    .returning();

  if (!row) return { ok: false, reason: "not_found" };

  if (input.state === "issued") {
    await emit({
      name: "domain.ssl_issued",
      projectId: row.projectId,
      actorType: "staff",
      actorId: context.user.id,
      payload: {
        domain: row.name,
        expiresAt: input.expiresAt?.toISOString() ?? null,
      },
    });
  }

  return { ok: true, value: row };
}

export async function domainsForProject(projectId: string): Promise<Domain[]> {
  return db
    .select()
    .from(domains)
    .where(eq(domains.projectId, projectId))
    .orderBy(asc(domains.name));
}

export async function primaryDomain(projectId: string): Promise<Domain | undefined> {
  return db.query.domains.findFirst({
    where: and(eq(domains.projectId, projectId), eq(domains.isPrimary, true)),
  });
}

/* -------------------------------------------------------------------------
 * Hosting
 * ---------------------------------------------------------------------- */

export async function hostingFor(projectId: string): Promise<ProjectHosting | undefined> {
  return db.query.projectHosting.findFirst({
    where: eq(projectHosting.projectId, projectId),
  });
}

/**
 * Creates or updates the hosting record for a project.
 *
 * Upserted on `projectId` rather than checked-then-inserted, so two concurrent
 * activations converge on one row instead of racing to create a second.
 */
export async function upsertHosting(
  input: {
    projectId: string;
    status?: ProjectHosting["status"];
    planKey?: string | null;
    providerProjectId?: string | null;
    productionUrl?: string | null;
  },
  context: AuthContext,
): Promise<ProjectHosting> {
  if (!context.can("build:execute")) {
    throw new ApiError("not_found", "Not found.");
  }

  const status = input.status ?? "active";
  const now = new Date();

  const [row] = await db
    .insert(projectHosting)
    .values({
      projectId: input.projectId,
      status,
      planKey: input.planKey ?? null,
      provider: HOSTING_PROVIDER,
      providerProjectId: input.providerProjectId ?? null,
      productionUrl: input.productionUrl ?? null,
      activatedAt: status === "active" ? now : null,
    })
    .onConflictDoUpdate({
      target: projectHosting.projectId,
      set: {
        status,
        ...(input.planKey !== undefined ? { planKey: input.planKey } : {}),
        ...(input.providerProjectId !== undefined
          ? { providerProjectId: input.providerProjectId }
          : {}),
        ...(input.productionUrl !== undefined
          ? { productionUrl: input.productionUrl }
          : {}),
        ...(status === "active" ? { activatedAt: now, suspendedAt: null } : {}),
        ...(status === "suspended" ? { suspendedAt: now } : {}),
        ...(status === "cancelled" ? { cancelledAt: now } : {}),
        updatedAt: now,
      },
    })
    .returning();

  if (!row) throw new ApiError("internal_error", "Hosting was not saved.");

  if (status === "active") {
    await emit({
      name: "hosting.activated",
      projectId: input.projectId,
      actorType: "staff",
      actorId: context.user.id,
      payload: { planKey: row.planKey, provider: row.provider },
    });
  }

  return row;
}

/**
 * Records a measured uptime figure.
 *
 * The timestamp is written with it and a CHECK constraint requires both or
 * neither, because an uptime percentage with no "as of" beside it is a number
 * nobody should act on and a claim nobody can check.
 */
export async function recordUptime(
  projectId: string,
  basisPoints: number,
  context: AuthContext,
): Promise<ProjectHosting | undefined> {
  if (!context.can("build:execute")) {
    throw new ApiError("not_found", "Not found.");
  }

  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new ApiError("validation_failed", "Uptime is a percentage in basis points.");
  }

  const [row] = await db
    .update(projectHosting)
    .set({
      uptimeBasisPoints: basisPoints,
      uptimeCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(projectHosting.projectId, projectId))
    .returning();

  return row;
}
