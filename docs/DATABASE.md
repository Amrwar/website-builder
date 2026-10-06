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

## Catalogue tables (Phase 10)

The commercial rules, as data. The shipped `config/` constants remain both the
seed and the fallback: **an empty table means "use what shipped"**, so pricing
works before anyone has opened the admin screens and a half-populated table
cannot produce a catalogue with holes in it.

| Table                | Purpose                                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog_features`   | Sellable capabilities. `points` and `minimum_tier` are both editable because both are commercial judgements about how much work something is, not facts about the code. |
| `catalog_tiers`      | Price, guaranteed duration and the point threshold that selects each tier of each build type. A null price is a quotation, and the duration must be null with it.       |
| `catalog_currencies` | Published local prices. `rate` is stored as text so the reviewed figure is kept exactly as a person wrote it, and `reviewed_on` records when a human last looked at it. |
| `discounts`          | Coupons. Every constraint that limits one — window, usage cap, minimum order, eligible build types, a cap on the reduction — lives here rather than in the checkout.    |

Editing any of these can never change what somebody was charged: orders freeze
a complete pricing snapshot when they are placed. That is what makes the tables
safe to edit at all.

### Catalogue CHECK constraints

Written by hand in `0005_pricing_catalog.sql` rather than generated, and
verified against real Postgres (22 cases, all in a rolled-back transaction).
The admin screens validate the same rules first with messages an administrator
can act on; these hold whatever path a write arrives by.

| Constraint                          | Refuses                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `catalog_tiers_price_days_coherent` | A price with no deadline, or a deadline with no price.                        |
| `catalog_tiers_amounts_sane`        | A zero or negative price, a duration outside 1–365, a negative threshold.     |
| `catalog_features_amounts_sane`     | Negative points, a zero surcharge, a blank key.                               |
| `catalog_currencies_rate_positive`  | A rate that is not a positive number, or a rounding step below one.           |
| `discounts_value_matches_kind`      | A percentage outside 1–100, or a fixed amount of zero.                        |
| `discounts_limits_sane`             | A lower-case code, a window that ends before it starts, a negative use count. |

## Lifecycle tables (Phase 11)

| Table                    | Purpose                                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `launch_checklist_items` | What a launch requires, as data. `appliesTo` is empty for "every product"; an item that applied to nothing would be invisible, so empty reads as all.                      |
| `project_launch_checks`  | One item's state on one project. Rows are created lazily, so an untouched project costs nothing. `item_key` is copied, not referenced, so a launch reads back years later. |
| `project_hosting`        | Where one project runs. Uptime is a recorded observation with the moment it was measured beside it, never a claim.                                                         |
| `domains`                | Verification, DNS and SSL as three columns, because they are three failures with three different fixes. `owned_by_customer` decides who renews it.                         |
| `maintenance_plans`      | Editable plan prices, seeded from `config/maintenance`. `included_credit_minutes` is why plans are modelled rather than being three product rows.                          |
| `subscriptions`          | One commitment. `cancel_at_period_end` is what makes cancelling non-destructive.                                                                                           |
| `subscription_events`    | Append-only. The only thing that settles "I was charged after I cancelled".                                                                                                |
| `credit_accounts`        | One balance per person. A cache of the ledger, rebuildable by `recomputeBalance`.                                                                                          |
| `credit_ledger`          | Append-only, signed minutes. `subject_type`/`subject_id` are untyped on purpose: a column per product type would be the coupling credits exist to avoid.                   |

`deployments` gained `provider`, `provider_deployment_id`,
`provider_confirmed_at`, `rollback_of_deployment_id` and `triggered_by_user_id`.

### Lifecycle invariants

Verified against real Postgres (30 cases, in a rolled-back transaction).

| Constraint                                | Refuses                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `deployments_ready_requires_confirmation` | `state = 'ready'` without a provider confirmation. **The rule of this phase.** |
| `deployments_failure_coherent`            | A failed deployment with no failure time, or a time without the state.         |
| `credit_ledger_direction_matches_kind`    | A "spent" entry that adds credit, or a "purchased" one that removes it.        |
| `credit_ledger_adjustment_needs_reason`   | A manual correction with no stated reason.                                     |
| `credit_ledger_balance_nonnegative`       | A balance below zero. Credit is prepaid.                                       |
| `credit_ledger_no_update` (trigger)       | **Any** update or delete. Corrections are new rows.                            |
| `domains_one_primary_per_project`         | A second primary domain on one project.                                        |
| `domains_name_lowercase`                  | An upper-case hostname, or one carrying a path.                                |
| `project_hosting_uptime_dated`            | An uptime figure with no measurement date, or a date with no figure.           |
| `project_launch_checks_na_needs_note`     | "Not applicable" with no reason recorded.                                      |
| `subscriptions_period_forward`            | A period that ends before it starts.                                           |

## Not yet modelled

Referrals and partner payouts, the content system, and notification
preferences beyond the per-user flags already on `users`. These arrive with
their phases.
