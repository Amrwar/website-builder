import { describe, expect, it } from "vitest";

import {
  addWorkingDays,
  deadlineFrom,
  deadlineStanding,
  isWorkingDay,
  workingDaysBetween,
} from "./deadline";

/**
 * The guarantee pays out in cash, so this arithmetic is a commercial
 * commitment rather than a convenience. The checkout says "N working days", so
 * these tests assert exactly that -- weekends excluded, time of day preserved.
 */

/** 2026-10-05 is a Monday. */
const MONDAY = new Date("2026-10-05T14:00:00.000Z");
const FRIDAY = new Date("2026-10-09T14:00:00.000Z");
const SATURDAY = new Date("2026-10-10T14:00:00.000Z");

describe("working days", () => {
  it("counts Monday to Friday as working days", () => {
    for (let i = 0; i < 5; i += 1) {
      const date = new Date(MONDAY.getTime() + i * 86_400_000);
      expect(isWorkingDay(date), date.toUTCString()).toBe(true);
    }
  });

  it("excludes Saturday and Sunday", () => {
    expect(isWorkingDay(SATURDAY)).toBe(false);
    expect(isWorkingDay(new Date("2026-10-11T14:00:00.000Z"))).toBe(false);
  });
});

describe("adding working days", () => {
  it("skips the weekend", () => {
    // Five working days from Monday is the following Monday, not Saturday.
    const due = addWorkingDays(MONDAY, 5);
    expect(due.toISOString()).toBe("2026-10-12T14:00:00.000Z");
  });

  it("carries a Friday start over the weekend", () => {
    const due = addWorkingDays(FRIDAY, 1);
    expect(due.toISOString()).toBe("2026-10-12T14:00:00.000Z");
  });

  it("preserves the time of day", () => {
    // A build that starts at 14:00 is due at 14:00, not at midnight.
    const due = addWorkingDays(MONDAY, 3);
    expect(due.getUTCHours()).toBe(14);
    expect(due.getUTCMinutes()).toBe(0);
  });

  it("handles the fourteen-day mobile guarantee", () => {
    // 14 working days from Monday 5 Oct is Friday 23 Oct: nearly three
    // calendar weeks, which is why calendar days would have been wrong.
    const due = addWorkingDays(MONDAY, 14);
    expect(due.toISOString()).toBe("2026-10-23T14:00:00.000Z");
  });

  it("returns the start instant for zero days", () => {
    expect(addWorkingDays(MONDAY, 0).toISOString()).toBe(MONDAY.toISOString());
  });

  it("refuses a negative or fractional count", () => {
    expect(() => addWorkingDays(MONDAY, -1)).toThrow(TypeError);
    expect(() => addWorkingDays(MONDAY, 2.5)).toThrow(TypeError);
  });

  it("never lands on a weekend", () => {
    for (let days = 1; days <= 30; days += 1) {
      expect(isWorkingDay(addWorkingDays(MONDAY, days)), `${days} days`).toBe(true);
    }
  });
});

describe("the deadline", () => {
  it("is computed from the start of the build", () => {
    const due = deadlineFrom(MONDAY, 5);
    expect(due?.toISOString()).toBe("2026-10-12T14:00:00.000Z");
  });

  it("is null when there is no guaranteed duration", () => {
    // A custom-quoted project has no published duration; inventing one would
    // create a commitment nobody made.
    expect(deadlineFrom(MONDAY, null)).toBeNull();
    expect(deadlineFrom(MONDAY, 0)).toBeNull();
  });
});

describe("counting working days between two instants", () => {
  it("counts forward across a weekend", () => {
    expect(workingDaysBetween(MONDAY, new Date("2026-10-12T14:00:00.000Z"))).toBe(5);
  });

  it("returns zero for the same instant", () => {
    expect(workingDaysBetween(MONDAY, MONDAY)).toBe(0);
  });

  it("goes negative once the deadline has passed", () => {
    expect(workingDaysBetween(new Date("2026-10-12T14:00:00.000Z"), MONDAY)).toBe(-5);
  });
});

describe("standing against the deadline", () => {
  const deadline = new Date("2026-10-12T14:00:00.000Z");

  it("reports comfortable when there is a week of work left", () => {
    const standing = deadlineStanding(deadline, MONDAY);
    expect(standing.level).toBe("comfortable");
    expect(standing.missed).toBe(false);
  });

  it("reports tight within three working days", () => {
    expect(deadlineStanding(deadline, new Date("2026-10-07T14:00:00.000Z")).level).toBe(
      "tight",
    );
  });

  it("reports critical on the last working day", () => {
    expect(deadlineStanding(deadline, new Date("2026-10-09T14:00:00.000Z")).level).toBe(
      "critical",
    );
  });

  it("reports missed the moment the deadline passes", () => {
    const standing = deadlineStanding(deadline, new Date("2026-10-12T14:00:01.000Z"));
    expect(standing.level).toBe("missed");
    expect(standing.missed).toBe(true);
  });

  it("treats the exact deadline instant as missed, not as met", () => {
    // The guarantee is "by" the deadline; at the instant it expires it is
    // gone. Rounding this in our own favour would be the wrong default.
    expect(deadlineStanding(deadline, deadline).missed).toBe(true);
  });
});
