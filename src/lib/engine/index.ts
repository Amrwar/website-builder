/**
 * The scope and pricing engine.
 *
 * The single authoritative answer to "what is this project, how long will it
 * take, and what does it cost". Callers depend on `evaluateProject` and these
 * types, never on the pieces behind them, so swapping the scope assessor or
 * moving the catalogue into the database is a change here rather than at every
 * call site.
 *
 * Pure by construction: the catalogue and the clock are arguments. The server
 * wrapper that loads the catalogue lives in `server/engine`.
 */

export type {
  AppliedDiscount,
  Delivery,
  DeliveryPlan,
  EngineInputs,
  PriceBreakdown,
  PriceLine,
  ProjectAssessment,
  ScopeBand,
  ScopeExplanation,
} from "./types";
export { BAND_BY_TIER, DELIVERY_PLANS, SCOPE_BANDS } from "./types";

export type {
  Catalog,
  CurrencyRule,
  DiscountRule,
  FeatureRule,
  TierRule,
} from "./catalog";
export {
  currencyRule,
  defaultCatalog,
  featureRule,
  tierForPoints,
  tierRule,
} from "./catalog";

export type { DiscountOutcome, DiscountRefusal } from "./discounts";
export { applyDiscount, normaliseCode } from "./discounts";

export {
  buildPrice,
  complexityBand,
  designFee,
  guaranteedDays,
  totalPrice,
} from "./select";

export type { SnapshotFacts } from "./snapshot";
export { readSnapshot } from "./snapshot";

export type { EvaluateInput } from "./evaluate";
export {
  ENGINE_ID,
  ENGINE_VERSION,
  deliveryFor,
  evaluateProject,
  explain,
} from "./evaluate";
