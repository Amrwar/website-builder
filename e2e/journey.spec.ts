import { expect, test, type Page } from "@playwright/test";

/**
 * Choice cards hide the native radio (`sr-only`) inside a label, so a person
 * clicks the card. `check()` on the hidden input would be refused — correctly,
 * because nobody can click something invisible — so this clicks the card and
 * then asserts the radio it wraps really is selected.
 */
async function choose(page: Page, name: RegExp) {
  const radio = page.getByRole("radio", { name });
  await page.locator("label").filter({ has: radio }).click();
  await expect(radio).toBeChecked();
}

/** The same for a checkbox card: click what a person clicks, assert the state. */
async function tick(page: Page, name: RegExp) {
  const box = page.getByRole("checkbox", { name });
  await page.locator("label").filter({ has: box }).click();
  await expect(box).toBeChecked();
}

/**
 * The visitor journey, from the home page to the point where money would
 * change hands, on every viewport the config defines.
 *
 * Driven by accessible names, not CSS selectors: if a person using a screen
 * reader cannot find "Next", neither can this test, which is the property
 * worth failing on.
 */

test.describe("visitor → configure → price", () => {
  test.beforeEach(async ({ page }) => {
    // The configurator keeps a draft in this browser; every test starts clean.
    // Once per tab, not per navigation: an init script runs on every load,
    // reloads included, and clearing then would make persistence untestable.
    await page.addInitScript(() => {
      if (sessionStorage.getItem("__e2e_cleared")) return;
      window.localStorage.clear();
      sessionStorage.setItem("__e2e_cleared", "1");
    });
  });

  test("reaches a fixed price and delivery date from the home page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.getByRole("link", { name: "Start a build" }).first().click();
    // A click during hydration becomes a client navigation, which can take
    // longer than the default wait on a loaded machine. Not a user-visible bug.
    await expect(page).toHaveURL(/\/configure$/, { timeout: 15_000 });

    // 1. Type
    await choose(page, /Website/);
    await page.getByRole("button", { name: "Next" }).click();

    // 2. Idea
    await page.getByLabel("Business name").fill("Cedar Bakery");
    await page
      .getByLabel("Describe what you want")
      .fill("A site for our bakery with our menu, opening hours and a contact form.");
    await page.getByRole("button", { name: "Next" }).click();

    // 3. Design
    await choose(page, /I have brand assets/);
    await page
      .getByRole("textbox", { name: "Colours" })
      .fill("Warm cream and dark brown");
    await page.getByRole("button", { name: "Next" }).click();

    // 4. Features, 5. Platform — defaults are valid for a website.
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();

    // 6. Scope: the engine has run and committed to figures.
    await expect(
      page.getByRole("heading", { name: "Here is what we found" }),
    ).toBeVisible();
    await expect(page.getByText("$400").first()).toBeVisible();
    await expect(page.getByText("5 days").first()).toBeVisible();
    // The rule engine says what it matched, rather than claiming intelligence.
    await expect(page.getByText(/Contact forms/).first()).toBeVisible();

    // 7. Review restates the order before anything is committed.
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Your build" })).toBeVisible();
    await expect(page.getByText("Cedar Bakery")).toBeVisible();

    // 8. Start: a signed-out visitor is asked for an account, never for money.
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Start your build" }),
    ).toBeVisible();
    // Holds with or without Clerk: nothing on this step takes payment.
    await expect(page.getByRole("button", { name: "Pay and start" })).toHaveCount(0);

    // The account prompt waits for Clerk's browser script, which a placeholder
    // key can never load. CI without Clerk secrets says so instead of failing.
    test.skip(
      Boolean(process.env.E2E_CLERK_STUB),
      "Clerk is a placeholder here; the account prompt needs a real instance",
    );
    await expect(
      page
        .getByRole("link", { name: "Create an account" })
        .or(page.getByRole("button", { name: "Create an account" })),
    ).toBeVisible();
  });

  test("explains what is missing instead of silently refusing Next", async ({ page }) => {
    await page.goto("/configure");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Choose what you are building.")).toBeVisible();
  });

  test("keeps the draft across a reload", async ({ page }) => {
    await page.goto("/configure");
    await choose(page, /Website/);
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Business name").fill("Cedar Bakery");

    // Saving is debounced; wait for the indicator rather than a fixed delay.
    await expect(page.getByText(/Saves automatically|Saved/)).toBeVisible();
    await page.waitForTimeout(1200);

    await page.reload();
    await expect(page.getByText("We kept your progress")).toBeVisible();
  });
});

test.describe("start my business → configurator", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem("__e2e_cleared")) return;
      window.localStorage.clear();
      sessionStorage.setItem("__e2e_cleared", "1");
    });
  });

  test("recommends, prices and hands over a configured draft", async ({ page }) => {
    await page.goto("/start");
    await expect(
      page.getByRole("heading", { level: 1, name: "What are you starting?" }),
    ).toBeVisible();

    // 1. The business. Next is refused, with a reason, until one is chosen.
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      page.getByText("Choose the kind of business you are starting."),
    ).toBeVisible();
    await choose(page, /^Barber/);
    await page.getByRole("button", { name: "Next" }).click();

    // 2. About it.
    await page.getByRole("textbox", { name: /Business name/ }).fill("Fade Street");
    await page
      .getByRole("textbox", { name: /What do you sell/ })
      .fill("Haircuts, beard trims and hot towel shaves for walk-ins and bookings.");
    await tick(page, /Take payments/);
    await page.getByRole("button", { name: "Next" }).click();

    // 3. What it needs: three levels, a goal's effect explained, a real price.
    await expect(
      page.getByRole("heading", { level: 1, name: "What your business needs" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recommended" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Optional" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Not needed" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Online booking/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /Online payments/ })).toBeChecked();
    await expect(
      page.getByText("Moved up because you chose: Take payments"),
    ).toBeVisible();
    await expect(page.getByText(/\$\d[\d,]*/).first()).toBeVisible({ timeout: 15_000 });

    // 4. Into the ordinary configurator, at the first unanswered question.
    await page.getByRole("button", { name: "Continue to design" }).click();
    await expect(page).toHaveURL(/\/configure$/);
    await expect(page.getByText("Started from Start my business")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "How should it look?" }),
    ).toBeVisible();
    // Not offered back as an abandoned draft: it was made a moment ago.
    await expect(page.getByText("We kept your progress")).toBeHidden();
  });
});

test.describe("test my business idea", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem("__e2e_cleared")) return;
      window.localStorage.clear();
      sessionStorage.setItem("__e2e_cleared", "1");
    });
  });

  test("builds a landing page, then asks for an account to publish it", async ({
    page,
  }) => {
    await page.goto("/validate");
    const next = page.getByRole("button", { name: "Next" });

    // Idea
    await next.click();
    await expect(page.getByText("Add a working name.")).toBeVisible();
    await page.getByRole("textbox", { name: /Working name/ }).fill("Little Loaves");
    await page
      .getByRole("textbox", { name: /idea in one sentence/ })
      .fill("Fresh sourdough delivered every Saturday.");
    await next.click();

    // Description
    await page
      .getByRole("textbox", { name: /Description/ })
      .fill("A weekly bread subscription baked in Laval and delivered by bike.");
    await next.click();

    // Customer
    await page
      .getByRole("textbox", { name: /Target customer/ })
      .fill("Families in Laval");
    await next.click();

    // Offer: a link is refused, with the reason.
    await page
      .getByRole("textbox", { name: /Headline/ })
      .fill("Order at www.example.com");
    await next.click();
    await expect(page.getByText(/Links are not allowed/)).toBeVisible();
    await page
      .getByRole("textbox", { name: /Headline/ })
      .fill("Saturday bread, at your door");
    await choose(page, /Not yet/);
    await next.click();

    // Pricing
    await choose(page, /^Monthly/);
    await page.getByRole("spinbutton", { name: /Amount/ }).fill("32");
    await next.click();

    // The preview is the real page.
    await expect(
      page.getByRole("heading", { level: 1, name: "Saturday bread, at your door" }),
    ).toBeVisible();
    await expect(page.getByText("$32 a month")).toBeVisible();
    await expect(page.getByText(/early test of an idea by Little Loaves/)).toBeVisible();
    await next.click();

    // Capture: a waitlist, suggested because the offer is not available yet.
    await expect(page.getByRole("radio", { name: /Waitlist/ })).toBeChecked();
    await expect(
      page.getByText("Suggested because it is not available yet"),
    ).toBeVisible();
    await next.click();

    // Publish: honest framing, and an account first.
    await expect(page.getByText("Early validation signals, not proof")).toBeVisible();
    await page.getByRole("button", { name: "Publish test" }).click();
    await expect(page.getByText("Sign in to publish")).toBeVisible();
    await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();

    // And nothing typed is lost on the way to sign-up.
    await page.reload();
    await expect(page.getByRole("textbox", { name: /Working name/ })).toHaveValue(
      "Little Loaves",
    );
  });
});
