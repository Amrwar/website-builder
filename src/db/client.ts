import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { serverEnv } from "@/config/env";
import * as schema from "./schema";

/**
 * Database client.
 *
 * Uses node-postgres over the pooled Neon connection, which is the right
 * driver on Vercel Fluid compute: instances are reused across concurrent
 * requests, so a real connection pool is kept warm rather than reconnecting
 * per invocation.
 *
 * `attachDatabasePool` registers the pool with the runtime so it is drained on
 * graceful shutdown instead of leaving connections stranded on the server.
 */

declare global {
  var __dbPool: Pool | undefined;
}

function createPool(): Pool {
  const pool = new Pool({
    connectionString: serverEnv().DATABASE_URL,
    // Each Fluid instance serves several concurrent requests, so a small pool
    // per instance is right; the Neon pooler multiplexes above this.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  attachDatabasePool(pool);
  return pool;
}

/**
 * Reused across hot reloads in development. Without this, every edit leaks a
 * pool and the connection limit is reached within a few minutes of work.
 */
const pool = globalThis.__dbPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalThis.__dbPool = pool;

export const db = drizzle(pool, { schema });

export type Database = typeof db;
export { schema };
