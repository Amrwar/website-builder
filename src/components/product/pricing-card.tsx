import type { ReactNode } from "react";

import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatMoney, type Money } from "@/lib/pricing/money";

/**
 * Pricing card.
 *
 * Presentational: it is handed a resolved price and says nothing about how it
 * was reached. The commercial rules live in the scope engine, and keeping them
 * out of the component is what stops the marketing page and the configurator
 * disagreeing about what something costs.
 *
 * `priceModel` is the honest part. A floor price is rendered with its "from"
 * qualifier, so a starting figure can never be presented as a fixed one.
 */

export interface PricingCardProps {
  name: ReactNode;
  summary?: ReactNode;
  /** Null when the scope requires a quotation instead of a published price. */
  price: Money | null;
  /** BCP 47 tag for formatting, e.g. "en-CA". */
  intlTag: string;
  priceModel: "fixed" | "from";
  /** Shown when `price` is null, e.g. "Custom quote". */
  quotePlaceholder?: ReactNode;
  fromLabel: ReactNode;
  /** Delivery badge, e.g. "5 days to deliver". */
  deliveryLabel?: ReactNode;
  /** Marks third-party review time as outside the guarantee. */
  deliveryWarning?: boolean;
  features?: ReactNode[];
  action: ReactNode;
  /** Visually promotes one card in a row. Use at most once. */
  featured?: boolean;
  /** Announced for the promoted card, since the styling alone is not conveyed. */
  featuredLabel?: string;
  className?: string;
}

export function PricingCard({
  name,
  summary,
  price,
  intlTag,
  priceModel,
  quotePlaceholder,
  fromLabel,
  deliveryLabel,
  deliveryWarning = false,
  features,
  action,
  featured = false,
  featuredLabel,
  className,
}: PricingCardProps) {
  return (
    <Card
      padding="lg"
      className={cn(
        "flex flex-1 flex-col gap-6",
        "duration-base transition-colors ease-out-quint hover:border-line-strong",
        // Emphasis by border weight, not by a coloured fill or a gradient.
        featured && "border-action ring-1 ring-action",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-display-sm text-primary">
          {name}
          {featured && featuredLabel ? (
            <span className="sr-only"> — {featuredLabel}</span>
          ) : null}
        </h3>
        {deliveryLabel ? (
          <Badge tone={deliveryWarning ? "warning" : "neutral"}>{deliveryLabel}</Badge>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        {priceModel === "from" && price ? (
          <span className="text-caption tracking-wide text-tertiary uppercase">
            {fromLabel}
          </span>
        ) : null}
        <p className="flex items-baseline gap-2">
          {price ? (
            <>
              <span className="text-display-lg text-primary" data-numeric>
                {formatMoney(price, intlTag, { trimWholeDecimals: true })}
              </span>
              <span className="text-body-sm text-tertiary">{price.currency}</span>
            </>
          ) : (
            <span className="text-display-md text-primary">{quotePlaceholder}</span>
          )}
        </p>
      </div>

      {summary ? <p className="text-body-sm text-secondary">{summary}</p> : null}

      {features?.length ? (
        <ul className="flex flex-1 flex-col gap-2.5">
          {features.map((feature, index) => (
            <li
              key={index}
              className="flex items-start gap-2.5 text-body-sm text-secondary"
            >
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              {feature}
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex-1" />
      )}

      {action}
    </Card>
  );
}
