# Testing strategy

## The gate

Every phase ends with all five passing, in order:

```
npm run format && npm run typecheck && npm run lint && npm test && npm run build
```

**And then the pages are loaded in a browser with the console open.** This is
not optional ceremony. Three bugs in this codebase passed every one of the
checks above while the page was broken in practice:

| Bug                                                            | What every automated gate reported                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Route-group `loading.tsx` left a segment permanently suspended | Clean. No error in dev or production. The page simply did nothing. |
| `<SignedOut>` throws at runtime in Clerk Core 3                | Clean build, clean types, clean tests. Blank white page.           |
| CSP blocked Clerk's script entirely                            | Clean. Sign-in could never have worked in any enforcing browser.   |

A phase is not complete until its pages have been seen running.

## Current state

Vitest + Testing Library, jsdom, `restoreMocks` and `clearMocks` on.
**619 tests across 32 files.**

| Area               | File                             | What it protects                                                                                                          |
| ------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Class merging      | `lib/cn.test.ts`                 | Custom tokens make size and colour ambiguous to the default merger                                                        |
| Money              | `lib/pricing/money.test.ts`      | Integer-only invariant, refund percentages, formatting                                                                    |
| Scope engine       | `lib/scope/*.test.ts`            | Tier selection, Arabic normalization, the restaurant example, false-positive regressions                                  |
| Configurator draft | `lib/configurator/*.test.ts`     | Schema, per-step validation, build-type reset, storage round-trip                                                         |
| Logger             | `lib/logger.test.ts`             | Level filtering, child context                                                                                            |
| Catalogues         | `messages/catalogues.test.ts`    | Key parity across en/fr/ar, ICU placeholders, no empty values                                                             |
| Permissions        | `config/roles.test.ts`           | The whole matrix, customer confinement, privilege separation                                                              |
| Authorization      | `server/auth.test.ts`            | Unauthenticated rejection, 404-not-403, role from DB not Clerk, ownership                                                 |
| Server actions     | `server/account-actions.test.ts` | Signed-out writes nothing, payload cannot redirect the write                                                              |
| Account schemas    | `lib/account/schema.test.ts`     | Mass-assignment, `javascript:` URLs, preference validation                                                                |
| Routing            | `proxy.test.ts`                  | Private-route matching, locale-aware sign-in redirect, the matcher regex                                                  |
| Pricing engine     | `lib/engine/evaluate.test.ts`    | Tier escalation, extreme scope routed to a quote, withdrawn tiers resolving upward, price tampering, historical snapshots |
| Coupons            | `lib/engine/discounts.test.ts`   | Unknown, withdrawn, expired, exhausted and ineligible codes; reductions clamped to the order value                        |
| Quote projection   | `lib/commerce/quote.test.ts`     | Lines summing to the header, per-line discount and tax allocation, the absence of any price input                         |
| Catalogue admin    | `server/admin/catalog.test.ts`   | Only the owner may write, refusal before any query, incoherent figures rejected                                           |

## What is tested, and why those things

### Business rules, not implementation

The scope engine's tests assert outcomes a non-engineer can check: the
restaurant brief exceeds the entry tier; a brochure site with a contact form
does not; customer-plus-admin stays affordable. These are the rules the company
sells, so they get the most direct tests in the codebase.

### Regressions, named

Every bug that shipped got a test with a comment explaining the real-world
input that triggered it: `"courier"` alone must not imply dispatch logistics;
"request an appointment" must not imply a booking system; `ويدير الموظفون` must
match a lexicon entry written as `الموظفين`.

### The proxy matcher, as regex

The `config.matcher` is tested as a string against real paths. One lost
backslash turns the file-extension lookahead into "match everything", which
makes the proxy skip every path and silently disables both localisation and the
signed-in gate. This happened once. There is now a test asserting the escape is
still there.

### Authorization, adversarially

`server/auth.test.ts` and `server/account-actions.test.ts` are written from the
attacker's side: a signed-out caller must be refused _before_ the database is
touched, an elevated role claimed in Clerk metadata must be ignored, a payload
carrying `role: "admin"` must have it dropped, and a 403 must never be returned
where a 404 would hide the route.

## Live verification

Automated tests mock Clerk. The authorization behaviour was additionally probed
against a running production build — forged cookies, forged bearer tokens,
forged identity headers, unsigned and forged webhooks — and the database was
queried afterwards to confirm zero rows were created. Results are tabulated in
`docs/SECURITY.md`.

Four further behaviours are only true of the real database, so each was probed
against Postgres inside a transaction that was then rolled back:

| What                             | Cases | Result                                                                                         |
| -------------------------------- | ----- | ---------------------------------------------------------------------------------------------- |
| Guarantee timestamp immutability | 4     | First write allowed; moving, back-dating and clearing all refused (23514)                      |
| Production engine guards         | 3     | Self-dependency refused, duplicate task key refused, readiness promotes on the last dependency |
| Webhook replay protection        | 4     | Valid 200, replay deduplicated, tampered payload 401, stale capture 401                        |
| Catalogue invariants             | 22    | All 22 behaved as expected — 5 allowed, 17 refused (23514/23505)                               |

## Gaps

Honest list, in rough priority order.

1. **No CI.** The gate is run by hand. Nothing stops a broken commit.
2. **No component tests.** Not one of the 30 UI primitives has a test. Their
   states are verified by eye in `/design-system`.
3. **No tests for `lib/api`.** The handler wrapper's error mapping — the thing
   that decides whether an internal error leaks — is untested.
4. **No automated accessibility checks.** No axe, no Lighthouse budget. Keyboard
   and screen-reader behaviour is checked manually and inconsistently.
5. **No end-to-end tests.** There is no Playwright suite, so the configurator's
   eight steps have never been driven start to finish by a machine.
6. **No visual regression tests.** The three-locale, two-theme matrix is checked
   by hand.
7. **No automated database-level tests.** The CHECK constraints and triggers are
   verified by hand-run scripts against real Postgres, recorded above, rather
   than by a suite that runs in the gate.
8. **No load or performance budget.**

Items 1 and 3 are the cheapest and most valuable. Item 5 is the one that would
have caught the suspended-boundary bug automatically.

## Conventions

- Tests sit beside the code: `foo.ts` → `foo.test.ts`.
- `it.each` for matrices, so a failure names the case.
- Mock at the boundary (Clerk, the database), not the function under test, so
  the real chain runs.
- Every assertion that encodes a business rule carries a comment saying which
  rule and why — a test that fails in two years should explain itself.
