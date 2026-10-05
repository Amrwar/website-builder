# Design system

## Direction

Apple-like restraint, Swiss grid structure, and a digital-factory feeling: a
build is a unit moving down a line, not an open-ended engagement.

**Deliberately avoided:** gradient washes, glassmorphism, oversized rounded
cards everywhere, decorative animation, mock browser frames, stock
illustration, and the hero-with-a-dashboard-screenshot cliché.

The thing that stops the site reading as an agency is structural, not
decorative: hairline rules, a specification panel of real numbers, and a
production-line diagram.

## Tokens

Three layers, in `src/styles/`:

```
tokens.css   raw palette and scales      --grey-900, --blue-500 …
theme.css    semantic, flips per theme   --text-primary, --surface-canvas …
             @theme inline               maps semantics to Tailwind utilities
```

Components only ever use the semantic layer. A component that reaches for a raw
palette value will be wrong in one of the two themes.

### The primary action is ink

`--action-primary-bg` is near-black in light mode and near-white in dark, not a
saturated brand colour. A product whose argument is restraint should not have a
purple button. Accent colour is reserved for state — the live rail on the
production line, status indicators — where it carries meaning.

### Spacing and type

`--spacing: 0.25rem` is declared explicitly, as are the breakpoints, because
Tailwind v4 derives the scale from it. Type is a named scale
(`text-display-2xl` … `text-caption`, `text-eyebrow`), never ad-hoc sizes.
Numerals use `data-numeric` for tabular figures so columns of numbers align.

### Dark mode

Resolved before first paint by an inline script (`src/lib/theme.ts`), from a
cookie, falling back to `prefers-color-scheme`. It is **not** read in a layout:
that would make every page dynamic. `data-theme` is absent from the server HTML
by design, with `suppressHydrationWarning` on `<html>`.

## `cn()`

`src/lib/cn.ts` configures `extendTailwindMerge` with explicit `classGroups`.
Custom tokens make `text-body-sm` (a size) and `text-secondary` (a colour)
ambiguous to the default merger, which would drop one of them. This is tested.

## Components

`src/components/ui/` — 30 primitives. Behaviour-only Radix is used for the six
things that are genuinely hard to get right (dialog, tabs, tooltip,
dropdown-menu, select, progress); everything else is ours.

```
badge        breadcrumbs   button        callout       card
checkbox     choice-card   dialog        dropdown-menu empty-state
error-state  field         icon          input         pagination
page-skeleton progress     select        separator     sheet
skeleton     spinner       status-indicator  stepper   table
tabs         timeline      toast         tooltip       overlay-styles
```

Variants are `class-variance-authority`. `src/app/[locale]/(marketing)/design-system`
renders every component in every state — it is the review surface, and a new
component is not done until it appears there.

## Required states

Every interactive component ships: default, hover, focus-visible, active,
disabled, loading, error. Every data surface ships: loading, empty, error,
success.

Two rules learned the hard way:

- `:focus-visible` must not set `border-radius` — it reshapes the element on
  focus. The outline already follows the element's own radius.
- `aria-busy` is not a built-in Tailwind variant; use `aria-[busy=true]:`.

## Motion

Purposeful only. The production line's pulse exists to turn a static row of
labels into something with direction; it is CSS-only, server-rendered, with
staggered delays on one keyframe. The unanimated state is the finished diagram,
so the reduced-motion rule in `base.css` leaves a complete graphic rather than a
half-drawn one.

Durations and easings are tokens (`duration-fast`, `ease-out-quint`). There are
no scroll-triggered reveals.

## RTL

Logical properties everywhere: `ps-`/`pe-`, `ms-`/`me-`, `start-`/`end-`,
`inline-size`. Icons that imply direction carry `rtl-flip`.

`translateX` does not mirror under `dir="rtl"`. A progress bar built with it
fills from the wrong edge in Arabic — use `inline-size` instead. This is the
single most common RTL bug in this codebase's history.

## Accessibility

- Keyboard reachable, visible focus, logical order.
- Decorative graphics use `aria-hidden`, not `role="presentation"` — the latter
  only drops the element's own semantics and leaves its children announced.
- Live regions for toasts and async errors.
- Form fields are labelled and describe their own errors.

Not yet automated: there is no axe or Lighthouse check in the pipeline. It is
listed in `docs/TESTING.md` as a known gap.

## Pitfall: route-group `loading.tsx`

A `loading.tsx` in a route group left the configurator segment permanently in
its Suspense fallback. The tree never committed. There was **no error in dev or
in production** — the page simply did nothing. Reproduced with both a
synchronous fallback and a synchronous page, so the boundary itself was the
cause. The finding is documented on `PageSkeleton` so nobody reinstates it.
