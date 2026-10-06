import "server-only";

import Stripe from "stripe";

import type { PaymentStatus } from "@/db/schema/enums";
import {
  PaymentProviderError,
  type CheckoutHandle,
  type CheckoutState,
  type CreateCheckoutInput,
  type PaymentProvider,
  type ProviderEvent,
  type RefundInput,
  type RefundResult,
} from "@/lib/payments/types";
import { logger } from "@/lib/logger";

/**
 * Stripe adapter.
 *
 * The only file in the codebase that imports the Stripe SDK. Everything above
 * it speaks `PaymentProvider`.
 *
 * Choices here follow Stripe's own current guidance rather than recollection:
 *
 *  - **Checkout Sessions** for one-time payments.
 *  - **No `payment_method_types`.** Omitting it enables dynamic payment
 *    methods, so what a customer is offered is configured in the Dashboard and
 *    adapts to them. Passing it pins the list and quietly costs conversion.
 *  - A client instance, never the deprecated module-level API key pattern.
 *  - `integration_identifier` so these sessions are attributable in the
 *    Dashboard.
 *  - **`automatic_tax` is deliberately not set.** See `config/commerce.ts`:
 *    enabling it without an active registration makes Stripe collect nothing
 *    while the integration believes tax is handled.
 */

/** Pinned, so a Stripe-side default change cannot alter payload shapes. */
const API_VERSION = "2026-09-30.endive";

/**
 * Tags sessions created by this integration in the Stripe Dashboard. The
 * random suffix is Stripe's convention for distinguishing checkout flows.
 */
const INTEGRATION_IDENTIFIER = "buildline-checkout-kqwmvrzt";

let cached: Stripe | undefined;

function client(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new PaymentProviderError("stripe", "Stripe is not configured.");
  }
  cached ??= new Stripe(key, {
    apiVersion: API_VERSION as Stripe.LatestApiVersion,
    // Identifies this application in Stripe's logs, which is what makes a
    // support conversation about a specific request possible.
    appInfo: { name: "Buildline", version: "1.0.0" },
    maxNetworkRetries: 2,
  });
  return cached;
}

/**
 * Maps Stripe's vocabulary onto ours.
 *
 * `payment_status` is the field that matters, not `status`: a session can be
 * `complete` while the money is still in flight for a delayed payment method,
 * and treating that as success would start a build nobody has paid for.
 */
function normaliseSession(session: Stripe.Checkout.Session): PaymentStatus {
  if (session.payment_status === "paid") return "succeeded";
  if (session.payment_status === "no_payment_required") return "succeeded";
  if (session.status === "expired") return "cancelled";
  if (session.status === "complete") return "pending";
  return "pending";
}

export const stripeProvider: PaymentProvider = {
  id: "stripe",

  isConfigured() {
    return Boolean(process.env.STRIPE_SECRET_KEY);
  },

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutHandle> {
    const lineTotal = input.lines.reduce(
      (sum, line) => sum + line.unitAmountMinorUnits * line.quantity,
      0,
    );

    // The lines are built from the server's own quote, so a mismatch here is a
    // bug in that construction rather than tampering -- but it would be a bug
    // that charges the wrong amount, so it fails loudly instead of silently.
    if (lineTotal !== input.expectedTotalMinorUnits) {
      throw new PaymentProviderError(
        "stripe",
        `Line items sum to ${lineTotal} but the order total is ${input.expectedTotalMinorUnits}.`,
      );
    }

    try {
      const session = await client().checkout.sessions.create(
        {
          mode: "payment",
          // No `payment_method_types`: see the note above.
          line_items: input.lines.map((line) => ({
            quantity: line.quantity,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: line.unitAmountMinorUnits,
              product_data: {
                name: line.name,
                ...(line.description ? { description: line.description } : {}),
              },
            },
          })),
          customer_email: input.customerEmail,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          // Round-trips our identifiers so a webhook can find the order
          // without trusting anything the browser sends back.
          client_reference_id: input.orderId,
          metadata: { orderId: input.orderId, orderNumber: input.orderNumber },
          payment_intent_data: {
            metadata: { orderId: input.orderId, orderNumber: input.orderNumber },
          },
          integration_identifier: INTEGRATION_IDENTIFIER,
        },
        // Stripe's own guard against a retried request creating a second
        // session -- and therefore a second chance to charge.
        { idempotencyKey: input.idempotencyKey },
      );

      if (!session.url) {
        throw new PaymentProviderError("stripe", "Stripe returned no checkout URL.");
      }

      return {
        providerReference: session.id,
        redirectUrl: session.url,
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
      };
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;
      logger.error("stripe checkout session creation failed", { error });
      throw new PaymentProviderError("stripe", "Could not start checkout.", {
        cause: error,
      });
    }
  },

  async retrieveCheckout(providerReference: string): Promise<CheckoutState> {
    try {
      const session = await client().checkout.sessions.retrieve(providerReference, {
        // Stripe's fulfilment guidance: retrieve with line items expanded so
        // what was actually bought can be reconciled against the order.
        expand: ["line_items", "payment_intent"],
      });

      const intent = session.payment_intent;
      const providerPaymentId =
        typeof intent === "string" ? intent : (intent?.id ?? null);

      return {
        providerReference: session.id,
        status: normaliseSession(session),
        providerStatus: `${session.status ?? "unknown"}/${session.payment_status}`,
        providerPaymentId,
        amountMinorUnits: session.amount_total ?? 0,
        currency: (session.currency ?? "").toUpperCase(),
        orderId: session.metadata?.orderId ?? session.client_reference_id ?? null,
        customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
      };
    } catch (error) {
      logger.error("stripe checkout retrieval failed", { error, providerReference });
      throw new PaymentProviderError("stripe", "Could not read the payment.", {
        cause: error,
      });
    }
  },

  async verifyWebhook(rawBody: string, signature: string | null): Promise<ProviderEvent> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      // Refusing beats processing an unverified payload: this endpoint creates
      // projects and marks orders paid.
      throw new PaymentProviderError("stripe", "Webhook signing secret is not set.");
    }
    if (!signature) {
      throw new PaymentProviderError("stripe", "Missing signature header.");
    }

    try {
      // `constructEventAsync` uses the platform crypto available in all of our
      // runtimes. The default 5-minute tolerance is kept: it is what rejects a
      // replayed capture of a genuine request.
      const event = await client().webhooks.constructEventAsync(
        rawBody,
        signature,
        secret,
      );

      const object = event.data.object as { id?: string };

      return {
        id: event.id,
        type: event.type,
        objectId: object.id ?? null,
        payload: event,
      };
    } catch (error) {
      // Logged at warn, not error: an invalid signature is an expected event
      // on a public endpoint, not a system fault.
      logger.warn("stripe webhook signature rejected", { error });
      throw new PaymentProviderError("stripe", "Invalid signature.", { cause: error });
    }
  },

  async refund(input: RefundInput): Promise<RefundResult> {
    try {
      const refund = await client().refunds.create(
        {
          payment_intent: input.providerPaymentId,
          amount: input.amountMinorUnits,
          ...(input.reason ? { reason: input.reason } : {}),
        },
        { idempotencyKey: input.idempotencyKey },
      );

      return {
        providerRefundId: refund.id,
        amountMinorUnits: refund.amount,
        status: refund.status === "succeeded" ? "refunded" : "pending",
      };
    } catch (error) {
      logger.error("stripe refund failed", { error });
      throw new PaymentProviderError("stripe", "Could not issue the refund.", {
        cause: error,
      });
    }
  },
};
