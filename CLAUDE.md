@AGENTS.md

# Buildline

A productized development platform: customers configure and order websites,
business systems and mobile apps at published prices with a delivery guarantee.

Detailed specifications live in `/docs`. This file is the short list of things
that must hold in every change.

## Commands

| Command               | What it does                                     |
| --------------------- | ------------------------------------------------ |
| `npm run dev`         | Dev server (Turbopack)                           |
| `npm run build`       | Production build; fails on type errors           |
| `npm run typecheck`   | `tsc --noEmit`                                   |
| `npm run lint`        | ESLint (Next 16 no longer lints during build)    |
| `npm test`            | Vitest, single run                               |
| `npm run format`      | Prettier write                                   |
| `npm run db:generate` | Generate a migration from schema changes         |
| `npm run db:migrate`  | Apply migrations (needs `DATABASE_URL_UNPOOLED`) |

`drizzle-kit generate` needs a TTY to disambiguate a rename from a new table.
Run it in a real terminal, never piped.

## Architecture

Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · Drizzle + Neon
Postgres · Clerk · next-intl (en/fr/ar) · Vitest. See `docs/ARCHITECTURE.md`.

- `src/config/` — client-safe constants and domain unions. No database imports.
- `src/db/` — Drizzle schema and client. Server only.
- `src/lib/` — pure domain logic: pricing, scope engine, configurator draft.
- `src/server/` — anything that touches the session or writes. `server-only`.
- `src/components/ui/` — the design system. Everything else composes from it.
- `src/app/[locale]/` — route groups: `(marketing)`, `(auth)`, `(app)`.

The middleware file is `src/proxy.ts` — Next 16 renamed it.

## Business rules that must never be broken

1. **A fixed price is not unlimited scope.** Complexity must raise the tier,
   the price and the days, or route to a custom quote. Never let an arbitrarily
   complex brief resolve to the entry price. `docs/PRICING_AND_SCOPE.md`.
2. **The guarantee countdown starts at `in_build`**, never at payment. The
   customer's assets must be in first. The timestamps are stored, not derived.
3. **App store review time is outside the guarantee** and must be disclosed
   wherever mobile delivery is stated.
4. **Missed deadline:** 100% refund and cancel, or continue with 30% refund.
   The customer chooses.
5. **No fake AI.** The scope engine is rule-based and says so. Never describe
   it as AI in the UI. It stays behind the `ScopeAssessor` interface so a real
   provider can be added later.
6. **No invented proof.** Portfolio, testimonials and the build wall render
   honest empty states until there is real work. Never fabricate a case study,
   a review, a logo or a metric.

## Authorization

- Identity comes only from Clerk's verified session.
- The role comes from our `users` table, never from Clerk metadata — metadata
  is client-readable and editable outside the application.
- **Never rely on client-side authorization.** Every protected page, route
  handler and server action re-checks server-side. The proxy is a coarse gate,
  not the boundary.
- Staff-only surfaces answer `not_found`, not `forbidden`. A 403 confirms the
  route exists.
- Server actions are public HTTP endpoints. Re-authenticate inside every one
  and scope writes to the id from the session, never from the payload.

## Conventions

- Money is integer minor units. Never floats. `src/lib/pricing/money.ts`.
- Commercial figures live in `src/config/`, defined once and read everywhere.
- Validate untrusted input with Zod at the boundary; let unknown keys drop.
- Logical CSS properties (`ps-`, `me-`, `inline-size`) so RTL works for free.
  `translateX` does not mirror — do not use it for directional UI.
- Every user-facing string goes through next-intl in all three catalogues.
- Comments explain _why_, not what. Prefer a short comment on a real trade-off
  over narration of the code.

## Never do

- Run `clerk init` — this project already has Clerk; it can replace the keys.
- Re-run `vercel integration add` after a partial failure — it provisions a
  second resource. Use the printed recovery command.
- Add a `loading.tsx` to a route group without testing the route renders.
  A bad boundary leaves the segment permanently suspended with **no error**.
- Use `<SignedIn>` / `<SignedOut>` — exported but they throw in Clerk Core 3.
  Use `<Show when="signed-in">` or `useAuth()`.
- Read cookies in a layout for theming. It makes every page dynamic.
- Commit a `.env` value, or echo a secret into logs or a response body.
- Fabricate content to fill a UI. Ship the empty state.

## Phase validation

A phase is done when all of these pass, in order, with no errors:

```
npm run format && npm run typecheck && npm run lint && npm test && npm run build
```

Then: load the affected routes in a browser and read the console. Type checks,
lint and unit tests have all passed while a page was blank in practice — the
Clerk Core 3 and suspended-boundary bugs were both invisible to every gate
above. A phase is not complete until its pages have been seen running.

Phases are implemented one at a time, in order, and never ahead of approval.
`docs/PHASES.md`.
