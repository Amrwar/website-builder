# Architecture

## Stack

| Layer      | Choice                                  | Why this one                                                                                               |
| ---------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack)      | Server components keep the marketing site static and the app dynamic in one codebase                       |
| UI         | React 19                                | Required by Next 16                                                                                        |
| Language   | TypeScript, ES2022                      | `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch` all on |
| Styling    | Tailwind CSS v4                         | `@theme inline` maps our own tokens; logical properties give RTL for free                                  |
| Database   | Neon Postgres                           | Serverless Postgres with a pooler, provisioned through the Vercel Marketplace                              |
| ORM        | Drizzle                                 | Schema is TypeScript, so domain unions are reused as Postgres enums instead of retyped                     |
| Auth       | Clerk (Core 3)                          | Registration, reset, verification, breach checks and bot defence are not differentiating work              |
| i18n       | next-intl v4                            | Typed catalogue, `localePrefix: "as-needed"`                                                               |
| Validation | Zod                                     | One schema serves the form, the action and the test                                                        |
| Testing    | Vitest + Testing Library                | Same transform pipeline as the app                                                                         |
| Hosting    | Vercel (Fluid Compute, Node.js runtime) | Not the Edge runtime — it is deprecated                                                                    |

### Next.js 16 specifics that differ from older documentation

- Middleware is `src/proxy.ts`, not `middleware.ts`.
- `next/root-params` supersedes the deprecated `requestLocale`.
- `eslint` is no longer a valid `NextConfig` key; linting is a separate step.
- `LayoutProps<"/[locale]">` and `PageProps` are generated; run `next typegen`
  after changing the route tree.

### Database driver

`node-postgres` with `attachDatabasePool` from `@vercel/functions` — not the
serverless HTTP driver. On Fluid Compute, function instances are reused across
concurrent requests, so a real pool with lifecycle hooks is the correct shape.

`DATABASE_URL` is pooled (PgBouncer) and used at runtime. `DATABASE_URL_UNPOOLED`
bypasses the pooler and is required for migrations, which need session-level
state a transaction pooler cannot provide.

## Layering

```
src/config/     client-safe constants, domain unions, commercial figures
      ↓         (no database imports — importable from a client component)
src/lib/        pure logic: money, scope engine, configurator draft, cn
      ↓         (no session, no I/O)
src/db/         Drizzle schema + client
      ↓
src/server/     session, authorization, mutations  [server-only]
      ↓
src/app/        routes
src/components/ ui/ is the design system; everything else composes it
```

The rule that keeps this honest: `src/config/roles.ts` holds the role union and
permission matrix with no database import, so client code can read it, while
`src/server/auth.ts` is marked `server-only` so an accidental client import is a
build error rather than a leak.

## Route map

```
/[locale]
├── (marketing)                     static, prerendered per locale
│   ├── /                           home: 15 sections
│   ├── /configure                  8-step build configurator
│   ├── /partners                   partner and affiliate applications
│   └── /design-system              component gallery
├── (auth)                          dynamic
│   ├── /sign-in/[[...rest]]        Clerk, optional catch-all for its sub-steps
│   └── /sign-up/[[...rest]]
├── (app)                           dynamic, session required
│   ├── /projects                   build list
│   ├── /projects/[reference]       the Build Room
│   ├── /orders/[number]/...        checkout return and confirmation
│   ├── /invoices/[number]          the invoice, in its own language
│   ├── /billing                    maintenance plan, credit, referrals
│   ├── /notifications              what the platform has told you
│   └── /account                    profile, business, preferences
├── (console)                       dynamic, gated on admin:access
│   └── /admin/...                  the staff console
└── /[...rest]                      404

/api                                not localised
├── /health
├── /account/me                     401 when signed out
├── /projects/[reference]/files/... upload and download
├── /webhooks/clerk                 Svix signature required
└── /webhooks/stripe                Stripe signature required

/r/[code]                           referral links, deliberately unlocalised
```

`localePrefix: "as-needed"` — English URLs carry no prefix, French and Arabic do.
Route matchers therefore have to list both forms.

### Static vs dynamic

The marketing pages are prerendered per locale and must stay that way. Two
things have broken this and must not be reintroduced:

- reading the theme cookie in a layout (it is resolved in a pre-paint script
  instead);
- `<ClerkProvider dynamic>` (the header's auth state is a client component
  instead, so the session resolves in the browser).

## Request path

```
request
  → src/proxy.ts
      ├── /api/*          → next() ; handlers enforce their own auth
      ├── private route   → auth.protect({ unauthenticatedUrl: locale sign-in })
      └── everything else → next-intl locale negotiation and rewrite
  → route
      → server component / route handler / server action
          → src/server/auth.ts   identity + role  (memoised per request)
          → Zod validation
          → Drizzle
```

The proxy is a **coarse gate**, not the authorization boundary. It runs before
the cache and only sees the request, so it can answer "is there a session?" but
not "may this person read this record?". Every real decision is re-made
server-side.

## The scope engine

`src/lib/scope/` is a self-contained service behind one interface:

```
assessScope(input) → activeAssessor.assess(input)
```

| Module             | Responsibility                                                    |
| ------------------ | ----------------------------------------------------------------- |
| `types.ts`         | `ScopeAssessor` — the seam for a future model                     |
| `capabilities.ts`  | 26 capabilities, each with `points` and `minimumTier`             |
| `tiers.ts`         | essential → extended → advanced → custom; prices per build type   |
| `actors.ts`        | distinct user groups in the brief; 3+ is the multi-role signal    |
| `normalize.ts`     | NFKD, Arabic diacritic stripping, alef unification, affix folding |
| `patterns.ts`      | per-locale phrase lists, action phrases only                      |
| `detection.ts`     | matches normalized text against normalized patterns               |
| `rule-assessor.ts` | the current implementation; carries `RULESET_VERSION`             |

Normalization is applied identically to the text and to the patterns, so any
mangling it does is harmless — this is what makes Arabic matching work without a
hand-maintained inflection table.

Every assessment is written append-only with its `assessorVersion` and an
`inputSnapshot`, so a price quoted last month can be explained after the rules
change.

## Extending the platform

The platform is a modular monolith. Adding a product is meant to be entries in
configuration, not branches in services, and these are the places that take the
entries.

### Adding a product type

`BuildType` is a union, and the maps keyed by it are `Record<BuildType, …>`, so
the compiler lists every place a new product needs an answer rather than
leaving one to be discovered in production:

| Where                        | What it declares                               |
| ---------------------------- | ---------------------------------------------- |
| `config/products.ts`         | price, price model, guarantee, capabilities    |
| `config/platforms.ts`        | delivery targets                               |
| `config/production.ts`       | the internal workflow and its stage weights    |
| `config/workspace.ts`        | what the customer sees in the Build Room       |
| `lib/scope/tiers.ts`         | tier prices                                    |
| `lib/scope/rule-assessor.ts` | screen allowance                               |
| `messages/*.json`            | names and descriptions, in all three languages |

Capabilities a product cannot carry are declared on the capability, not
branched on in the engine.

**What is _not_ on that list is the point.** No service asks what a website is.
Properties that vary by product — whether a third party reviews the result,
whether more than one delivery target is chosen, how long the guarantee runs —
are declared on the product and read from there. A branch on a product id is a
bug; `deliveryFor` carried one, comparing against a literal 5 or 14 chosen by
build type, and it is now a comparison against whatever that product publishes.

### Modules

`config/modules.ts` declares reusable bundles of capability — booking,
commerce, CRM. A module is defined as the `CapabilityKey`s it provides, so its
price, complexity and minimum tier all fall out of the scope engine rather than
being restated. `planned` modules carry no capabilities, which is what keeps
them un-orderable.

### Integrations

`config/integrations.ts` names every external system, the seam it is reached
through, and what breaks without it. `server/platform/integrations.ts` reports
which are actually configured, by variable name — never value. The question it
exists to answer is "is this wired, and if not, what stops working?", which
went unanswered when email shipped with a transport that could not deliver.

### Domain events

`lib/events/catalogue.ts` is the contract. Names are stable, payloads are
versioned, and events are facts in the past tense — they describe what
happened, never what should happen next, which is what makes a new subscriber
safe to add.

`server/events/bus.ts` persists first and dispatches second, isolates failing
handlers, and refuses to let a customer-triggered request emit a privileged
event such as `build.started`.

An event names its **subject**: usually a project, but an order, a subscription
or a user where there is no project. `projectId` remains as the denormalised
column the Build Room timeline reads, and the database enforces that a project
event carries it. `record(tx, …)` writes the row inside a caller's transaction
and returns the dispatcher to run after it commits — a fact belongs in the
transaction, a notification about it does not.

Automation is not built. The bus is the foundation it will attach to, and
nothing else is needed until there is something to automate.

## Error handling

Every API route is wrapped by `createHandler`, which gives it a correlation id,
one log line per failure, and a response body that never exposes internal
detail. An `ApiError` is deliberate and its message is written for the caller;
anything else is a bug, logged in full and answered with a generic message plus
the correlation id.

All responses use one envelope: `{ ok: true, data }` or
`{ ok: false, error: { code, message, details? } }`.

## Internationalization

- English, French, Arabic. English is the reference catalogue.
- A test asserts the three catalogues have identical key sets, that every ICU
  placeholder survives translation, and that no value is empty.
- Arabic is RTL. Layout uses logical properties throughout; `translateX` is
  banned for directional UI because it does not mirror.
- Arabic gets a native face (IBM Plex Sans Arabic), loaded only on that locale.

## Known limitation

`script-src` still allows `'unsafe-inline'`. Locking it down needs a
per-request nonce, and a nonce makes every page dynamic — which would cost the
marketing pages their prerendering. The policy restricts everything it can
without one. The nonce-based policy goes in when payments land, since those
routes are dynamic anyway. `docs/SECURITY.md`.
