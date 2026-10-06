"use server";

import { revalidatePath } from "next/cache";

import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { requireUser } from "@/server/auth";
import { adminSearch } from "@/server/admin/queries";
import { executeRefund, rejectRefund, requestRefund } from "@/server/admin/refunds";
import { changeUserRole } from "@/server/admin/team";
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
