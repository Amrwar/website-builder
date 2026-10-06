# Security

## Authentication

Clerk owns it. Registration, login, password reset, email verification, rate
limiting, breach-password checks and bot defence all live behind Clerk's hosted
components. Re-implementing that surface is how authentication bugs get written,
and none of it is differentiating work.

Credentials, sessions and verification state are never mirrored into our
database. The `users` row is a projection carrying `clerk_user_id`, profile,
preferences and — critically — the role.

**Never run `clerk init` on this project.** It already has Clerk; a signed-out
agent run can create a second application and replace the keys.

## Authorization

Three rules, enforced in `src/server/auth.ts`:

1. Identity comes from Clerk's verified session — never a request body, never a
   client-controlled header, never a cookie we parse ourselves.
2. Permissions derive from the role in **our** database. Clerk metadata is
   client-readable and editable outside the application; authorization needs a
   source of truth we own and can change transactionally with our own data.
3. Nothing in that module is importable from a client component. `server-only`
   turns an accidental client import into a build error rather than a leak.

**Never rely on client-side authorization.** Hidden UI is presentation. The
proxy is a coarse gate. The server-side check on the page, route handler or
action is the boundary. See `docs/ADMIN_FLOWS.md` for the permission matrix.

### Server actions are public endpoints

Next.js gives each action a generated name. That is obscurity, not security:
anyone who loaded the page has the id and can post anything to it. Every action
therefore re-authenticates, and scopes its write to the id **from the session**:

```ts
await db.update(users).set(parsed.data).where(eq(users.id, user.id));
```

A crafted payload cannot widen that, because the id never comes from the
request.

### Enumeration

Staff-only surfaces answer `not_found`, not `forbidden`. A 403 confirms the
route exists. `assertOwnershipOr` does the same for records: a customer asking
for someone else's project gets a 404, not a 403.

## Input validation

Zod at every boundary — forms, actions, route handlers — with unknown keys
dropped rather than spread into a write. That single property defeats the whole
class of mass-assignment attacks:

- a `role` in a profile payload is discarded;
- an `id` or `clerkUserId` in a payload is discarded;
- a `billingCountry` sent to the profile action is discarded, because each
  section carries its own schema.

URL fields reject anything that is not `http` or `https`, so a
`javascript:` or `data:` value cannot be stored and later rendered as a link.

Authentication is checked **before** validation, so an unauthenticated caller
cannot probe the schema by reading which fields come back as errors.

## Webhooks

`POST /api/webhooks/clerk` verifies the Svix signature before reading the
payload. That check is the only thing standing between the route and anyone on
the internet creating or deleting user rows.

If `CLERK_WEBHOOK_SIGNING_SECRET` is missing the route returns **503** rather
than skipping verification. Refusing is the safe failure.

The webhook can create an account but never grant privilege: `role` is set to
the default on insert and deliberately untouched on update.

## Secrets

- All values are provisioned through the Vercel Marketplace and pulled with
  `vercel env pull`. `.env.example` documents names only.
- `serverEnv()` throws if called in the browser.
- Validation errors report variable **names** only, never values, because those
  messages reach logs.
- Clerk's and Sentry's SDKs read and validate their own keys; restating them in
  our schema would mean two sources of truth and would make a missing Clerk key
  break every database call.

## HTTP headers

Set in `next.config.ts` for every route:

`Content-Security-Policy` · `X-Content-Type-Options: nosniff` ·
`X-Frame-Options: DENY` · `Referrer-Policy: strict-origin-when-cross-origin` ·
`Strict-Transport-Security` (2 years, preload) · `Permissions-Policy` (camera,
microphone, geolocation, browsing-topics all denied) ·
`Cross-Origin-Opener-Policy` · `Cross-Origin-Resource-Policy` ·
`X-Permitted-Cross-Domain-Policies: none`. `poweredByHeader` is off.

API routes additionally get `Cache-Control: no-store, must-revalidate` and
`Vary: Cookie, Authorization`.

### Content Security Policy

```
default-src 'self'; base-uri 'self'; form-action 'self';
frame-ancestors 'none'; object-src 'none';
style-src 'self' 'unsafe-inline';
script-src 'self' 'unsafe-inline' <clerk-instance>;
font-src 'self' data:;
img-src 'self' data: blob: https://img.clerk.com <clerk-instance>;
connect-src 'self' <clerk-instance>;
worker-src 'self' blob:;
frame-src 'self' https://challenges.cloudflare.com <clerk-instance>;
manifest-src 'self'; upgrade-insecure-requests
```

`<clerk-instance>` is decoded at build time from the publishable key, which
encodes the per-instance frontend API host and differs between development and
production. A malformed key yields `null` and the tighter policy, rather than a
guessed wildcard — browsers drop a nonsense source silently, taking the rest of
the directive with it.

**Known limitation.** `script-src` still allows `'unsafe-inline'`. A proper
lockdown needs a per-request nonce, and a nonce makes every page dynamic, which
would cost the marketing pages their prerendering and CDN caching. The
directives that are set are not decorative — `frame-ancestors` blocks
clickjacking, `form-action` blocks forms rewritten to post credentials
elsewhere, `base-uri` blocks `<base>` injection, `object-src` blocks legacy
plugins — each independently of `script-src`. The nonce-based policy goes in
with payments, since those routes are dynamic anyway.

## Verified attacks

Run against a production build. All rejected; see `docs/TESTING.md`.

| Attempt                                           | Result                |
| ------------------------------------------------- | --------------------- |
| `GET /api/account/me` signed out                  | 401                   |
| `/account`, `/fr/account`, `/ar/admin` signed out | 307 to locale sign-in |
| Forged `__session` cookie                         | 401                   |
| Forged bearer token                               | 401                   |
| `x-user-id` / `x-user-role: admin` headers        | 401                   |
| Webhook with no signature                         | 401                   |
| Webhook with forged Svix headers                  | 401                   |
| Rows created by the forged webhook                | **0**                 |
| Role in a profile payload                         | Dropped               |
| Another user's id in a payload                    | Dropped               |

## Commerce (Phase 6)

**The server decides the price.** The client submits a configuration, never an
amount. It is re-parsed, re-assessed and re-priced server-side, so a tampered
payload can at most describe a different project -- which is then priced
correctly for what it describes. `buildQuote` takes no price argument at all.

**Duplicate orders** are prevented by a unique index on `orders.idempotency_key`,
scoped to the user. A double submit, a retry or a lost race all converge on one
order.

**Duplicate payments** are prevented by passing an idempotency key to the
provider, so a retried create returns the original session rather than a second
chance to charge.

**Replayed webhooks** are stopped by a unique index on
`(provider, provider_event_id)`. The insert _is_ the claim: a redelivery loses
it and is acknowledged with 200 without re-running fulfilment. Stripe's own
guidance is to key on event ids, not timestamps. Signature verification keeps
its default five-minute tolerance, which rejects a replayed capture of a
genuine request.

**Fulfilment is authoritative and idempotent.** The payment state is read back
from the provider, never taken from the browser; the amount collected is
checked against the order total; and the claim to fulfil is a single
conditional UPDATE, so concurrent callers produce one project.

**Unauthorized order and invoice access** is blocked by scoping every lookup to
the owner inside the SQL, and answering `not_found` rather than `forbidden`.

**Tax** is deliberately not enabled; see `config/commerce.ts` for why turning on
`automatic_tax` without a registration is worse than leaving it off.

### Verified live (Phase 6)

| Attempt                                   | Result                               |
| ----------------------------------------- | ------------------------------------ |
| `/orders/…` and `/fr/orders/…` signed out | 307 to locale sign-in                |
| Webhook with no signature                 | 401                                  |
| Webhook with a forged signature           | 401                                  |
| Webhook payload tampered after signing    | 401                                  |
| Correctly signed event, replayed          | 200 `duplicate: true`, one event row |
| Correctly signed capture, 1 hour stale    | 401                                  |
| Orders created by any of the above        | **0**                                |

## Gaps

- **No rate limiting** on our own endpoints. Clerk rate-limits authentication;
  the configurator's server actions do not.
- **No CSRF token.** Next.js server actions carry origin checks, and session
  cookies are `SameSite`, but this has not been audited.
- **No automated dependency scanning** in CI — there is no CI yet.
  `npm audit --omit=dev` currently reports 0 production vulnerabilities.
- **No audit-log integrity** — `project_events` is append-only by convention,
  not by constraint.
