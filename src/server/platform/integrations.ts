import "server-only";

import {
  INTEGRATIONS,
  type Integration,
  type IntegrationCapability,
} from "@/config/integrations";

/**
 * Which integrations are actually configured in this deployment.
 *
 * Separate from the registry because answering it needs the server
 * environment, and the registry is client-safe. Reports presence only: a
 * credential's value never leaves `process.env` through here, which is why the
 * declaration lists variable *names*.
 *
 * The question this exists to answer is the one that went unanswered when
 * email shipped: "is it wired, and if not, what stops working?" A deployment
 * missing a `degrades` integration is a decision; one missing a `blocks`
 * integration is an outage waiting for its first request.
 */
export interface IntegrationStatus {
  integration: Integration;
  configured: boolean;
  /** Names of the variables that are missing. Never values. */
  missing: readonly string[];
}

function statusOf(integration: Integration): IntegrationStatus {
  const missing = integration.requires.filter((name) => {
    const value = process.env[name];
    return value === undefined || value.trim() === "";
  });
  return { integration, configured: missing.length === 0, missing };
}

export function integrationStatuses(): readonly IntegrationStatus[] {
  return INTEGRATIONS.map(statusOf);
}

export function integrationStatus(id: string): IntegrationStatus | undefined {
  const integration = INTEGRATIONS.find((entry) => entry.id === id);
  return integration ? statusOf(integration) : undefined;
}

/**
 * True when at least one provider for a capability is usable.
 *
 * Phrased per capability rather than per provider so a caller asks "can this
 * platform send email?" instead of "is Resend configured?" -- which is what
 * lets a second provider be added without rewriting the question.
 */
export function hasCapability(capability: IntegrationCapability): boolean {
  return INTEGRATIONS.filter((entry) => entry.capability === capability).some(
    (entry) => statusOf(entry).configured,
  );
}

/**
 * Integrations whose absence stops the platform working.
 *
 * Intended for a startup check or a staff health view. Returning the list
 * rather than throwing is deliberate: the caller decides whether a missing
 * credential is fatal here, and a build-time import should never be able to
 * take the process down.
 */
export function blockingGaps(): readonly IntegrationStatus[] {
  return integrationStatuses().filter(
    (status) => !status.configured && status.integration.whenAbsent === "blocks",
  );
}
