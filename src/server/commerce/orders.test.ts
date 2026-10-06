import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ScopeModule from "@/lib/scope";
import { fromMajorUnits } from "@/lib/pricing/money";
import type { ScopeAssessment } from "@/lib/scope";

vi.mock("server-only", () => ({}));

/**
 * Order creation, from the attacker's side.
 *
 * The order row is what a payment is later reconciled against, so the
 * questions worth asking are: can a caller influence the amount, can a caller
 * cause two orders from one intent, and can a caller read somebody else's
 * order.
 */

const inserts: { table: string; values: unknown }[] = [];
let existingOrder: Record<string, unknown> | undefined;

function tableName(table: unknown): string {
  for (const symbol of Object.getOwnPropertySymbols(table as object)) {
    if (String(symbol).includes("Name")) {
      return String((table as Record<symbol, unknown>)[symbol]);
    }
  }
  return "unknown";
}

function thenable<T>(value: T) {
  return { then: (resolve: (v: T) => unknown) => Promise.resolve(value).then(resolve) };
}

function makeTx() {
  return {
    /** The catalogue lookup that links order lines to product rows. */
    select() {
      return {
        from: () => ({
          where: () =>
            Promise.resolve([
              { id: "product-website", key: "build.website" },
              { id: "product-design", key: "service.design" },
            ]),
        }),
      };
    },
    insert(table: unknown) {
      const name = tableName(table);
      return {
        values(values: unknown) {
          inserts.push({ table: name, values });
          const rows = Array.isArray(values)
            ? values.map((v, i) => ({ id: `${name}-${i}`, ...(v as object) }))
            : [{ id: `${name}-id`, ...(values as object) }];
          return {
            ...thenable(rows),
            returning: () => Promise.resolve(rows),
            onConflictDoUpdate: () => ({
              returning: () => Promise.resolve([{ lastValue: 7 }]),
            }),
          };
        },
      };
    },
  };
}

const ordersFindFirst = vi.fn();

vi.mock("@/db/client", () => ({
  db: {
    transaction: (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()),
    query: { orders: { findFirst: () => ordersFindFirst() } },
  },
}));

const assessScope = vi.fn();
vi.mock("@/lib/scope", async (importOriginal) => {
  const actual = await importOriginal<typeof ScopeModule>();
  return { ...actual, assessScope: (input: unknown) => assessScope(input) };
});

const { createOrderFromDraft, getOrderForCaller } = await import("./orders");

/* --- Fixtures ----------------------------------------------------------- */

const user = {
  id: "user-1",
  email: "buyer@example.com",
  preferredCurrency: "CAD",
} as never;

const context = { user, can: () => false } as never;

function validDraft(extra: Record<string, unknown> = {}) {
  return {
    version: 1,
    buildType: "website",
    intake: {
      businessName: "Acme",
      industry: "retail",
      description: "A small brochure site for a shop that sells coffee beans.",
      targetCustomers: "local shoppers",
      desiredOutcome: "more walk-ins",
    },
    design: {
      approach: "supplied_brand",
      referenceLinks: ["https://example.com"],
      colourNotes: "navy",
      brandNotes: "",
    },
    selectedCapabilities: [],
    platforms: ["responsive_web"],
    estimatedScreens: 5,
    locale: "en",
    ...extra,
  };
}

function assessment(overrides: Partial<ScopeAssessment> = {}): ScopeAssessment {
  return {
    assessorId: "rule-engine",
    assessorVersion: "2026.10.2",
    buildType: "website",
    tier: "essential",
    complexityPoints: 4,
    capabilities: [],
    reasons: [],
    requiresCustomQuote: false,
    price: fromMajorUnits(400),
    designFee: null,
    totalPrice: fromMajorUnits(400),
    complexity: "simple",
    guaranteedDays: 5,
    exceededEntryTierBy: [],
    ...overrides,
  };
}

beforeEach(() => {
  inserts.length = 0;
  existingOrder = undefined;
  ordersFindFirst.mockReset();
  ordersFindFirst.mockImplementation(() => Promise.resolve(existingOrder));
  assessScope.mockReset();
  assessScope.mockResolvedValue(assessment());
});

/* --- Tests -------------------------------------------------------------- */

describe("the server decides the price", () => {
  it("prices from its own assessment, not from the payload", async () => {
    const result = await createOrderFromDraft(
      { rawDraft: validDraft(), clientRequestId: "req-1" },
      context,
    );

    expect(result.ok).toBe(true);
    const order = inserts.find((row) => row.table === "orders")?.values as Record<
      string,
      number
    >;
    expect(order.totalMinorUnits).toBe(40_000);
  });

  it("ignores a price smuggled into the draft", async () => {
    // Zod drops unknown keys, so these never reach the write -- and the amount
    // comes from the assessment regardless.
    const result = await createOrderFromDraft(
      {
        rawDraft: validDraft({
          totalMinorUnits: 1,
          price: 1,
          total: 1,
          amount: 1,
          challenge: "discount",
        }),
        clientRequestId: "req-1",
      },
      context,
    );

    expect(result.ok).toBe(true);
    const order = inserts.find((row) => row.table === "orders")?.values as Record<
      string,
      number
    >;
    expect(order.totalMinorUnits).toBe(40_000);
  });

  it("re-assesses rather than trusting any scope the client claims", async () => {
    await createOrderFromDraft(
      { rawDraft: validDraft(), clientRequestId: "req-1" },
      context,
    );
    expect(assessScope).toHaveBeenCalledTimes(1);
  });

  it("stores the assessment that justified the price", async () => {
    await createOrderFromDraft(
      { rawDraft: validDraft(), clientRequestId: "req-1" },
      context,
    );
    const stored = inserts.find((row) => row.table === "scope_assessments");
    expect(stored).toBeDefined();
    expect((stored?.values as { assessorVersion: string }).assessorVersion).toBe(
      "2026.10.2",
    );
  });

  it("links the order line to its catalogue row", async () => {
    await createOrderFromDraft(
      { rawDraft: validDraft(), clientRequestId: "req-1" },
      context,
    );

    const items = inserts.find((row) => row.table === "order_items")?.values as {
      productId: string | null;
      productKey: string;
    }[];
    expect(items[0]?.productKey).toBe("build.website");
    expect(items[0]?.productId).toBe("product-website");
  });

  it("rejects a draft that fails validation before pricing anything", async () => {
    const result = await createOrderFromDraft(
      { rawDraft: { version: 1, buildType: "website" }, clientRequestId: "req-1" },
      context,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_draft");
    expect(assessScope).not.toHaveBeenCalled();
  });

  it("re-checks platform conflicts the client was supposed to block", async () => {
    const result = await createOrderFromDraft(
      {
        rawDraft: validDraft({ buildType: "mobileApp", platforms: [] }),
        clientRequestId: "req-1",
      },
      context,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_platforms");
  });
});

describe("a brief needing a quotation never becomes an order", () => {
  it("is refused rather than priced at some fallback", async () => {
    assessScope.mockResolvedValue(
      assessment({
        requiresCustomQuote: true,
        tier: "custom",
        price: null,
        totalPrice: null,
        guaranteedDays: null,
      }),
    );

    const result = await createOrderFromDraft(
      { rawDraft: validDraft(), clientRequestId: "req-1" },
      context,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("requires_custom_quote");
    expect(inserts.filter((row) => row.table === "orders")).toHaveLength(0);
  });
});

describe("one intent produces one order", () => {
  it("returns the existing order for a repeated request id", async () => {
    existingOrder = {
      id: "order-1",
      number: "ORD-2026-0007",
      currency: "CAD",
      totalMinorUnits: 40_000,
    };

    const result = await createOrderFromDraft(
      { rawDraft: validDraft(), clientRequestId: "req-1" },
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deduplicated).toBe(true);
    expect(inserts.filter((row) => row.table === "orders")).toHaveLength(0);
  });

  it("scopes the idempotency key to the user, so keys cannot collide across accounts", async () => {
    await createOrderFromDraft(
      { rawDraft: validDraft(), clientRequestId: "req-1" },
      context,
    );

    const order = inserts.find((row) => row.table === "orders")?.values as Record<
      string,
      string
    >;
    expect(order.idempotencyKey).toContain("user-1");
  });

  it("generates its own key when the client supplies a bogus one", async () => {
    await createOrderFromDraft(
      { rawDraft: validDraft(), clientRequestId: "<script>alert(1)</script>" },
      context,
    );

    const order = inserts.find((row) => row.table === "orders")?.values as Record<
      string,
      string
    >;
    expect(order.idempotencyKey).not.toContain("<script>");
  });
});

describe("one account cannot read another's order", () => {
  it("reports not_found rather than forbidden", async () => {
    // A 403 would confirm the order number exists, which is information a
    // caller enumerating numbers did not have.
    existingOrder = undefined;

    await expect(getOrderForCaller("ORD-2026-0001", context)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("returns the order when the caller owns it", async () => {
    existingOrder = { id: "order-1", number: "ORD-2026-0001", items: [] };
    await expect(getOrderForCaller("ORD-2026-0001", context)).resolves.toMatchObject({
      number: "ORD-2026-0001",
    });
  });
});
