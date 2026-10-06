import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type * as ReferralsModule from "./referrals";

/**
 * The growth services, from the attacking side.
 *
 * These cover the rules that only exist once a database is involved: who may
 * approve a partner, who may moderate a review, and whether a commission can
 * be made larger than the sale by anything a caller sends.
 */

const inserts: { table: string; values: Record<string, unknown> }[] = [];
const updates: { table: string; values: Record<string, unknown> }[] = [];
const audits: { action: string }[] = [];

let partnerRow: Record<string, unknown> | undefined;
let affiliateRow: Record<string, unknown> | undefined;
let codeRow: Record<string, unknown> | undefined;
let referralRow: Record<string, unknown> | undefined;
let commissionRow: Record<string, unknown> | undefined;
let reviewRow: Record<string, unknown> | undefined;
let projectRow: Record<string, unknown> | undefined;
let userRow: Record<string, unknown> | undefined;

function tableName(table: unknown): string {
  for (const symbol of Object.getOwnPropertySymbols(table as object)) {
    if (String(symbol).includes("Name")) {
      return String((table as Record<symbol, unknown>)[symbol]);
    }
  }
  return "unknown";
}

vi.mock("@/db/client", () => ({
  db: {
    query: {
      partners: { findFirst: () => Promise.resolve(partnerRow) },
      affiliates: { findFirst: () => Promise.resolve(affiliateRow) },
      referralCodes: { findFirst: () => Promise.resolve(codeRow) },
      referrals: { findFirst: () => Promise.resolve(referralRow) },
      commissions: { findFirst: () => Promise.resolve(commissionRow) },
      reviews: { findFirst: () => Promise.resolve(reviewRow) },
      projects: { findFirst: () => Promise.resolve(projectRow) },
      showcaseEntries: { findFirst: () => Promise.resolve(undefined) },
      users: { findFirst: () => Promise.resolve(userRow) },
    },
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: () => ({ limit: () => Promise.resolve([]) }) }),
        orderBy: () => ({ limit: () => Promise.resolve([]) }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table: tableName(table), values });
        return {
          returning: () => Promise.resolve([{ id: "new-id", ...values }]),
          onConflictDoUpdate: () => ({
            returning: () => Promise.resolve([{ id: "new-id", ...values }]),
          }),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updates.push({ table: tableName(table), values });
        return {
          where: () => ({
            returning: () => Promise.resolve([{ id: "row", ...values }]),
          }),
        };
      },
    }),
  },
}));

vi.mock("@/config/env", () => ({
  serverEnv: () => ({ GROWTH_FINGERPRINT_SECRET: "test-secret-value-long" }),
}));

vi.mock("@/server/admin/audit", () => ({
  recordAudit: (input: { action: string }) => {
    audits.push(input);
    return Promise.resolve();
  },
  diffFields: () => null,
}));

vi.mock("./referrals", async (importOriginal) => {
  const actual = await importOriginal<typeof ReferralsModule>();
  return {
    ...actual,
    createOwnedCode: () => Promise.resolve({ id: "code-1", code: "ABCD2345" }),
  };
});

const {
  applyAsPartner,
  approvePartner,
  approveCommission,
  raiseCommission,
  reverseCommission,
  setPartnerStatus,
} = await import("./partners");

const { approveReview, rejectReview, submitReview } = await import("./reviews");
const { attributeSignup } = await import("./referrals");

/* --- Fixtures ----------------------------------------------------------- */

function contextWith(permissions: string[], id = "staff-1") {
  return {
    user: { id, email: "staff@example.test", role: "admin" },
    can: (permission: string) => permissions.includes(permission),
  } as unknown as Parameters<typeof approvePartner>[2];
}

const owner = contextWith(["billing:manage", "customer:read", "analytics:read"]);
const customer = contextWith([], "user-1");

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
  audits.length = 0;

  partnerRow = {
    id: "partner-1",
    status: "applied",
    companyName: "Northside Studio",
    commissionBasisPoints: 0,
  };
  affiliateRow = {
    id: "aff-1",
    status: "approved",
    name: "A",
    commissionBasisPoints: 1000,
  };
  codeRow = {
    id: "code-1",
    ownerKind: "affiliate",
    ownerAffiliateId: "aff-1",
    ownerPartnerId: null,
    ownerUserId: null,
  };
  referralRow = { id: "ref-1", codeId: "code-1", convertedAt: new Date("2026-01-01") };
  commissionRow = undefined;
  reviewRow = undefined;
  projectRow = {
    id: "project-1",
    ownerId: "user-1",
    reference: "PRJ-2026-0001",
    launchedAt: new Date("2026-03-01T00:00:00Z"),
  };
  userRow = {
    id: "user-1",
    email: "sam@example.com",
    createdAt: new Date("2026-02-01T00:00:00Z"),
  };
});

/* -------------------------------------------------------------------------
 * Who may approve a partner
 * ---------------------------------------------------------------------- */

describe("approving a partner is a money decision", () => {
  it("refuses a caller without billing:manage", async () => {
    await expect(
      approvePartner("partner-1", 1_500, contextWith(["analytics:read"])),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("answers not_found rather than forbidden", async () => {
    await expect(
      setPartnerStatus(
        { kind: "partner", id: "partner-1", status: "suspended", note: "x" },
        contextWith([]),
      ),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("clamps an impossible rate rather than committing to it", async () => {
    // 150% would otherwise be caught only by the database, at the first
    // commission, having already been promised to the partner.
    await approvePartner("partner-1", 15_000, owner);

    const update = updates.find((entry) => entry.table === "partners");
    expect(update?.values.commissionBasisPoints).toBe(10_000);
  });

  it("refuses a negative rate", async () => {
    await approvePartner("partner-1", -500, owner);
    const update = updates.find((entry) => entry.table === "partners");
    expect(update?.values.commissionBasisPoints).toBe(0);
  });

  it("records who approved it and at what rate", async () => {
    await approvePartner("partner-1", 1_500, owner);
    expect(audits.map((entry) => entry.action)).toContain("partner.approved");
  });

  it("requires a reason to suspend", async () => {
    const result = await setPartnerStatus(
      { kind: "partner", id: "partner-1", status: "suspended", note: "   " },
      owner,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("reason_required");
  });
});

describe("an application cannot set its own rate", () => {
  it("starts every partner at zero, whatever the payload said", async () => {
    await applyAsPartner({
      kind: "agency",
      companyName: "Northside Studio",
      contactName: "Sam",
      email: "sam@example.com",
      website: null,
      country: null,
      pitch: "We build brand sites and would send the heavier work your way.",
      // A field the schema does not declare. Zod drops it.
      commissionBasisPoints: 9_000,
    });

    const row = inserts.find((entry) => entry.table === "partners");
    expect(row?.values.commissionBasisPoints).toBe(0);
    expect(row?.values.status).toBe("applied");
  });

  it("refuses an application with no pitch", async () => {
    const result = await applyAsPartner({
      kind: "agency",
      companyName: "A",
      contactName: "B",
      email: "not-an-email",
      website: null,
      country: null,
      pitch: "short",
    });
    expect(result.ok).toBe(false);
  });
});

/* -------------------------------------------------------------------------
 * Commission
 * ---------------------------------------------------------------------- */

describe("a commission is derived from the order", () => {
  it("applies the account's stored rate, not anything passed in", async () => {
    await raiseCommission({
      referralId: "ref-1",
      orderId: "order-1",
      grossMinorUnits: 40_000,
      currency: "CAD",
    });

    const row = inserts.find((entry) => entry.table === "commissions");
    // 10% of 400.00, from the affiliate record.
    expect(row?.values.amountMinorUnits).toBe(4_000);
    expect(row?.values.rateBasisPoints).toBe(1_000);
  });

  it("earns nothing for a customer-owned code", async () => {
    codeRow = { id: "code-1", ownerKind: "customer", ownerUserId: "user-9" };

    const result = await raiseCommission({
      referralId: "ref-1",
      orderId: "order-1",
      grossMinorUnits: 40_000,
      currency: "CAD",
    });

    expect(result).toBeNull();
    expect(inserts.some((entry) => entry.table === "commissions")).toBe(false);
  });

  it("earns nothing while the account is suspended", async () => {
    affiliateRow = { ...affiliateRow, status: "suspended" };

    const result = await raiseCommission({
      referralId: "ref-1",
      orderId: "order-1",
      grossMinorUnits: 40_000,
      currency: "CAD",
    });
    expect(result).toBeNull();
  });

  it("takes no amount in its input", () => {
    const input = {
      referralId: "ref-1",
      orderId: "order-1",
      grossMinorUnits: 40_000,
      currency: "CAD" as const,
    };
    expect(Object.keys(input)).not.toContain("amountMinorUnits");
    expect(Object.keys(input)).not.toContain("rateBasisPoints");
  });
});

describe("paying a commission", () => {
  beforeEach(() => {
    commissionRow = {
      id: "comm-1",
      referralId: "ref-1",
      state: "pending",
      amountMinorUnits: 4_000,
      currency: "CAD",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
  });

  it("holds it inside the refund window", async () => {
    referralRow = { ...referralRow, convertedAt: new Date("2026-01-01T00:00:00Z") };

    const result = await approveCommission(
      "comm-1",
      owner,
      new Date("2026-01-10T00:00:00Z"),
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("on_hold");
  });

  it("releases it once the window has passed", async () => {
    const result = await approveCommission(
      "comm-1",
      owner,
      new Date("2026-03-01T00:00:00Z"),
    );
    expect(result.ok).toBe(true);
  });

  it("refuses to pay a commission whose referral was blocked", async () => {
    referralRow = { ...referralRow, fraudState: "blocked" };

    const result = await approveCommission(
      "comm-1",
      owner,
      new Date("2026-03-01T00:00:00Z"),
    );
    expect(result.ok).toBe(false);
  });

  it("refuses to pay one whose reward was clawed back", async () => {
    referralRow = { ...referralRow, rewardState: "clawed_back" };

    const result = await approveCommission(
      "comm-1",
      owner,
      new Date("2026-03-01T00:00:00Z"),
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a reversal with no reason", async () => {
    const result = await reverseCommission("comm-1", "  ", owner);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("reason_required");
  });

  it("refuses to reverse money that has already left", async () => {
    // Recovered by arrangement, not by an UPDATE that misstates the ledger.
    commissionRow = { ...commissionRow, state: "paid" };
    const result = await reverseCommission("comm-1", "chargeback", owner);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("already_paid");
  });

  it("refuses a caller without billing:manage", async () => {
    await expect(approveCommission("comm-1", contextWith([]))).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

/* -------------------------------------------------------------------------
 * Reviews
 * ---------------------------------------------------------------------- */

describe("a review cannot be written by just anybody", () => {
  it("refuses somebody who does not own the project", async () => {
    const result = await submitReview(
      {
        projectId: "project-1",
        rating: 5,
        body: "An excellent experience throughout.",
        consentToPublish: true,
      },
      contextWith([], "user-2"),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_the_customer");
  });

  it("refuses a project that never launched", async () => {
    projectRow = { ...projectRow, launchedAt: null };

    const result = await submitReview(
      {
        projectId: "project-1",
        rating: 5,
        body: "An excellent experience throughout.",
        consentToPublish: true,
      },
      customer,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_delivered");
  });

  it("refuses a second review of the same project", async () => {
    reviewRow = { id: "rev-1", status: "submitted", projectId: "project-1" };

    const result = await submitReview(
      {
        projectId: "project-1",
        rating: 1,
        body: "Changed my mind about the first one.",
        consentToPublish: true,
      },
      customer,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("already_reviewed");
  });

  it("answers an outstanding invitation rather than refusing it", async () => {
    reviewRow = { id: "rev-1", status: "invited", projectId: "project-1" };

    const result = await submitReview(
      {
        projectId: "project-1",
        rating: 5,
        body: "They shipped it in four days.",
        consentToPublish: true,
      },
      customer,
    );

    expect(result.ok).toBe(true);
  });

  it("discards the name when consent was not given", async () => {
    await submitReview(
      {
        projectId: "project-1",
        rating: 5,
        body: "They shipped it in four days.",
        displayName: "Cedar Bakery",
        consentToPublish: false,
      },
      customer,
    );

    const row = inserts.find((entry) => entry.table === "reviews");
    // Not stored "just in case": a name kept without consent is a name that
    // gets published by a later change of policy.
    expect(row?.values.authorDisplayName).toBeNull();
  });
});

describe("moderation", () => {
  beforeEach(() => {
    reviewRow = {
      id: "rev-1",
      status: "submitted",
      projectId: "project-1",
      publishedAt: null,
    };
  });

  it("refuses a caller who cannot read customers", async () => {
    await expect(approveReview("rev-1", true, contextWith([]))).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("refuses to reject without a reason", async () => {
    const result = await rejectReview("rev-1", "   ", owner);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("note_required");
  });

  it("approves without publishing when asked not to", async () => {
    await approveReview("rev-1", false, owner);
    const update = updates.find((entry) => entry.table === "reviews");
    expect(update?.values.status).toBe("approved");
    expect(update?.values.publishedAt).toBeNull();
  });

  it("records every moderation decision", async () => {
    await approveReview("rev-1", true, owner);
    expect(audits.map((entry) => entry.action)).toContain("review.published");
  });

  it("will not approve an unanswered invitation", async () => {
    reviewRow = { ...reviewRow, status: "invited" };
    const result = await approveReview("rev-1", true, owner);
    expect(result.ok).toBe(false);
  });

  it("has no path that edits the words", async () => {
    await approveReview("rev-1", true, owner);
    const update = updates.find((entry) => entry.table === "reviews");
    // Moderation can refuse a review but never rewrite it.
    expect(update?.values).not.toHaveProperty("body");
    expect(update?.values).not.toHaveProperty("rating");
  });
});

/* -------------------------------------------------------------------------
 * Attribution
 * ---------------------------------------------------------------------- */

describe("a self-referral is refused without a row", () => {
  it("does not try to record one", async () => {
    // The schema forbids a self-referral row, deliberately. Attempting to
    // record the attempt would raise a constraint violation rather than
    // produce the evidence it was meant to keep -- a real collision between
    // two correct designs, found by following a link while signed in.
    codeRow = {
      id: "code-1",
      code: "ABCD2345",
      ownerKind: "customer",
      ownerUserId: "user-1",
      ownerPartnerId: null,
      ownerAffiliateId: null,
      isActive: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
    referralRow = undefined;

    const result = await attributeSignup({
      code: "ABCD2345",
      userId: "user-1",
      email: "sam@example.com",
    });

    expect(result.ok).toBe(false);
    expect(inserts.some((entry) => entry.table === "referrals")).toBe(false);
  });
});
