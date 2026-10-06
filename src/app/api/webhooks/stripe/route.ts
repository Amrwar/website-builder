import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { paymentEvents, payments } from "@/db/schema";
import { createHandler } from "@/lib/api/handler";
import { ApiError, apiSuccess } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { PaymentProviderError } from "@/lib/payments/types";
import { fulfilCheckout, markCheckoutUnsuccessful } from "@/server/commerce/fulfilment";
import { paymentProvider } from "@/server/payments";

/**
 * Stripe webhook.
 *
 * The authoritative path for fulfilment. The success page also fulfils, for
 * immediacy, but it cannot be relied on: a customer can pay and close the tab
 * before it loads. Stripe is explicit that webhooks are required rather than
 * optional for this reason.
 *
 * Three defences, in order:
 *
 *  1. **Signature verification** over the raw body, with the default
 *     five-minute tolerance. Without it, anyone who finds this URL could mark
 *     orders paid and have projects created.
 *  2. **The replay guard**: inserting `payment_events` under a unique
 *     constraint on the provider's event id. The insert *is* the claim. A
 *     redelivery or a replayed capture loses it and returns 200 without
 *     re-running fulfilment. Stripe states that the same event can arrive more
 *     than once and that event ids, not timestamps, are the way to tell.
 *  3. **Idempotent fulfilment** underneath, so even a gap in (2) cannot create
 *     two projects for one order.
 *
 * Events are not ordered, so nothing here assumes a sequence; a late failure
 * event cannot downgrade an order that is already paid.
 */

export const dynamic = "force-dynamic";

/** Only what fulfilment actually needs. Listening to more is noise. */
const HANDLED = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);

export const POST = createHandler(async (request) => {
  const provider = paymentProvider("stripe");

  // The raw text, never a parsed body: signature verification is over exact
  // bytes and any re-serialisation breaks it.
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event;
  try {
    event = await provider.verifyWebhook(rawBody, signature);
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      throw new ApiError("unauthorized", "Invalid signature.");
    }
    throw error;
  }

  const log = logger.child({ webhook: "stripe", type: event.type, eventId: event.id });

  // The claim. A duplicate delivery conflicts here and is acknowledged
  // without doing the work twice.
  const [claimed] = await db
    .insert(paymentEvents)
    .values({
      provider: "stripe",
      providerEventId: event.id,
      type: event.type,
      payload: event.payload as Record<string, unknown>,
    })
    .onConflictDoNothing({
      target: [paymentEvents.provider, paymentEvents.providerEventId],
    })
    .returning({ id: paymentEvents.id });

  if (!claimed) {
    log.info("duplicate webhook ignored");
    return apiSuccess({ received: true, duplicate: true });
  }

  if (!HANDLED.has(event.type) || !event.objectId) {
    await db
      .update(paymentEvents)
      .set({ processedAt: new Date() })
      .where(eq(paymentEvents.id, claimed.id));
    log.debug("event acknowledged without action");
    return apiSuccess({ received: true });
  }

  const providerReference = event.objectId;

  try {
    const attempt = await db.query.payments.findFirst({
      where: eq(payments.providerReference, providerReference),
    });

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const outcome = await fulfilCheckout(providerReference, "stripe");

        if (outcome.ok) {
          if (attempt) {
            await db
              .update(payments)
              .set({
                status: "succeeded",
                providerStatus: event.type,
                succeededAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(payments.id, attempt.id));
          }
          log.info("fulfilment complete", {
            orderId: outcome.order.id,
            alreadyFulfilled: outcome.alreadyFulfilled,
          });
        } else if (outcome.reason === "unpaid") {
          // A completed session whose money has not landed yet. Normal for
          // delayed payment methods; the async_payment_succeeded event follows.
          log.info("session complete but not yet paid; awaiting settlement");
        } else {
          log.error("fulfilment refused", { reason: outcome.reason });
        }
        break;
      }

      case "checkout.session.async_payment_failed": {
        if (attempt) {
          await db
            .update(payments)
            .set({
              status: "failed",
              providerStatus: event.type,
              failedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(payments.id, attempt.id));
          await markCheckoutUnsuccessful(attempt.orderId, "failed");
        }
        log.info("payment failed");
        break;
      }

      case "checkout.session.expired": {
        if (attempt) {
          await db
            .update(payments)
            .set({
              status: "cancelled",
              providerStatus: event.type,
              cancelledAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(payments.id, attempt.id));
          // The order returns to a payable state rather than being cancelled:
          // an abandoned checkout is a customer who may well come back.
          await markCheckoutUnsuccessful(attempt.orderId, "cancelled");
        }
        log.info("checkout expired");
        break;
      }
    }

    await db
      .update(paymentEvents)
      .set({
        processedAt: new Date(),
        paymentId: attempt?.id ?? null,
        orderId: attempt?.orderId ?? null,
      })
      .where(eq(paymentEvents.id, claimed.id));

    return apiSuccess({ received: true });
  } catch (error) {
    // Recorded against the event and re-thrown, so the handler answers 500 and
    // Stripe retries. The event row stays unprocessed, which is what makes a
    // failed delivery visible rather than silently swallowed.
    await db
      .update(paymentEvents)
      .set({ processingError: error instanceof Error ? error.message : "unknown" })
      .where(eq(paymentEvents.id, claimed.id));
    log.error("webhook processing failed", { error });
    throw error;
  }
});
