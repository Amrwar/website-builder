import type { Schedule } from "./schedule";

/**
 * Schedule risk.
 *
 * Deterministic and explainable, by construction. The level is never decided
 * directly: every input produces zero or more **reasons**, each carrying its
 * own severity, and the level is the worst severity present. That ordering
 * matters -- it means a red project always has at least one reason attached
 * saying why, because the red came *from* the reason.
 *
 * This is not a prediction and is not described as one anywhere. It is a set
 * of thresholds a person can read, disagree with, and change.
 */

export const RISK_LEVELS = ["green", "yellow", "red"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/**
 * Why a project is at risk.
 *
 * A union rather than free text, so a reason cannot ship without the copy that
 * explains it, and so the admin queue can filter by cause.
 */
export const RISK_REASON_CODES = [
  "deadline_missed",
  "behind_schedule",
  "severely_behind",
  "tasks_blocked",
  "blocked_time_significant",
  "final_day",
  "not_started",
  "no_progress",
  "awaiting_customer",
] as const;

export type RiskReasonCode = (typeof RISK_REASON_CODES)[number];

export interface RiskReason {
  code: RiskReasonCode;
  severity: RiskLevel;
  /** Numbers behind the judgement, for display and for the audit trail. */
  detail: Record<string, number | string>;
}

export interface RiskAssessment {
  level: RiskLevel;
  reasons: readonly RiskReason[];
  /** Identifies the ruleset that produced this, as pricing does. */
  rulesetVersion: string;
}

/**
 * Thresholds, in one place so they can be argued about without reading code.
 *
 * `drift` is elapsed minus complete: at 0.15 a project has used 15 percentage
 * points more of its window than it has turned into finished work.
 */
export const RISK_THRESHOLDS = {
  driftYellow: 0.15,
  driftRed: 0.3,
  /** Blocked time counts once it is a meaningful slice of the window. */
  blockedMinutesYellow: 240,
  blockedMinutesRed: 960,
  /** Below this much elapsed, "no progress" is not yet a signal. */
  noProgressAfterElapsed: 0.25,
} as const;

export const RISK_RULESET_VERSION = "2026.10.1";

const SEVERITY_ORDER: Record<RiskLevel, number> = { green: 0, yellow: 1, red: 2 };

function worst(reasons: readonly RiskReason[]): RiskLevel {
  return reasons.reduce<RiskLevel>(
    (level, reason) =>
      SEVERITY_ORDER[reason.severity] > SEVERITY_ORDER[level] ? reason.severity : level,
    "green",
  );
}

export interface RiskInput {
  schedule: Schedule;
  /** True when the project is parked with the customer for a decision. */
  awaitingCustomer?: boolean;
}

/**
 * Assesses schedule risk.
 *
 * Returns `green` with no reasons for a healthy project, which is itself
 * informative: an empty reason list means nothing tripped, not that nothing
 * was checked.
 */
export function assessRisk(input: RiskInput): RiskAssessment {
  const { schedule, awaitingCustomer = false } = input;
  const reasons: RiskReason[] = [];

  // Before the clock runs there is no schedule to be at risk against. Saying
  // "green" here would imply we are measuring something; we are not.
  if (schedule.startedAt === null || schedule.deadlineAt === null) {
    return {
      level: "green",
      reasons: [{ code: "not_started", severity: "green", detail: {} }],
      rulesetVersion: RISK_RULESET_VERSION,
    };
  }

  const { percentElapsed, percentComplete, drift, blockedMinutes, counts } = schedule;

  // 1. The deadline has passed and the work is not finished. Nothing else
  //    matters at this point; the guarantee has already been triggered.
  if (
    schedule.workingDaysRemaining !== null &&
    schedule.workingDaysRemaining < 0 &&
    counts.remaining > 0
  ) {
    reasons.push({
      code: "deadline_missed",
      severity: "red",
      detail: {
        workingDaysOverdue: Math.abs(schedule.workingDaysRemaining),
        tasksRemaining: counts.remaining,
      },
    });
  }

  // 2. Drift: used more of the window than has turned into finished work.
  if (drift !== null && counts.remaining > 0) {
    if (drift >= RISK_THRESHOLDS.driftRed) {
      reasons.push({
        code: "severely_behind",
        severity: "red",
        detail: {
          drift: Number(drift.toFixed(3)),
          percentElapsed: Number((percentElapsed ?? 0).toFixed(3)),
          percentComplete: Number(percentComplete.toFixed(3)),
        },
      });
    } else if (drift >= RISK_THRESHOLDS.driftYellow) {
      reasons.push({
        code: "behind_schedule",
        severity: "yellow",
        detail: {
          drift: Number(drift.toFixed(3)),
          percentElapsed: Number((percentElapsed ?? 0).toFixed(3)),
          percentComplete: Number(percentComplete.toFixed(3)),
        },
      });
    }
  }

  // 3. Something is actively stuck.
  if (counts.blocked > 0) {
    reasons.push({
      code: "tasks_blocked",
      severity: "yellow",
      detail: { blockedTasks: counts.blocked },
    });
  }

  // 4. Accumulated blocked time, which is a different signal from "blocked
  //    right now" -- a project repeatedly unblocked still lost the days.
  if (blockedMinutes >= RISK_THRESHOLDS.blockedMinutesRed) {
    reasons.push({
      code: "blocked_time_significant",
      severity: "red",
      detail: { blockedMinutes },
    });
  } else if (blockedMinutes >= RISK_THRESHOLDS.blockedMinutesYellow) {
    reasons.push({
      code: "blocked_time_significant",
      severity: "yellow",
      detail: { blockedMinutes },
    });
  }

  // 5. On the last working day with work outstanding.
  if (
    schedule.workingDaysRemaining !== null &&
    schedule.workingDaysRemaining >= 0 &&
    schedule.workingDaysRemaining <= 1 &&
    counts.remaining > 0
  ) {
    reasons.push({
      code: "final_day",
      severity: "yellow",
      detail: { tasksRemaining: counts.remaining },
    });
  }

  // 6. A quarter of the window gone with nothing finished.
  if (
    percentElapsed !== null &&
    percentElapsed >= RISK_THRESHOLDS.noProgressAfterElapsed &&
    counts.done === 0 &&
    counts.total > 0
  ) {
    reasons.push({
      code: "no_progress",
      severity: "red",
      detail: { percentElapsed: Number(percentElapsed.toFixed(3)) },
    });
  }

  // 7. Parked with the customer. Recorded so the queue can tell "we are late"
  //    from "we are waiting", and deliberately green: this is not our delay,
  //    and the countdown does not run through it.
  if (awaitingCustomer) {
    reasons.push({ code: "awaiting_customer", severity: "green", detail: {} });
  }

  return {
    level: worst(reasons),
    reasons,
    rulesetVersion: RISK_RULESET_VERSION,
  };
}

/** The single most severe reason, for a one-line summary. */
export function primaryReason(assessment: RiskAssessment): RiskReason | null {
  const ranked = [...assessment.reasons].sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity],
  );
  return ranked[0] ?? null;
}
