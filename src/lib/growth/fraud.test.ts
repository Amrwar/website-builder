import { describe, expect, it } from "vitest";

import { MINIMUM_CONVERTING_ORDER_MINOR_UNITS } from "@/config/growth";
import {
  assessReferral,
  canReview,
  commissionFor,
  isPayable,
  isReleasable,
  validateReviewContent,
  type FraudInput,
} from "./fraud";

/**
 * Anti-abuse.
 *
 * Written as the attacks rather than as a tour of the rules: every test is
 * somebody trying to get paid for a referral they did not earn, a review they
 * were not entitled to write, or a commission larger than the sale.
 */

function input(overrides: Partial<FraudInput> = {}): FraudInput {
  return {
    referrerUserId: "user-referrer",
    referredUserId: "user-referred",
    referrerEmailHash: "hash-a",
    referredEmailHash: "hash-b",
    referrerIpHash: "ip-a",
    referredIpHash: "ip-b",
    ownerWasReferredByReferee: false,
    refereeAlreadyReferred: false,
    ownerIsActive: true,
    codeCreatedAt: new Date("2026-01-01T00:00:00Z"),
    refereeSignedUpAt: new Date("2026-02-01T00:00:00Z"),
    orderTotalMinorUnits: 40_000,
    expiresAt: new Date("2026-05-01T00:00:00Z"),
    convertedAt: new Date("2026-02-10T00:00:00Z"),
    ...overrides,
  };
}

describe("an honest referral passes", () => {
  it("is clear with no reasons", () => {
    const verdict = assessReferral(input());
    expect(verdict.state).toBe("clear");
    expect(verdict.reasons).toEqual([]);
  });

  it("is payable once converted", () => {
    expect(isPayable("clear", "converted")).toBe(true);
  });

  it("is not payable before it converts", () => {
    expect(isPayable("clear", "signed_up")).toBe(false);
  });
});

describe("self-referral", () => {
  it("is blocked when both sides are the same account", () => {
    const verdict = assessReferral(
      input({ referrerUserId: "same", referredUserId: "same" }),
    );
    expect(verdict.state).toBe("blocked");
    expect(verdict.reasons).toContain("self_referral");
  });

  it("is blocked when two accounts share one mailbox", () => {
    // `a.b+promo@gmail.com` and `ab@gmail.com` fold to the same fingerprint,
    // which is what makes a second identity cost more than one keystroke.
    const verdict = assessReferral(
      input({ referrerEmailHash: "same", referredEmailHash: "same" }),
    );
    expect(verdict.state).toBe("blocked");
    expect(verdict.reasons).toContain("same_email_identity");
  });

  it("is never payable, whatever the status says", () => {
    expect(isPayable("blocked", "converted")).toBe(false);
  });
});

describe("referral loops", () => {
  it("blocks two people introducing each other", () => {
    const verdict = assessReferral(input({ ownerWasReferredByReferee: true }));
    expect(verdict.state).toBe("blocked");
    expect(verdict.reasons).toContain("referral_loop");
  });
});

describe("duplicate attribution", () => {
  it("blocks a second claim on somebody already referred", () => {
    const verdict = assessReferral(input({ refereeAlreadyReferred: true }));
    expect(verdict.state).toBe("blocked");
    expect(verdict.reasons).toContain("already_referred");
  });

  it("flags two signups from one network without refusing them", () => {
    // A household buying two websites looks exactly like this, so a person
    // decides rather than the rule.
    const verdict = assessReferral(
      input({ referrerIpHash: "same", referredIpHash: "same" }),
    );
    expect(verdict.state).toBe("flagged");
    expect(verdict.reasons).toEqual(["same_network"]);
  });

  it("treats a cleared flag as payable", () => {
    expect(isPayable("cleared", "converted")).toBe(true);
  });
});

describe("retroactive attribution", () => {
  it("blocks an account that existed before the code", () => {
    // Otherwise a code could be applied to a customer who arrived on their own.
    const verdict = assessReferral(
      input({
        codeCreatedAt: new Date("2026-03-01T00:00:00Z"),
        refereeSignedUpAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );
    expect(verdict.state).toBe("blocked");
    expect(verdict.reasons).toContain("backdated_signup");
  });

  it("blocks a conversion after the window closed", () => {
    const verdict = assessReferral(
      input({
        expiresAt: new Date("2026-02-01T00:00:00Z"),
        convertedAt: new Date("2026-04-01T00:00:00Z"),
      }),
    );
    expect(verdict.state).toBe("blocked");
    expect(verdict.reasons).toContain("outside_window");
  });

  it("allows a conversion inside the window", () => {
    expect(assessReferral(input()).reasons).not.toContain("outside_window");
  });
});

describe("the order has to be worth paying on", () => {
  it("blocks an order below the floor", () => {
    const verdict = assessReferral(
      input({ orderTotalMinorUnits: MINIMUM_CONVERTING_ORDER_MINOR_UNITS - 1 }),
    );
    expect(verdict.state).toBe("blocked");
    expect(verdict.reasons).toContain("below_minimum_order");
  });

  it("allows an order exactly at the floor", () => {
    const verdict = assessReferral(
      input({ orderTotalMinorUnits: MINIMUM_CONVERTING_ORDER_MINOR_UNITS }),
    );
    expect(verdict.reasons).not.toContain("below_minimum_order");
  });

  it("says nothing about the order before there is one", () => {
    const verdict = assessReferral(
      input({ orderTotalMinorUnits: null, convertedAt: null }),
    );
    expect(verdict.state).toBe("clear");
  });
});

describe("a withdrawn owner earns nothing", () => {
  it("blocks when the owning account is suspended", () => {
    const verdict = assessReferral(input({ ownerIsActive: false }));
    expect(verdict.state).toBe("blocked");
    expect(verdict.reasons).toContain("inactive_owner");
  });
});

describe("every reason is reported, not just the first", () => {
  it("lists them all so one fix does not reveal the next", () => {
    const verdict = assessReferral(
      input({
        referrerUserId: "same",
        referredUserId: "same",
        referrerEmailHash: "x",
        referredEmailHash: "x",
        referrerIpHash: "y",
        referredIpHash: "y",
        ownerIsActive: false,
      }),
    );

    expect(verdict.reasons).toEqual([
      "self_referral",
      "same_email_identity",
      "inactive_owner",
      "same_network",
    ]);
  });

  it("is deterministic: the same facts give the same answer", () => {
    const facts = input({ referrerIpHash: "z", referredIpHash: "z" });
    expect(JSON.stringify(assessReferral(facts))).toBe(
      JSON.stringify(assessReferral(facts)),
    );
  });
});

/* -------------------------------------------------------------------------
 * Reviews
 * ---------------------------------------------------------------------- */

describe("who may write a review", () => {
  const base = {
    projectLaunchedAt: new Date("2026-03-01T00:00:00Z"),
    projectOwnerId: "user-1",
    authorUserId: "user-1",
    alreadyExists: false,
  };

  it("allows the customer of a delivered project", () => {
    expect(canReview(base)).toBeNull();
  });

  it("refuses a project that was never delivered", () => {
    // No delivery, no experience to review.
    expect(canReview({ ...base, projectLaunchedAt: null })).toBe("not_delivered");
  });

  it("refuses somebody who is not the customer", () => {
    expect(canReview({ ...base, authorUserId: "user-2" })).toBe("not_the_customer");
  });

  it("refuses a second review of the same project", () => {
    // Otherwise a customer can bury their own first review.
    expect(canReview({ ...base, alreadyExists: true })).toBe("already_reviewed");
  });
});

describe("review content", () => {
  it("accepts a real review", () => {
    expect(validateReviewContent(5, "They shipped it in four days.")).toBeNull();
  });

  it("refuses a rating outside one to five", () => {
    for (const rating of [0, 6, -1, 100]) {
      expect(validateReviewContent(rating, "A long enough body."), String(rating)).toBe(
        "invalid_rating",
      );
    }
  });

  it("refuses a fractional rating", () => {
    expect(validateReviewContent(4.5, "A long enough body.")).toBe("invalid_rating");
  });

  it("refuses five stars with no words", () => {
    // An empty five stars is a number somebody clicked, not a review.
    expect(validateReviewContent(5, "   ")).toBe("empty_body");
    expect(validateReviewContent(5, "great")).toBe("empty_body");
  });
});

/* -------------------------------------------------------------------------
 * Commission
 * ---------------------------------------------------------------------- */

describe("commission is derived, never proposed", () => {
  it("applies the rate to the gross", () => {
    expect(commissionFor(40_000, 1_500)).toBe(6_000);
    expect(commissionFor(40_000, 1_000)).toBe(4_000);
  });

  it("rounds down, so an error is never an accidental overpayment", () => {
    expect(commissionFor(333, 1_000)).toBe(33);
  });

  it("never exceeds the order, whatever the rate says", () => {
    // A rate above 100% is a configuration mistake; paying out more than was
    // taken in is not something to do quietly.
    expect(commissionFor(40_000, 50_000)).toBe(40_000);
  });

  it("is zero for a zero or negative gross", () => {
    expect(commissionFor(0, 1_000)).toBe(0);
    expect(commissionFor(-40_000, 1_000)).toBe(0);
  });

  it("is zero for a zero or negative rate", () => {
    expect(commissionFor(40_000, 0)).toBe(0);
    expect(commissionFor(40_000, -500)).toBe(0);
  });

  it("takes no argument through which an amount could be supplied", () => {
    // The defence stated as a signature: gross and rate, nothing else.
    expect(commissionFor).toHaveLength(2);
  });
});

describe("the payout hold", () => {
  const converted = new Date("2026-03-01T00:00:00Z");

  it("holds a commission inside the refund window", () => {
    expect(isReleasable(converted, new Date("2026-03-15T00:00:00Z"), 30)).toBe(false);
  });

  it("releases it once the window has passed", () => {
    expect(isReleasable(converted, new Date("2026-04-01T00:00:00Z"), 30)).toBe(true);
  });

  it("releases exactly on the boundary", () => {
    expect(isReleasable(converted, new Date("2026-03-31T00:00:00Z"), 30)).toBe(true);
  });
});
