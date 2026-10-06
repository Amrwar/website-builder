import type {
  ChecklistState,
  DnsState,
  DomainVerification,
  SslState,
} from "@/db/schema/enums";
import type { LaunchChecklistDefinition } from "@/config/launch";

/**
 * Launch readiness.
 *
 * Pure, deterministic, and explainable -- the same discipline as the deadline
 * risk engine. "Not ready" with no reason is a dead end for whoever reads it,
 * so every refusal names the items responsible.
 *
 * Readiness is computed from recorded facts, never asserted. A deployment
 * counts only when the hosting provider confirmed it; a certificate counts
 * only when it has actually been issued. The whole point of this module is
 * that nothing here can decide a site is live because the code expected it to
 * be.
 */

export interface ChecklistEntry {
  item: LaunchChecklistDefinition;
  state: ChecklistState;
  note: string | null;
  completedAt: Date | null;
}

/** The observed facts a launch depends on, outside the checklist itself. */
export interface LaunchFacts {
  /** True only when a production deployment the provider confirmed exists. */
  hasConfirmedProductionDeployment: boolean;
  productionUrl: string | null;
  domainVerification: DomainVerification | null;
  dnsState: DnsState | null;
  sslState: SslState | null;
  /** The customer has signed off the preview. */
  previewApproved: boolean;
  /** Already launched, with the moment it happened. */
  launchedAt: Date | null;
}

export type BlockerCode =
  | "checklist_incomplete"
  | "no_confirmed_deployment"
  | "domain_unverified"
  | "dns_not_configured"
  | "ssl_not_issued"
  | "preview_not_approved";

export interface LaunchBlocker {
  code: BlockerCode;
  /** Checklist keys responsible, where the blocker is about the checklist. */
  itemKeys: readonly string[];
}

export interface LaunchReadiness {
  /** True when nothing stands between this project and going live. */
  ready: boolean;
  /** Already live. A launched project is not "ready", it is done. */
  launched: boolean;
  blockers: readonly LaunchBlocker[];
  /** Required items resolved, out of required items that apply. */
  completed: number;
  required: number;
  /** 0–100, for a progress bar. 100 does not by itself mean ready. */
  percent: number;
}

/** Resolved means done or deliberately ruled out, not merely touched. */
function isResolved(state: ChecklistState): boolean {
  return state === "done" || state === "not_applicable";
}

export function assessLaunchReadiness(
  entries: readonly ChecklistEntry[],
  facts: LaunchFacts,
): LaunchReadiness {
  const required = entries.filter((entry) => entry.item.isRequired);
  const unresolved = required.filter((entry) => !isResolved(entry.state));

  const blockers: LaunchBlocker[] = [];

  if (unresolved.length > 0) {
    blockers.push({
      code: "checklist_incomplete",
      itemKeys: unresolved.map((entry) => entry.item.key),
    });
  }

  if (!facts.previewApproved) {
    blockers.push({ code: "preview_not_approved", itemKeys: [] });
  }

  // These are only blockers for products that actually deploy somewhere. An
  // automation has no domain, and demanding a certificate for it would make
  // the Launch Centre unusable for every product that is not a website.
  const needsHosting = entries.some((entry) => entry.item.key === "production_deployed");

  if (needsHosting) {
    if (!facts.hasConfirmedProductionDeployment) {
      blockers.push({ code: "no_confirmed_deployment", itemKeys: [] });
    }
    if (facts.domainVerification !== "verified") {
      blockers.push({ code: "domain_unverified", itemKeys: [] });
    }
    if (facts.dnsState !== "configured") {
      blockers.push({ code: "dns_not_configured", itemKeys: [] });
    }
    if (facts.sslState !== "issued") {
      blockers.push({ code: "ssl_not_issued", itemKeys: [] });
    }
  }

  const completed = required.length - unresolved.length;

  return {
    ready: blockers.length === 0 && facts.launchedAt === null,
    launched: facts.launchedAt !== null,
    blockers,
    completed,
    required: required.length,
    percent:
      required.length === 0 ? 100 : Math.round((completed / required.length) * 100),
  };
}

/**
 * Whether a certificate is close enough to expiry to say something.
 *
 * Returns null when there is nothing to warn about, so a caller renders a
 * warning only when one exists rather than deciding what "soon" means itself.
 */
export function sslExpiryWarning(
  expiresAt: Date | null,
  now: Date,
  withinDays: number,
): { daysRemaining: number; expired: boolean } | null {
  if (!expiresAt) return null;

  const days = Math.floor((expiresAt.getTime() - now.getTime()) / 86_400_000);
  if (days > withinDays) return null;

  return { daysRemaining: days, expired: days < 0 };
}
