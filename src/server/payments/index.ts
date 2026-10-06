import "server-only";

import type { PaymentProvider } from "@/lib/payments/types";
import { stripeProvider } from "./stripe-provider";

/**
 * The provider in use.
 *
 * A single seam, mirroring how `assessScope` selects a scope assessor. Adding
 * a second provider -- a regional processor, or a manual bank-transfer flow --
 * is a selection here, not an edit at every call site.
 */
const providers: Record<string, PaymentProvider> = {
  stripe: stripeProvider,
};

export function paymentProvider(id = "stripe"): PaymentProvider {
  const provider = providers[id];
  if (!provider) {
    throw new Error(`Unknown payment provider "${id}".`);
  }
  return provider;
}

export { stripeProvider };
