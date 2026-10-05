import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

/**
 * Button styling, exported separately so an anchor or a locale-aware `Link`
 * can adopt the exact same appearance without this component having to
 * re-implement link behaviour (and without pulling in a slot primitive).
 *
 *   <Link href="/configure" className={buttonVariants({ variant: "primary" })}>
 */
export const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2",
    "rounded-md font-medium whitespace-nowrap",
    "transition-[background-color,border-color,color,transform]",
    "duration-fast ease-out-quint",
    // A press is felt rather than seen: 2% scale, no bounce.
    "active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-50",
    // Loading keeps the button interactive-looking but inert. `aria-busy` is
    // not one of Tailwind's built-in ARIA variants, hence the arbitrary form.
    "aria-[busy=true]:pointer-events-none",
  ],
  {
    variants: {
      variant: {
        /** Default action. Ink, not a saturated accent -- quiet and premium. */
        primary: [
          "bg-action text-action-fg",
          "hover:bg-action-hover active:bg-action-active",
        ],
        /** Equal-weight alternative alongside a primary action. */
        secondary: [
          "border border-line-strong bg-canvas text-primary",
          "hover:border-line-inverse hover:bg-hover active:bg-active",
        ],
        /** Low-emphasis action in dense surfaces (tables, toolbars). */
        ghost: ["text-secondary", "hover:bg-hover hover:text-primary active:bg-active"],
        /** Reserved for the single highest-intent conversion action per view. */
        accent: [
          "bg-action-accent text-action-accent-fg",
          "hover:bg-action-accent-hover",
        ],
        /** Destructive, irreversible actions only. */
        danger: [
          "border border-danger-line bg-danger-surface text-danger",
          "hover:border-danger hover:bg-danger hover:text-fg-inverse",
        ],
      },
      size: {
        sm: "h-8 px-3 text-body-sm",
        md: "h-10 px-4 text-body-sm",
        lg: "h-12 px-6 text-body",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">,
    VariantProps<typeof buttonVariants> {
  className?: string;
  /**
   * Declared explicitly so the button can be the child of an `asChild`
   * trigger (a Sheet or Dialog trigger, for instance), which needs to attach
   * its own ref. React 19 passes `ref` as an ordinary prop, so it reaches the
   * underlying element through the spread below.
   */
  ref?: Ref<HTMLButtonElement>;
  /**
   * Replaces the label with a spinner and marks the button busy. The rendered
   * width is preserved so surrounding layout does not shift mid-request.
   */
  loading?: boolean;
  /** Announced while `loading` is true. */
  loadingLabel?: string;
  /** Decorative leading icon. Hidden from assistive tech. */
  startIcon?: ReactNode;
  /** Decorative trailing icon. Hidden from assistive tech. */
  endIcon?: ReactNode;
}

export function Button({
  className,
  variant,
  size,
  fullWidth,
  loading = false,
  loadingLabel,
  startIcon,
  endIcon,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      // Kept enabled-but-busy rather than disabled: a disabled button loses
      // focus, which would drop the user's keyboard position on submit.
      aria-busy={loading || undefined}
      disabled={disabled}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      {...props}
    >
      {loading ? (
        <>
          <span className="absolute inset-0 grid place-items-center">
            <Spinner size={size === "lg" ? "md" : "sm"} />
          </span>
          {/* Holds the original width so the layout stays still. */}
          <span className="invisible inline-flex items-center gap-2" aria-hidden>
            {startIcon}
            {children}
            {endIcon}
          </span>
          {loadingLabel ? <span className="sr-only">{loadingLabel}</span> : null}
        </>
      ) : (
        <>
          {startIcon ? (
            <span aria-hidden className="shrink-0">
              {startIcon}
            </span>
          ) : null}
          {children}
          {endIcon ? (
            <span aria-hidden className="shrink-0">
              {endIcon}
            </span>
          ) : null}
        </>
      )}
    </button>
  );
}
