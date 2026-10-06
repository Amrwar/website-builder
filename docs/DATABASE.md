# Database model

Neon Postgres, Drizzle ORM. Schema in `src/db/schema/`, migrations in
`drizzle/`. Current migration: `0000_brainy_callisto.sql`.

## Principle

Where a union already exists in application config it is reused as a Postgres
enum rather than retyped, so the database and the domain cannot drift. Adding a
value produces a migration — which is the point: the change becomes visible and
reviewable instead of silent.

## Enums

| Enum                | Values                                                         | Source                 |
| ------------------- | -------------------------------------------------------------- | ---------------------- |
| `user_role`         | customer, admin, project_manager, developer, designer, support | `config/roles.ts`      |
| `build_type`        | website, system, mobileApp                                     | `config/products.ts`   |
| `currency`          | CAD, USD, EUR, GBP, AED, SAR                                   | `lib/pricing/money.ts` |
| `scope_tier`        | essential, extended, advanced, custom                          | `db/schema/enums.ts`   |
| `project_status`    | see below                                                      | `db/schema/enums.ts`   |
| `assessment_source` | rule_engine, llm, manual_override                              | `db/schema/enums.ts`   |
| `design_approach`   | design_for_me, supplied_brand, existing_design                 | `db/schema/enums.ts`   |
| `actor_type`        | customer, staff, system                                        | `db/schema/enums.ts`   |

### `project_status`

```
draft → quoted → awaiting_payment → awaiting_assets → in_build
      ↘ awaiting_quote                                   ↓
                                                     in_preview
                                                         ↓
                                                  awaiting_approval
                                                         ↓
                                                      approved
                                                         ↓
                                              launching → launched

cancelled is reachable from anywhere before launched.
```

The distinction between `awaiting_assets` and `in_build` **is the guarantee**.
Payment does not start the countdown; the customer's required information and
assets must be in first. The clock starts on the transition into `in_build`,
never earlier. `awaiting_quote` is where a brief goes when it exceeds the
published ladder.

## Tables

### `users`

Everyone who signs in — customers and staff alike. One table because they share
one identity provider and one account surface; what separates them is `role`.

Clerk owns authentication. This row is the local projection, kept in step by the
Clerk webhook. Credentials, sessions and verification state stay with Clerk and
are never mirrored.

| Group         | Columns                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------ |
| Identity      | `id` (uuid pk), `clerk_user_id` (unique), `email`, `display_name`                          |
| Authorization | `role` — default `customer`                                                                |
| Preferences   | `preferred_locale`, `preferred_currency`, `timezone`                                       |
| Notifications | `notify_build_updates`, `notify_messages`, `notify_deadline_alerts`, `notify_product_news` |
| Business      | `business_name`, `business_website`, `billing_country`, `tax_id`                           |
| Audit         | `created_at`, `updated_at`                                                                 |

`role` is stored here rather than only in Clerk metadata because metadata is
client-readable and editable through Clerk's dashboard. Authorization needs a
source of truth the application controls and can change transactionally
alongside its own data.

Notification preferences are explicit columns, not a JSON blob: they are queried
when sending, and a blob makes "everyone who wants deadline alerts" an
unindexable scan. `notify_product_news` defaults to **false** — consent has to
be given, not withdrawn, and defaulting it true would make the first email
unlawful in several target markets.

Indexes: unique on `clerk_user_id`; `email`; `role` (staff listings filter by it).

### `projects`

| Group      | Columns                                                             |
| ---------- | ------------------------------------------------------------------- |
| Identity   | `id`, `reference` (unique, human-quotable), `owner_id` → users      |
| Scope      | `build_type`, `scope_tier`, `status`                                |
| Commercial | `price_minor_units`, `currency`, `guaranteed_days`                  |
| Guarantee  | `paid_at`, `assets_submitted_at`, `build_started_at`, `deadline_at` |
| Delivery   | `delivered_at`, `approved_at`, `launched_at`, `cancelled_at`        |
| Audit      | `created_at`, `updated_at`                                          |

The guarantee timestamps are **stored, not derived**. A deadline computed on
read would silently change when the rules change; a commitment made on a given
day has to survive that.

Price is integer minor units with the currency beside it. Never a float.

`owner_id` restricts deletion: a customer with builds is a financial and
contractual record, so the Clerk `user.deleted` webhook retains the row and the
account simply becomes unreachable.

Indexes: unique `reference`; `owner_id`; `status`; `deadline_at` (deadline-risk
detection will scan it).

### `project_briefs`

One per project. What the customer actually asked for.

`idea_text`, `idea_locale`, `selected_capabilities`, `design_approach`,
`estimated_screens`, `reference_urls`, `asset_pathnames`.

`idea_locale` is stored because the scope engine's pattern matching is
per-locale — re-assessing later needs to know which language it was written in.

### `scope_assessments`

Append-only. Never updated, never deleted.

`source`, `assessor_id`, `assessor_version`, `build_type`, `tier`,
`complexity_points`, `capabilities`, `reasons`, `requires_custom_quote`,
`price_minor_units`, `currency`, `guaranteed_days`, `input_snapshot`.

This is the table that makes a price defensible. `assessor_version` plus
`input_snapshot` means a quote issued under ruleset `2026.10.2` can be
reconstructed exactly after the rules change, and a rule-engine assessment stays
distinguishable from a later LLM one.

### `project_events`

The audit log. `type`, `actor_type`, `actor_id`, `payload` (jsonb),
`occurred_at`.

`actor_type` separates customer actions from staff actions from system
transitions, which is what makes "who started this build?" answerable.

## Migrations

```
npm run db:generate   # after any schema change
npm run db:migrate    # applies; needs DATABASE_URL_UNPOOLED
npm run db:check      # consistency
```

`drizzle-kit generate` needs a TTY to disambiguate a rename from a new table.
Run it in a real terminal — piping it will hang or guess.

## Commerce tables (Phase 6)

| Table               | Purpose                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `products`          | The sellable catalogue. `type` and `pricing_model` are what let a build, a design service, a maintenance plan and a block of credits coexist. |
| `orders`            | What was agreed. Totals, currency and `pricing_snapshot` are frozen at placement. Unique `idempotency_key` is the duplicate-order guard.      |
| `order_items`       | One line per thing bought, with its configuration, scope assessment and conversion arithmetic snapshotted.                                    |
| `payments`          | One row per attempt, not per order. Unique on (provider, provider_reference).                                                                 |
| `payment_events`    | Provider event log. **Unique on (provider, provider_event_id) — this is the webhook replay guard.**                                           |
| `invoices`          | Financial documents. Billed-to details are copied, never joined. One per order.                                                               |
| `document_counters` | Year-scoped gapless series for order, invoice and project numbers.                                                                            |

`scope_assessments.project_id` became **nullable** in this phase: an assessment
is produced when a quote is priced, which is before payment and therefore
before a project exists. The order side of the link is
`order_items.scope_assessment_id`; the project id is filled in at fulfilment.

## Build Room tables (Phase 7)

| Table               | Purpose                                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project_members`   | Who is on a project, **including the customer**. `last_read_at` is what unread counts are derived from.                                                              |
| `project_files`     | Versioned by `(group_key, version)`, so re-uploading a logo makes v2 rather than overwriting what the build was done against. `pathname` is a blob key, never a URL. |
| `project_messages`  | Author name is copied, so a thread still reads correctly after someone leaves.                                                                                       |
| `change_requests`   | Scope, price and time impact are explicit columns — that is how the fixed price stays honest when scope moves.                                                       |
| `project_approvals` | Append-only per round. Asking again after changes is a new row, so "approved, then we changed it" stays visible.                                                     |
| `deployments`       | One row per deployment, not a mutable URL on the project, so a customer can tell that what they approved is not what they are looking at.                            |

`projects` gained `product_type` and `product_id` in this phase. That is what
makes the Build Room reusable: the room reads the product type to decide which
stages, panels and approvals apply, and never asks what a website is.

## Production engine tables (Phase 8)

| Table                | Purpose                                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `production_tasks`   | The internal plan. `estimated` and `actual` are separate columns and `actual` is measured, never typed in; `blocked_minutes` accumulates so a task that waited two of its three days is recorded as a one-day task. |
| `task_dependencies`  | A table rather than an array, because the question asked most often is the reverse one — "what is this blocking?" — which an array makes an unindexable scan. A check constraint forbids self-reference.            |
| `project_milestones` | Derived from task state, so a milestone cannot claim a stage is complete while work in it is open.                                                                                                                  |
| `deliverables`       | Points at a file, a deployment or an external URL. `delivered` and `accepted` are separate states because the gap between them is the customer's review.                                                            |

`projects` gained `risk_level`, `risk_reasons` and `risk_assessed_at`. These are
a **cache for sorting the queue**, not a source of truth: `assessRisk` is
deterministic, so they can always be rebuilt from task state and the clock.

### The guarantee trigger

`projects_guard_guarantee` is a `BEFORE UPDATE` trigger that refuses any change
to `paid_at`, `assets_submitted_at`, `build_started_at` or `deadline_at` once
set — including clearing one. These four columns decide whether a refund is
owed, so the database protects them regardless of which code path asks. A
deliberate correction sets `app.allow_guarantee_edit` inside a transaction,
which is auditable precisely because it is unusual.

## Not yet modelled

Files and uploads, messages and change requests, approvals, maintenance
subscriptions, build credits, referrals, hosting and domains, deployments.
These arrive with their phases.
