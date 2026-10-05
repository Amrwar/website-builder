import { getTranslations } from "next-intl/server";

import { cn } from "@/lib/cn";

/**
 * Production-line diagram.
 *
 * The visual argument of the whole site: a build is a unit moving along a
 * line, not an open-ended engagement. Five stages, evenly spaced, with a pulse
 * travelling the rail.
 *
 * Motion is purposeful rather than decorative -- it is what turns a static row
 * of labels into something that reads as a process with direction. It is also
 * entirely CSS: staggered delays on one keyframe, no JavaScript, rendered on
 * the server.
 *
 * The unanimated state is the finished diagram, so the reduced-motion rule in
 * base.css leaves a complete, legible graphic rather than a half-drawn one.
 */

const STAGES = ["idea", "configure", "build", "preview", "launch"] as const;

/** One full pass of the line, in seconds; stages are evenly offset within it. */
const CYCLE_SECONDS = 5;

export async function ProductionLine({ className }: { className?: string }) {
  const t = await getTranslations("home.productionLine");

  return (
    <div
      className={cn("w-full", className)}
      // The diagram restates the stage names already in the How It Works
      // section, so it is decoration for assistive technology.
      role="presentation"
    >
      <ol className="relative flex flex-col gap-6 sm:flex-row sm:gap-0">
        {/* Rail: horizontal on tablet and up, vertical on phones. */}
        <span
          aria-hidden
          className={cn(
            "absolute start-[0.4375rem] top-2 bottom-2 w-px bg-line",
            "sm:inset-x-0 sm:top-[0.4375rem] sm:bottom-auto sm:h-px sm:w-full",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "absolute hidden h-px bg-action-accent sm:block",
            "inset-x-0 top-[0.4375rem]",
            "origin-left rtl:origin-right",
            "animate-rail-fill",
          )}
        />

        {STAGES.map((stage, index) => (
          <li
            key={stage}
            className="relative flex flex-1 items-start gap-4 sm:flex-col sm:gap-4"
          >
            {/* Node: a filled square, echoing the production grid in the mark. */}
            <span className="relative z-10 flex size-3.5 shrink-0 items-center justify-center">
              <span className="absolute inset-0 rounded-xs bg-canvas" />
              <span
                aria-hidden
                className="absolute inset-0 animate-stage-pass rounded-xs bg-action-accent"
                style={{
                  animationDelay: `${(index * CYCLE_SECONDS) / STAGES.length}s`,
                }}
              />
              <span className="relative size-2 rounded-xs bg-line-strong" />
            </span>

            <div className="flex flex-col gap-1 sm:pe-6">
              <span className="font-mono text-caption text-tertiary" data-numeric>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-body-sm font-semibold text-primary">
                {t(`${stage}.name`)}
              </span>
              <span className="text-caption text-secondary">{t(`${stage}.detail`)}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
