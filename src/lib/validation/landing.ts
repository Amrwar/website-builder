import type { LandingContent } from "@/components/validation/landing-page";
import type { PriceModel } from "@/config/validation";
import { formatMoney, money, type Currency } from "@/lib/pricing/money";

/**
 * Turns a test's content into what its landing page shows.
 *
 * Shared by the wizard (major units as typed) and the public page (minor
 * units as stored), so the price is formatted one way in both.
 */
export function landingContent(
  source: {
    businessName: string;
    oneLiner: string;
    headline: string;
    details: string;
    benefits: readonly string[];
    targetCustomer: string;
    availability: "now" | "soon";
    captureMode: LandingContent["captureMode"];
  },
  price: { model: PriceModel; minorUnits: number | null; currency: Currency },
  intlTag: string,
): LandingContent {
  return {
    businessName: source.businessName,
    oneLiner: source.oneLiner,
    headline: source.headline,
    details: source.details,
    benefits: source.benefits,
    targetCustomer: source.targetCustomer,
    availability: source.availability,
    captureMode: source.captureMode,
    priceModel: price.model,
    priceLabel:
      price.model === "none" || price.minorUnits === null
        ? null
        : formatMoney(money(price.minorUnits, price.currency), intlTag, {
            trimWholeDecimals: true,
          }),
  };
}
