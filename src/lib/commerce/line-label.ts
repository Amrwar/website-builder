import { BUILD_TYPES, type BuildType } from "@/config/products";
import { SCOPE_TIERS, type ScopeTierId } from "@/db/schema/enums";
import { CAPABILITIES, type CapabilityKey } from "@/lib/scope";

/**
 * Where an order line's customer-facing name comes from.
 *
 * The line snapshot stores two different things for two different readers.
 * `productName` is the internal English name: it is what the payment provider
 * prints on a card statement and what staff search on, and it must not change.
 * `translationKey` is the catalogue key the *customer's* label is translated
 * from, so the same line reads "Website build" or "تطوير موقع إلكتروني"
 * depending on the document's own language.
 *
 * Only the key is snapshotted, never the translated string. A translation can
 * be corrected after an invoice is issued without reissuing the document,
 * whereas a frozen string would preserve the typo forever. The figures are the
 * part that must never move, and those are frozen.
 *
 * The result is a narrow union rather than a message path string so that the
 * caller's `t()` keeps its compile-time key checking. Building a path here
 * would let a renamed message silently print its own path onto an invoice.
 */
export type LineLabel =
  | { kind: "build"; buildType: BuildType; tier: ScopeTierId | null }
  | { kind: "design_service" }
  | { kind: "capability"; capability: CapabilityKey };

export interface LineLabelInput {
  /** Stable catalogue key, e.g. "build.website". Null on pre-snapshot rows. */
  translationKey: string | null | undefined;
  /** Only meaningful on a build line. */
  scopeTier?: string | null;
}

const isBuildType = (value: string): value is BuildType =>
  (BUILD_TYPES as readonly string[]).includes(value);

const isTier = (value: string): value is ScopeTierId =>
  (SCOPE_TIERS as readonly string[]).includes(value);

const CAPABILITY_KEYS: ReadonlySet<string> = new Set(
  CAPABILITIES.map((capability) => capability.key),
);

/**
 * Resolves a line key to something translatable, or `null` when there is
 * nothing to translate and the caller should fall back to `productName`.
 *
 * Every component of the key is checked against the union it claims to be
 * from. A key naming a build type or capability that no longer exists returns
 * `null` -- the line then shows its stored English name, which is honest,
 * rather than a raw message path on a financial document.
 */
export function lineLabel(input: LineLabelInput): LineLabel | null {
  const key = input.translationKey;
  if (!key) return null;

  const separator = key.indexOf(".");
  if (separator <= 0) return null;

  const group = key.slice(0, separator);
  const rest = key.slice(separator + 1);
  if (rest.length === 0) return null;

  switch (group) {
    case "build": {
      if (!isBuildType(rest)) return null;
      const tier = input.scopeTier;
      return {
        kind: "build",
        buildType: rest,
        // The tier is part of what was sold: "Website build" at the entry
        // price and at the advanced price are different line items, and an
        // invoice that hides the difference cannot be reconciled.
        tier: tier && isTier(tier) ? tier : null,
      };
    }
    case "service":
      return rest === "design" ? { kind: "design_service" } : null;
    case "feature":
      // Feature lines reuse the configurator's own capability names: the
      // customer picked the capability by that name, so renaming it on the
      // invoice would read as a charge for something else.
      return CAPABILITY_KEYS.has(rest)
        ? { kind: "capability", capability: rest as CapabilityKey }
        : null;
    default:
      return null;
  }
}
