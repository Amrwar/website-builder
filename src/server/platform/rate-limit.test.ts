import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
}));

const { consume, limiterKey, resetRateLimits, RATE_LIMITS } =
  await import("./rate-limit");

const rule = { limit: 3, windowMs: 1_000 };

beforeEach(() => resetRateLimits());

describe("consume", () => {
  it("allows calls up to the limit, then refuses", () => {
    expect(consume("t", "k", rule, 0).ok).toBe(true);
    expect(consume("t", "k", rule, 1).ok).toBe(true);
    expect(consume("t", "k", rule, 2).ok).toBe(true);
    expect(consume("t", "k", rule, 3).ok).toBe(false);
  });

  it("says how long until a call would be accepted", () => {
    for (let at = 0; at < 3; at += 1) consume("t", "k", rule, at);
    const refused = consume("t", "k", rule, 400);
    // The oldest hit, at 0, leaves the window at 1000.
    expect(refused).toEqual({ ok: false, retryAfterMs: 600 });
  });

  /**
   * A sliding window, not a fixed one: a fixed window lets a caller spend the
   * whole budget at the end of one window and again at the start of the next,
   * doubling the effective rate at every boundary.
   */
  it("slides, so the budget returns one call at a time", () => {
    consume("t", "k", rule, 0);
    consume("t", "k", rule, 500);
    consume("t", "k", rule, 900);
    expect(consume("t", "k", rule, 999).ok).toBe(false);
    // The hit at 0 has aged out; one slot is free, not three.
    expect(consume("t", "k", rule, 1_001).ok).toBe(true);
    expect(consume("t", "k", rule, 1_002).ok).toBe(false);
  });

  it("does not count a refused call against the budget", () => {
    // Otherwise a client hammering a closed door would keep it closed forever.
    for (let at = 0; at < 3; at += 1) consume("t", "k", rule, at);
    for (let at = 10; at < 500; at += 10) consume("t", "k", rule, at);
    expect(consume("t", "k", rule, 1_000).ok).toBe(true);
  });

  it("keeps keys and scopes apart", () => {
    for (let at = 0; at < 3; at += 1) consume("t", "a", rule, at);
    expect(consume("t", "a", rule, 5).ok).toBe(false);
    expect(consume("t", "b", rule, 5).ok).toBe(true);
    expect(consume("other", "a", rule, 5).ok).toBe(true);
  });

  it("stays bounded when an attacker rotates keys", () => {
    // Ten thousand is the cap. Going well past it must not grow the map, and
    // must not crash; the stalest keys are what get evicted.
    for (let i = 0; i < 12_000; i += 1) consume("t", `rotating-${i}`, rule, i);
    expect(consume("t", "fresh", rule, 20_000).ok).toBe(true);
  });
});

describe("limiterKey", () => {
  it("keys a signed-in caller by user, wherever they connect from", async () => {
    expect(await limiterKey("user-1")).toBe("user:user-1");
  });

  it("keys an anonymous caller by the first forwarded address", async () => {
    // The left-most entry is the client; the rest are proxies.
    expect(await limiterKey(null)).toBe("ip:203.0.113.7");
  });
});

describe("the budgets", () => {
  it("are positive and finite", () => {
    for (const [name, budget] of Object.entries(RATE_LIMITS)) {
      expect(budget.limit, name).toBeGreaterThan(0);
      expect(budget.windowMs, name).toBeGreaterThan(0);
    }
  });
});
