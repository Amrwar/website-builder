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
  className?: string;
}

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
  className,
}: StepperProps) {
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
                  status === "current" && "border-action text-primary",
                  status === "upcoming" && "border-line text-tertiary",
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
                    status === "complete" ? "bg-action" : "bg-line",
                  )}
                />
              ) : null}
            </div>

            <div className="flex min-w-0 flex-col gap-0.5">
              <span
                className={cn(
                  "text-body-sm",
                  status === "upcoming" ? "text-tertiary" : "font-medium text-primary",
                )}
              >
                {step.label}
                {/* Status is announced but not shown: the visual already says it. */}
                <span className="sr-only"> — {statusLabel(status)}</span>
              </span>
              {step.description ? (
                <span className="hidden text-caption text-secondary sm:block">
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
