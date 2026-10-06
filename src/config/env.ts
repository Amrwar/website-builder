import { z } from "zod";

/**
 * Server environment.
 *
 * Validated once, at first use, so a missing or malformed variable fails with
 * a readable message at startup rather than as an obscure error deep inside a
 * request.
 *
 * Only variables this module reads are declared. Clerk's and Sentry's SDKs
 * read their own keys from `process.env` and validate them themselves, so
 * restating them here would mean two sources of truth and would make a missing
 * Clerk key break every database call. Variables that are provisioned but not
 * yet consumed (Stripe) are added as the features that use them land --
 * requiring a variable before anything reads it would break builds for no
 * safety gain.
 */

const serverSchema = z.object({
  /**
   * Pooled connection (PgBouncer), used for all request-time queries.
   * Serverless invocations open many short connections; the pooler is what
   * keeps that from exhausting Postgres' connection limit.
   */
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required").startsWith("postgres"),

  /**
   * Direct connection, bypassing the pooler. Required for migrations, which
   * need session-level state that a transaction pooler cannot provide.
   */
  DATABASE_URL_UNPOOLED: z.string().startsWith("postgres").optional(),

  /**
   * Salt for the one-way identity fingerprints the anti-abuse rules compare.
   *
   * Optional, and the degradation is deliberate and visible: without it the
   * platform stores no fingerprints, the duplicate-account and shared-network
   * signals never fire, and a warning says so. Every other anti-abuse rule
   * still applies. The alternative -- hashing with a constant -- would look
   * like protection while providing none, since an unsalted hash of an email
   * address is an email address to anyone holding a word list.
   */
  GROWTH_FINGERPRINT_SECRET: z.string().min(16).optional(),

  /**
   * Resend API key. Optional, and the degradation is visible rather than
   * silent: without it `emailTransport()` returns a transport that reports it
   * cannot deliver, notifications are still recorded and readable in the app,
   * and nothing is marked as a failed send.
   */
  RESEND_API_KEY: z.string().min(1).optional(),

  /**
   * The `From` address, which must be on a domain verified in Resend --
   * "Buildline <noreply@send.buildline.dev>". Separate from the key because
   * the key is a secret and this is not, and because the verified domain
   * differs per environment.
   */
  EMAIL_FROM: z.string().min(3).optional(),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

/**
 * Returns the validated server environment.
 *
 * Throws if called from the browser: these values are secrets, and an
 * accidental client import would otherwise bundle them.
 */
export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error(
      "serverEnv() was called in the browser. Server environment variables must " +
        "never reach the client bundle.",
    );
  }

  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    // Report every problem at once, by name only -- never echo a value, since
    // these messages reach logs.
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid server environment:\n${issues}\n\n` +
        "Run `vercel env pull` to refresh .env.local.",
    );
  }

  cached = parsed.data;
  return cached;
}
