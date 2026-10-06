import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { projects, type Project } from "@/db/schema";
import { SSL_EXPIRY_WARNING_DAYS } from "@/config/launch";
import { ApiError } from "@/lib/api/response";
import {
  assessLaunchReadiness,
  sslExpiryWarning,
  type ChecklistEntry,
  type LaunchReadiness,
} from "@/lib/launch/readiness";
import { logger } from "@/lib/logger";
import { outboundOrigin } from "@/lib/site-origin";
import { notify } from "@/server/notifications";
import type { AuthContext } from "@/server/auth";
import { emit } from "@/server/events/bus";
import { checklistForProject } from "./checklist";
import { deploymentHistory, liveDeployment } from "./deployments";
import { domainsForProject, hostingFor, primaryDomain } from "./domains";

/**
 * The Launch Centre.
 *
 * Assembles everything a launch depends on into one answer: the checklist, the
 * deployment the provider confirmed, the domain, DNS, the certificate, hosting
 * and whether the thing is already live.
 *
 * `launchProject` is the only place `projects.launched_at` is ever written,
 * and it refuses unless the readiness assessment says every blocker is clear.
 * That refusal is the point of the module. "Launched" is a claim a customer
 * will act on -- they will send the link to their own customers -- and being
 * wrong about it is worse than being slow.
 */

export interface LaunchCentre {
  project: Project;
  readiness: LaunchReadiness;
  checklist: readonly ChecklistEntry[];
  production: Awaited<ReturnType<typeof liveDeployment>>;
  history: Awaited<ReturnType<typeof deploymentHistory>>;
  hosting: Awaited<ReturnType<typeof hostingFor>>;
  domains: Awaited<ReturnType<typeof domainsForProject>>;
  primary: Awaited<ReturnType<typeof primaryDomain>>;
  /** Null when there is nothing worth saying about certificate expiry. */
  certificateWarning: ReturnType<typeof sslExpiryWarning>;
}

/**
 * Loads the Launch Centre for one project.
 *
 * The project is fetched scoped to what the caller may see, in the query
 * itself rather than fetched and then checked: a filter that is part of the
 * SQL cannot be forgotten by a later edit.
 */
export async function loadLaunchCentre(
  projectId: string,
  context: AuthContext,
  now: Date = new Date(),
): Promise<LaunchCentre> {
  const canReadAll = context.can("project:read:all");

  const project = await db.query.projects.findFirst({
    where: canReadAll
      ? eq(projects.id, projectId)
      : and(eq(projects.id, projectId), eq(projects.ownerId, context.user.id)),
  });

  if (!project) throw new ApiError("not_found", "Not found.");

  const audience = canReadAll ? "staff" : "customer";

  const [checklist, production, history, hosting, allDomains, primary] =
    await Promise.all([
      checklistForProject(project.id, project.productType, audience),
      liveDeployment(project.id, "production"),
      deploymentHistory(project.id),
      hostingFor(project.id),
      domainsForProject(project.id),
      primaryDomain(project.id),
    ]);

  const readiness = assessLaunchReadiness(checklist, {
    // Read from the deployment the provider confirmed, never from a checklist
    // tick. Staff marking "deployed" is an intention; this is a fact.
    hasConfirmedProductionDeployment: production !== undefined,
    productionUrl: production?.url ?? hosting?.productionUrl ?? null,
    domainVerification: primary?.verification ?? null,
    dnsState: primary?.dnsState ?? null,
    sslState: primary?.sslState ?? null,
    previewApproved: project.approvedAt !== null,
    launchedAt: project.launchedAt,
  });

  return {
    project,
    readiness,
    checklist,
    production,
    history,
    hosting,
    domains: allDomains,
    primary,
    certificateWarning: sslExpiryWarning(
      primary?.sslExpiresAt ?? null,
      now,
      SSL_EXPIRY_WARNING_DAYS,
    ),
  };
}

export type LaunchRefusal = "not_ready" | "already_launched" | "wrong_status";

export type LaunchResult =
  | { ok: true; project: Project }
  | { ok: false; reason: LaunchRefusal; readiness: LaunchReadiness };

/**
 * Takes a project live.
 *
 * Requires `build:execute`, re-derives readiness server-side, and writes
 * `launched_at` with a conditional UPDATE so two simultaneous clicks produce
 * one launch rather than two events and two timestamps.
 *
 * There is no force parameter. A launch that overrides its own blockers is a
 * launch that tells a customer their site is live while the certificate is
 * still pending, and no amount of urgency makes that a better outcome than
 * saying "not yet, and here is why".
 */
export async function launchProject(
  projectId: string,
  context: AuthContext,
): Promise<LaunchResult> {
  if (!context.can("build:execute")) {
    throw new ApiError("not_found", "Not found.");
  }

  const centre = await loadLaunchCentre(projectId, context);

  if (centre.project.launchedAt) {
    return { ok: false, reason: "already_launched", readiness: centre.readiness };
  }

  // `approved` and `launching` are the only states a launch can follow. A
  // project still in build has not been seen by the person paying for it.
  if (!["approved", "launching"].includes(centre.project.status)) {
    return { ok: false, reason: "wrong_status", readiness: centre.readiness };
  }

  if (!centre.readiness.ready) {
    return { ok: false, reason: "not_ready", readiness: centre.readiness };
  }

  const now = new Date();

  const [launched] = await db
    .update(projects)
    .set({ status: "launched", launchedAt: now, updatedAt: now })
    .where(
      and(
        eq(projects.id, projectId),
        // The claim: only a project that has not launched may launch. A
        // concurrent second request matches no row and gets the refusal.
        isNull(projects.launchedAt),
      ),
    )
    .returning();

  if (!launched) {
    return { ok: false, reason: "already_launched", readiness: centre.readiness };
  }

  await emit({
    name: "launch.completed",
    projectId,
    actorType: "staff",
    actorId: context.user.id,
    payload: {
      launchedAt: now.toISOString(),
      productionUrl: centre.production?.url ?? null,
      domain: centre.primary?.name ?? null,
    },
  });

  logger.info("project launched", {
    projectId,
    reference: launched.reference,
    url: centre.production?.url,
  });

  try {
    await notify({
      recipientId: launched.ownerId,
      kind: "project_launched",
      params: { reference: launched.reference },
      projectId: launched.id,
      dedupeKey: `project_launched:${launched.id}`,
      path: `/projects/${launched.reference}`,
      origin: outboundOrigin(),
    });
  } catch (error) {
    // A launch that happened must never be reported as failed because the
    // customer could not be told. The site is live either way.
    logger.error("notification failed after launch", { projectId, error });
  }

  return { ok: true, project: launched };
}

export { checklistForProject, setChecklistState } from "./checklist";
export {
  confirmDeployment,
  deploymentHistory,
  failDeployment,
  liveDeployment,
  recordDeployment,
  rollbackTo,
} from "./deployments";
export {
  addDomain,
  domainsForProject,
  hostingFor,
  normaliseDomain,
  primaryDomain,
  recordCertificate,
  recordDns,
  recordUptime,
  recordVerification,
  upsertHosting,
} from "./domains";
