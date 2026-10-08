import { z } from "zod";

import { getAuthContext } from "@/server/auth";
import { RATE_LIMITS, consume, limiterKey } from "@/server/platform/rate-limit";
import { recordVisit } from "@/server/validation/experiments";

/**
 * Views and call-to-action clicks on a validation page.
 *
 * Always 204, whether the event was recorded, ignored as a bot, ignored as
 * the owner, or refused for rate: an answer that varied would tell a
 * stranger whether a slug exists and is live. Sent with `sendBeacon`, so
 * nothing reads the response anyway.
 */

const bodySchema = z.object({ kind: z.enum(["view", "cta_click"]) });

const NO_CONTENT = new Response(null, { status: 204 });

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/v/[slug]/events">,
) {
  const { slug } = await params;
  const key = await limiterKey(null);
  if (!consume("validationEvent", key, RATE_LIMITS.validationEvent).ok)
    return NO_CONTENT.clone();

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NO_CONTENT.clone();
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NO_CONTENT.clone();

  const auth = await getAuthContext();
  await recordVisit(slug, parsed.data.kind, {
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: request.headers.get("user-agent") ?? "",
    viewerUserId: auth?.user.id ?? null,
  });
  return NO_CONTENT.clone();
}
