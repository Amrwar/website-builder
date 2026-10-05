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

## Next

### Phase 6 — Checkout and payments

Stripe. Order creation from a configured draft, payment, invoice, and the
transition to `awaiting_assets`. Webhook-driven status changes. Refund
primitives for the two guarantee outcomes.

**Gate:** a test payment moves a project to `awaiting_assets` and does **not**
start the countdown.

### Phase 7 — Asset submission and the guarantee clock

Upload to the private Vercel Blob store. The submission gate that sets
`assets_submitted_at`, then `build_started_at` and the stored `deadline_at`.
Countdown UI.

**Gate:** the clock starts on entry to `in_build` and never earlier; the stored
deadline survives a later change to tier rules.

### Phase 8 — Build Room

The signed-in project view: timeline, countdown, live preview, files, messages,
change requests, approvals. The core of the product after purchase and the
largest remaining body of work.

### Phase 9 — Admin dashboard

Project queue sorted by deadline risk, deadline-risk detection, scope override
as an append-only assessment, customer management, payment and refund
management, role assignment.

### Phase 10 — Post-launch commerce

Maintenance subscriptions, build credits, referral and partner programmes.
Requires the provisional figures to be signed off first.

### Phase 11 — Public proof

Build wall and portfolio reading real projects; reviews collected from
delivered builds. Only once there are real builds — the empty states stay until
then.

### Phase 12 — Operations

CI, monitoring and alerting, analytics, deployment tracking, content
management, performance budgets.

## Cross-cutting backlog

Not phases; they should be absorbed into whichever phase touches them first.

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
| Maintenance plan prices                                                                  | Phase 10                                   |
| Referral credit amount                                                                   | Phase 10                                   |
| Company name and domain                                                                  | Launch                                     |
| Clerk application name (currently the Vercel resource name, visible on the sign-in card) | Launch — one dashboard edit                |
