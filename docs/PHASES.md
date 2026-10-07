# Implementation phases

One phase at a time, in order, never ahead of approval. A phase ends with the
gate in `docs/TESTING.md` and a browser check of its pages.

## Done

### Phase 0 — Architecture and planning

Stack selection, risk analysis, domain model, and these documents.

> Written retroactively. The architecture was proposed and approved in
> conversation and the build proceeded through Phase 5, but the documents
> themselves were never created until now. They describe the system as built.

### Phase 1 — Technical foundation

Next.js 16 + React 19 + TypeScript. Tailwind v4 token layers. next-intl with
en/fr/ar and RTL. Drizzle + Neon. Logger, API envelope, route-handler wrapper,
validated environment. Vitest. Security headers. Marketplace integrations
provisioned: Neon, Clerk, Stripe (sandbox), Sentry, Vercel Blob.

### Phase 2 — Design system

30 UI primitives with full state coverage, variants via CVA, Radix for
behaviour only. `/design-system` gallery as the review surface.

### Phase 3 — Marketing website

17 sections. Hero with the five-stage production line. Products, comparison,
journey, guarantee, scope, build wall, design-for-me, configurator entry,
portfolio, testimonials, maintenance, referral, FAQ, closing CTA, header,
footer. Portfolio, testimonials and build wall ship as honest empty states.

### Phase 4 — Build configurator

Eight steps, persisted drafts, the rule-based scope engine, complexity meter,
impossible scopes blocked client- and server-side. Submit deliberately inactive
pending checkout.

### Phase 5 — Authentication and accounts

Clerk integration. Six roles, ten permissions, server-side enforcement. Account
management across profile, business and preferences. Clerk webhook with
signature verification. Unauthorized access tested, live and in unit tests.

### Phase 6 — Commerce + Checkout

Product catalogue, orders with immutable pricing snapshots, order items,
payment attempts, provider-agnostic payment abstraction with a Stripe adapter,
invoices with gapless numbering, and a checkout that states the full scope
including what is **not** included. Payment creates a project in
`awaiting_assets` and does not start the guarantee clock. EGP added; local
prices come from a reviewed table, never a live rate. Replay protection and
signature verification tested against a running server.

## Roadmap

Phases 7–32 as set by the product owner. Titles are authoritative; the notes
under each are what the title maps onto in the system as it stands today.

### Phase 7 — Customer Workspace / Build Room ✅

Delivered. The workspace is driven by `config/workspace.ts`, keyed on
`projects.product_type`, so a website, an automation and a business product use
the same room with different stages, panels and approvals. Nine panels:
overview, timeline, preview, files, messages, changes, approvals, payments,
launch. Seven new tables. Uploads go browser-to-blob with a scoped token.
**The guarantee clock starts at `startBuild` and nowhere else**, in working
days, stored not derived.

#### Original plan

The signed-in project view: timeline, countdown, live preview, files, messages,
change requests, approvals. Includes asset submission — the gate that sets
`assets_submitted_at`, then `build_started_at` and the stored `deadline_at`.
The core of the product after purchase.

**Gate:** the clock starts on entry to `in_build` and never earlier; the stored
deadline survives a later change to tier rules.

### Phase 8 — Project Production Engine ✅

Delivered. Workflows are configuration (`config/production.ts`) keyed on
product type, with stages, weighted durations, task templates, dependencies and
milestones. Four new tables plus a risk cache on `projects`. The deadline and
risk engines are pure, deterministic and explainable -- a red project always
carries the reason that made it red. A typed event bus (`lib/events/catalogue`,
`server/events/bus`) is the contract future automation reads against.
**Guarantee timestamps are immutable at the database level**, enforced by a
Postgres trigger, not only by a permission check.

#### Original plan

The internal pipeline that moves a project through `project_status`, records
every transition in `project_events`, and makes build execution trackable
rather than tacit.

### Phase 9 — Admin Production Factory ✅

Delivered. Nine roles with a rank ladder, eighteen permissions, 25 declared
console sections with server-side guards, an append-only audit log, refunds
with segregated duties, and the production queue. See `docs/ADMIN_FLOWS.md`.

#### Original plan

Project queue sorted by deadline risk, deadline-risk detection,
scope override as an append-only assessment, customer management, payment and
refund management, role assignment.

### Phase 10 — Scope + Pricing Engine ✅

Delivered. `lib/engine` is now the single authoritative answer to what a
project is, how long it takes and what it costs, and `server/engine` is the
only thing that loads the catalogue. The configurator and the order service
previously assembled scope and price independently; they now share one call.

The commercial rules moved into four audited tables, editable by the owner
alone, with the shipped `config/` constants kept as both seed and fallback.
Invariants are enforced twice — in Zod and in database CHECK constraints —
and verified against real Postgres. Coupons, localized prices, feature
surcharges and immutable pricing snapshots all ship. See
`docs/PRICING_AND_SCOPE.md`.

An LLM assessor still connects through the unchanged `ScopeAssessor` seam; the
engine now records both the assessor and the engine version on every
assessment, so a future swap stays interpretable.

#### Original plan

Formalize and extend the rule-based engine (26 capabilities, points plus tier
floors, actor-group detection across three languages).

### Phase 11 — Launch + Hosting + Maintenance ✅

Delivered. The lifecycle now runs past delivery: BUILD → PREVIEW → APPROVE →
DEPLOY → LAUNCH → MAINTAIN → EXPAND.

The Launch Centre replaced four hard-coded steps with a configurable
checklist, and readiness is computed from recorded facts rather than asserted.
A deployment counts only once the hosting provider has confirmed it — enforced
in the service, in the schema and by a database CHECK. Domains track
verification, DNS and SSL separately because they fail differently and are
fixed differently.

Maintenance plans are editable and audited like build prices. Cancelling never
cuts a paid period short. Build credit is a platform-level resource held by a
person, denominated in minutes, on an append-only ledger a trigger refuses to
rewrite. "Build more" raises a change request on the existing project rather
than forking a new one, so brief, files, messages and history survive.

Hosting and domains moved from `planned` to live in the console. See
`docs/USER_FLOWS.md` and `docs/ADMIN_FLOWS.md`.

#### Not done

The renewal sweep is written, tested and callable, but nothing schedules it —
the same honest gap as the risk sweep. Taking payment for a renewal is the
provider's job and arrives by webhook; that wiring is not built.

### Phase 12 — Growth engine ✅

Delivered. Referrals, partners, affiliates, reviews and the public build wall,
with the anti-abuse rules that make any of them safe to pay out on.

**One attribution path.** A customer sharing a link, an agency sending a client
and an affiliate running ads are the same event: somebody arrived carrying a
code. They share one `referral_codes` table and one `referrals` ledger, and
differ only in what the owner earns — build credit for a customer, commission
for a partner or an affiliate.

**Conversion is build start**, not signup and not payment. The money is in, the
customer has committed their assets and work has begun, so an order placed to
claim a reward and then cancelled never pays anybody.

**Nothing here can manufacture proof.** A review exists only against a
delivered project and only from the person who paid for it, one per project. A
build-wall entry exists only with recorded customer consent, and names a
customer only where they separately agreed. Both are schema constraints, not
service conventions.

Rewards go through the Phase 11 credit ledger rather than a parallel balance.
30 anti-abuse invariants verified against real Postgres. See
`docs/SECURITY.md` and `docs/USER_FLOWS.md`.

#### Not done

Payouts are modelled — account, commission, state, batch — but no money
movement is wired: no provider has been chosen, and `payoutReference` is a
handle for whatever that turns out to be. Commissions can be approved and
reversed; marking one paid is a manual act.

`GROWTH_FINGERPRINT_SECRET` is unset, so the duplicate-account and
shared-network signals do not fire. Every other rule applies, and the log says
so on first use.

### Phase 13 — Internationalization ✅

Delivered, and larger than the one-line scope it was written against.

en/fr/ar with RTL, a typed catalogue and a parity test shipped from Phase 1.
This phase was everything that turned out to be missing behind that:

- **Time zones.** Twenty-eight call sites built `Intl.DateTimeFormat` with no
  `timeZone`, which means the server's — UTC in production. `users.timezone`
  existed and nothing read it, so a guaranteed delivery date read a day out for
  anyone east of Toronto.
- **Invoices in their own language**, from `invoices.locale`, with the order's
  currency and a frozen issue date. `resolveLocale("fr-CA")` returned `en`, so
  every French invoice would have rendered in English.
- **Notifications and email**, composed in the recipient's language rather than
  the language of whoever caused the event. Email behind a transport seam.
- **RTL in practice.** Radix writes `dir="ltr"` onto its own wrapper and does
  not read the document, so whole tab panels laid out backwards inside Arabic.
  Currency rendered as "$CA 199" until the formatter switched to the ISO code
  for RTL locales.

### Phase 14 — Platform Core / Extensibility Layer ✅

Architectural. No customer-facing functionality added.

The audit found less to fix than expected: product properties were already
declared as data, workflows were already configuration keyed by product type,
and `Record<BuildType, …>` already makes the compiler list what a new product
must answer. What it did find:

- **Events could only be about a project.** The envelope required a project id,
  so three emits in the subscription service were wrapped in `if (projectId)` —
  a plan bought against the account recorded nothing at all, silently. Events
  now name a subject.
- **Two catalogued events were written straight to the table**, bypassing the
  bus, so nothing could ever subscribe to them. One of them was `order.fulfilled`,
  the platform's flagship commerce fact.
- **Three branches on a product id** where the product already declared the
  property as data, including `deliveryFor` comparing against a literal 5 or 14.
  The delivery plan union itself encoded durations (`five_day`, `fourteen_day`),
  so every new product with a different promise needed another member.

Added: `config/modules.ts` (reusable modules, defined as the capabilities they
provide so the scope engine stays the only thing that prices anything),
`config/integrations.ts` plus `server/platform/integrations.ts` (what the
platform depends on, and whether it is actually configured), and `record()` for
emitting inside a transaction.

**Deliberately not built.** Organization is not an entity: ownership is
per-user, introducing an account boundary means re-pointing every ownership
check, and the roadmap puts it at Phase 27. Automation is not built either —
the bus is its foundation and nothing more is needed until there is something
to automate. Both are named here so the absence is a decision rather than an
oversight.

### Phase 15 — Production Hardening + Security — done

A full audit of security, data, performance, accessibility, layout and the two
end-to-end flows. Of the four gaps listed for it, two closed: rate limiting on
our own endpoints (assessment, applications, reviews, referral claims) and
audit-log integrity (the four ledgers are append-only at the database, by
trigger, not by convention). Nonce-based CSP and CI dependency scanning remain
open: the first would make every marketing page dynamic, the second needs a CI
that does not exist yet.

What the audit found that no earlier gate had:

- **Refunds could never execute.** The webhook never stored the payment intent
  id, so a refund had nothing to refund against, guarantee refunds included.
- **No notification was ever recorded.** A partial unique index cannot satisfy
  `ON CONFLICT (dedupe_key)`, so every insert threw and was swallowed.
- **A current-step label was invisible** (1.0:1 contrast) on the configurator's
  dark entry panel, and four other text colours were below AA.
- **The Arabic header overflowed a tablet**, and two private sections
  (invoices, notifications) were missing from the proxy's coarse gate.
- **32 foreign keys had no index.**

The first two were found by `server/lifecycle.integration.test.ts`, which
walks an order from draft to refund against real Postgres (PGlite, real
migrations, the real webhook route) with only the outside providers faked. It
fails with the fulfilment fix reverted. The Playwright suite (`npm run
test:e2e`) covers the public journey, four viewports, both directions and the
signed-out access boundary against a production build.

### Phase 16 — Business-in-a-Box — done

"I am starting a business" → a recommendation → the ordinary configurator.
Start my business (`/start`) asks for the kind of business, its name,
location, customers, what it sells and its goals, then shows every feature at
one of three levels — recommended, optional, not needed — for the customer to
switch on or off, with a live estimate from the configurator's own server
action. Continuing writes a normal configurator draft and opens the
configurator at the design question. From there it is the existing flow:
scope, review, checkout, project. Nothing about pricing, ordering or
production was reimplemented.

How it is built:

- **Blueprints are data.** `config/business.ts` ships 13 blueprints (version
  0), 10 categories, 33 features and 7 goals; no blueprint is named in UI
  code. A feature is defined as the capabilities it needs plus the screens it
  adds, so the scope engine prices it — there is no blueprint price list to
  drift. Dedupe means two features needing a product catalogue charge once.
- **Goals are a stated rule.** A goal moves a feature one level (optional →
  recommended, not needed → optional), and the screen says which goal did it.
  Rule-based, and the page says so.
- **Versions.** Admin edits write a new row in `business_blueprint_versions`,
  which is append-only by trigger (migration 0016); publishing points the
  blueprint at a version, and publishing an older one is the rollback. An
  empty table means the shipped definitions are live.
- **Provenance, not price.** The draft carries `blueprint: { key, version,
features, goals }`. Order creation re-checks it against published versions
  and drops a claim nobody was offered. It never affects the price.
- **Admin** (`/admin/blueprints`): blueprints, recommendation levels, product,
  wording in all three languages, categories (add, hide, reorder), version
  history with publish/rollback, archive, and the engine's estimate for each
  blueprint's recommended set. Reading needs console access; writing needs
  `settings:manage`. Pricing stays in Pricing, on purpose.

Found while building it: under the current tier thresholds the restaurant
blueprint's full recommended set (the brief's own example) prices as a custom
quote. That is rule 1 working, not a bug; moving items to optional or tuning
thresholds in Pricing changes it.

Not built: features are code, not admin data — a feature's capability mapping
is what keeps its price honest, and one editable to `[]` would price as free.
Mobile-app blueprints are possible (product is selectable) but none ship.

### Phases 17–30 — Platform expansion

These titles arrived without specifications. The one-line readings below are
the obvious reading of each title and are **not** commitments — each needs
defining before it is implemented, in the way Phases 1–5 were.

| Phase | Title                         | Reads as                                                       |
| ----- | ----------------------------- | -------------------------------------------------------------- |
| 17    | Business Idea Validator       | Assessing an idea before it is configured and ordered          |
| 18    | Spreadsheet → Software        | Turning a customer's existing spreadsheet into an application  |
| 19    | Process Rescue                | Replacing a broken or manual business process                  |
| 20    | Software Renovation           | Rebuilding or extending software a customer already owns       |
| 21    | Automation Engine             | Automating work across a customer's systems                    |
| 22    | Business Brain                | Scope to be defined                                            |
| 23    | Business Health               | Scope to be defined                                            |
| 24    | Digital Employees             | Scope to be defined                                            |
| 25    | Business Marketplace          | Scope to be defined                                            |
| 26    | Template / Module Marketplace | Reusable modules customers or partners can buy                 |
| 27    | Partner / Developer Ecosystem | Third parties building on the platform                         |
| 28    | Globalization + Localization  | Beyond Phase 13: markets, currencies, tax, regional operations |
| 29    | Advanced Intelligence         | Scope to be defined                                            |
| 30    | Final Platform Transformation | Scope to be defined                                            |

### Phase 31 — Full Production Audit

End-to-end review before launch: security, performance, accessibility, data,
commercial terms.

### Phase 32 — Launch

Go live.

## What the previous roadmap's items became

The earlier seven-phase plan is superseded. Nothing in it was dropped silently;
this is where each item now sits.

| Previous item                                     | Now                              |
| ------------------------------------------------- | -------------------------------- |
| Checkout and payments                             | Phase 6                          |
| Asset submission + guarantee clock                | Phase 7                          |
| Build Room                                        | Phase 7                          |
| Admin dashboard                                   | Phase 9                          |
| Post-launch commerce                              | Phases 11 and 12                 |
| Operations (CI, monitoring, analytics)            | Phase 15 and the backlog below   |
| **Public proof** (build wall, portfolio, reviews) | **Not named in the new roadmap** |

### One gap to close

The new roadmap has no phase for **public proof**. Three marketing sections —
the build wall, the portfolio and testimonials — currently render empty states
on the live home page and stay empty until something populates them from real
delivered projects. They need a home, most plausibly inside Phase 11 or 12, or
a phase of their own.

## Cross-cutting backlog

Not phases; they should be absorbed into whichever phase touches them first.
CI is the one that should not wait for Phase 15 — nothing currently stops a
broken commit.

| Item                                | Where it is written up                  |
| ----------------------------------- | --------------------------------------- |
| CI pipeline                         | `docs/TESTING.md` — gap 1               |
| Component tests                     | `docs/TESTING.md` — gap 2               |
| `lib/api` tests                     | `docs/TESTING.md` — gap 3               |
| Automated accessibility checks      | `docs/TESTING.md` — gap 4               |
| End-to-end tests                    | `docs/TESTING.md` — gap 5               |
| Nonce-based CSP                     | `docs/SECURITY.md`                      |
| Rate limiting                       | `docs/SECURITY.md`                      |
| Clerk widget localisation for fr/ar | Open decision — payload cost vs. polish |

## Blocked on a decision

| Decision                                                                                 | Blocks                                     |
| ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| `extended` / `advanced` tier prices and days                                             | Showing the configurator to real customers |
| Maintenance plan prices                                                                  | Phase 11                                   |
| Referral credit amount                                                                   | Phase 12                                   |
| Company name and domain                                                                  | Phase 32                                   |
| Clerk application name (currently the Vercel resource name, visible on the sign-in card) | Phase 32 — one dashboard edit              |
