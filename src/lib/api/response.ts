import { NextResponse } from "next/server";

/**
 * API response envelope.
 *
 * Every route returns the same shape, so a client branches on `ok` once rather
 * than guessing per endpoint whether a failure arrives as a status code, a
 * `message` field or an empty body.
 */

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    /** Stable, machine-readable. Clients branch on this, never on `message`. */
    code: ApiErrorCode;
    /** Human-readable and safe to display. Never contains internal detail. */
    message: string;
    /** Field-level validation detail, when applicable. */
    details?: Record<string, string[]>;
  };
}

export type ApiResponseBody<T> = ApiSuccess<T> | ApiFailure;

export const API_ERROR_CODES = [
  "bad_request",
  "validation_failed",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "internal_error",
  "service_unavailable",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal_error: 500,
  service_unavailable: 503,
};

/**
 * An error that is safe to return to the caller.
 *
 * Anything thrown that is *not* an `ApiError` is treated as unexpected and
 * reported as a generic internal error, so an incidental exception can never
 * leak a query, a path or a credential through the response body.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details?: Record<string, string[]>;

  constructor(
    code: ApiErrorCode,
    message: string,
    options?: { details?: Record<string, string[]>; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "ApiError";
    this.code = code;
    this.details = options?.details;
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }
}

export function apiSuccess<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status: 200, ...init });
}

export function apiFailure(
  error: ApiError,
  init?: ResponseInit,
): NextResponse<ApiFailure> {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    },
    { status: error.status, ...init },
  );
}

export function statusForCode(code: ApiErrorCode): number {
  return STATUS_BY_CODE[code];
}
