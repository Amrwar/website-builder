# Staff flows

## Roles

Nine roles, one `users` table. Defined in `src/config/roles.ts` — client-safe,
no database import, so the UI can read the matrix while enforcement stays on
the server.

| Role              | Purpose                                                |
| ----------------- | ------------------------------------------------------ |
| `customer`        | Orders builds. The default for every new account.      |
| `owner`           | Everything, including platform configuration.          |
| `admin`           | Everything operational. Not configuration.             |
| `project_manager` | Runs the queue: scope, deadlines, customer contact.    |
| `finance`         | Money in and out. Raises refunds; cannot release them. |
| `developer`       | Executes builds.                                       |
| `designer`        | Owns design deliverables.                              |
| `qa`              | Runs and signs off quality passes.                     |
| `support`         | Answers customers. Cannot change commercial terms.     |

## The rank ladder

Permissions answer "may this person do this thing". Rank answers "may they do
it **to that person**". Without rank, anyone holding `user:manage` could
promote themselves and every separation below would be theatre.

| Rank | Roles                    |
| ---- | ------------------------ |
| 100  | owner                    |
| 90   | admin                    |
| 60   | project_manager, finance |
| 40   | developer, designer, qa  |
| 30   | support                  |
| 0    | customer                 |

Three rules, all enforced in `server/admin/team.ts` and all audited including
refusals:

1. You may only grant a role **strictly below** your own rank.
2. You may only act on someone whose current role ranks below yours.
3. **Nobody changes their own role**, at any rank. Absolute rather than
   derived — an owner changing their own role is how a company locks itself
   out of its own platform.

It follows from (1) that only the owner can appoint an administrator.

## Permissions

Eighteen permissions. A role is a named bundle; nothing is checked by role name
at a call site.

Separations that matter:

- **`user:manage`** — owner and admin only, and then subject to the ladder.
- **`billing:manage` vs `refund:execute`** — finance raises a refund, owner or
  admin releases it, and `executeRefund` additionally refuses whoever raised
  it. Preparing a payment and releasing it are two people.
- **`settings:manage`** — owner alone. Pricing tables and tax policy are
  commercial decisions.
- **`customer:read` vs `customer:read:sensitive`** — a designer needs to know
  whose project it is, not their VAT number. The commercial columns are
  stripped in the query, not hidden in the template.
- **`audit:read`** — owner and admin only.

Every row is asserted in `src/config/roles.test.ts`.

## The console

Twenty-five sections declared in `src/config/admin-nav.ts`, which navigation,
page guards and tests all read from, so they cannot disagree. `requireAdminSection`
resolves the section and refuses with `notFound()` — never `forbidden`, which
would confirm the section is real.

Sections whose data does not exist yet (organizations, referrals, partners,
reviews, domains, hosting, content, notifications) are marked `planned` with
the phase that delivers them and render an honest "not built" page. An empty
table would say "nobody has added a domain"; the truth is that domains do not
exist here.

## Enforcement

Three layers, and the first two are conveniences:

1. **Hidden links** — the staff link does not render for customers. This is
   presentation only. A hidden link is not a closed door.
2. **The proxy** — redirects signed-out visitors away from `/account` and
   `/admin`. It runs before the cache and only sees the request, so it can
   answer "is there a session?" and nothing more.
3. **The server** — `requirePermission()` on the page itself, reading the role
   from our database. **This is the boundary.**

### Staff surfaces answer `not_found`

A customer who guesses `/admin` gets the 404 page, not a 403. Reporting
"forbidden" confirms the route exists, which is information they did not have.
The real reason goes to the log.

## Role assignment

No code path accepts a role from a request:

- The account forms have no `role` field, and Zod drops unknown keys, so a
  crafted payload cannot smuggle one.
- The Clerk webhook sets the default role on insert and **never touches `role`
  on update**, so an elevated role survives a profile edit in Clerk and cannot
  be set from outside the application.
- Clerk metadata is ignored entirely for authorization.

The one interface that does change a role is `/admin/team`, which goes through
`changeUserRole` and enforces five checks: the actor holds `user:manage`, the
target role exists, the target ranks strictly below the actor, the subject is
not the actor, and the change is audited. Self-change is refused absolutely —
without that, anyone holding `user:manage` could promote themselves and every
other separation here would be decorative.

The first owner is promoted by `scripts/promote-user.mjs`, which writes its own
audit entry. Bootstrapping cannot be done through the interface, because the
interface requires an existing owner.

## Pricing administration (Phase 10)

`/admin/pricing` reads the catalogue through the same `loadCatalog()` the
configurator and checkout call, so the screen cannot drift from what customers
are actually quoted. Four tabs: tiers, features, currencies, discounts.

Two permissions, deliberately split:

- **`finance:read`** sees the figures. No controls render.
- **`settings:manage`** — the owner alone — may change them.

An administrator who can release a refund still cannot move a price. Hiding the
controls is presentation; every server action re-checks `settings:manage` and
refuses with `not_found` before running a query.

Every write records an `audit_events` row with the fields that changed, their
previous values, the actor and an optional reason the form asks for. That is
what makes an edit reviewable and revertable now that the figures no longer
live in version control. No edit is retroactive: orders freeze a complete
pricing snapshot when placed.

Until an owner presses **Import shipped defaults**, the tables are empty and
the engine prices from the `config/` constants. The import copies those exact
figures into the database — it changes no price, it makes them editable — and
refuses if rows already exist, because overwriting an administrator's edits
with the shipped figures is a destructive act disguised as a convenience.

## Hosting and domains (Phase 11)

`/admin/hosting` lists every hosted project with the version that is **actually
live** — read from a deployment the provider confirmed, not from the hosting
row's own status. A project whose hosting says "active" with no live version is
not a rendering gap; it is a disagreement between two records, and showing it is
the point.

`/admin/domains` is sorted by certificate expiry, soonest first, because a
certificate that lapses takes the site with it and a list sorted by name buries
the only row that matters today. Verification, DNS and SSL are three columns for
the same reason they are three columns in the schema.

Uptime is only ever shown with the moment it was measured. A percentage with no
"as of" beside it is a claim nobody can check, so the column says "not measured"
rather than showing a zero.

The pricing console gained two tabs: **Plans**, where maintenance prices and the
credit each plan includes are edited, and **Launch checklist**, where what a
launch requires is edited. Both follow the Phase 10 rules exactly — owner-only
writes, audited changes, shipped config as the seed and the fallback. A plan
price change never alters an existing subscription, which froze its figure when
it was bought.

## Still to build

**Organizations, referrals, partners, reviews, content and notifications** are
declared in the navigation as `planned` with the phase that delivers them, and
render an honest "not built" page rather than an empty table.

## Audit

`project_events` records `actor_type` (customer / staff / system) and `actor_id`
against every transition. This is what makes "who started this build, and when
did the clock start?" answerable — which matters because the answer determines
whether a refund is owed.
