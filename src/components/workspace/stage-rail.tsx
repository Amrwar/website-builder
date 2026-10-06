import { Check } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { stageStates } from "@/config/workspace";
import { cn } from "@/lib/cn";

/**
 * The milestone rail.
 *
 * Vertical on phones, horizontal from `sm` up. Mobile-first because a customer
 * checking on their build is, overwhelmingly, doing it on a phone -- so the
 * stacked layout is the base and the horizontal one is the enhancement.
 *
 * The stage names come from `config/workspace`, which is keyed on product
 * type: an automation shows its own sequence here without this component
 * knowing anything about automations.
 */
export async function StageRail({ stages }: { stages: ReturnType<typeof stageStates> }) {
  const t = await getTranslations("workspace");

  return (
    <ol className="relative flex flex-col gap-5 sm:flex-row sm:gap-0">
      {/* Rail. Logical insets, so it runs the right way in Arabic. */}
      <span
        aria-hidden
        className={cn(
          "absolute start-[0.4375rem] top-2 bottom-2 w-px bg-line",
          "sm:inset-x-0 sm:top-[0.4375rem] sm:bottom-auto sm:h-px sm:w-full",
        )}
      />

      {stages.map(({ stage, state }) => (
        <li
          key={stage.id}
          className="relative flex flex-1 items-start gap-3.5 sm:flex-col sm:gap-3"
          aria-current={state === "current" ? "step" : undefined}
        >
          <span
            className={cn(
              "relative z-10 grid size-3.5 shrink-0 place-items-center rounded-xs",
              state === "complete" && "bg-action-accent text-action-fg",
              state === "current" && "bg-primary",
              state === "upcoming" && "border border-line bg-canvas",
            )}
          >
            {state === "complete" ? (
              <Check className="size-2.5 text-canvas" aria-hidden />
            ) : null}
          </span>

          <div className="flex flex-col gap-0.5 sm:pe-6">
            <span
              className={cn(
                "text-body-sm",
                state === "upcoming" ? "text-tertiary" : "font-medium text-primary",
              )}
            >
              {t(`stage.${stage.id as "ordered"}`)}
            </span>
            <span className="text-caption text-tertiary">{t(`stageState.${state}`)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
