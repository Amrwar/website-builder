import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/cn";
import { ShowcaseSection, Specimen } from "./specimen";

/**
 * Foundations: the tokens every component is built from.
 *
 * Every class below is written out in full rather than composed from a
 * template literal. Tailwind discovers classes by scanning source text, so a
 * constructed name like `bg-${token}` generates no CSS at all and the swatch
 * silently renders unstyled -- the one bug a token gallery must not have.
 */

const SURFACES = [
  { token: "canvas", className: "bg-canvas" },
  { token: "subtle", className: "bg-subtle" },
  { token: "sunken", className: "bg-sunken" },
  { token: "raised", className: "bg-raised" },
  { token: "overlay", className: "bg-overlay" },
  { token: "inverse", className: "bg-inverse border-line-inverse" },
] as const;

const TEXT_TONES = [
  { token: "primary", className: "text-primary" },
  { token: "secondary", className: "text-secondary" },
  { token: "tertiary", className: "text-tertiary" },
  { token: "fg-disabled", className: "text-fg-disabled" },
  { token: "accent", className: "text-accent" },
] as const;

const STATUS = [
  {
    token: "success",
    box: "bg-success-surface border-success-line",
    text: "text-success",
  },
  {
    token: "warning",
    box: "bg-warning-surface border-warning-line",
    text: "text-warning",
  },
  { token: "danger", box: "bg-danger-surface border-danger-line", text: "text-danger" },
  { token: "info", box: "bg-info-surface border-info-line", text: "text-info" },
] as const;

const BORDERS = [
  { token: "line-subtle", className: "border-line-subtle" },
  { token: "line", className: "border-line" },
  { token: "line-strong", className: "border-line-strong" },
] as const;

const TYPE_SCALE = [
  {
    token: "display-2xl",
    className: "text-display-2xl",
    sample: "Your idea. Built this week.",
  },
  {
    token: "display-xl",
    className: "text-display-xl",
    sample: "Your idea. Built this week.",
  },
  {
    token: "display-lg",
    className: "text-display-lg",
    sample: "Three products. Published price.",
  },
  {
    token: "display-md",
    className: "text-display-md",
    sample: "The deadline is ours to keep.",
  },
  { token: "display-sm", className: "text-display-sm", sample: "Inside a 5-Day Build" },
  {
    token: "body-lg",
    className: "text-body-lg",
    sample: "Configure the build, see the exact price before you pay.",
  },
  {
    token: "body",
    className: "text-body",
    sample: "Configure the build, see the exact price before you pay.",
  },
  {
    token: "body-sm",
    className: "text-body-sm",
    sample: "Configure the build, see the exact price before you pay.",
  },
  {
    token: "caption",
    className: "text-caption",
    sample: "App store review sits outside the guarantee.",
  },
  {
    token: "eyebrow",
    className: "text-eyebrow uppercase",
    sample: "Productized digital builds",
  },
] as const;

const RADIUS = [
  { token: "xs", className: "rounded-xs" },
  { token: "sm", className: "rounded-sm" },
  { token: "md", className: "rounded-md" },
  { token: "lg", className: "rounded-lg" },
  { token: "xl", className: "rounded-xl" },
] as const;

const SHADOWS = [
  { token: "sm", className: "shadow-sm" },
  { token: "md", className: "shadow-md" },
  { token: "lg", className: "shadow-lg" },
] as const;

const SPACING = [1, 2, 3, 4, 6, 8, 12, 16] as const;

const BREAKPOINTS = [
  { name: "sm", value: "40rem / 640px", use: "Large phone" },
  { name: "md", value: "48rem / 768px", use: "Tablet portrait; primary nav appears" },
  { name: "lg", value: "64rem / 1024px", use: "Small laptop; multi-column grids" },
  { name: "xl", value: "80rem / 1280px", use: "Desktop" },
  { name: "2xl", value: "96rem / 1536px", use: "Large desktop; measure takes over" },
] as const;

export function FoundationsShowcase() {
  return (
    <ShowcaseSection
      id="foundations"
      title="Foundations"
      description="Tokens, not values. Components reference these names; no component hardcodes a colour, size or duration."
    >
      <Specimen
        title="Surfaces"
        note="Depth ordering, shallow to deep. Structure comes from hairline borders; shadows are reserved for genuine overlays."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {SURFACES.map(({ token, className }) => (
            <div key={token} className="flex flex-col gap-2">
              <div className={cn("h-16 rounded-md border border-line", className)} />
              <code className="text-caption text-secondary">{token}</code>
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen
        title="Text tones"
        note="Hierarchy by weight of colour, not by size alone."
      >
        <div className="flex flex-col gap-1.5">
          {TEXT_TONES.map(({ token, className }) => (
            <p key={token} className={cn("text-body", className)}>
              {token} — Websites in 5 days. Apps in 14.
            </p>
          ))}
        </div>
      </Specimen>

      <Specimen
        title="Status colours"
        note="Each is a foreground / surface / border triplet."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STATUS.map(({ token, box, text }) => (
            <div key={token} className={cn("rounded-md border px-4 py-3", box)}>
              <p className={cn("text-body-sm font-medium", text)}>{token}</p>
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen title="Borders">
        <div className="flex flex-col gap-3">
          {BORDERS.map(({ token, className }) => (
            <div key={token} className="flex items-center gap-4">
              <div className={cn("h-10 w-40 rounded-md border", className)} />
              <code className="text-caption text-secondary">{token}</code>
            </div>
          ))}
        </div>
      </Specimen>

      <Separator />

      <Specimen
        title="Type scale"
        note="Display sizes carry negative tracking and tight leading, and clamp fluidly between phone and desktop."
      >
        <div className="flex flex-col gap-5">
          {TYPE_SCALE.map(({ token, className, sample }) => (
            <div key={token} className="flex flex-col gap-1">
              <code className="text-caption text-tertiary">text-{token}</code>
              <p className={cn("text-primary", className)}>{sample}</p>
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen
        title="Font families"
        note="Geist for Latin, IBM Plex Sans Arabic for Arabic, Geist Mono for numerals and identifiers."
      >
        <div className="flex flex-col gap-3">
          <p className="font-sans text-body-lg text-primary">
            Geist — Your idea. Built this week.
          </p>
          <p className="font-arabic text-body-lg text-primary" lang="ar" dir="rtl">
            فكرتك. منفَّذة هذا الأسبوع.
          </p>
          <p className="font-mono text-body-lg text-primary" data-numeric>
            Geist Mono — 0123456789 BL-2026-0042
          </p>
        </div>
      </Specimen>

      <Separator />

      <Specimen
        title="Spacing"
        note="One base unit of 0.25rem keeps every step on a 4px grid."
      >
        <div className="flex flex-wrap items-end gap-4">
          {SPACING.map((step) => (
            <div key={step} className="flex flex-col items-center gap-2">
              {/* Inline width: an arbitrary demo size, not a token. */}
              <div className="h-8 bg-action" style={{ width: `${step * 0.25}rem` }} />
              <code className="text-caption text-tertiary">{step}</code>
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen title="Radius" note="Restrained by design. No pills, no oversized cards.">
        <div className="flex flex-wrap gap-4">
          {RADIUS.map(({ token, className }) => (
            <div key={token} className="flex flex-col items-center gap-2">
              <div className={cn("size-16 border border-line bg-subtle", className)} />
              <code className="text-caption text-tertiary">{token}</code>
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen title="Elevation" note="Overlays only. A page of cards should read flat.">
        <div className="flex flex-wrap gap-6">
          {SHADOWS.map(({ token, className }) => (
            <div key={token} className="flex flex-col items-center gap-2">
              <div className={cn("size-20 rounded-lg bg-raised", className)} />
              <code className="text-caption text-tertiary">{token}</code>
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen
        title="Breakpoints"
        note="Mobile-first: unprefixed utilities are the small-screen case."
      >
        <dl className="flex flex-col gap-2">
          {BREAKPOINTS.map(({ name, value, use }) => (
            <div key={name} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <dt className="w-12 font-mono text-caption text-primary">{name}</dt>
              <dd className="w-40 text-caption text-secondary tabular-nums">{value}</dd>
              <dd className="text-caption text-tertiary">{use}</dd>
            </div>
          ))}
        </dl>
      </Specimen>
    </ShowcaseSection>
  );
}
