import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, statusForCode } from "@/lib/api/response";
import type { User } from "@/db/schema";

// `server-only` throws by design when it is not resolved under the
// react-server condition, which is exactly what makes it a useful guard in
// the app and exactly what has to be neutralised to test the module here.
vi.mock("server-only", () => ({}));

const authMock = vi.fn();
const currentUserMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: () => currentUserMock(),
}));

const findFirst = vi.fn();
const returning = vi.fn();

vi.mock("@/db/client", () => ({
  db: {
    query: { users: { findFirst: () => findFirst() } },
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: () => returning() }),
      }),
    }),
  },
}));

const { assertOwnershipOr, getAuthContext, isSignedIn, requirePermission, requireUser } =
  await import("./auth");

function userRow(overrides: Partial<User> = {}): User {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    clerkUserId: "user_abc",
    email: "person@example.com",
    displayName: "Person",
    role: "customer",
    preferredLocale: "en",
    preferredCurrency: "CAD",
    timezone: "America/Toronto",
    notifyBuildUpdates: true,
    notifyMessages: true,
    notifyDeadlineAlerts: true,
    notifyProductNews: false,
    businessName: null,
    businessWebsite: null,
    billingCountry: null,
    taxId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

/** No session: what an unauthenticated request looks like to Clerk. */
function signedOut() {
  authMock.mockResolvedValue({ userId: null });
}

/** A verified session whose row already exists at `role`. */
function signedInAs(role: User["role"], overrides: Partial<User> = {}) {
  authMock.mockResolvedValue({ userId: "user_abc" });
  findFirst.mockResolvedValue(userRow({ role, ...overrides }));
}

beforeEach(() => {
  authMock.mockReset();
  currentUserMock.mockReset();
  findFirst.mockReset();
  returning.mockReset();
});

describe("unauthenticated access", () => {
  it("resolves no context", async () => {
    signedOut();
    await expect(getAuthContext()).resolves.toBeNull();
  });

  it("never queries the database", async () => {
    // A signed-out request must not be able to make the server do work; this
    // is also what keeps an unauthenticated flood off the connection pool.
    signedOut();
    await getAuthContext();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("reports not signed in", async () => {
    signedOut();
    await expect(isSignedIn()).resolves.toBe(false);
  });

  it("is rejected by requireUser as 401", async () => {
    signedOut();
    const error = await requireUser().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("unauthorized");
    expect(statusForCode((error as ApiError).code)).toBe(401);
  });

  it("is rejected by requirePermission before any permission is consulted", async () => {
    signedOut();
    const error = await requirePermission("admin:access").catch((e: unknown) => e);
    expect((error as ApiError).code).toBe("unauthorized");
  });

  it("cannot be forged by passing a user id, because none is accepted", async () => {
    // The only identity input is Clerk's session. There is no parameter on any
    // of these functions through which a caller could name a different user.
    signedOut();
    expect(getAuthContext.length).toBe(0);
    expect(requireUser.length).toBe(0);
  });
});

describe("a customer reaching a staff surface", () => {
  it("is answered not_found, not forbidden", async () => {
    // 403 would confirm the route exists. 404 tells them nothing they did not
    // already know.
    signedInAs("customer");
    const error = await requirePermission("admin:access").catch((e: unknown) => e);

    expect((error as ApiError).code).toBe("not_found");
    expect(statusForCode((error as ApiError).code)).toBe(404);
  });

  it("leaks nothing about the permission in the message", async () => {
    signedInAs("customer");
    const error = (await requirePermission("user:manage").catch(
      (e: unknown) => e,
    )) as ApiError;

    expect(error.message).toBe("Not found.");
    expect(error.message).not.toContain("user:manage");
    expect(error.message).not.toContain("permission");
  });

  it("is refused every staff permission", async () => {
    for (const permission of [
      "admin:access",
      "project:read:all",
      "project:manage",
      "build:execute",
      "design:manage",
      "support:respond",
      "billing:manage",
      "user:manage",
    ] as const) {
      signedInAs("customer");
      await expect(requirePermission(permission), permission).rejects.toThrow(ApiError);
    }
  });

  it("still reaches its own account", async () => {
    signedInAs("customer");
    const { can } = await requirePermission("account:manage");
    expect(can("project:create")).toBe(true);
  });
});

describe("staff permissions are per-role, not all-or-nothing", () => {
  it("lets a developer in but not at design", async () => {
    signedInAs("developer");
    const context = await requirePermission("admin:access");

    expect(context.can("build:execute")).toBe(true);
    expect(context.can("design:manage")).toBe(false);
    expect(context.can("user:manage")).toBe(false);
  });

  it("refuses a designer the build controls", async () => {
    signedInAs("designer");
    await expect(requirePermission("build:execute")).rejects.toThrow(ApiError);
  });

  it("refuses support the ability to change scope", async () => {
    signedInAs("support");
    await expect(requirePermission("project:manage")).rejects.toThrow(ApiError);
  });

  it("admits an admin everywhere", async () => {
    signedInAs("admin");
    const context = await requirePermission("user:manage");
    expect(context.can("billing:manage")).toBe(true);
  });
});

describe("the role comes from our database, not from Clerk", () => {
  it("ignores an elevated role claimed in session metadata", async () => {
    // The scenario: Clerk metadata is client-readable and editable outside the
    // application, so a role found there is an assertion, not a fact.
    authMock.mockResolvedValue({
      userId: "user_abc",
      sessionClaims: { metadata: { role: "admin" } },
      publicMetadata: { role: "admin" },
    });
    findFirst.mockResolvedValue(userRow({ role: "customer" }));

    const context = await getAuthContext();

    expect(context?.user.role).toBe("customer");
    expect(context?.can("admin:access")).toBe(false);
  });
});

describe("first sight of a new account", () => {
  it("provisions the row at the least-privileged role", async () => {
    authMock.mockResolvedValue({ userId: "user_new" });
    findFirst.mockResolvedValue(undefined);
    currentUserMock.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "new@example.com" },
      fullName: "New Person",
    });
    returning.mockResolvedValue([userRow({ clerkUserId: "user_new", role: "customer" })]);

    const context = await getAuthContext();

    expect(context?.user.role).toBe("customer");
    expect(context?.can("admin:access")).toBe(false);
  });

  it("refuses rather than inventing an identity when Clerk has no email", async () => {
    authMock.mockResolvedValue({ userId: "user_new" });
    findFirst.mockResolvedValue(undefined);
    currentUserMock.mockResolvedValue({ primaryEmailAddress: null, fullName: null });

    await expect(getAuthContext()).resolves.toBeNull();
    expect(returning).not.toHaveBeenCalled();
  });

  it("re-reads the row when the webhook wins the insert race", async () => {
    authMock.mockResolvedValue({ userId: "user_new" });
    findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(userRow({ clerkUserId: "user_new" }));
    currentUserMock.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "new@example.com" },
      fullName: null,
    });
    // onConflictDoNothing returns nothing when the row already exists.
    returning.mockResolvedValue([]);

    const context = await getAuthContext();
    expect(context?.user.clerkUserId).toBe("user_new");
  });
});

describe("one account cannot read another's records", () => {
  const owner = "22222222-2222-2222-2222-222222222222";

  it("lets the owner through", async () => {
    signedInAs("customer", { id: owner });
    const context = await requireUser();
    expect(() => assertOwnershipOr(context, owner, "project:read:all")).not.toThrow();
  });

  it("stops a different customer with not_found", async () => {
    signedInAs("customer");
    const context = await requireUser();

    const error = (() => {
      try {
        assertOwnershipOr(context, owner, "project:read:all");
      } catch (e: unknown) {
        return e as ApiError;
      }
      return null;
    })();

    expect(error?.code).toBe("not_found");
  });

  it("lets staff with project:read:all read any record", async () => {
    signedInAs("project_manager");
    const context = await requireUser();
    expect(() => assertOwnershipOr(context, owner, "project:read:all")).not.toThrow();
  });

  it("does not let staff without that permission read any record", async () => {
    // Being staff is not a blanket exemption: the named permission is what
    // transcends ownership, not the role.
    signedInAs("designer");
    const context = await requireUser();
    expect(() => assertOwnershipOr(context, owner, "billing:manage")).toThrow(ApiError);
  });
});
