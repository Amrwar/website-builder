"use server";

import { revalidatePath } from "next/cache";

import { ApiError } from "@/lib/api/response";
import type { ChecklistState } from "@/db/schema/enums";
import { logger } from "@/lib/logger";
import { requireUser } from "@/server/auth";
import { launchProject, setChecklistState } from "@/server/launch";
import {
  cancelSubscription,
  changePlan,
  previewPlanChange,
  resumeSubscription,
  startSubscription,
} from "@/server/subscriptions";
import { requestMoreWork } from "@/server/expand";

/**
 * Launch, subscription and expansion actions.
 *
 * Every one is a public HTTP endpoint with a generated name, so every one
 * re-establishes the caller from the session and hands straight to a service
 * that applies the permission itself. Nothing here decides authority; these
 * are transport, and keeping them thin is what stops a new action shipping
 * without the check its service already has.
 *
 * None of them accepts an amount, a status or an owner. A caller can describe
 * what they want; the server decides what that costs and whether it is
 * allowed.
 */

export type ActionResult<T = unknown> =
  | ({ ok: true } & (T extends object ? T : object))
  | { ok: false; reason: string; message: string };

function failure(error: unknown, fallback: string): ActionResult<never> {
  if (error instanceof ApiError) {
    return { ok: false, reason: error.code, message: error.message };
  }
  logger.error("launch action failed", { error });
  return { ok: false, reason: "internal_error", message: fallback };
}

/* -------------------------------------------------------------------------
 * Launch
 * ---------------------------------------------------------------------- */

export async function updateChecklistItem(
  projectId: string,
  itemKey: string,
  state: string,
  note?: string,
): Promise<ActionResult> {
  try {
    const context = await requireUser();

    const result = await setChecklistState(
      {
        projectId: String(projectId),
        itemKey: String(itemKey),
        state: state as ChecklistState,
        note: note ?? null,
      },
      context,
    );

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        message:
          result.reason === "note_required"
            ? "Say why this item does not apply."
            : "That item could not be updated.",
      };
    }

    revalidatePath("/projects");
    return { ok: true };
  } catch (error) {
    return failure(error, "That item could not be updated.");
  }
}

export async function goLive(projectId: string): Promise<ActionResult> {
  try {
    const context = await requireUser();
    const result = await launchProject(String(projectId), context);

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        message:
          result.reason === "not_ready"
            ? "This project is not ready to go live yet."
            : result.reason === "already_launched"
              ? "This project is already live."
              : "This project cannot be launched from its current state.",
      };
    }

    revalidatePath("/projects");
    revalidatePath("/admin/projects");
    return { ok: true };
  } catch (error) {
    return failure(error, "That launch could not be completed.");
  }
}

/* -------------------------------------------------------------------------
 * Subscriptions
 * ---------------------------------------------------------------------- */

export async function subscribeToPlan(
  planKey: string,
  projectId?: string | null,
): Promise<ActionResult<{ reference: string }>> {
  try {
    const context = await requireUser();

    const result = await startSubscription(
      { planKey: String(planKey), projectId: projectId ?? null },
      context,
    );

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        message:
          result.reason === "already_subscribed"
            ? "This project already has an active plan."
            : "That plan is not available.",
      };
    }

    revalidatePath("/billing");
    return { ok: true, reference: result.value.reference };
  } catch (error) {
    return failure(error, "That plan could not be started.");
  }
}

/**
 * What switching would cost, before anything is charged.
 *
 * A separate read, so the customer sees the figure and agrees to it. The
 * amount is computed by the same function that will charge it.
 */
export async function previewSwitch(
  subscriptionId: string,
  planKey: string,
): Promise<
  ActionResult<{
    kind: string;
    immediate: boolean;
    dueNowMinorUnits: number;
    currency: string;
    effectiveAt: string;
  }>
> {
  try {
    const context = await requireUser();
    const result = await previewPlanChange(
      String(subscriptionId),
      String(planKey),
      context,
    );

    if (!result.ok) {
      return { ok: false, reason: result.reason, message: "That plan is not available." };
    }

    return {
      ok: true,
      kind: result.value.kind,
      immediate: result.value.immediate,
      dueNowMinorUnits: result.value.dueNowMinorUnits,
      currency: result.value.currency,
      effectiveAt: result.value.effectiveAt.toISOString(),
    };
  } catch (error) {
    return failure(error, "That change could not be previewed.");
  }
}

export async function switchPlan(
  subscriptionId: string,
  planKey: string,
): Promise<ActionResult<{ dueNowMinorUnits: number; immediate: boolean }>> {
  try {
    const context = await requireUser();
    const result = await changePlan(String(subscriptionId), String(planKey), context);

    if (!result.ok) {
      return { ok: false, reason: result.reason, message: "That change was refused." };
    }

    revalidatePath("/billing");
    return {
      ok: true,
      dueNowMinorUnits: result.value.change.dueNowMinorUnits,
      immediate: result.value.change.immediate,
    };
  } catch (error) {
    return failure(error, "That plan could not be changed.");
  }
}

export async function endSubscription(
  subscriptionId: string,
  reason?: string,
): Promise<ActionResult<{ endsAt: string }>> {
  try {
    const context = await requireUser();
    const result = await cancelSubscription(
      String(subscriptionId),
      reason?.trim() || null,
      context,
    );

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        message: "That subscription could not be cancelled.",
      };
    }

    revalidatePath("/billing");
    // Returned so the confirmation can say the date service actually ends: a
    // paid period is never cut short, and the customer should see that.
    return { ok: true, endsAt: result.value.endsAt.toISOString() };
  } catch (error) {
    return failure(error, "That subscription could not be cancelled.");
  }
}

export async function keepSubscription(subscriptionId: string): Promise<ActionResult> {
  try {
    const context = await requireUser();
    const result = await resumeSubscription(String(subscriptionId), context);

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        message: "That subscription could not be resumed.",
      };
    }

    revalidatePath("/billing");
    return { ok: true };
  } catch (error) {
    return failure(error, "That subscription could not be resumed.");
  }
}

/* -------------------------------------------------------------------------
 * Build more
 * ---------------------------------------------------------------------- */

export async function buildMore(
  projectId: string,
  summary: string,
  detail: string,
): Promise<ActionResult<{ reference: string }>> {
  try {
    const context = await requireUser();

    const result = await requestMoreWork(
      {
        projectId: String(projectId),
        summary: String(summary ?? ""),
        detail: String(detail ?? ""),
      },
      context,
    );

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        message:
          result.reason === "not_expandable"
            ? "More work can be ordered once this build reaches preview."
            : "Describe what you would like added.",
      };
    }

    revalidatePath("/projects");
    return { ok: true, reference: result.reference };
  } catch (error) {
    return failure(error, "That request could not be raised.");
  }
}
