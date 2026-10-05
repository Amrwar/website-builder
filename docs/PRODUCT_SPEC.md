# Product specification

## What the company sells

Professionally built websites, business systems and mobile applications,
ordered through a configurator at a published price with a delivery guarantee —
not quoted through a proposal process.

The product should feel like a marketplace where you order a digital product,
not like a development agency that sells a relationship.

## The offer

| Build           | Price        | Model                   | Guaranteed days |
| --------------- | ------------ | ----------------------- | --------------- |
| Website         | 400 CAD      | fixed                   | 5               |
| Business system | from 400 CAD | floor, rises with scope | 5 at entry tier |
| Mobile app      | 600 CAD      | fixed, constrained MVP  | 14              |

Prices are set in CAD and displayed in the viewer's currency, rounded locally.
CAD is the base; USD, EUR, GBP, AED and SAR are supported for display.

`priceModel` is modelled in data (`fixed` vs `from`) so the UI cannot present a
floor as if it were a cap. This is the honest half of the fixed-price promise.

## The guarantee

- The countdown covers **development only**.
- It starts when the project enters `in_build` — after payment _and_ after the
  customer's required information and assets are submitted. Payment alone does
  not start the clock.
- App Store and Google Play review time sits **outside** the guarantee. This is
  disclosed wherever mobile delivery is stated.
- If the guaranteed development deadline is missed, the customer chooses:
  - 100% refund and cancel, or
  - continue the build and receive a 30% refund.

The timestamps that encode this (`paidAt`, `assetsSubmittedAt`, `buildStartedAt`,
`deadlineAt`) are **stored**, not derived, so the commitment that was made on a
given day survives later changes to the rules.

## The customer journey

```
IDEA → CONFIGURE → PRICE → PAY → BUILD → PREVIEW → APPROVE → LAUNCH → MAINTAIN → EXPAND
```

Ten stages, defined once in `src/config/journey.ts` and read by the marketing
page, the Build Room timeline and the project state machine, so the public
explanation and the internal pipeline cannot drift apart.

The marketing hero shows a five-stage summary of this
(IDEA → CONFIGURE → BUILD → PREVIEW → LAUNCH) as a production-line diagram.

## The central business rule

> Do not build a system where customers can claim that literally every possible
> enterprise application costs 400 CAD.

A simple project qualifies for the 5-Day Build. A complex one must
automatically become a larger scope, more days, more price, or a request for a
custom quotation — and the interface must make that feel helpful rather than
restrictive.

The worked example, which the engine is tested against:

> "I want a restaurant system where customers order food, pay online, restaurant
> staff manage orders, drivers manage deliveries, and customers track drivers."

This must be identified as exceeding a 5-Day Build, with the reasons named, and
a suitable larger option offered. See `docs/PRICING_AND_SCOPE.md`.

## No fake intelligence

The scope engine is rule-based. It is never described as AI anywhere in the
interface. It sits behind the `ScopeAssessor` interface
(`src/lib/scope/types.ts`) so a real model can be connected later without
touching callers; assessments record which assessor produced them and at what
version, so historical results stay interpretable after a swap.

## No invented proof

The portfolio, testimonials and public build wall render honest empty states.
There are no customers yet, and a fabricated quote or case study would
undermine the single thing this page sells: that its claims can be checked.

## Feature inventory

The 52 capabilities from the brief, by current state.

**Built (Phases 1–5)**

Marketing website · build configurator · website/system/app selection · scope
builder · feature selection · design preference selection · "design it for me"
option · idea-to-product intake · automatic scope assessment · fixed pricing ·
localized rounded pricing · customer accounts · security · testing ·
notifications preferences · internationalization · English/French/Arabic
architecture · RTL support · accessibility · SEO · performance optimization

**Not yet built**

Asset upload · checkout · customer dashboard · Build Room · project timeline ·
countdown tracking · live preview · files · messages · change requests ·
approvals · payments · invoices · hosting/domain management · maintenance plans
(configured, not purchasable) · build credits · referral system (configured,
not operational) · partner/affiliate system · public portfolio and build wall
(sections exist, empty) · reviews · admin dashboard (shell only) · internal
project queue · deadline-risk detection · project management · customer
management · scope management · payment/refund management · deployment tracking
· analytics · content management · monitoring

## Open commercial decisions

These are isolated in config so approving them is a single edit each.

| Item                                            | Where                       | Status                      |
| ----------------------------------------------- | --------------------------- | --------------------------- |
| `extended` / `advanced` tier prices and days    | `src/lib/scope/tiers.ts`    | Provisional, needs sign-off |
| Maintenance plans (29 / 79 / 199 CAD per month) | `src/config/maintenance.ts` | Provisional, needs sign-off |
| Referral credit (75 CAD, reciprocal)            | `src/config/referral.ts`    | Provisional, needs sign-off |
| Company name (`Buildline`) and domain           | `src/config/brand.ts`       | Working placeholder         |

Only the `essential` row of each build type comes from the stated offer.
