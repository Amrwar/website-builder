import type { ReactNode } from "react";

import { Check } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Stepper.
 *
 * Shows position within a known, ordered sequence -- the configurator's steps,
 * or a build's stage on the production line.
 *
 * It is a presentation of state, not a control: steps are not buttons here,
 * because letting someone jump to step 4 before step 2 is answered is a
 * validation problem disguised as navigation. An ordered list with the current
 * step marked `aria-current="step"` is the whole semantic requirement.
 *
 * Completed steps show a check rather than their number, so progress is
 * readable without comparing against the current index.
 */

export type StepStatus = "complete" | "current" | "upcoming";

export interface Step {
  id: string;
  label: ReactNode;
  /** Short supporting line. Hidden on narrow screens. */
  description?: ReactNode;
}

export interface StepperProps {
  steps: Step[];
  /** Zero-based index of the current step. */
  current: number;
  /** Accessible name for the list, e.g. "Configurator steps". */
  label: string;
  /** Builds the status text announced per step, e.g. (s) => "completed". */
  statusLabel: (status: StepStatus) => string;
  orientation?: "horizontal" | "vertical";
  /**
   * The surface it sits on. The default tokens are for the page surface; on
   * the inverse panel they read light-on-light, which is how the home page's
   * "start here" stepper ended up with an invisible current step in dark mode
   * — measured at a contrast ratio of 1.0.
   */
  surface?: "default" | "inverse";
  className?: string;
}

/**
 * Text and line colours per surface. Muted text on the inverse panel is the
 * inverse ink at reduced strength rather than a second palette, matching how
 * the panel's own headings and descriptions are muted.
 */
const TONES = {
  default: {
    strong: "text-primary",
    muted: "text-secondary",
    faint: "text-tertiary",
    line: "border-line",
    rail: "bg-line",
  },
  inverse: {
    strong: "text-fg-inverse",
    muted: "text-fg-inverse/80",
    faint: "text-fg-inverse/70",
    line: "border-line-inverse/60",
    rail: "bg-line-inverse/40",
  },
} as const;

function statusOf(index: number, current: number): StepStatus {
  if (index < current) return "complete";
  if (index === current) return "current";
  return "upcoming";
}

export function Stepper({
  steps,
  current,
  label,
  statusLabel,
  orientation = "horizontal",
  surface = "default",
  className,
}: StepperProps) {
  const tone = TONES[surface];
  return (
    <ol
      aria-label={label}
      className={cn(
        orientation === "horizontal"
          ? "flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-2"
          : "flex flex-col gap-5",
        className,
      )}
    >
      {steps.map((step, index) => {
        const status = statusOf(index, current);
        const isLast = index === steps.length - 1;

        return (
          <li
            key={step.id}
            aria-current={status === "current" ? "step" : undefined}
            className={cn(
              "flex gap-3",
              orientation === "horizontal" && "sm:flex-1 sm:flex-col sm:gap-2",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-3",
                orientation === "horizontal" && "sm:w-full",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full border text-caption font-medium tabular-nums",
                  "duration-base transition-colors ease-out-quint",
                  status === "complete" && "border-action bg-action text-action-fg",
                  status === "current" && cn("border-action", tone.strong),
                  status === "upcoming" && cn(tone.line, tone.faint),
                )}
              >
                {status === "complete" ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : (
                  index + 1
                )}
              </span>

              {/* Connector, horizontal layout only. Decorative. */}
              {orientation === "horizontal" && !isLast ? (
                <span
                  aria-hidden
                  className={cn(
                    "hidden h-px flex-1 sm:block",
                    status === "complete" ? "bg-action" : tone.rail,
                  )}
                />
              ) : null}
            </div>

            <div className="flex min-w-0 flex-col gap-0.5">
              <span
                className={cn(
                  "text-body-sm",
                  status === "upcoming" ? tone.faint : cn("font-medium", tone.strong),
                )}
              >
                {step.label}
                {/* Status is announced but not shown: the visual already says it. */}
                <span className="sr-only"> — {statusLabel(status)}</span>
              </span>
              {step.description ? (
                <span className={cn("hidden text-caption sm:block", tone.muted)}>
                  {step.description}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
