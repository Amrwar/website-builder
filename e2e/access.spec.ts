import { expect, test } from "@playwright/test";

/**
 * What a signed-out visitor can and cannot reach.
 *
 * Run once, on one viewport: access control does not vary by screen size, and
 * repeating it four times would only slow the suite.
 */

test.describe("signed out", () => {
  // Access control does not vary by viewport; run it once.
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "viewport-independent");
  });

  const PRIVATE = [
    "/projects",
    "/billing",
    "/account",
    "/notifications",
    "/ideas",
    "/ideas/00000000-0000-4000-8000-000000000000",
    "/invoices/INV-2026-0001",
    "/admin",
    "/admin/pricing",
    "/admin/refunds",
    "/ar/billing",
  ];

  for (const path of PRIVATE) {
    test(`${path} sends a visitor to sign in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in/);
      // And remembers where they were going.
      expect(new URL(page.url()).searchParams.get("redirect_url")).toContain(
        path.split("/").filter(Boolean).at(-1),
      );
    });
  }

  test("the account API answers 401, not a page", async ({ request }) => {
    const response = await request.get("/api/account/me");
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.ok).toBe(false);
  });

  test("API responses are never cached", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("the Stripe webhook refuses an unsigned delivery", async ({ request }) => {
    const response = await request.post("/api/webhooks/stripe", {
      data: { id: "evt_forged", type: "checkout.session.completed" },
    });
    expect(response.status()).toBe(401);
  });

  test("the Clerk webhook refuses an unsigned delivery", async ({ request }) => {
    const response = await request.post("/api/webhooks/clerk", {
      data: { type: "user.created", data: {} },
    });
    // 400/401 when the signing secret is configured; 503 when it is not, which
    // is the handler refusing to trust anything it cannot verify. Either way
    // the property under test holds: an unsigned delivery is never accepted.
    // (Production has the secret; local and CI environments do not.)
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.ok()).toBe(false);
  });

  test("a server action from another origin is refused", async ({ request }) => {
    // Same-origin reaches action lookup; a foreign origin must not get that
    // far. The id is fake — what is being tested is the gate in front of it.
    const headers = { "Next-Action": "0".repeat(40), "Content-Type": "text/plain" };
    const same = await request.post("/", { headers, data: "[]" });
    const foreign = await request.post("/", {
      headers: { ...headers, Origin: "https://evil.example" },
      data: "[]",
    });
    expect(same.status()).toBe(404);
    expect(foreign.status()).not.toBe(404);
    expect(foreign.status()).toBeGreaterThanOrEqual(400);
  });

  test("an idea test that does not exist is a 404, and its endpoint says nothing", async ({
    page,
    request,
  }) => {
    const response = await page.goto("/v/no-such-test-0000");
    expect(response?.status()).toBe(404);
    // 204 whatever happened, so a stranger cannot probe for live slugs.
    const beacon = await request.post("/api/v/no-such-test-0000/events", {
      data: { kind: "view" },
    });
    expect(beacon.status()).toBe(204);
  });

  test("an unknown page is a real 404 with a way home", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
  });

  test("security headers are present on pages", async ({ request }) => {
    const headers = (await request.get("/")).headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });
});
