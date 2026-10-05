import { beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/db/schema";

/**
 * Server actions are public HTTP endpoints.
 *
 * Next.js gives each one a generated name, which is obscurity, not security:
 * anyone who has loaded the page has the id and can post whatever they like to
 * it. So these tests go through the real `requireUser` path rather than
 * stubbing it, and check the two things that matter -- a signed-out call is
 * refused before any write, and a signed-in call can only ever write to its
 * own row.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
const currentUserMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: () => currentUserMock(),
}));

const findFirst = vi.fn();
const set = vi.fn();
const where = vi.fn();

vi.mock("@/db/client", () => ({
  db: {
    query: { users: { findFirst: () => findFirst() } },
    update: () => ({
      set: (values: unknown) => {
        set(values);
        return { where: (clause: unknown) => where(clause) };
      },
    }),
  },
}));

const { updateBusiness, updatePreferences, updateProfile } =
  await import("./account-actions");

const OWN_ID = "11111111-1111-1111-1111-111111111111";

function userRow(overrides: Partial<User> = {}): User {
  return {
    id: OWN_ID,
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

function signedOut() {
  authMock.mockResolvedValue({ userId: null });
}

function signedIn() {
  authMock.mockResolvedValue({ userId: "user_abc" });
  findFirst.mockResolvedValue(userRow());
}

beforeEach(() => {
  authMock.mockReset();
  currentUserMock.mockReset();
  findFirst.mockReset();
  set.mockReset();
  where.mockReset();
});

describe("a signed-out caller", () => {
  const actions = [
    ["updateProfile", updateProfile, { displayName: "Attacker" }],
    ["updateBusiness", updateBusiness, { businessName: "Attacker Inc" }],
    ["updatePreferences", updatePreferences, { preferredLocale: "fr" }],
  ] as const;

  it.each(actions)("%s is refused", async (_name, action, payload) => {
    signedOut();
    const result = await action(payload);
    expect(result.ok).toBe(false);
  });

  it.each(actions)("%s writes nothing", async (_name, action, payload) => {
    signedOut();
    await action(payload);
    expect(set).not.toHaveBeenCalled();
    expect(where).not.toHaveBeenCalled();
  });

  it("is told to sign in, not given internal detail", async () => {
    signedOut();
    const result = await updateProfile({ displayName: "Attacker" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe("You need to be signed in to do that.");
  });

  it("is rejected before validation, so an invalid payload still 401s", async () => {
    // Order matters: validating first would let an unauthenticated caller
    // probe the schema by reading which fields come back as errors.
    signedOut();
    const result = await updateBusiness({ businessWebsite: "javascript:alert(1)" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors).toBeUndefined();
  });
});

describe("a signed-in caller", () => {
  it("writes to its own row", async () => {
    signedIn();
    const result = await updateProfile({ displayName: "Person" });

    expect(result.ok).toBe(true);
    expect(where).toHaveBeenCalledTimes(1);
  });

  it("cannot redirect the write with an id in the payload", async () => {
    // The row is chosen from the session, and the payload is stripped to the
    // schema's own fields, so neither half of the attack has an effect.
    signedIn();
    await updateProfile({
      displayName: "Person",
      id: "99999999-9999-9999-9999-999999999999",
      clerkUserId: "user_someone_else",
    });

    const written = set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(written).not.toHaveProperty("id");
    expect(written).not.toHaveProperty("clerkUserId");
    expect(Object.keys(written).sort()).toEqual(["displayName", "updatedAt"]);
  });

  it("cannot elevate its own role", async () => {
    signedIn();
    await updateProfile({ displayName: "Person", role: "admin" });

    const written = set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(written).not.toHaveProperty("role");
  });

  it("cannot reach another section's columns through the wrong action", async () => {
    // Each action carries its own schema, so the profile form cannot quietly
    // rewrite billing details.
    signedIn();
    await updateProfile({ displayName: "Person", billingCountry: "XX", taxId: "forged" });

    const written = set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(written).not.toHaveProperty("billingCountry");
    expect(written).not.toHaveProperty("taxId");
  });

  it("gets field errors for a bad value and still writes nothing", async () => {
    signedIn();
    const result = await updateBusiness({
      businessName: "Acme",
      businessWebsite: "javascript:alert(1)",
      billingCountry: "",
      taxId: "",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors).toHaveProperty("businessWebsite");
    expect(set).not.toHaveBeenCalled();
  });
});
