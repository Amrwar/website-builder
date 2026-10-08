import "server-only";

import { headers } from "next/headers";

import { logger } from "@/lib/logger";

/**
 * Rate limiting for the platform's own endpoints.
 *
 * `docs/SECURITY.md` has carried this as a named gap since Phase 6: Clerk
 * rate-limits authentication, and nothing rate-limited anything of ours. The
 * endpoints that matter are the unauthenticated, compute-bearing ones — the
 * configurator assessment runs the scope engine and the catalogue queries for
 * anyone who posts a draft, and applications and reviews are rows anybody can
 * create.
 *
 * ── What this is, honestly ────────────────────────────────────────────────
 * A sliding window held in process memory. On Fluid Compute an instance is
 * reused across many requests, so the window is real — but there can be more
 * than one instance, so the effective limit is `limit × instances`, and a
 * cold start forgets history. This is a mitigation that makes abuse
 * expensive and accidental loops harmless; it is not a distributed
 * guarantee. The honest upgrade is a shared store (an Upstash-class Redis),
 * which is a provisioning decision, not a code change: `consume` is the seam
 * and its callers do not care where the window lives.
 *
 * Chosen over a database-backed window deliberately. A limiter that costs a
 * database round trip per request would levy its own tax on exactly the
 * endpoints it protects, and under load would push its writes into the same
 * pool it is trying to defend.
 *
 * ── Keys ──────────────────────────────────────────────────────────────────
 * Authenticated callers are keyed by user id, anonymous ones by client IP
 * from the platform's forwarding header. IPs are shared — offices, phones
 * behind carrier NAT — which is why the limits are generous: the budget is
 * set so no honest person meets it, and only loops and scripts do.
 * ──────────────────────────────────────────────────────────────────────────
 */

interface Window {
  /** Timestamps of accepted calls, oldest first, within the window. */
  hits: number[];
}

const windows = new Map<string, Window>();

/**
 * Bounds the map so an attacker rotating keys cannot grow it without limit.
 * Eviction is oldest-inserted-first, which under rotation evicts the
 * attacker's own stale keys.
 */
const MAX_KEYS = 10_000;

export interface RateLimitRule {
  /** Accepted calls per window, per key. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Milliseconds until the oldest hit leaves the window. 0 when allowed. */
  retryAfterMs: number;
}

/**
 * Records a call against a key and says whether it is within budget.
 *
 * Refusals are logged with the key's *shape*, not the key: an IP in the logs
 * is personal data with no retention story.
 */
export function consume(
  scope: string,
  key: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): RateLimitResult {
  const mapKey = `${scope}:${key}`;
  const cutoff = now - rule.windowMs;

  let window = windows.get(mapKey);
  if (!window) {
    if (windows.size >= MAX_KEYS) {
      const oldest = windows.keys().next().value;
      if (oldest !== undefined) windows.delete(oldest);
    }
    window = { hits: [] };
    windows.set(mapKey, window);
  }

  while (window.hits.length > 0 && window.hits[0]! <= cutoff) {
    window.hits.shift();
  }

  if (window.hits.length >= rule.limit) {
    const oldest = window.hits[0]!;
    const retryAfterMs = Math.max(0, oldest + rule.windowMs - now);
    logger.warn("rate limit refused a call", {
      scope,
      keyKind: key.startsWith("user:") ? "user" : "ip",
      retryAfterMs,
    });
    return { ok: false, retryAfterMs };
  }

  window.hits.push(now);
  return { ok: true, retryAfterMs: 0 };
}

/** Test seam. Never call from application code. */
export function resetRateLimits(): void {
  windows.clear();
}

/**
 * The caller's identity for limiting: the user when signed in, the client IP
 * otherwise.
 *
 * The forwarding header is attacker-suppliable in general; on Vercel the
 * platform overwrites `x-forwarded-for` with the real client address, which
 * is the one place this is safe to trust. Absent any address — local tools,
 * unit tests — everything shares one bucket, which fails toward stricter.
 */
export async function limiterKey(userId: string | null): Promise<string> {
  if (userId) return `user:${userId}`;
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return `ip:${ip}`;
}

/* -------------------------------------------------------------------------
 * The budgets
 *
 * Declared here rather than at call sites so the complete surface is
 * reviewable in one screen. Each is set well above honest use: nobody
 * assesses thirty scopes in a minute by hand.
 * ---------------------------------------------------------------------- */

export const RATE_LIMITS = {
  /** Scope assessment: engine + catalogue queries per call, anonymous. */
  assess: { limit: 30, windowMs: 60_000 },
  /** Partner and affiliate applications: a row per call. */
  application: { limit: 5, windowMs: 3_600_000 },
  /** Review submission and withdrawal. */
  review: { limit: 10, windowMs: 3_600_000 },
  /** Referral claims: already idempotent, this just caps the probing rate. */
  referralClaim: { limit: 20, windowMs: 3_600_000 },
  /** Publishing a validation page: each one is a public page on our domain. */
  validationPublish: { limit: 10, windowMs: 3_600_000 },
  /** Page views and clicks on a validation page, anonymous. */
  validationEvent: { limit: 120, windowMs: 60_000 },
  /** Leads on a validation page, per visitor per page. */
  validationLead: { limit: 5, windowMs: 3_600_000 },
} as const satisfies Record<string, RateLimitRule>;
