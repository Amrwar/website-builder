"use server";

import { headers } from "next/headers";

import { logger } from "@/lib/logger";
import { getAuthContext, requireUser } from "@/server/auth";
import { RATE_LIMITS, consume, limiterKey } from "@/server/platform/rate-limit";
import {
  publishExperiment,
  setExperimentStatus,
  submitLead,
  type VisitorMeta,
} from "@/server/validation/experiments";

/**
 * Test my business idea: server actions.
 *
 * Public HTTP endpoints, like every server action. The owner's actions take
 * the user from the session and pass it down; the services scope every read
 * and write by it. The lead action is anonymous by design and is rate
 * limited per visitor and page.
 */

async function visitorMeta(): Promise<VisitorMeta> {
  const list = await headers();
  const auth = await getAuthContext();
  return {
    ip: list.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: list.get("user-agent") ?? "",
    viewerUserId: auth?.user.id ?? null,
  };
}

export type PublishActionResult =
  | { ok: true; id: string }
  | { ok: false; reason: "signed_out" | "invalid" | "limit" | "rate_limited" | "failed" };

export async function publishValidation(
  rawContent: unknown,
): Promise<PublishActionResult> {
  const context = await getAuthContext();
  if (!context) return { ok: false, reason: "signed_out" };
  if (
    !consume(
      "validationPublish",
      `user:${context.user.id}`,
      RATE_LIMITS.validationPublish,
    ).ok
  ) {
    return { ok: false, reason: "rate_limited" };
  }
  try {
    const result = await publishExperiment(rawContent, context);
    return result.ok ? { ok: true, id: result.id } : result;
  } catch (error) {
    logger.error("validation publish failed", { error, userId: context.user.id });
    return { ok: false, reason: "failed" };
  }
}

export async function changeValidationStatus(id: string, status: string) {
  const context = await requireUser();
  return setExperimentStatus(String(id), status, context);
}

export type LeadActionResult =
  { ok: true } | { ok: false; reason: "invalid" | "closed" | "rate_limited" | "failed" };

export async function submitValidationLead(
  slug: string,
  input: unknown,
): Promise<LeadActionResult> {
  const budget = consume(
    "validationLead",
    `${await limiterKey(null)}:${String(slug)}`,
    RATE_LIMITS.validationLead,
  );
  if (!budget.ok) return { ok: false, reason: "rate_limited" };
  try {
    return await submitLead(String(slug), input, await visitorMeta());
  } catch (error) {
    logger.error("validation lead failed", { error });
    return { ok: false, reason: "failed" };
  }
}
