import { fromMajorUnits } from "@/lib/pricing/money";

/**
 * Referral programme terms.
 *
 * Both sides receive the same credit. A flat reciprocal amount is the only
 * version of this that can be stated in one sentence and verified by the
 * person reading it, which matches how everything else here is priced.
 *
 * COMMERCIAL NOTE: the amount is provisional and needs sign-off. It is a
 * direct cost per referred build, so it belongs to the same pricing decision
 * as the tier ladder.
 */
export const REFERRAL = {
  /** Credit granted to the referrer and to the new customer alike. */
  creditPerSide: fromMajorUnits(75),
  /** Credits expire if unused; stated so the offer is not open-ended. */
  expiryMonths: 12,
} as const;
