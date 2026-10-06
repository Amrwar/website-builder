import { describe, expect, it } from "vitest";

import { SUBSCRIPTION_STATUSES } from "@/db/schema/enums";
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  cancellationEffectiveAt,
  changeKind,
  isServing,
  isTerminal,
  nextPeriodEnd,
  planChange,
} from "./lifecycle";

/**
 * The subscription state machine.
 *
 * A subscription decides whether somebody's site stays up and whether their
 * card is charged, so these are written as the ways that could go wrong for
 * the customer: service cut off early, a charge after cancelling, a renewal
 * date that drifts.
 */

describe("transitions", () => {
  it("allows recovery from a failed payment", () => {
    // The reason past_due is modelled apart from cancelled: a declined card is
    // usually a card problem, not a decision to leave.
    expect(canTransition("past_due", "active")).toBe(true);
  });

  it("allows a paused subscription to resume", () => {
    expect(canTransition("paused", "active")).toBe(true);
  });

  it("refuses to revive a cancelled subscription", () => {
    // A returning customer starts a new one, so the record of what they had
    // stays intact.
    for (const status of SUBSCRIPTION_STATUSES) {
      expect(canTransition("cancelled", status), status).toBe(false);
      expect(canTransition("expired", status), status).toBe(false);
    }
  });

  it("refuses to go straight from trialing to past due", () => {
    // A trial has taken no money, so there is nothing to be in arrears over.
    expect(canTransition("trialing", "past_due")).toBe(false);
  });

  it("marks exactly the two end states as terminal", () => {
    const terminal = SUBSCRIPTION_STATUSES.filter(isTerminal);
    expect(terminal).toEqual(["cancelled", "expired"]);
  });

  it("never allows a transition to itself", () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      expect(ALLOWED_TRANSITIONS[status]).not.toContain(status);
    }
  });
});

describe("who is actually being served", () => {
  it("keeps serving while a payment problem is resolved", () => {
    // Suspending on the first failed charge turns a declined card into an
    // outage for a business that did nothing wrong.
    expect(isServing("past_due")).toBe(true);
  });

  it("serves a trial", () => {
    expect(isServing("trialing")).toBe(true);
  });

  it("does not serve a paused, cancelled or expired subscription", () => {
    expect(isServing("paused")).toBe(false);
    expect(isServing("cancelled")).toBe(false);
    expect(isServing("expired")).toBe(false);
  });
});

describe("billing periods follow the calendar", () => {
  it("bills on the same day each month", () => {
    const end = nextPeriodEnd(new Date("2026-03-03T09:00:00Z"), "monthly");
    expect(end.toISOString()).toBe("2026-04-03T09:00:00.000Z");
  });

  it("clamps to the last day of a shorter month", () => {
    const end = nextPeriodEnd(new Date("2026-01-31T09:00:00Z"), "monthly");
    expect(end.toISOString()).toBe("2026-02-28T09:00:00.000Z");
  });

  it("returns to the anchor day rather than drifting earlier", () => {
    // Without the anchor, a January 31st subscription would bill on the 28th
    // for the rest of its life.
    const end = nextPeriodEnd(new Date("2026-02-28T09:00:00Z"), "monthly", 31);
    expect(end.toISOString()).toBe("2026-03-31T09:00:00.000Z");
  });

  it("handles a leap year", () => {
    const end = nextPeriodEnd(new Date("2028-01-31T09:00:00Z"), "monthly");
    expect(end.toISOString()).toBe("2028-02-29T09:00:00.000Z");
  });

  it("adds twelve months for a yearly plan", () => {
    const end = nextPeriodEnd(new Date("2026-06-15T09:00:00Z"), "yearly");
    expect(end.toISOString()).toBe("2027-06-15T09:00:00.000Z");
  });
});

describe("changing plan", () => {
  const periodStart = new Date("2026-10-01T00:00:00Z");
  const periodEnd = new Date("2026-11-01T00:00:00Z");

  it("reads direction from price, not from plan names", () => {
    expect(changeKind(2_900, 7_900)).toBe("upgrade");
    expect(changeKind(7_900, 2_900)).toBe("downgrade");
    expect(changeKind(2_900, 2_900)).toBe("same");
  });

  it("applies an upgrade immediately and charges only the remainder", () => {
    const result = planChange({
      currentPriceMinorUnits: 2_900,
      nextPriceMinorUnits: 7_900,
      periodStart,
      periodEnd,
      now: new Date("2026-10-16T00:00:00Z"),
    });

    expect(result.immediate).toBe(true);
    // Half the month left, half the difference. Floored, so rounding never
    // falls in our favour.
    expect(result.dueNowMinorUnits).toBe(Math.floor(5_000 * (16 / 31)));
    expect(result.effectiveAt.toISOString()).toBe("2026-10-16T00:00:00.000Z");
  });

  it("charges nothing extra for an upgrade on the last day", () => {
    const result = planChange({
      currentPriceMinorUnits: 2_900,
      nextPriceMinorUnits: 7_900,
      periodStart,
      periodEnd,
      now: periodEnd,
    });
    expect(result.dueNowMinorUnits).toBe(0);
  });

  it("defers a downgrade to the next renewal and refunds nothing", () => {
    // They keep the plan they already paid for until it runs out, which is
    // fair and avoids a mid-period credit nobody can reconcile.
    const result = planChange({
      currentPriceMinorUnits: 7_900,
      nextPriceMinorUnits: 2_900,
      periodStart,
      periodEnd,
      now: new Date("2026-10-05T00:00:00Z"),
    });

    expect(result.kind).toBe("downgrade");
    expect(result.immediate).toBe(false);
    expect(result.dueNowMinorUnits).toBe(0);
    expect(result.effectiveAt).toEqual(periodEnd);
  });

  it("charges nothing for a change that is not a change", () => {
    const result = planChange({
      currentPriceMinorUnits: 2_900,
      nextPriceMinorUnits: 2_900,
      periodStart,
      periodEnd,
      now: new Date("2026-10-05T00:00:00Z"),
    });
    expect(result.dueNowMinorUnits).toBe(0);
    expect(result.immediate).toBe(false);
  });
});

describe("cancelling", () => {
  it("always ends at the period the customer paid for", () => {
    const periodEnd = new Date("2026-11-01T00:00:00Z");
    expect(cancellationEffectiveAt(periodEnd)).toEqual(periodEnd);
  });

  it("takes no argument through which service could end sooner", () => {
    // The guarantee stated as a signature: there is no parameter for cutting a
    // paid period short.
    expect(cancellationEffectiveAt).toHaveLength(1);
  });
});
