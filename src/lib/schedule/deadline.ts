/**
 * Deadline arithmetic.
 *
 * The checkout promises "N working days of development", so the deadline is
 * N business days from the moment the build officially starts -- not N
 * calendar days. The difference is a week over a fortnight's work, and the
 * guarantee pays out in cash, so it has to be the number the customer was
 * actually shown.
 *
 * ── A documented limitation ───────────────────────────────────────────────
 * Weekends are excluded. **Public holidays are not**, because they depend on
 * the jurisdiction of the team doing the work, and there is no holiday
 * calendar in the system yet. The effect is conservative in the customer's
 * favour: a holiday inside the window makes the deadline harder for us to
 * meet, never easier. When a calendar exists it plugs in at `isWorkingDay`
 * without changing any caller.
 * ──────────────────────────────────────────────────────────────────────────
 */

const MS_PER_DAY = 86_400_000;

/** Saturday and Sunday are not working days. */
export function isWorkingDay(date: Date): boolean {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * Adds a whole number of working days.
 *
 * The start instant is preserved -- the time of day a build starts is the time
 * of day it is due -- and only the date advances. A build started on a Friday
 * afternoon with one working day is due Monday afternoon, not Saturday.
 */
export function addWorkingDays(from: Date, days: number): Date {
  if (!Number.isInteger(days) || days < 0) {
    throw new TypeError(`Working days must be a non-negative integer, got ${days}.`);
  }

  const result = new Date(from.getTime());
  let remaining = days;

  while (remaining > 0) {
    result.setTime(result.getTime() + MS_PER_DAY);
    if (isWorkingDay(result)) remaining -= 1;
  }

  return result;
}

/**
 * The deadline for a build.
 *
 * Returns null when there is no guarantee to compute -- a custom-quoted
 * project has no published duration, and inventing one would create a
 * commitment nobody made.
 */
export function deadlineFrom(
  startedAt: Date,
  guaranteedDays: number | null,
): Date | null {
  if (guaranteedDays === null || guaranteedDays <= 0) return null;
  return addWorkingDays(startedAt, guaranteedDays);
}

/** Whole working days left, which may be negative once a deadline has passed. */
export function workingDaysBetween(from: Date, to: Date): number {
  const forward = to.getTime() >= from.getTime();
  const [start, end] = forward ? [from, to] : [to, from];

  let count = 0;
  const cursor = new Date(start.getTime());

  while (cursor.getTime() < end.getTime()) {
    cursor.setTime(cursor.getTime() + MS_PER_DAY);
    if (cursor.getTime() <= end.getTime() && isWorkingDay(cursor)) count += 1;
  }

  return forward ? count : -count;
}

export type DeadlineStandingLevel = "comfortable" | "tight" | "critical" | "missed";

export interface DeadlineStanding {
  level: DeadlineStandingLevel;
  workingDaysRemaining: number;
  msRemaining: number;
  missed: boolean;
}

/**
 * How a project stands against its deadline.
 *
 * The thresholds are what the Build Room shows a customer and what deadline
 * risk detection will later scan for, so they live in one place rather than
 * being re-guessed per surface.
 */
export function deadlineStanding(
  deadlineAt: Date,
  now: Date = new Date(),
): DeadlineStanding {
  const msRemaining = deadlineAt.getTime() - now.getTime();
  const workingDaysRemaining = workingDaysBetween(now, deadlineAt);

  const level: DeadlineStandingLevel =
    msRemaining <= 0
      ? "missed"
      : workingDaysRemaining <= 1
        ? "critical"
        : workingDaysRemaining <= 3
          ? "tight"
          : "comfortable";

  return {
    level,
    workingDaysRemaining,
    msRemaining,
    missed: msRemaining <= 0,
  };
}
