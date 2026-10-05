import { ZodError } from "zod";

import { logger } from "@/lib/logger";
import { ApiError, apiFailure, type ApiFailure } from "./response";
import type { NextResponse } from "next/server";

/**
 * Route handler wrapper.
 *
 * Gives every endpoint the same three guarantees: a correlation id, one log
 * line per failure, and a response body that never exposes internal detail.
 *
 * The important rule is the distinction between expected and unexpected
 * failures. An `ApiError` is deliberate and its message is written for the
 * caller. Anything else is a bug, and its message could contain a query, a
 * path or a secret -- so it is logged in full and answered with a generic
 * message plus the correlation id.
 */

/**
 * Second argument Next.js passes to a route handler.
 *
 * `params` is a promise, so a dynamic segment must be awaited. It is threaded
 * through rather than swallowed: without it a route like
 * `/api/projects/[id]/route.ts` has no way to read its own id.
 */
export type RouteParams = Record<string, string | string[]>;

export interface NextRouteContext<TParams extends RouteParams = RouteParams> {
  params: Promise<TParams>;
}

export type RouteContext<TParams extends RouteParams = RouteParams> =
  NextRouteContext<TParams> & { requestId: string };

export type RouteHandler<TParams extends RouteParams = RouteParams> = (
  request: Request,
  context: RouteContext<TParams>,
) => Promise<NextResponse> | NextResponse;

/** Converts Zod issues into the envelope's field-keyed `details`. */
function detailsFromZod(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (details[key] ??= []).push(issue.message);
  }
  return details;
}

export function createHandler<TParams extends RouteParams = RouteParams>(
  handler: RouteHandler<TParams>,
) {
  return async function route(
    request: Request,
    context: NextRouteContext<TParams>,
  ): Promise<NextResponse> {
    // Reuse the platform's id when present so a log line here can be joined to
    // the same request in Vercel's own logs.
    const requestId =
      request.headers.get("x-vercel-id") ??
      request.headers.get("x-request-id") ??
      crypto.randomUUID();

    const log = logger.child({
      requestId,
      method: request.method,
      path: new URL(request.url).pathname,
    });

    try {
      const response = await handler(request, { ...context, requestId });
      response.headers.set("x-request-id", requestId);
      return response;
    } catch (error) {
      if (error instanceof ZodError) {
        const apiError = new ApiError("validation_failed", "The request was invalid.", {
          details: detailsFromZod(error),
        });
        log.warn("request failed validation", { details: apiError.details });
        return withRequestId(apiFailure(apiError), requestId);
      }

      if (error instanceof ApiError) {
        // Expected failure: logged at warn, message is already caller-safe.
        log.warn("request rejected", { code: error.code, message: error.message });
        return withRequestId(apiFailure(error), requestId);
      }

      // Unexpected: the real error goes to the log, never to the response.
      log.error("unhandled route error", { error });
      return withRequestId(
        apiFailure(
          new ApiError("internal_error", `Something went wrong. Reference: ${requestId}`),
        ),
        requestId,
      );
    }
  };
}

function withRequestId(
  response: NextResponse<ApiFailure>,
  requestId: string,
): NextResponse<ApiFailure> {
  response.headers.set("x-request-id", requestId);
  return response;
}
