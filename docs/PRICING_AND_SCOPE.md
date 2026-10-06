# Pricing and scope model

This document exists to satisfy one rule:

> Do not build a system where customers can claim that literally every possible
> enterprise application costs 400 CAD.

## Money

Integer minor units only. `money()` throws on a non-integer, so a float can
never enter the system. `percentOf` computes the 30% and 100% refunds.
`formatMoney(value, intlTag, { trimWholeDecimals })` renders per locale.

Base currency is CAD. USD, EUR, GBP, AED, SAR and EGP are supported, with a
reviewed rate and a rounding step per currency. Rates are **configured, never
fetched**: a published price must not move because a market did.

## The engine

`src/lib/engine` is the single authoritative answer to "what is this project,
how long will it take, and what does it cost". One function, `evaluateProject`,
returns a `ProjectAssessment`, and every surface reads it — the configurator,
checkout, the Build Room, the admin console and whatever product types arrive
later.

It is **pure**: the catalogue and the clock are arguments, so the same brief,
catalogue and instant always produce the same figure. That is what makes a
stored snapshot defensible months later.

`src/server/engine` is the only thing that loads the catalogue, and
`assessAndPrice` is the only entry point callers use. Before Phase 10 the
configurator and the order service each assembled scope and price separately,
which was two implementations of one number.

### The server decides the price

There is no parameter anywhere on this path through which a caller can propose
an amount. Not on `assessAndPrice`, not on `evaluateProject`, not on
`buildQuote`. A tampered payload can at most describe a _different project_,
which is then priced correctly for what it describes. Tests assert the absence
of such a field, not just the behaviour.

A coupon is the one exception to "the client sends no number", and it is a
_code_, not a value: the reduction is computed from the rule stored in the
database.

## The catalogue

The commercial rules live in four tables — `catalog_features`,
`catalog_tiers`, `catalog_currencies`, `discounts` — and the shipped
`config/` constants remain both the seed and the fallback. **An empty table
means "use what shipped"**, so the platform prices correctly before anyone has
opened the admin screens, and a half-populated table cannot produce a catalogue
with holes in it.

Phase 9 argued these screens should be read-only, because version-controlled
configuration is reviewable and revertable. Phase 10 requires them editable, so
those properties are preserved another way:

- **Reviewable** — every change writes an `audit_events` row with the changed
  fields, their previous values, the actor and an optional reason.
- **Revertable** — that entry carries enough to put the value back.
- **Historically inert** — orders freeze a complete pricing snapshot, so
  editing a row here can never alter what anybody was charged.

Only the **owner** (`settings:manage`) may write. `finance:read` can see the
price list without being able to move it: an administrator who can release a
refund still cannot quietly change a price.

Every figure is validated twice — in a Zod schema that returns a message an
administrator can act on, and in a database CHECK constraint that holds
whatever path the write arrived by. A tier must have a price _and_ a duration
or neither; a percentage discount cannot exceed 100; a currency rate must parse
and be positive. Verified against real Postgres.

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

Thresholds are catalogue data, so moving one is a commercial decision rather
than a deployment.

A **withdrawn tier resolves upward, never down.** Filtering inactive rows out
before walking the ladder looks equivalent and is not: it would make a
twelve-point brief whose band has been withdrawn fall through to the entry
price, selling moderate work for the cost of a simple site. If every tier at or
above the band is withdrawn, the brief is quoted.

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

## Delivery plans

Four, derived from the guaranteed duration and the build type rather than
stored, so a tier whose days are edited moves between plans automatically
instead of keeping a label that no longer matches its promise.

| Plan           | When                                  | Guarantee |
| -------------- | ------------------------------------- | --------- |
| `five_day`     | Website or system within 5 days       | Yes       |
| `fourteen_day` | Mobile app within 14 days             | Yes       |
| `extended`     | A longer build with a published price | Yes       |
| `quote`        | No published price                    | **No**    |

A guarantee on an unscoped amount of work is a promise nobody can keep, so
`quote` carries none.

## Discounts

Every constraint that limits a coupon — validity window, usage cap, minimum
order, which build types it applies to, a cap on the reduction — lives in the
`discounts` table and is checked server-side against the stored rule. The
reduction is clamped to the order value: a coupon that exceeds the total is a
refund, which is not what a coupon is.

Only the one code the customer named is ever loaded. A list of valid codes
returned to a browser is a list of valid codes, whatever the UI does with it.
`times_used` is incremented when the order is actually created, not when the
code is validated, so a browser cannot exhaust a campaign by typing a code
repeatedly.

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
