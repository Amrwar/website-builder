import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ApiError } from "@/lib/api/response";
import { roleHasPermission, type UserRole } from "@/config/roles";
import type * as AuditModule from "./audit";

/**
 * Who may change a price.
 *
 * The question these answer is not "does the form validate" but "can a staff
 * account that is not the owner move a number that decides revenue". Every
 * refusal below happens before any query runs, which is why the database mock
 * can assert it was never touched.
 */

const selected = vi.fn();
const transaction = vi.fn();

vi.mock("@/db/client", () => ({
  db: {
    select: () => ({ from: () => ({ orderBy: selected }) }),
    query: {
      catalogTiers: { findFirst: vi.fn() },
      catalogFeatures: { findFirst: vi.fn() },
      catalogCurrencies: { findFirst: vi.fn() },
      discounts: { findFirst: vi.fn() },
    },
    transaction,
  },
}));

vi.mock("@/server/engine", () => ({ invalidateCatalogCache: vi.fn() }));

const recordAudit = vi.fn();
vi.mock("./audit", async (importOriginal) => {
  const actual = await importOriginal<typeof AuditModule>();
  return { ...actual, recordAudit: (input: unknown) => recordAudit(input) };
});

const {
  createDiscount,
  importShippedDefaults,
  readCatalogForAdmin,
  setDiscountActive,
  updateCurrency,
  updateFeature,
  updateTier,
} = await import("./catalog");

/** A context for a role, with permissions derived the way the server does. */
function contextFor(role: UserRole) {
  return {
    user: {
      id: "11111111-1111-1111-1111-111111111111",
      email: `${role}@example.com`,
      role,
    },
    can: (permission: Parameters<typeof roleHasPermission>[1]) =>
      roleHasPermission(role, permission),
  } as unknown as Parameters<typeof updateTier>[2];
}

const VALID_TIER = {
  priceMinorUnits: 50_000,
  guaranteedDays: 7,
  pointThreshold: 10,
  isActive: true,
};

beforeEach(() => {
  selected.mockReset();
  selected.mockResolvedValue([]);
  transaction.mockReset();
  recordAudit.mockReset();
});

/* -------------------------------------------------------------------------
 * Authorization
 * ---------------------------------------------------------------------- */

describe("only the owner may change the catalogue", () => {
  const nonOwners: UserRole[] = [
    "admin",
    "finance",
    "project_manager",
    "developer",
    "designer",
    "qa",
    "support",
    "customer",
  ];

  it.each(nonOwners)("refuses %s", async (role) => {
    const context = contextFor(role);

    await expect(updateTier("id", VALID_TIER, context)).rejects.toThrow(ApiError);
    await expect(
      updateFeature("id", { points: 1, minimumTier: "essential" }, context),
    ).rejects.toThrow(ApiError);
    await expect(
      updateCurrency(
        "id",
        { rate: 1, roundToMinorUnits: 1, reviewedOn: "2026-10-06", isActive: true },
        context,
      ),
    ).rejects.toThrow(ApiError);
    await expect(createDiscount({}, context)).rejects.toThrow(ApiError);
    await expect(setDiscountActive("id", false, context)).rejects.toThrow(ApiError);
    await expect(importShippedDefaults(context)).rejects.toThrow(ApiError);
  });

  it("answers not_found rather than forbidden", async () => {
    // A refusal that distinguishes "you may not" from "there is nothing here"
    // tells a prober which endpoints are worth attacking.
    await expect(updateTier("id", VALID_TIER, contextFor("admin"))).rejects.toMatchObject(
      { code: "not_found" },
    );
  });

  it("refuses before touching the database", async () => {
    await expect(updateTier("id", VALID_TIER, contextFor("finance"))).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("does not let an administrator who can refund money move a price", () => {
    // Deliberate segregation: `billing:manage` and `refund:execute` are
    // operational, `settings:manage` is a commercial decision.
    expect(roleHasPermission("admin", "refund:execute")).toBe(true);
    expect(roleHasPermission("admin", "settings:manage")).toBe(false);
    expect(roleHasPermission("owner", "settings:manage")).toBe(true);
  });
});

describe("reading the price list is a weaker permission than editing it", () => {
  it("lets finance read", async () => {
    const view = await readCatalogForAdmin(contextFor("finance"));
    expect(view.usingShippedDefaults.tiers).toBe(true);
  });

  it("refuses a role with no finance access", async () => {
    await expect(readCatalogForAdmin(contextFor("designer"))).rejects.toThrow(ApiError);
    await expect(readCatalogForAdmin(contextFor("customer"))).rejects.toThrow(ApiError);
  });
});

/* -------------------------------------------------------------------------
 * Validation
 * ---------------------------------------------------------------------- */

describe("the owner cannot save an incoherent figure", () => {
  const owner = contextFor("owner");

  it("refuses a price with no deadline", async () => {
    await expect(
      updateTier("id", { ...VALID_TIER, guaranteedDays: null }, owner),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("refuses a deadline with no price", async () => {
    await expect(
      updateTier("id", { ...VALID_TIER, priceMinorUnits: null }, owner),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("accepts a quotation row, where both are absent", async () => {
    // Rejected later for not existing, not for being incoherent.
    await expect(
      updateTier(
        "id",
        {
          priceMinorUnits: null,
          guaranteedDays: null,
          pointThreshold: 45,
          isActive: true,
        },
        owner,
      ),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses a zero or negative price", async () => {
    for (const priceMinorUnits of [0, -1]) {
      await expect(
        updateTier("id", { ...VALID_TIER, priceMinorUnits }, owner),
      ).rejects.toMatchObject({ code: "validation_failed" });
    }
  });

  it("refuses a percentage discount above 100", async () => {
    await expect(
      createDiscount(
        {
          code: "HALFOFF",
          description: null,
          kind: "percentage",
          value: 5_000,
          maxDiscountMinorUnits: null,
          minOrderMinorUnits: null,
          appliesToBuildTypes: [],
          startsAt: null,
          endsAt: null,
          maxRedemptions: null,
          isActive: true,
        },
        owner,
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("refuses a window that ends before it starts", async () => {
    await expect(
      createDiscount(
        {
          code: "BACKWARDS",
          description: null,
          kind: "percentage",
          value: 10,
          maxDiscountMinorUnits: null,
          minOrderMinorUnits: null,
          appliesToBuildTypes: [],
          startsAt: new Date("2026-11-01T00:00:00Z"),
          endsAt: new Date("2026-10-01T00:00:00Z"),
          maxRedemptions: null,
          isActive: true,
        },
        owner,
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("refuses a code with characters a URL or a shell would mangle", async () => {
    await expect(
      createDiscount(
        {
          code: "DROP TABLE orders;",
          description: null,
          kind: "percentage",
          value: 10,
          maxDiscountMinorUnits: null,
          minOrderMinorUnits: null,
          appliesToBuildTypes: [],
          startsAt: null,
          endsAt: null,
          maxRedemptions: null,
          isActive: true,
        },
        owner,
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("refuses a rate that would price a build at nothing", async () => {
    for (const rate of [0, -1]) {
      await expect(
        updateCurrency(
          "id",
          { rate, roundToMinorUnits: 100, reviewedOn: "2026-10-06", isActive: true },
          owner,
        ),
      ).rejects.toMatchObject({ code: "validation_failed" });
    }
  });

  it("requires a review date on every rate change", async () => {
    await expect(
      updateCurrency(
        "id",
        { rate: 1.4, roundToMinorUnits: 100, reviewedOn: "", isActive: true },
        owner,
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });
});
