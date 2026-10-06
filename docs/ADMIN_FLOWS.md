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

There is deliberately **no interface** for changing a role, and no code path
that accepts one from a request:

- The account forms have no `role` field, and Zod drops unknown keys, so a
  crafted payload cannot smuggle one.
- The Clerk webhook sets the default role on insert and **never touches `role`
  on update**, so an elevated role survives a profile edit in Clerk and cannot
  be set from outside the application.
- Clerk metadata is ignored entirely for authorization.

Roles are currently changed by a direct database update. A proper admin
interface for it belongs with the admin dashboard phase, and it is the single
most security-sensitive screen in the product.

## The staff console today

`/admin` is a shell. It is gated on `admin:access` and renders what the
signed-in role may do — the permission table resolved for the current user.
That is deliberately the whole page: the console's actual tools belong to later
phases, and the one thing worth proving now is that authorization resolves
correctly.

## Not yet built

**Project queue** — every active build, sorted by deadline risk.

**Deadline-risk detection** — `projects.deadline_at` is indexed for exactly this
scan. The rule is a function of time remaining against stage, and it must fire
early enough that the 30% refund is avoidable.

**Scope management** — staff override of an assessment. `assessment_source`
already has `manual_override` reserved; an override is a new append-only row,
never an edit to the engine's own assessment.

**Payment and refund management** — including the two guarantee outcomes, which
must be executable without a developer.

**Customer management, deployment tracking, analytics, content management.**

## Audit

`project_events` records `actor_type` (customer / staff / system) and `actor_id`
against every transition. This is what makes "who started this build, and when
did the clock start?" answerable — which matters because the answer determines
whether a refund is owed.
