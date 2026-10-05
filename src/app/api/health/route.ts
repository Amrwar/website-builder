import { sql } from "drizzle-orm";

import { createHandler } from "@/lib/api/handler";
import { ApiError, apiSuccess } from "@/lib/api/response";

/**
 * Health check.
 *
 * `GET /api/health`          liveness: the process is up and serving.
 * `GET /api/health?deep=1`   readiness: the database answers too.
 *
 * The two are separate on purpose. A liveness probe that touches the database
 * turns a brief database blip into "the whole application is down", and under
 * load the probe itself competes for the connections it is checking.
 */

export const dynamic = "force-dynamic";

export const GET = createHandler(async (request, { requestId }) => {
  const deep = new URL(request.url).searchParams.get("deep") !== null;

  if (!deep) {
    return apiSuccess({ status: "ok", requestId, checks: {} });
  }

  const startedAt = performance.now();
  try {
    // Imported lazily so a shallow probe never constructs a connection pool.
    const { db } = await import("@/db/client");
    await db.execute(sql`select 1`);
  } catch (error) {
    throw new ApiError("service_unavailable", "A dependency is unavailable.", {
      cause: error,
    });
  }

  return apiSuccess({
    status: "ok",
    requestId,
    checks: {
      database: { status: "ok", durationMs: Math.round(performance.now() - startedAt) },
    },
  });
});
