import { fromMajorUnits } from "@/lib/pricing/money";

/**
 * Design service.
 *
 * "Design it for me" is a real, separately-priced piece of work: choosing
 * typography, colour and layout for a business that has none of them yet.
 * Charging for it is what keeps the base price honest -- bundling it would
 * mean customers who arrive with a finished brand subsidise those who do not.
 *
 * The other two routes are free because they consume no design time: we are
 * implementing a direction that already exists.
 */
export const DESIGN_SERVICE = {
  /** Added to the build price when "design it for me" is chosen. */
  fee: fromMajorUnits(50),
} as const;
