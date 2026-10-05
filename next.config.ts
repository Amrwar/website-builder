import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Clerk's frontend API origin, decoded from the publishable key.
 *
 * ClerkJS and Clerk's UI bundle are served from a per-instance host (and that
 * host differs between the development and production instances), so the CSP
 * cannot name it as a literal. The key encodes it, is public by design, and is
 * available at build time -- so it is read from there rather than duplicated
 * into another variable that could disagree with it.
 *
 * Returning null when the key is absent is deliberate: a build without Clerk
 * configured gets the tighter policy rather than a guessed wildcard.
 */
function clerkOrigin(): string | null {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!key) return null;

  const encoded = key.replace(/^pk_(test|live)_/, "");
  const host = Buffer.from(encoded, "base64").toString("utf8").replace(/\$+$/, "");

  // Guard against a malformed key turning into a nonsense CSP source, which
  // browsers drop silently -- taking the rest of the directive with it.
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(host) ? `https://${host}` : null;
}

const clerk = clerkOrigin();

/**
 * Content Security Policy.
 *
 * ── A deliberate, documented limitation ───────────────────────────────────
 * `script-src` still allows `'unsafe-inline'`. Locking scripts down properly
 * requires a per-request nonce, and a nonce makes every page dynamic, which
 * would cost the marketing pages their static prerendering and CDN caching.
 *
 * That trade is not worth taking yet, so the policy restricts everything it
 * can without it. These directives are not decorative -- each blocks a real
 * class of attack independently of script-src:
 *
 *   frame-ancestors  clickjacking
 *   form-action      forms rewritten to post credentials to another origin
 *   base-uri         <base> injection that re-points every relative URL
 *   object-src       legacy plugin execution
 *
 * The /sign-in, /sign-up, /account and /admin routes are dynamic anyway, so
 * the nonce-based policy can go in for those alongside payments.
 *
 * ── Clerk's origins ───────────────────────────────────────────────────────
 * Clerk is a hosted widget: it loads its own script and talks back to its
 * frontend API, so `'self'` alone silently blocks sign-in altogether. The
 * origins below are the narrowest set that works -- the instance host from
 * the publishable key, Clerk's image CDN, and Cloudflare Turnstile, which is
 * what Clerk's bot protection renders in an iframe.
 * ──────────────────────────────────────────────────────────────────────────
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  // Tailwind and the pre-paint theme script are inlined.
  "style-src 'self' 'unsafe-inline'",
  [
    "script-src 'self' 'unsafe-inline'",
    clerk,
    process.env.NODE_ENV === "development" ? "'unsafe-eval'" : null,
  ]
    .filter(Boolean)
    .join(" "),
  // next/font self-hosts Google fonts at build time, so no remote font origin.
  "font-src 'self' data:",
  ["img-src 'self' data: blob: https://img.clerk.com", clerk].filter(Boolean).join(" "),
  ["connect-src 'self'", clerk].filter(Boolean).join(" "),
  // ClerkJS runs its session handling in a worker created from a blob.
  "worker-src 'self' blob:",
  // Clerk's bot protection renders Cloudflare Turnstile in an iframe.
  ["frame-src 'self' https://challenges.cloudflare.com", clerk].filter(Boolean).join(" "),
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Superseded by frame-ancestors above; retained for older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // Isolates this browsing context from cross-origin openers and embedders.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

/**
 * API responses must never be cached by a CDN or browser: they are
 * request-specific and may become user-specific the moment auth lands.
 */
const apiHeaders = [
  { key: "Cache-Control", value: "no-store, must-revalidate" },
  { key: "Vary", value: "Cookie, Authorization" },
];

const nextConfig: NextConfig = {
  /**
   * Pin the workspace root. Without this, Turbopack walks up the directory
   * tree and can adopt an unrelated lockfile from a parent folder, which on
   * this machine sits in the user's home directory.
   */
  turbopack: { root: import.meta.dirname },

  // Surface type errors at build time rather than silently shipping.
  // Next 16 no longer runs ESLint during `next build`, so linting is a
  // separate `npm run lint` step (and a CI gate) rather than a config flag.
  typescript: { ignoreBuildErrors: false },

  // Trailing-slash-free canonical URLs, which keeps hreflang pairs unambiguous.
  trailingSlash: false,

  // Hide the framework fingerprint.
  poweredByHeader: false,

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: apiHeaders },
    ];
  },
};

export default withNextIntl(nextConfig);
