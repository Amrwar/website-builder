import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Fulfilment is where money becomes an obligation, so these tests are written
 * against the three promises the product makes at that moment:
 *
 *  1. Nothing is built for money that has not actually arrived.
 *  2. Paying creates a project but **does not start the guarantee clock**.
 *  3. Running fulfilment twice produces one project, not two.
 */

/* --- A minimal Drizzle-shaped fake ------------------------------------- */

interface Recorded {
  table: string;
  values: Record<string, unknown>;
}

const inserts: Recorded[] = [];
const updates: { table: string; values: Record<string, unknown> }[] = [];

/** Set by each test: whether the conditional claim update finds a row. */
let claimSucceeds = true;
let ownerRow: Record<string, unknown> | null = null;
let orderRow: Record<string, unknown> | null = null;
let settledOrderRow: Record<string, unknown> | null = null;

function tableName(table: unknown): string {
  const symbols = Object.getOwnPropertySymbols(table as object);
  for (const symbol of symbols) {
    if (String(symbol).includes("Name")) {
      return String((table as Record<symbol, unknown>)[symbol]);
    }
  }
  return "unknown";
}

function thenable<T>(value: T) {
  return {
    then: (resolve: (v: T) => unknown) => Promise.resolve(value).then(resolve),
  };
}

function makeTx() {
  return {
    insert(table: unknown) {
      const name = tableName(table);
      return {
        values(values: Record<string, unknown>) {
          inserts.push({ table: name, values });
          const rows = [{ id: `${name}-id`, ...values }];
          return {
            ...thenable(rows),
            returning: () => Promise.resolve(rows),
            onConflictDoUpdate: () => ({
              returning: () => Promise.resolve([{ lastValue: 1 }]),
            }),
            onConflictDoNothing: () => ({
              ...thenable(rows),
              returning: () => Promise.resolve(rows),
            }),
          };
        },
      };
    },
    update(table: unknown) {
      const name = tableName(table);
      return {
        set(values: Record<string, unknown>) {
          updates.push({ table: name, values });
          const claimed =
            name === "orders" && "status" in values && values.status === "paid"
              ? claimSucceeds
                ? [{ id: "order-1", number: "ORD-2026-0001", ...values }]
                : []
              : [{ id: `${name}-1` }];
          return {
            where: () => ({
              ...thenable(claimed),
              returning: () => Promise.resolve(claimed),
            }),
          };
        },
      };
    },
    query: {
      users: { findFirst: () => Promise.resolve(ownerRow) },
    },
  };
}

const findFirstOrder = vi.fn();

vi.mock("@/db/client", () => ({
  db: {
    transaction: (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()),
    query: {
      orders: { findFirst: () => findFirstOrder() },
      documentCounters: { findFirst: () => Promise.resolve(undefined) },
    },
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
  },
}));

const retrieveCheckout = vi.fn();

vi.mock("@/server/payments", () => ({
  paymentProvider: () => ({
    id: "stripe",
    isConfigured: () => true,
    retrieveCheckout,
  }),
}));

const { fulfilCheckout } = await import("./fulfilment");

/* --- Fixtures ----------------------------------------------------------- */

function anOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    number: "ORD-2026-0001",
    ownerId: "user-1",
    status: "pending_payment",
    currency: "CAD",
    totalMinorUnits: 40_000,
    subtotalMinorUnits: 40_000,
    discountMinorUnits: 0,
    taxMinorUnits: 0,
    locale: "en",
    projectId: null,
    items: [
      {
        id: "item-1",
        productType: "build",
        productKey: "build.website",
        productName: "website build (essential)",
        quantity: 1,
        unitAmountMinorUnits: 40_000,
        taxMinorUnits: 0,
        totalMinorUnits: 40_000,
        guaranteedDays: 5,
        scopeTier: "essential",
        scopeAssessmentId: "assessment-1",
        scopeSnapshot: { buildType: "website" },
        configuration: {
          intake: { description: "A small brochure site" },
          locale: "en",
          selectedCapabilities: [],
          design: { approach: "design_for_me", referenceLinks: [] },
          estimatedScreens: 5,
        },
      },
    ],
    ...overrides,
  };
}

function paidSession(overrides: Record<string, unknown> = {}) {
  return {
    providerReference: "cs_test_1",
    status: "succeeded",
    providerStatus: "complete/paid",
    providerPaymentId: "pi_1",
    amountMinorUnits: 40_000,
    currency: "CAD",
    orderId: "order-1",
    customerEmail: "buyer@example.com",
    ...overrides,
  };
}

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
  claimSucceeds = true;
  ownerRow = { id: "user-1", email: "buyer@example.com", displayName: "Buyer" };
  orderRow = anOrder();
  settledOrderRow = null;
  findFirstOrder.mockReset();
  findFirstOrder.mockImplementation(() => Promise.resolve(settledOrderRow ?? orderRow));
  retrieveCheckout.mockReset();
  retrieveCheckout.mockResolvedValue(paidSession());
});

/* --- Tests -------------------------------------------------------------- */

describe("nothing is built for money that has not arrived", () => {
  it("refuses a session that completed but has not been paid", async () => {
    // Normal for delayed payment methods: the session completes while the
    // funds are still in flight.
    retrieveCheckout.mockResolvedValue(paidSession({ status: "pending" }));

    const result = await fulfilCheckout("cs_test_1");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unpaid");
    expect(inserts.filter((row) => row.table === "projects")).toHaveLength(0);
  });

  it("refuses when the amount collected does not match the order", async () => {
    // A session created from anything other than this order's own totals.
    retrieveCheckout.mockResolvedValue(paidSession({ amountMinorUnits: 100 }));

    const result = await fulfilCheckout("cs_test_1");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("amount_mismatch");
    expect(inserts.filter((row) => row.table === "projects")).toHaveLength(0);
  });

  it("refuses a session that names no order", async () => {
    retrieveCheckout.mockResolvedValue(paidSession({ orderId: null }));
    const result = await fulfilCheckout("cs_test_1");
    expect(result.ok).toBe(false);
  });

  it("never takes the payment state from the caller", async () => {
    // The only argument is a reference; the provider is asked what happened.
    await fulfilCheckout("cs_test_1");
    expect(retrieveCheckout).toHaveBeenCalledWith("cs_test_1");
  });
});

describe("payment creates a project but does not start the clock", () => {
  it("creates the project in awaiting_assets", async () => {
    const result = await fulfilCheckout("cs_test_1");

    expect(result.ok).toBe(true);
    const project = inserts.find((row) => row.table === "projects");
    expect(project?.values.status).toBe("awaiting_assets");
  });

  it("leaves buildStartedAt and deadlineAt unset", async () => {
    // This is the guarantee. Setting either here would start the countdown at
    // checkout, before the customer has sent anything.
    await fulfilCheckout("cs_test_1");

    const project = inserts.find((row) => row.table === "projects");
    expect(project?.values.buildStartedAt).toBeUndefined();
    expect(project?.values.deadlineAt).toBeUndefined();
    expect(project?.values.assetsSubmittedAt).toBeUndefined();
  });

  it("records paidAt, because the money genuinely did arrive", async () => {
    await fulfilCheckout("cs_test_1");
    const project = inserts.find((row) => row.table === "projects");
    expect(project?.values.paidAt).toBeInstanceOf(Date);
  });

  it("carries the sold guarantee onto the project", async () => {
    await fulfilCheckout("cs_test_1");
    const project = inserts.find((row) => row.table === "projects");
    expect(project?.values.guaranteedDays).toBe(5);
    expect(project?.values.scopeTier).toBe("essential");
  });

  it("states in the audit trail that the guarantee has not started", async () => {
    // The fact a future deadline dispute turns on, written down at the time.
    await fulfilCheckout("cs_test_1");

    const event = inserts.find((row) => row.table === "project_events");
    expect(event?.values.type).toBe("order.fulfilled");
    expect(
      (event?.values.payload as { guaranteeStarted: boolean }).guaranteeStarted,
    ).toBe(false);
  });

  it("issues exactly one invoice, marked paid", async () => {
    await fulfilCheckout("cs_test_1");

    const invoices = inserts.filter((row) => row.table === "invoices");
    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.values.status).toBe("paid");
  });

  it("snapshots who was billed rather than relying on a join", async () => {
    ownerRow = {
      id: "user-1",
      email: "buyer@example.com",
      displayName: "Buyer",
      businessName: "Acme",
      billingCountry: "CA",
      taxId: "GST123",
    };

    await fulfilCheckout("cs_test_1");

    const invoice = inserts.find((row) => row.table === "invoices");
    expect(invoice?.values.billToOrganization).toBe("Acme");
    expect(invoice?.values.billToCountry).toBe("CA");
  });

  it("records the brief so the build team has what was asked for", async () => {
    await fulfilCheckout("cs_test_1");
    const brief = inserts.find((row) => row.table === "project_briefs");
    expect(brief?.values.ideaText).toBe("A small brochure site");
  });
});

describe("running fulfilment twice produces one project", () => {
  it("short-circuits when the order is already paid and has a project", async () => {
    orderRow = anOrder({ status: "paid", projectId: "project-1" });

    const result = await fulfilCheckout("cs_test_1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.alreadyFulfilled).toBe(true);
    expect(inserts.filter((row) => row.table === "projects")).toHaveLength(0);
  });

  it("yields to the winner when a concurrent caller takes the claim", async () => {
    // The conditional UPDATE is the claim: losing it means another caller is
    // already doing the work, so this one reads the result rather than
    // creating a second project.
    claimSucceeds = false;
    settledOrderRow = anOrder({ status: "paid", projectId: "project-1" });

    const result = await fulfilCheckout("cs_test_1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.alreadyFulfilled).toBe(true);
    expect(result.projectId).toBe("project-1");
    expect(inserts.filter((row) => row.table === "projects")).toHaveLength(0);
  });

  it("claims by moving the order out of a non-paid state", async () => {
    await fulfilCheckout("cs_test_1");

    const claim = updates.find(
      (row) => row.table === "orders" && row.values.status === "paid",
    );
    expect(claim).toBeDefined();
    expect(claim?.values.paidAt).toBeInstanceOf(Date);
  });
});
