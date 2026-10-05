import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Baseline security headers.
 *
 * Content-Security-Policy is intentionally absent for now: a meaningful policy
 * needs the script origins of the auth, payment and analytics providers, which
 * are provisioned but not yet wired. It is added once those are in place --
 * shipping a permissive `unsafe-inline` policy early would be worse than none,
 * because it reads as protection without providing any.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
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
  { key: "X-DNS-Prefetch-Control", value: "on" },
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
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
