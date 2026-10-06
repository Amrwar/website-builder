import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Refund authority.
 *
 * "Never allow the browser to determine refund authority" was the instruction.
 * These tests attack the three ways that could go wrong: a role that should
 * not release money doing so, the requester approving their own request, and a
 * caller naming their own amount for a guaranteed refund.
 */

const updates: { table: string; values: Record<string, unknown> }[] = [];
const inserts: Record<string, unknown>[] = [];
const audits: { action: string; after?: Record<string, unknown> }[] = [];

let orderRow: Record<string, unknown> | undefined;
let projectRow: Record<string, unknown> | undefined;
let refundRow: Record<string, unknown> | undefined;
let paymentRow: Record<string, unknown> | undefined;
let updateMatches = true;
const providerRefund = vi.fn();

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
      orders: { findFirst: () => Promise.resolve(orderRow) },
      projects: { findFirst: () => Promise.resolve(projectRow) },
      refunds: { findFirst: () => Promise.resolve(refundRow) },
      payments: { findFirst: () => Promise.resolve(paymentRow) },
    },
    select: () => ({ from: () => Promise.resolve([{ n: 0 }]) }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserts.push(values);
        return { returning: () => Promise.resolve([{ id: "refund-1", ...values }]) };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updates.push({ table: tableName(table), values });
        return {
          where: () => ({
            then: (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve),
            returning: () =>
              Promise.resolve(updateMatches ? [{ ...(refundRow ?? {}), ...values }] : []),
          }),
        };
      },
    }),
  },
}));

vi.mock("./audit", () => ({
  recordAudit: (input: { action: string; after?: Record<string, unknown> }) => {
    audits.push({ action: input.action, after: input.after });
    return Promise.resolve();
  },
  diffFields: () => null,
}));

vi.mock("@/server/payments", () => ({
  paymentProvider: () => ({ refund: providerRefund }),
}));

const { executeRefund, refundEligibility, rejectRefund, requestRefund } =
  await import("./refunds");

/* --- Actors ------------------------------------------------------------- */

function actor(role: string, id = `${role}-1`) {
  const grants: Record<string, string[]> = {
    owner: ["billing:manage", "refund:execute", "finance:read"],
    admin: ["billing:manage", "refund:execute", "finance:read"],
    finance: ["billing:manage", "finance:read"],
    support: [],
    developer: [],
  };
  return {
    user: { id, email: `${role}@example.test`, role, clerkUserId: `user_${role}` },
    can: (permission: string) => (grants[role] ?? []).includes(permission),
  } as never;
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    number: "ORD-2026-0001",
    status: "paid",
    currency: "CAD",
    totalMinorUnits: 45_000,
    refundedMinorUnits: 0,
    projectId: "project-1",
    ...overrides,
  };
}

beforeEach(() => {
  updates.length = 0;
  inserts.length = 0;
  audits.length = 0;
  updateMatches = true;
  orderRow = order();
  projectRow = { id: "project-1", deadlineAt: null, deliveredAt: null };
  refundRow = undefined;
  paymentRow = {
    id: "payment-1",
    provider: "stripe",
    providerPaymentId: "pi_1",
    status: "succeeded",
  };
  providerRefund.mockReset();
  providerRefund.mockResolvedValue({
    providerRefundId: "re_1",
    amountMinorUnits: 45_000,
    status: "refunded",
  });
});

/* --- Who may do what ---------------------------------------------------- */

describe("raising a refund", () => {
  it("is refused to roles without billing:manage", async () => {
    for (const role of ["support", "developer"]) {
      await expect(
        requestRefund(
          { orderId: "order-1", reason: "goodwill", amountMinorUnits: 100 },
          actor(role),
        ),
      ).rejects.toMatchObject({ code: "not_found" });
    }
    expect(inserts).toHaveLength(0);
  });

  it("is allowed to finance", async () => {
    const created = await requestRefund(
      { orderId: "order-1", reason: "customer_request", amountMinorUnits: 10_000 },
      actor("finance"),
    );
    expect(created.status).toBe("requested");
  });

  it("moves no money", async () => {
    await requestRefund(
      { orderId: "order-1", reason: "customer_request", amountMinorUnits: 10_000 },
      actor("finance"),
    );
    expect(providerRefund).not.toHaveBeenCalled();
  });
});

describe("executing a refund", () => {
  beforeEach(() => {
    refundRow = {
      id: "refund-1",
      reference: "REF-2026-0001",
      orderId: "order-1",
      status: "requested",
      amountMinorUnits: 45_000,
      currency: "CAD",
      requestedByUserId: "finance-1",
    };
  });

  it("is refused to finance, who can only raise one", async () => {
    // The whole point of the two-state design.
    await expect(executeRefund("refund-1", actor("finance"))).rejects.toMatchObject({
      code: "not_found",
    });
    expect(providerRefund).not.toHaveBeenCalled();
  });

  it("is refused to support and developers", async () => {
    for (const role of ["support", "developer"]) {
      await expect(executeRefund("refund-1", actor(role))).rejects.toMatchObject({
        code: "not_found",
      });
    }
  });

  it("is allowed to an administrator who did not raise it", async () => {
    const result = await executeRefund("refund-1", actor("admin"));
    expect(providerRefund).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("completed");
  });

  it("refuses the person who raised it, whatever their rank", async () => {
    // Segregation of duties: preparing and releasing are two people.
    refundRow = { ...refundRow, requestedByUserId: "admin-1" };

    await expect(
      executeRefund("refund-1", actor("admin", "admin-1")),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(providerRefund).not.toHaveBeenCalled();
  });

  it("records the self-approval attempt", async () => {
    refundRow = { ...refundRow, requestedByUserId: "admin-1" };
    await executeRefund("refund-1", actor("admin", "admin-1")).catch(() => undefined);
    expect(audits.at(-1)?.after?.refusal).toBe("self_approval");
  });

  it("claims the refund before calling the provider", async () => {
    // A crash mid-flight leaves a `processing` row to reconcile rather than a
    // `requested` one whose money has already gone.
    await executeRefund("refund-1", actor("admin"));

    const claim = updates.find((row) => row.values.status === "processing");
    expect(claim).toBeDefined();
  });

  it("loses gracefully when a second approver races", async () => {
    updateMatches = false;
    await expect(executeRefund("refund-1", actor("admin"))).rejects.toMatchObject({
      code: "conflict",
    });
    expect(providerRefund).not.toHaveBeenCalled();
  });

  it("refuses one that has already been handled", async () => {
    refundRow = { ...refundRow, status: "completed" };
    await expect(executeRefund("refund-1", actor("admin"))).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("marks it failed and audits when the provider refuses", async () => {
    providerRefund.mockRejectedValue(new Error("card expired"));

    await expect(executeRefund("refund-1", actor("admin"))).rejects.toMatchObject({
      code: "service_unavailable",
    });
    expect(updates.some((row) => row.values.status === "failed")).toBe(true);
    expect(audits.some((entry) => entry.action === "refund.failed")).toBe(true);
  });
});

/* --- Amounts ------------------------------------------------------------ */

describe("guarantee amounts are derived, not accepted", () => {
  it("ignores a supplied amount for a full guarantee cancellation", async () => {
    // The customer was promised 100%; a hand-entered figure is how that
    // quietly becomes something else.
    await requestRefund(
      { orderId: "order-1", reason: "guarantee_cancel", amountMinorUnits: 1 },
      actor("finance"),
    );
    expect(inserts[0]?.amountMinorUnits).toBe(45_000);
  });

  it("computes 30% for a continued build", async () => {
    await requestRefund(
      { orderId: "order-1", reason: "guarantee_continue", amountMinorUnits: 44_000 },
      actor("finance"),
    );
    expect(inserts[0]?.amountMinorUnits).toBe(13_500);
  });

  it("refuses more than remains on the order", async () => {
    orderRow = order({ refundedMinorUnits: 40_000 });
    await expect(
      requestRefund(
        { orderId: "order-1", reason: "goodwill", amountMinorUnits: 10_000 },
        actor("finance"),
      ),
    ).rejects.toMatchObject({ code: "bad_request" });
  });

  it("refuses a zero or negative amount", async () => {
    for (const amount of [0, -100]) {
      await expect(
        requestRefund(
          { orderId: "order-1", reason: "goodwill", amountMinorUnits: amount },
          actor("finance"),
        ),
      ).rejects.toMatchObject({ code: "bad_request" });
    }
  });

  it("requires a note for an unclassified refund", async () => {
    await expect(
      requestRefund(
        { orderId: "order-1", reason: "other", amountMinorUnits: 1000 },
        actor("finance"),
      ),
    ).rejects.toMatchObject({ code: "bad_request" });
  });
});

/* --- Eligibility -------------------------------------------------------- */

describe("eligibility", () => {
  it("is refused to anyone without billing:manage", async () => {
    await expect(refundEligibility("order-1", actor("support"))).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("refuses an unpaid order", async () => {
    orderRow = order({ status: "pending_payment" });
    const result = await refundEligibility("order-1", actor("finance"));

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("order_not_paid");
  });

  it("refuses one already fully refunded", async () => {
    orderRow = order({ refundedMinorUnits: 45_000 });
    const result = await refundEligibility("order-1", actor("finance"));

    expect(result.eligible).toBe(false);
    expect(result.maximum.minorUnits).toBe(0);
  });

  it("offers both guarantee amounts once a deadline is missed", async () => {
    projectRow = {
      id: "project-1",
      deadlineAt: new Date("2026-10-01T00:00:00Z"),
      deliveredAt: null,
    };

    const result = await refundEligibility(
      "order-1",
      actor("finance"),
      new Date("2026-10-10T00:00:00Z"),
    );

    expect(result.guarantee.deadlineMissed).toBe(true);
    expect(result.guarantee.cancelAmount?.minorUnits).toBe(45_000);
    expect(result.guarantee.continueAmount?.minorUnits).toBe(13_500);
  });

  it("offers neither when the work was delivered on time", async () => {
    projectRow = {
      id: "project-1",
      deadlineAt: new Date("2026-10-10T00:00:00Z"),
      deliveredAt: new Date("2026-10-08T00:00:00Z"),
    };

    const result = await refundEligibility(
      "order-1",
      actor("finance"),
      new Date("2026-10-12T00:00:00Z"),
    );

    expect(result.guarantee.deadlineMissed).toBe(false);
    expect(result.guarantee.cancelAmount).toBeNull();
  });
});

/* --- Rejection ---------------------------------------------------------- */

describe("rejecting a request", () => {
  beforeEach(() => {
    refundRow = {
      id: "refund-1",
      reference: "REF-2026-0001",
      orderId: "order-1",
      status: "requested",
      amountMinorUnits: 10_000,
      requestedByUserId: "finance-1",
    };
  });

  it("needs refund:execute", async () => {
    await expect(rejectRefund("refund-1", "no", actor("finance"))).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("requires a reason", async () => {
    await expect(rejectRefund("refund-1", "   ", actor("admin"))).rejects.toMatchObject({
      code: "bad_request",
    });
  });

  it("records the decision and the reason", async () => {
    await rejectRefund("refund-1", "Delivered on time", actor("admin"));
    expect(audits.at(-1)?.action).toBe("refund.rejected");
  });
});
