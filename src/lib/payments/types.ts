import type { PaymentProviderId, PaymentStatus } from "@/db/schema/enums";
import type { Currency } from "@/lib/pricing/money";

/**
 * Payment provider contract.
 *
 * Nothing in this file imports a provider SDK, and nothing in the commerce
 * domain imports one either. Order creation, fulfilment and refunds speak only
 * these types, so the provider is a replaceable part rather than a dependency
 * threaded through the business rules.
 *
 * The vocabulary is ours, not theirs. A provider's own status strings are
 * carried alongside as `providerStatus` for support and auditing, but every
 * decision the platform makes is made on the normalised `PaymentStatus`.
 */

export interface CheckoutLine {
  /** Shown on the provider's payment page. */
  name: string;
  description?: string;
  unitAmountMinorUnits: number;
  quantity: number;
}

export interface CreateCheckoutInput {
  orderId: string;
  orderNumber: string;
  currency: Currency;
  lines: readonly CheckoutLine[];
  /** Total we expect to charge, checked against the provider's own sum. */
  expectedTotalMinorUnits: number;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  /** Makes a retried create return the original session, not a second one. */
  idempotencyKey: string;
  /** BCP 47 tag for the provider's hosted page. */
  locale: string;
}

export interface CheckoutHandle {
  /** The provider's id for this attempt. Stored as `providerReference`. */
  providerReference: string;
  /** Where to send the customer. */
  redirectUrl: string;
  expiresAt: Date | null;
}

export interface CheckoutState {
  providerReference: string;
  status: PaymentStatus;
  /** The provider's own word for it, unmapped. */
  providerStatus: string;
  /** The charge or intent, once money has moved. */
  providerPaymentId: string | null;
  amountMinorUnits: number;
  currency: string;
  /** Our order id, round-tripped through provider metadata. */
  orderId: string | null;
  customerEmail: string | null;
}

/**
 * A verified event from the provider.
 *
 * `id` is the replay key: it is written to `payment_events` under a unique
 * constraint, and that insert is what claims the event for processing.
 */
export interface ProviderEvent {
  id: string;
  type: string;
  /** The id of the object the event concerns, e.g. a checkout session. */
  objectId: string | null;
  /** The verified payload, stored for audit. */
  payload: unknown;
}

export interface RefundInput {
  providerPaymentId: string;
  amountMinorUnits: number;
  idempotencyKey: string;
  reason?: "requested_by_customer" | "duplicate" | "fraudulent";
}

export interface RefundResult {
  providerRefundId: string;
  amountMinorUnits: number;
  status: PaymentStatus;
}

/** Raised when the provider refuses or misbehaves. Never shown raw. */
export class PaymentProviderError extends Error {
  constructor(
    readonly provider: PaymentProviderId,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PaymentProviderError";
  }
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  /** True when the provider has the configuration it needs to run. */
  isConfigured(): boolean;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutHandle>;
  retrieveCheckout(providerReference: string): Promise<CheckoutState>;
  /**
   * Verifies a webhook's authenticity and returns the event.
   *
   * Takes the raw body, never a parsed object: signature verification is over
   * exact bytes, and a framework that re-serialises the JSON breaks it.
   */
  verifyWebhook(rawBody: string, signature: string | null): Promise<ProviderEvent>;
  refund(input: RefundInput): Promise<RefundResult>;
}
