import type { ComplexityBand } from "@/lib/scope";
import type { Money } from "@/lib/pricing/money";
import type { PriceLine, ProjectAssessment } from "./types";

/**
 * Reading an assessment.
 *
 * Views need particular figures out of a breakdown -- the build price on its
 * own, the design fee, the total -- and the brief is explicit that pricing
 * rules must not be scattered through React components. These selectors are
 * the alternative: a component asks for a figure by name, and no component
 * knows how a breakdown is shaped or which line kind carries what.
 *
 * Every one of them is safe on an unpriced assessment and returns null rather
 * than throwing, because "this needs a quotation" is a normal outcome and the
 * views that show a price have to render it.
 */

function lineOfKind(
  assessment: ProjectAssessment,
  kind: PriceLine["kind"],
): PriceLine | undefined {
  return assessment.price?.lines.find((line) => line.kind === kind);
}

/** The build itself, excluding the design service and any surcharges. */
export function buildPrice(assessment: ProjectAssessment): Money | null {
  return lineOfKind(assessment, "build")?.amount ?? null;
}

/** The design service fee, when "design it for me" was chosen. */
export function designFee(assessment: ProjectAssessment): Money | null {
  return lineOfKind(assessment, "design_service")?.amount ?? null;
}

/** What the customer will actually be charged, discounts and tax included. */
export function totalPrice(assessment: ProjectAssessment): Money | null {
  return assessment.price?.total ?? null;
}

/** Guaranteed working days, or null when the work has to be quoted. */
export function guaranteedDays(assessment: ProjectAssessment): number | null {
  return assessment.delivery.guaranteedDays;
}

/**
 * The band for the complexity meter.
 *
 * The meter has three positions because a customer reading it is being told
 * roughly how big their project is. A project needing a quotation is at the
 * top of that scale -- there is no fourth position to move to, and leaving the
 * meter empty would read as "no complexity" rather than "off the scale".
 */
export function complexityBand(assessment: ProjectAssessment): ComplexityBand {
  return assessment.band === "custom" ? "advanced" : assessment.band;
}
