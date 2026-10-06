import { describe, expect, it } from "vitest";

import { applyMovement, balanceFrom, expiredEntries, formatMinutes } from ".";

/**
 * Build credit arithmetic.
 *
 * Credit is something a customer paid for, so these are written from the angle
 * of "what could silently take it away, or hand out more than was bought".
 */

describe("direction follows the kind, not the caller", () => {
  it("adds for purchased, granted, awarded and refunded", () => {
    for (const kind of ["purchased", "granted", "awarded", "refunded"] as const) {
      const result = applyMovement(0, { kind, minutes: 60 });
      expect(result.ok, kind).toBe(true);
      if (!result.ok) continue;
      expect(result.signedMinutes, kind).toBe(60);
    }
  });

  it("removes for spent and expired", () => {
    for (const kind of ["spent", "expired"] as const) {
      const result = applyMovement(120, { kind, minutes: 60 });
      expect(result.ok, kind).toBe(true);
      if (!result.ok) continue;
      expect(result.signedMinutes, kind).toBe(-60);
      expect(result.balanceAfter, kind).toBe(60);
    }
  });

  it("lets an adjustment go either way, because a correction can", () => {
    const up = applyMovement(
      60,
      { kind: "adjusted", minutes: 30, reason: "goodwill" },
      1,
    );
    const down = applyMovement(
      60,
      { kind: "adjusted", minutes: 30, reason: "double counted" },
      -1,
    );

    expect(up.ok && up.balanceAfter).toBe(90);
    expect(down.ok && down.balanceAfter).toBe(30);
  });
});

describe("a balance cannot go negative", () => {
  it("refuses a spend larger than the balance", () => {
    // Refused rather than clamped: spending ninety against sixty is not a
    // spend of sixty, it is work that will not happen.
    const result = applyMovement(60, { kind: "spent", minutes: 90 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("insufficient_balance");
  });

  it("allows a spend of exactly the balance", () => {
    const result = applyMovement(60, { kind: "spent", minutes: 60 });
    expect(result.ok && result.balanceAfter).toBe(0);
  });

  it("refuses an adjustment that would overdraw", () => {
    const result = applyMovement(
      10,
      { kind: "adjusted", minutes: 30, reason: "correction" },
      -1,
    );
    expect(result.ok).toBe(false);
  });
});

describe("a movement has to be a real amount", () => {
  it("refuses zero", () => {
    const result = applyMovement(60, { kind: "spent", minutes: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_positive");
  });

  it("refuses a negative, which would invert the direction", () => {
    const result = applyMovement(60, { kind: "spent", minutes: -30 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_positive");
  });

  it("refuses a fraction, because minutes are counted", () => {
    expect(applyMovement(60, { kind: "spent", minutes: 1.5 }).ok).toBe(false);
  });
});

describe("a manual correction has to say why", () => {
  it("refuses an adjustment with no reason", () => {
    const result = applyMovement(60, { kind: "adjusted", minutes: 30 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("reason_required");
  });

  it("refuses a reason that is only whitespace", () => {
    expect(applyMovement(60, { kind: "adjusted", minutes: 30, reason: "   " }).ok).toBe(
      false,
    );
  });

  it("does not demand one for an ordinary spend", () => {
    expect(applyMovement(60, { kind: "spent", minutes: 30 }).ok).toBe(true);
  });
});

describe("the ledger is the truth", () => {
  it("rebuilds a balance from signed entries", () => {
    expect(
      balanceFrom([
        { minutes: 120 },
        { minutes: -30 },
        { minutes: 60 },
        { minutes: -90 },
      ]),
    ).toBe(60);
  });

  it("is empty-safe", () => {
    expect(balanceFrom([])).toBe(0);
  });
});

describe("expiry", () => {
  const now = new Date("2026-10-06T00:00:00Z");

  it("finds granted credit that has lapsed", () => {
    const found = expiredEntries(
      [
        { minutes: 60, expiresAt: new Date("2026-09-01T00:00:00Z") },
        { minutes: 60, expiresAt: new Date("2026-12-01T00:00:00Z") },
        { minutes: 60, expiresAt: null },
      ],
      now,
    );
    expect(found).toHaveLength(1);
  });

  it("never expires a consumption entry", () => {
    // Only positive entries can lapse; expiring a spend would hand credit back.
    const found = expiredEntries(
      [{ minutes: -60, expiresAt: new Date("2026-01-01T00:00:00Z") }],
      now,
    );
    expect(found).toHaveLength(0);
  });

  it("never expires purchased credit, which has no expiry", () => {
    const found = expiredEntries([{ minutes: 600, expiresAt: null }], now);
    expect(found).toHaveLength(0);
  });
});

describe("formatting", () => {
  it("splits minutes into hours and minutes", () => {
    expect(formatMinutes(90)).toEqual({ hours: 1, minutes: 30 });
    expect(formatMinutes(60)).toEqual({ hours: 1, minutes: 0 });
    expect(formatMinutes(0)).toEqual({ hours: 0, minutes: 0 });
  });

  it("never renders a negative balance", () => {
    expect(formatMinutes(-30)).toEqual({ hours: 0, minutes: 0 });
  });
});
