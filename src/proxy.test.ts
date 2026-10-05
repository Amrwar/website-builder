import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ClerkServer from "@clerk/nextjs/server";

/**
 * Proxy routing tests.
 *
 * Two things are checked, both of which have broken silently before:
 *
 *  1. The `config.matcher` regex. A single lost backslash turns the file-
 *     extension lookahead into "anything", which makes the proxy skip every
 *     path -- disabling localisation and the signed-in gate with no error
 *     anywhere. It is regex, so it is tested as regex.
 *  2. Which paths are treated as private. Missing one does not fail a build;
 *     it just quietly serves a private page to anyone.
 */

const protect = vi.fn();
const handleI18n = vi.fn(() => new Response(null, { status: 200 }));

// `clerkMiddleware` is reduced to the identity function so the handler under
// test can be called directly with a stub `auth`. `createRouteMatcher` is the
// real implementation: it is half of what is being tested.
vi.mock("@clerk/nextjs/server", async (importOriginal) => {
  const actual = await importOriginal<typeof ClerkServer>();
  return {
    ...actual,
    clerkMiddleware: (handler: unknown) => handler,
  };
});

vi.mock("next-intl/middleware", () => ({ default: () => handleI18n }));

const proxyModule = await import("./proxy");
const proxy = proxyModule.default as unknown as (
  auth: { protect: typeof protect },
  request: Request,
) => Promise<Response>;
const { config } = proxyModule;

function request(pathname: string): Request {
  // The handler reads `nextUrl`, which NextRequest derives from the URL.
  const url = new URL(pathname, "https://example.com");
  return Object.assign(new Request(url), { nextUrl: url });
}

beforeEach(() => {
  protect.mockReset();
  handleI18n.mockClear();
});

describe("private routes are gated", () => {
  const privatePaths = [
    "/account",
    "/account/",
    "/account/billing",
    "/admin",
    "/admin/users",
    // `localePrefix: "as-needed"` means only non-English URLs carry a prefix,
    // so both forms have to match or /fr/account is wide open.
    "/fr/account",
    "/fr/admin",
    "/ar/account/billing",
  ];

  it.each(privatePaths)("%s calls auth.protect()", async (path) => {
    await proxy({ protect }, request(path));
    expect(protect).toHaveBeenCalledTimes(1);
  });
});

describe("the gate sends people to our own sign-in page", () => {
  /** The `unauthenticatedUrl` handed to Clerk for a given request. */
  async function redirectFor(path: string): Promise<URL> {
    await proxy({ protect }, request(path));
    const [options] = protect.mock.calls[0] as [{ unauthenticatedUrl: string }];
    return new URL(options.unauthenticatedUrl);
  }

  it("uses the application's route, not Clerk's hosted portal", async () => {
    const url = await redirectFor("/account");
    expect(url.origin).toBe("https://example.com");
    expect(url.pathname).toBe("/sign-in");
  });

  it("keeps the visitor's language", async () => {
    expect((await redirectFor("/fr/account")).pathname).toBe("/fr/sign-in");
    protect.mockReset();
    expect((await redirectFor("/ar/admin")).pathname).toBe("/ar/sign-in");
  });

  it("carries where they were heading", async () => {
    const url = await redirectFor("/admin/users");
    expect(url.searchParams.get("redirect_url")).toBe("https://example.com/admin/users");
  });

  it("does not invent a locale prefix for an unprefixed path", async () => {
    // "/account" must not become "/account/sign-in": the first segment is only
    // a locale when it actually is one.
    expect((await redirectFor("/account/billing")).pathname).toBe("/sign-in");
  });
});

describe("public routes are not gated", () => {
  const publicPaths = [
    "/",
    "/fr",
    "/ar",
    "/configure",
    "/fr/configure",
    "/sign-in",
    "/sign-up",
    "/fr/sign-in",
    // Near misses: a prefix match on "/account" would catch these wrongly.
    "/accounts-payable",
    "/administrators",
  ];

  it.each(publicPaths)("%s does not call auth.protect()", async (path) => {
    await proxy({ protect }, request(path));
    expect(protect).not.toHaveBeenCalled();
  });

  it.each(publicPaths)("%s is handed to the locale middleware", async (path) => {
    await proxy({ protect }, request(path));
    expect(handleI18n).toHaveBeenCalledTimes(1);
  });
});

describe("API routes", () => {
  it("are never rewritten onto a locale segment", async () => {
    // An /api path has no [locale] segment; rewriting it onto one 404s the
    // endpoint. Authentication there is the handler's job.
    await proxy({ protect }, request("/api/account/me"));
    expect(handleI18n).not.toHaveBeenCalled();
  });

  it("are not gated by the proxy", async () => {
    await proxy({ protect }, request("/api/account/me"));
    expect(protect).not.toHaveBeenCalled();
  });

  it("are included in the matcher so Clerk can attach the session", () => {
    expect(config.matcher).toContain("/api/(.*)");
  });
});

describe("config.matcher", () => {
  const pattern = config.matcher[0];
  const matches = (path: string) => new RegExp(`^${pattern}$`).test(path);

  it("is a string, as Next.js requires", () => {
    expect(typeof pattern).toBe("string");
  });

  it("runs on the paths that need gating or localising", () => {
    for (const path of [
      "/",
      "/account",
      "/fr/account",
      "/admin",
      "/configure",
      "/sign-in",
      "/fr/sign-up/verify",
    ]) {
      expect(matches(path), `matcher skips ${path}`).toBe(true);
    }
  });

  it("skips framework internals and static assets", () => {
    for (const path of [
      "/_next/static/chunks/main.js",
      "/_vercel/insights/script.js",
      "/favicon.ico",
      "/logo.svg",
      "/fonts/geist.woff2",
      "/styles/app.css",
      "/sitemap.xml",
      "/robots.txt",
      "/site.webmanifest",
      "/og/card.png",
    ]) {
      expect(matches(path), `matcher runs on ${path}`).toBe(false);
    }
  });

  it("still runs on a path that merely contains a dot", () => {
    // The exclusion is anchored to an extension at the end, not to "has a
    // dot" -- a slug like this is a page, not an asset.
    expect(matches("/blog/v1.2-release")).toBe(true);
  });

  it("has not collapsed its escapes into a match-everything lookahead", () => {
    // The exact regression that disabled the proxy once: `\\.` written as `.`
    // makes the lookahead match any path, so nothing is ever processed.
    expect(pattern).toContain("\\.");
    expect(matches("/account")).toBe(true);
  });
});
