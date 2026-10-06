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

### Phase 10 — Scope + Pricing Engine

A rule-based engine already ships (26 capabilities, points plus tier floors,
actor-group detection across three languages). This phase is where it is
formalized and extended, and where an LLM assessor would connect through the
existing `ScopeAssessor` seam. See `docs/PRICING_AND_SCOPE.md`.

### Phase 11 — Launch + Hosting + Maintenance

Deployment, domain management, and maintenance subscriptions. The plans are
configured with provisional prices and are not purchasable.

### Phase 12 — Growth + Referral + Partner System

Referral credits and the partner/affiliate programme. The credit amount is
configured and provisional.

### Phase 13 — Internationalization

en/fr/ar with RTL, a typed catalogue and a parity test already ship from Phase

1. This phase is the expansion beyond that — additional locales, and the
   decision on Clerk widget localisation currently sitting in the backlog.

### Phase 14 — Platform Core / Extensibility Layer

Scope to be defined.

### Phase 15 — Production Hardening + Security

Where the known security gaps land: nonce-based CSP, rate limiting on our own
endpoints, dependency scanning in CI, audit-log integrity. All four are written
up in `docs/SECURITY.md`.

### Phases 16–30 — Platform expansion

These titles arrived without specifications. The one-line readings below are
the obvious reading of each title and are **not** commitments — each needs
defining before it is implemented, in the way Phases 1–5 were.

| Phase | Title                         | Reads as                                                       |
| ----- | ----------------------------- | -------------------------------------------------------------- |
| 16    | Business-in-a-Box             | A bundled starting package rather than a single build          |
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
