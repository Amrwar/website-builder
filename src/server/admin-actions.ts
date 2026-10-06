"use server";

import { revalidatePath } from "next/cache";

import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { requireUser } from "@/server/auth";
import { adminSearch } from "@/server/admin/queries";
import { executeRefund, rejectRefund, requestRefund } from "@/server/admin/refunds";
import { changeUserRole } from "@/server/admin/team";
import {
  createDiscount,
  importShippedDefaults,
  setDiscountActive,
  updateCurrency,
  updateFeature,
  updateTier,
} from "@/server/admin/catalog";
import {
  importLifecycleDefaults,
  updateChecklistItem as updateChecklistDefinition,
  updatePlan,
} from "@/server/admin/lifecycle";
import type { RefundReason } from "@/db/schema/enums";

/**
 * Admin server actions.
 *
 * Every one re-establishes the caller from the session and hands straight to a
 * service that applies the permission itself. Nothing here decides authority;
 * these are transport, and keeping them thin is what stops a new action
 * shipping without the check its service already has.
 */

export type AdminResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : T))
  | { ok: false; reason: string; message: string };

function failure(error: unknown, fallback: string): AdminResult<never> {
  if (error instanceof ApiError) {
    return { ok: false, reason: error.code, message: error.message };
  }
  logger.error("admin action failed", { error });
  return { ok: false, reason: "internal_error", message: fallback };
}

export async function runAdminSearch(
  term: string,
): Promise<AdminResult<{ hits: unknown[] }>> {
  try {
    const context = await requireUser();
    // Refused outright for anyone who cannot reach the console, so this is not
    // a way to probe for records from a customer account.
    if (!context.can("admin:access")) throw new ApiError("not_found", "Not found.");

    const hits = await adminSearch(String(term ?? ""), context);
    return { ok: true, hits };
  } catch (error) {
    return failure(error, "Search is unavailable.");
  }
}

export async function assignRole(
  userId: string,
  role: string,
  reason?: string,
): Promise<AdminResult> {
  try {
    const context = await requireUser();
    await changeUserRole(String(userId), String(role), context, reason);
    revalidatePath("/admin/team");
    return { ok: true };
  } catch (error) {
    return failure(error, "That role could not be changed.");
  }
}

export async function raiseRefund(
  orderId: string,
  reason: string,
  amountMinorUnits?: number,
  note?: string,
): Promise<AdminResult> {
  try {
    const context = await requireUser();
    await requestRefund(
      {
        orderId: String(orderId),
        reason: reason as RefundReason,
        amountMinorUnits,
        note,
      },
      context,
    );
    revalidatePath("/admin/refunds");
    return { ok: true };
  } catch (error) {
    return failure(error, "That refund could not be raised.");
  }
}

export async function approveRefund(refundId: string): Promise<AdminResult> {
  try {
    const context = await requireUser();
    await executeRefund(String(refundId), context);
    revalidatePath("/admin/refunds");
    return { ok: true };
  } catch (error) {
    return failure(error, "That refund could not be processed.");
  }
}

export async function declineRefund(
  refundId: string,
  note: string,
): Promise<AdminResult> {
  try {
    const context = await requireUser();
    await rejectRefund(String(refundId), String(note ?? ""), context);
    revalidatePath("/admin/refunds");
    return { ok: true };
  } catch (error) {
    return failure(error, "That refund could not be declined.");
  }
}

/* -------------------------------------------------------------------------
 * The commercial catalogue
 * ---------------------------------------------------------------------- */

/**
 * Pricing edits.
 *
 * Each one hands a raw payload to a service that re-establishes the caller's
 * permission, validates the figures and writes an audit entry. Nothing is
 * trusted here -- not the id, not the numbers, and emphatically not the
 * caller's claim to be allowed to make the change.
 */

export async function saveTier(id: string, patch: unknown, reason?: string) {
  try {
    const context = await requireUser();
    await updateTier(String(id), patch, context, reason);
    revalidatePath("/admin/pricing");
    return { ok: true } as const;
  } catch (error) {
    return failure(error, "That tier could not be saved.");
  }
}

export async function saveFeature(id: string, patch: unknown, reason?: string) {
  try {
    const context = await requireUser();
    await updateFeature(String(id), patch, context, reason);
    revalidatePath("/admin/pricing");
    return { ok: true } as const;
  } catch (error) {
    return failure(error, "That feature could not be saved.");
  }
}

export async function saveCurrency(id: string, patch: unknown, reason?: string) {
  try {
    const context = await requireUser();
    await updateCurrency(String(id), patch, context, reason);
    revalidatePath("/admin/pricing");
    return { ok: true } as const;
  } catch (error) {
    return failure(error, "That currency could not be saved.");
  }
}

export async function addDiscount(input: unknown) {
  try {
    const context = await requireUser();
    await createDiscount(input, context);
    revalidatePath("/admin/pricing");
    return { ok: true } as const;
  } catch (error) {
    return failure(error, "That discount could not be created.");
  }
}

export async function toggleDiscount(id: string, isActive: boolean, reason?: string) {
  try {
    const context = await requireUser();
    await setDiscountActive(String(id), Boolean(isActive), context, reason);
    revalidatePath("/admin/pricing");
    return { ok: true } as const;
  } catch (error) {
    return failure(error, "That discount could not be changed.");
  }
}

export async function importCatalogDefaults() {
  try {
    const context = await requireUser();
    const written = await importShippedDefaults(context);
    revalidatePath("/admin/pricing");
    return { ok: true, written } as const;
  } catch (error) {
    return failure(error, "The catalogue could not be imported.");
  }
}

export async function savePlan(id: string, patch: unknown, reason?: string) {
  try {
    const context = await requireUser();
    await updatePlan(String(id), patch, context, reason);
    revalidatePath("/admin/pricing");
    return { ok: true } as const;
  } catch (error) {
    return failure(error, "That plan could not be saved.");
  }
}

export async function saveChecklistItem(id: string, patch: unknown, reason?: string) {
  try {
    const context = await requireUser();
    await updateChecklistDefinition(String(id), patch, context, reason);
    revalidatePath("/admin/pricing");
    return { ok: true } as const;
  } catch (error) {
    return failure(error, "That item could not be saved.");
  }
}

export async function importLifecycleCatalog() {
  try {
    const context = await requireUser();
    const written = await importLifecycleDefaults(context);
    revalidatePath("/admin/pricing");
    return { ok: true, written } as const;
  } catch (error) {
    return failure(error, "Those defaults could not be imported.");
  }
}
