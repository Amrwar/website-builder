"use server";

import { headers } from "next/headers";

import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { createOrderFromDraft } from "@/server/commerce/orders";
import { startCheckout } from "@/server/commerce/checkout";
import { requireUser } from "@/server/auth";

/**
 * Checkout actions.
 *
 * Both of these are public HTTP endpoints with generated names, so both
 * re-establish who the caller is before doing anything, and neither accepts an
 * amount. `placeOrder` takes a configuration and prices it server-side;
 * `beginPayment` takes an order number and reads the amount from the row.
 *
 * The client never sees a price it could edit into a request.
 */

export type PlaceOrderResult =
  | { ok: true; orderNumber: string; totalMinorUnits: number; currency: string }
  | { ok: false; reason: string; message: string };

export async function placeOrder(
  rawDraft: unknown,
  clientRequestId: string,
): Promise<PlaceOrderResult> {
  try {
    const context = await requireUser();

    const result = await createOrderFromDraft(
      { rawDraft, clientRequestId: String(clientRequestId ?? "") },
      context,
    );

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        message:
          result.reason === "requires_custom_quote"
            ? "This build needs a quotation rather than a checkout."
            : "We could not price this configuration. Please review your answers.",
      };
    }

    const { order } = result.value;
    return {
      ok: true,
      orderNumber: order.number,
      totalMinorUnits: order.totalMinorUnits,
      currency: order.currency,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, reason: error.code, message: error.message };
    }
    logger.error("placeOrder failed", { error });
    return {
      ok: false,
      reason: "internal_error",
      message: "Something went wrong. Please try again.",
    };
  }
}

export type BeginPaymentResult =
  { ok: true; redirectUrl: string } | { ok: false; reason: string; message: string };

export async function beginPayment(
  orderNumber: string,
  locale: string,
): Promise<BeginPaymentResult> {
  try {
    const context = await requireUser();

    // Origin from the request rather than from the client, so a crafted value
    // cannot turn our own success URL into somebody else's site.
    const headerList = await headers();
    const host = headerList.get("host");
    const proto = headerList.get("x-forwarded-proto") ?? "https";
    const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? `${proto}://${host}`;

    const { redirectUrl } = await startCheckout({
      orderNumber: String(orderNumber ?? ""),
      context,
      origin,
      locale: String(locale ?? "en"),
    });

    return { ok: true, redirectUrl };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, reason: error.code, message: error.message };
    }
    logger.error("beginPayment failed", { error });
    return {
      ok: false,
      reason: "internal_error",
      message: "Something went wrong. Please try again.",
    };
  }
}
