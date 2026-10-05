# Pricing and scope model

This document exists to satisfy one rule:

> Do not build a system where customers can claim that literally every possible
> enterprise application costs 400 CAD.

## Money

Integer minor units only. `money()` throws on a non-integer, so a float can
never enter the system. `percentOf` computes the 30% and 100% refunds.
`formatMoney(value, intlTag, { trimWholeDecimals })` renders per locale.

Base currency is CAD. USD, EUR, GBP, AED and SAR are supported for display with
local rounding.

## The ladder

Every brief resolves to exactly one tier.

| Tier        | Meaning                                                        |
| ----------- | -------------------------------------------------------------- |
| `essential` | The published offer. A 5-Day Build.                            |
| `extended`  | Materially more work; more days, higher price.                 |
| `advanced`  | Substantially more; a different kind of project.               |
| `custom`    | **Terminal.** No published price. Routed to a human quotation. |

`custom` has no price because the work cannot be honestly fixed-priced. The
customer is routed to a quote rather than being quietly underquoted — which is
the failure mode this whole model exists to prevent.

### Published offers

| Build      | essential | extended   | advanced   | custom |
| ---------- | --------- | ---------- | ---------- | ------ |
| Website    | 400 / 5d  | 900 / 10d  | 1800 / 15d | quote  |
| System     | 400 / 5d  | 1200 / 12d | 2400 / 20d | quote  |
| Mobile app | 600 / 14d | 1500 / 21d | 3000 / 30d | quote  |

> **COMMERCIAL NOTE.** Only the `essential` column comes from the stated offer.
> `extended` and `advanced` are provisional placeholders chosen to be internally
> consistent and **need sign-off before the configurator is shown to
> customers**. They are isolated in `src/lib/scope/tiers.ts` so approving them
> is a single edit.

## How a tier is chosen

Two independent levers, both required.

### 1. Points accumulate

Each of the 26 capabilities carries a `points` value for relative effort. The
total selects a tier by threshold:

| Tier      | Lower bound |
| --------- | ----------- |
| essential | 0           |
| extended  | 10          |
| advanced  | 25          |
| custom    | 45          |

### 2. Capabilities carry a floor

Each capability also has a `minimumTier` it cannot be delivered below. The
resolved tier is raised to the highest floor among the selected capabilities.

**Both are needed.** Points alone would let a brief with one genuinely hard
feature and little else qualify for the entry tier. A floor alone would miss
briefs that are heavy through sheer accumulation of ordinary work.

### 3. Distinct actor groups

`MULTI_ROLE_THRESHOLD = 3`. Three or more distinct user groups in one brief is
the single most reliable signal that it has outgrown a 5-day build — every
additional role multiplies screens, rules and test surface.

Customer + admin is **two**, and must stay affordable. That is the ordinary
shape of a small business site and it has to remain a 400 CAD build.

## The capability catalogue

26 capabilities in 7 categories (`src/lib/scope/capabilities.ts`).

| Category    | Capabilities                                                                             |
| ----------- | ---------------------------------------------------------------------------------------- |
| Content     | cms_editing, blog, multilingual, contact_forms                                           |
| Identity    | user_accounts, multi_role_access, organisation_accounts                                  |
| Commerce    | hosted_checkout, product_catalog, subscriptions, booking_scheduling, marketplace_payouts |
| Realtime    | push_notifications, live_updates, chat_messaging, realtime_location_tracking             |
| Operations  | admin_dashboard, order_management, inventory, reporting, dispatch_logistics              |
| Integration | third_party_integration, data_migration, public_api                                      |
| Platform    | native_device_features, offline_sync                                                     |

Some capabilities `imply` others — `organisation_accounts` implies
`multi_role_access` — so a brief cannot select the harder thing while dodging
its prerequisite.

## Detection from free text

The customer writes their idea in English, French or Arabic. The engine
normalizes and matches:

1. **Normalize** — NFKD, strip Arabic diacritics, unify alef forms, fold the
   conjunction _و_ and the plural _ون → ين_.
2. **Match** the normalized text against **normalized patterns**. Applying the
   same normalization to both sides is what makes this work: any mangling is
   symmetric and therefore harmless.
3. **Score**: accumulate points, apply floors, count actor groups.

### Two lessons encoded as rules

**Action phrases only.** A bare noun like `"courier"` once triggered
`dispatch_logistics` — mentioning a courier is not building a dispatch system.
Patterns describe what the software _does_.

**Intent, not vocabulary.** "A contact form so patients can request an
appointment" priced a brochure site at 950 instead of 450. Booking now requires
phrasing that indicates a booking system, not the word "appointment". There is a
regression test.

**Arabic needs affix folding.** The lexicon had `الموظفين` while a real brief
said `ويدير الموظفون`. Without folding, Arabic was massively under-detected.

## The worked example

> "I want a restaurant system where customers order food, pay online, restaurant
> staff manage orders, drivers manage deliveries, and customers track drivers."

Detected: `product_catalog`, `hosted_checkout`, `order_management`,
`dispatch_logistics`, `realtime_location_tracking`, `multi_role_access`.

Actor groups: customers, staff, drivers → **3**, over the threshold.

Result: well past the `essential` tier. The customer is shown _why_ — the
capabilities and the actor count, named explicitly — and offered the
appropriate larger build rather than a refusal.

This is the behaviour the rule exists for, and it is covered by tests.

## Guarantee arithmetic

`guaranteedDays` comes from the resolved tier, not the build type alone. The
countdown starts at `build_started_at`, which is set on the transition into
`in_build` — after payment **and** after assets. `deadline_at` is computed once,
then stored.

For mobile apps, store review sits outside the guarantee
(`hasExternalReviewStep: true`) and the UI must say so wherever mobile delivery
is stated.

Missed deadline: 100% refund and cancel, or continue with 30% refund. The
customer chooses. Both percentages are in `src/config/brand.ts`.

## Extending this

Adding a capability means: an entry in `capabilities.ts` with both `points` and
`minimumTier`, phrases in `patterns.ts` for all three locales, a label in all
three catalogues, and a test. Bumping `RULESET_VERSION` in `rule-assessor.ts` is
required whenever scoring changes, because stored assessments reference it.

Swapping in a real model means implementing `ScopeAssessor` and pointing
`activeAssessor` at it. Nothing else changes; assessments record `source: "llm"`
and historical rule-engine results stay interpretable.
