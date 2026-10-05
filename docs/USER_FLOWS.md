# Customer flows

## 1. Discover → configure

The marketing home page makes its argument in the order a sceptical buyer asks
the questions:

| Section                 | Question it answers  |
| ----------------------- | -------------------- |
| Hero + production line  | What is this         |
| Products                | What does it cost    |
| Comparison              | Which one is mine    |
| Journey                 | How does it work     |
| Guarantee               | What if you fail     |
| Scope                   | Where are the limits |
| Build wall              | Is it real           |
| Design-for-me           | I have no designer   |
| **Configurator entry**  | **→ start**          |
| Portfolio, testimonials | Prove it             |
| Maintenance, referral   | Then what            |
| FAQ                     | I still have doubts  |
| Closing CTA             | **→ start**          |

The conversion point sits in the middle as well as the end: by that stage the
price, the process and the guarantee have been answered, and a reader who is
convinced should not have to scroll past four more sections to act.

Primary CTA is "Start a build" → `/configure`. Secondary explains how it works
→ `#how-it-works`.

## 2. Configure — eight steps

`/configure`, `src/components/configurator/`.

| Step        | What happens                                               |
| ----------- | ---------------------------------------------------------- |
| 1. Start    | What you are ordering, and what the guarantee covers       |
| 2. Type     | Website / system / mobile app                              |
| 3. Platform | Only for apps; conflicts are blocked                       |
| 4. Intake   | The idea, in free text, in any of the three languages      |
| 5. Scope    | The engine's assessment, with reasons                      |
| 6. Features | Capability selection, which feeds back into the assessment |
| 7. Design   | Design-it-for-me, supply brand, or existing design         |
| 8. Review   | Final tier, price, days, and what is included              |

### Rules

- **Progress persists.** The draft is written to versioned `localStorage` and
  re-validated on read, so a customer who leaves halfway returns to where they
  were. A draft whose shape no longer parses is discarded rather than crashing.
- **Changing build type resets** features and platforms — they are not
  comparable across types.
- **An impossible scope cannot be created.** Platform conflicts are blocked in
  the UI _and_ re-checked server-side.
- **Everything is re-validated on the server.** The draft is re-parsed with the
  same Zod schema in the server action; the client's copy is untrusted.
- **The assessment is never called AI.** It is described as a scope engine, and
  it shows its reasons.

### When scope exceeds the ladder

The customer is not refused. They are shown which capabilities and how many
distinct user groups pushed the build past the entry tier, and offered the
appropriate larger option — or a custom quote when no published tier fits.

### Current limit

Step 8's submit is deliberately inactive. Checkout does not exist yet, and a
button that appears to take an order and does not is worse than one that is
honestly disabled.

## 3. Account

`/sign-up` and `/sign-in` are Clerk's hosted components rendered inside our own
shell, styled from our tokens. Registration, login, password reset, email
verification, rate limiting, breach-password checks and bot defence all live
behind them.

After sign-in the customer lands on `/account`:

| Tab         | Fields                                                                                |
| ----------- | ------------------------------------------------------------------------------------- |
| Profile     | Display name. Email is read-only — Clerk owns it and the re-verification it requires. |
| Business    | Business name, website, billing country, tax ID                                       |
| Preferences | Language, currency, time zone, four notification toggles                              |

Each tab saves independently, so a validation error in a tax number cannot block
a notification change. Field errors come from the server, which is the authority
on what it accepted — mirroring the rules in two places is how they drift.

A new account is provisioned at the least-privileged role on first sight, so
sign-up does not race the Clerk webhook.

## 4. Not yet built

Everything after approval of the configured build:

**Checkout and payment** — Stripe is provisioned in sandbox; no flow exists.

**Build Room** — the signed-in project view: timeline, countdown, live preview,
files, messages, change requests, approvals. This is the core of the product
after purchase and is the largest remaining body of work.

**Asset submission** — the gate that starts the guarantee countdown. Vercel Blob
is provisioned (private store) and unused.

**Maintenance, referrals, credits** — configured with provisional figures, not
purchasable.

## Journey to status mapping

| Journey stage    | `project_status`                              |
| ---------------- | --------------------------------------------- |
| IDEA, CONFIGURE  | `draft`                                       |
| PRICE            | `quoted` / `awaiting_quote`                   |
| PAY              | `awaiting_payment`                            |
| —                | `awaiting_assets` ← countdown not yet running |
| BUILD            | `in_build` ← **countdown starts here**        |
| PREVIEW          | `in_preview`                                  |
| APPROVE          | `awaiting_approval` → `approved`              |
| LAUNCH           | `launching` → `launched`                      |
| MAINTAIN, EXPAND | post-launch, not yet modelled                 |

`awaiting_assets` has no journey stage of its own on purpose: to the customer it
is part of paying, but to the business it is the line the clock does not cross
until their assets are in.
