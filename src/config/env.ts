import { z } from "zod";

/**
 * Server environment.
 *
 * Validated once, at first use, so a missing or malformed variable fails with
 * a readable message at startup rather than as an obscure error deep inside a
 * request.
 *
 * Only variables the application actually reads are declared. Provisioned but
 * unused ones (Stripe, Sentry, Clerk) are added as the features that consume
 * them land -- requiring a variable before anything reads it would break
 * builds for no safety gain.
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
