import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next, so .env.local is not loaded for it.
config({ path: ".env.local" });

/**
 * Migrations run over the DIRECT (unpooled) connection.
 *
 * DDL needs session-level state — advisory locks, `SET`, long transactions —
 * which a transaction pooler cannot provide; running migrations through the
 * pooler produces intermittent, hard-to-diagnose failures. The pooled URL is
 * only a fallback for environments where the unpooled one is absent.
 */
const migrationUrl =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: migrationUrl },
  // Fail loudly on a destructive diff rather than silently dropping data.
  strict: true,
  verbose: true,
});
