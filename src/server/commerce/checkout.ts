import "server-only";

import { and, eq } from "drizzle-orm";

import { BRAND } from "@/config/brand";
import { db } from "@/db/client";
import { orders, payments, type Order, type OrderItem } from "@/db/schema";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { PaymentProviderError } from "@/lib/payments/types";
import type { AuthContext } from "@/server/auth";
import { paymentProvider } from "@/server/payments";

/**
 * Starting a payment.
 *
 * The amounts sent to the provider are read from the order row, which was
 * written by the server from its own assessment. Nothing a browser sends
 * influences what is charged -- the only input this takes from the client is
 * which order to pay, and that is ownership-checked.
 *
 * A payment attempt is recorded before the customer leaves, so an abandoned
 * checkout is a visible row rather than a silence.
 */

const PAYABLE_STATUSES = ["draft", "pending_payment", "failed"] as const;

export interface StartCheckoutInput {
  orderNumber: string;
  context: AuthContext;
  /** Absolute origin, e.g. "https://buildline.dev". */
  origin: string;
  locale: string;
}

export interface StartCheckoutResult {
  redirectUrl: string;
  providerReference: string;
}

function assertPayable(order: Order): void {
  if (order.status === "paid" || order.status === "completed") {
    // Not an error state so much as a race the customer can cause by using
    // the back button; the caller turns this into a redirect to the receipt.
    throw new ApiError("conflict", "This order has already been paid.");
  }
  if (!PAYABLE_STATUSES.includes(order.status as (typeof PAYABLE_STATUSES)[number])) {
    throw new ApiError("conflict", "This order can no longer be paid.");
  }
  if (order.totalMinorUnits <= 0) {
    throw new ApiError("bad_request", "This order has nothing to charge.");
  }
}

/** Reuses a live attempt rather than creating a second one on a refresh. */
async function existingOpenAttempt(orderId: string, idempotencyKey: string) {
  return db.query.payments.findFirst({
    where: and(
      eq(payments.orderId, orderId),
      eq(payments.idempotencyKey, idempotencyKey),
    ),
  });
}

function lineFor(item: OrderItem) {
  return {
    name: item.productName,
    unitAmountMinorUnits: item.unitAmountMinorUnits + item.taxMinorUnits,
    quantity: item.quantity,
  };
}

export async function startCheckout(
  input: StartCheckoutInput,
): Promise<StartCheckoutResult> {
  const { context, orderNumber, origin, locale } = input;

  // Scoped to the caller in the query itself: there is no window in which
  // someone else's order is loaded and then checked.
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.number, orderNumber), eq(orders.ownerId, context.user.id)),
    with: { items: true },
  });

  // `not_found` rather than `forbidden`: a caller probing order numbers learns
  // nothing about which ones exist.
  if (!order) throw new ApiError("not_found", "Not found.");

  assertPayable(order);

  const provider = paymentProvider();
  if (!provider.isConfigured()) {
    logger.error("checkout attempted with no payment provider configured");
    throw new ApiError("service_unavailable", "Payments are not available right now.");
  }

  // One attempt per (order, order version). A refresh or a double click lands
  // on the same key and therefore on the same provider session.
  const idempotencyKey = `checkout:${order.id}:${order.updatedAt.getTime()}`;

  const open = await existingOpenAttempt(order.id, idempotencyKey);
  if (open && open.status === "initiated") {
    try {
      const state = await provider.retrieveCheckout(open.providerReference);
      if (state.status === "initiated" || state.status === "pending") {
        const handle = await provider.createCheckout({
          orderId: order.id,
          orderNumber: order.number,
          currency: order.currency,
          lines: order.items.map(lineFor),
          expectedTotalMinorUnits: order.totalMinorUnits,
          customerEmail: context.user.email,
          successUrl: successUrl(origin, locale, order.number),
          cancelUrl: cancelUrl(origin, locale, order.number),
          idempotencyKey,
          locale: getLocaleDefinition(resolveLocale(locale)).intlTag,
        });
        return {
          redirectUrl: handle.redirectUrl,
          providerReference: handle.providerReference,
        };
      }
    } catch {
      // Fall through and open a fresh attempt; a stale session is not a
      // reason to block a customer who wants to pay.
    }
  }

  try {
    const handle = await provider.createCheckout({
      orderId: order.id,
      orderNumber: order.number,
      currency: order.currency,
      lines: order.items.map(lineFor),
      expectedTotalMinorUnits: order.totalMinorUnits,
      customerEmail: context.user.email,
      successUrl: successUrl(origin, locale, order.number),
      cancelUrl: cancelUrl(origin, locale, order.number),
      idempotencyKey,
      locale: getLocaleDefinition(resolveLocale(locale)).intlTag,
    });

    await db
      .insert(payments)
      .values({
        orderId: order.id,
        provider: provider.id,
        providerReference: handle.providerReference,
        status: "initiated",
        amountMinorUnits: order.totalMinorUnits,
        currency: order.currency,
        idempotencyKey,
      })
      // The provider returned the same session for the same idempotency key,
      // so the attempt is already recorded.
      .onConflictDoNothing();

    await db
      .update(orders)
      .set({ status: "pending_payment" })
      .where(and(eq(orders.id, order.id), eq(orders.status, "draft")));

    logger.info("checkout started", {
      orderId: order.id,
      orderNumber: order.number,
      providerReference: handle.providerReference,
    });

    return {
      redirectUrl: handle.redirectUrl,
      providerReference: handle.providerReference,
    };
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      logger.error("checkout could not be started", { orderId: order.id, error });
      throw new ApiError("service_unavailable", "Could not start checkout.");
    }
    throw error;
  }
}

function localePath(locale: string, path: string): string {
  const resolved = resolveLocale(locale);
  return resolved === "en" ? path : `/${resolved}${path}`;
}

function successUrl(origin: string, locale: string, orderNumber: string): string {
  // `{CHECKOUT_SESSION_ID}` is substituted by the provider on redirect, which
  // is what lets the landing page fulfil immediately instead of waiting for
  // the webhook.
  return `${origin}${localePath(locale, `/orders/${orderNumber}/confirmation`)}?session_id={CHECKOUT_SESSION_ID}`;
}

function cancelUrl(origin: string, locale: string, orderNumber: string): string {
  return `${origin}${localePath(locale, `/orders/${orderNumber}`)}?cancelled=1`;
}

/** The public origin, for building absolute redirect URLs. */
export function publicOrigin(requestUrl: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_ORIGIN;
  if (configured) return configured.replace(/\/$/, "");
  try {
    return new URL(requestUrl).origin;
  } catch {
    return `https://${BRAND.domain}`;
  }
}
