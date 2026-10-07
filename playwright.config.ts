import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests, against a real production build.
 *
 * Not the dev server: the bugs this suite exists to catch — a client export
 * called from a server component, a bad suspense boundary, a missing
 * translation namespace — are the ones that pass every unit test and only
 * show up once the real build is rendering pages.
 *
 * Runs on the system's Chrome (`channel: "chrome"`) rather than a downloaded
 * browser build, so the suite has no binary to fetch and matches what people
 * actually use.
 *
 * ── Scope, honestly ───────────────────────────────────────────────────────
 * Everything here runs signed out. Signed-in journeys need a Clerk test user
 * and Clerk's testing tokens, which have to be provisioned against the
 * project's own Clerk instance; until they are, authenticated flows are
 * covered by the integration tests and by hand. What signed-out E2E *can*
 * prove is still a lot: the public journey end to end, every viewport, both
 * directions, and that every private surface refuses an anonymous visitor.
 * ──────────────────────────────────────────────────────────────────────────
 */

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 45_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "chrome" } },
    { name: "tablet", use: { viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: "desktop", use: { viewport: { width: 1366, height: 900 } } },
    { name: "large", use: { viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: {
    // The build is a separate step (`npm run build`), so a failing build is
    // reported as a build failure rather than as forty failing tests.
    command: `npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
