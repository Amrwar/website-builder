/**
 * External systems the platform depends on.
 *
 * The platform already talks to six of these, each behind its own seam, and
 * until now there was no single place that said so. The cost was not
 * theoretical: email shipped with a transport that could not deliver, and
 * nothing in the application could answer "is email configured?" without
 * someone reading `transport.ts`.
 *
 * ── What a seam is ────────────────────────────────────────────────────────
 * Every integration here is reached through one interface with a local
 * default, so the provider can be replaced without touching callers:
 * `ScopeAssessor`, `PaymentProvider`, `EmailTransport`. That pattern is the
 * platform's answer to vendor risk, and naming it here is what makes it a
 * pattern rather than three coincidences.
 *
 * ── Why this is config and not a table ────────────────────────────────────
 * Integrations are chosen by whoever deploys the platform, not by a customer
 * at runtime. A table would imply they can be added through the product, which
 * they cannot: adding one means writing an adapter. The *state* of an
 * integration -- whether its credential is actually present -- is a runtime
 * question, and lives in `server/platform/integrations.ts` because answering
 * it needs the server environment.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** What an integration does for the platform. */
export const INTEGRATION_CAPABILITIES = [
  "identity",
  "payments",
  "email",
  "database",
  "file_storage",
  "error_tracking",
  "scope_assessment",
] as const;

export type IntegrationCapability = (typeof INTEGRATION_CAPABILITIES)[number];

export interface Integration {
  id: string;
  capability: IntegrationCapability;
  /**
   * Environment variables that must be present for this to work.
   *
   * Names only, never values. Used to report what is configured without
   * anything reading a secret.
   */
  requires: readonly string[];
  /**
   * What happens when it is not configured.
   *
   * `blocks` means the platform cannot function -- there is no local
   * substitute for a database. `degrades` means a named, visible reduction in
   * behaviour: no email is sent, and the platform says so rather than
   * pretending. Writing this down is what stops a missing credential being
   * discovered as a silent failure in production.
   */
  whenAbsent: "blocks" | "degrades";
  /** Where the swap happens, for whoever is replacing it. */
  seam: string;
}

export const INTEGRATIONS = [
  {
    id: "clerk",
    capability: "identity",
    requires: ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
    whenAbsent: "blocks",
    seam: "src/server/auth.ts",
  },
  {
    id: "neon",
    capability: "database",
    requires: ["DATABASE_URL"],
    whenAbsent: "blocks",
    seam: "src/db/client.ts",
  },
  {
    id: "stripe",
    capability: "payments",
    requires: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    whenAbsent: "blocks",
    seam: "src/server/payments/stripe-provider.ts",
  },
  {
    id: "resend",
    capability: "email",
    requires: ["RESEND_API_KEY", "EMAIL_FROM"],
    // Notifications are still recorded and readable in the application; only
    // the email leg is lost, and the transport reports that it cannot deliver
    // rather than returning success.
    whenAbsent: "degrades",
    seam: "src/server/email/transport.ts",
  },
  {
    id: "vercel_blob",
    capability: "file_storage",
    requires: ["BLOB_READ_WRITE_TOKEN"],
    whenAbsent: "degrades",
    seam: "src/server/workspace/files.ts",
  },
  {
    id: "sentry",
    capability: "error_tracking",
    requires: ["NEXT_PUBLIC_SENTRY_DSN"],
    // Errors still reach the structured logger with the same shape and
    // redaction; what is lost is aggregation, not the record.
    whenAbsent: "degrades",
    seam: "src/lib/logger.ts",
  },
  {
    id: "rule_assessor",
    capability: "scope_assessment",
    // The default implementation is ours and needs no credential. It is listed
    // because the seam is the point: a future provider plugs in here, and the
    // rule-based assessor is what the platform falls back to. It is not AI and
    // the product says so.
    requires: [],
    whenAbsent: "degrades",
    seam: "src/lib/scope/rule-assessor.ts",
  },
] as const satisfies readonly Integration[];

export type IntegrationId = (typeof INTEGRATIONS)[number]["id"];

const BY_ID = new Map<string, Integration>(INTEGRATIONS.map((i) => [i.id, i]));

export function getIntegration(id: string): Integration | undefined {
  return BY_ID.get(id);
}

export function integrationsFor(
  capability: IntegrationCapability,
): readonly Integration[] {
  return INTEGRATIONS.filter((integration) => integration.capability === capability);
}
