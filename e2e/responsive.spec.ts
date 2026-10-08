import { expect, test } from "@playwright/test";

/**
 * Layout at every viewport, in both directions.
 *
 * The check that matters most is horizontal overflow: a page wider than the
 * viewport scrolls sideways on a phone, which reads as broken even when every
 * element is individually correct, and it is the classic failure of RTL — a
 * physical margin that should have been logical pushes something off-screen.
 */

const PAGES = ["/", "/configure", "/partners", "/start", "/validate"];
const LOCALES = [
  { prefix: "", dir: "ltr" },
  { prefix: "/ar", dir: "rtl" },
] as const;

for (const { prefix, dir } of LOCALES) {
  for (const path of PAGES) {
    const url = `${prefix}${path === "/" && prefix ? "" : path}` || "/";

    test(`${url} fits the viewport and runs ${dir}`, async ({ page }) => {
      await page.goto(url);
      await expect(page.locator("html")).toHaveAttribute("dir", dir);

      const overflow = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        // Name the culprits, not just the fact, so a failure is actionable.
        const offenders = [...document.querySelectorAll("body *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.right > width + 1 || r.left < -1);
          })
          .filter((el) => !el.closest("[aria-hidden='true'], .sr-only, nextjs-portal"))
          // Inside a deliberate horizontal scroll region — the comparison
          // table on a phone — overflow is the design, and the page itself
          // does not scroll; the scrollWidth assertion below covers that.
          .filter((el) => {
            for (let p = el.parentElement; p; p = p.parentElement) {
              const x = getComputedStyle(p).overflowX;
              if (x === "auto" || x === "scroll") return false;
            }
            return true;
          })
          .slice(0, 5)
          .map(
            (el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`,
          );
        return { scrollWidth: document.documentElement.scrollWidth, width, offenders };
      });

      expect(
        overflow.offenders,
        `elements outside a ${overflow.width}px viewport`,
      ).toEqual([]);
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.width);
    });
  }
}

test.describe("primary navigation", () => {
  test("is reachable at every width, as a menu on phones", async ({ page }, info) => {
    await page.goto("/");
    // The header switches to the menu below `lg`, tablets included.
    const isPhone = (page.viewportSize()?.width ?? 1280) < 1024;

    if (!isPhone) {
      await expect(
        page.getByRole("navigation").getByRole("link", { name: "Pricing" }).first(),
      ).toBeVisible();
      return;
    }

    // The phone menu is the platform's only real dialog, so it carries the
    // dialog checks: focus moves in, Escape closes, focus comes back.
    const trigger = page.getByRole("button", { name: /menu/i }).first();
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Pricing" })).toBeVisible();
    const focusInside = await dialog.evaluate((node) =>
      node.contains(document.activeElement),
    );
    expect(focusInside, `${info.project.name}: focus moved into the menu`).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test("the full header fits at its narrowest width, in Arabic", async ({ page }, info) => {
  // `lg` is where the full header appears; Arabic labels run widest. A nav
  // item that fits at 1366 can still push the cluster off-screen at 1024.
  test.skip(info.project.name !== "desktop", "one width is the point");
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/ar");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const header = await page
    .locator("header")
    .first()
    .evaluate((node) => {
      const width = document.documentElement.clientWidth;
      return [...node.querySelectorAll("a, button")]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.left < -1 || r.right > width + 1)).length;
    });
  expect(header).toBe(0);
});
