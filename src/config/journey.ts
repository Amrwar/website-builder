/**
 * The customer journey.
 *
 * The canonical stage sequence, used by the marketing page now and by the
 * Build Room timeline and project state machine later. Defined once so the
 * public explanation and the internal pipeline cannot drift apart.
 */

export const JOURNEY_STAGES = [
  "idea",
  "configure",
  "price",
  "pay",
  "build",
  "preview",
  "approve",
  "launch",
  "maintain",
  "expand",
] as const;

export type JourneyStage = (typeof JOURNEY_STAGES)[number];

/**
 * Where the delivery guarantee applies.
 *
 * The countdown runs from the start of `build` -- not from `pay` -- which is
 * the commercial rule that the customer's assets must be in before the clock
 * starts. Encoded here so the countdown logic reads it rather than hard-coding
 * a stage name.
 */
export const GUARANTEE_START_STAGE: JourneyStage = "build";
export const GUARANTEE_END_STAGE: JourneyStage = "approve";

/** One-based position, for display as "01", "02", ... */
export function stageNumber(stage: JourneyStage): number {
  return JOURNEY_STAGES.indexOf(stage) + 1;
}

/** Zero-padded label for the production-line numbering. */
export function stageLabel(stage: JourneyStage): string {
  return String(stageNumber(stage)).padStart(2, "0");
}
