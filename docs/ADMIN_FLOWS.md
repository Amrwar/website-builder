# Staff flows

## Roles

Six roles, one `users` table. Defined in `src/config/roles.ts` — client-safe, no
database import, so the UI can read the matrix while the enforcement stays on
the server.

| Role              | Purpose                                             |
| ----------------- | --------------------------------------------------- |
| `customer`        | Orders builds. The default for every new account.   |
| `admin`           | Everything, including roles and refunds.            |
| `project_manager` | Runs the queue: scope, deadlines, customer contact. |
| `developer`       | Executes builds.                                    |
| `designer`        | Owns design deliverables.                           |
| `support`         | Answers customers. Cannot change commercial terms.  |

## Permissions

Ten permissions. A role is a named bundle of them; nothing is checked by role
name at a call site.

| Permission         | customer | admin | PM  | dev | designer | support |
| ------------------ | :------: | :---: | :-: | :-: | :------: | :-----: |
| `account:manage`   |    ●     |   ●   |  ●  |  ●  |    ●     |    ●    |
| `project:create`   |    ●     |   ●   |     |     |          |         |
| `admin:access`     |          |   ●   |  ●  |  ●  |    ●     |    ●    |
| `project:read:all` |          |   ●   |  ●  |  ●  |    ●     |    ●    |
| `project:manage`   |          |   ●   |  ●  |     |          |         |
| `build:execute`    |          |   ●   |     |  ●  |          |         |
| `design:manage`    |          |   ●   |     |     |    ●     |         |
| `support:respond`  |          |   ●   |  ●  |     |          |    ●    |
| `billing:manage`   |          |   ●   |     |     |          |         |
| `user:manage`      |          |   ●   |     |     |          |         |

### Separations that are deliberate

- **Only `admin` holds `user:manage`.** Anyone who can set roles can grant
  themselves everything else, so role assignment is the keys to the kingdom.
- **Only `admin` holds `billing:manage`.** Refunds are money leaving the
  company.
- **A developer cannot change design assets; a designer cannot move a build
  through its stages.** Separate crafts, separate authority.
- **Support cannot change scope, price or deadline.** Support exists to answer
  customers, not to renegotiate the contract.

Every row of this table is asserted in `src/config/roles.test.ts`, including
that `customer` is refused all eight staff permissions and that the default role
is the least privileged.

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
