/**
 * Which page numbers a pager shows.
 *
 * Deliberately outside `components/ui/pagination.tsx`: that file is a client
 * component, and everything it exports is therefore a client export. The
 * admin tables are server components, and calling this from one across that
 * boundary fails at runtime with "attempted to call paginationRange() from
 * the server" -- which neither `tsc` nor `next build` catches, because it is
 * a module-boundary error rather than a type error. Keeping the pure logic in
 * a plain module lets both sides share it.
 */
/** Page numbers to show, with `null` marking a collapsed run. */
export function paginationRange(page: number, pageCount: number): (number | null)[] {
  // Seven slots is the most that stays scannable at a glance, and the count is
  // held constant so the control does not change width as you page through it.
  // The earlier version returned four slots at page 1 and seven at page 4,
  // which moved everything beside it every time somebody clicked next.
  const SLOTS = 7;

  if (pageCount <= SLOTS) {
    return Array.from({ length: Math.max(0, pageCount) }, (_, index) => index + 1);
  }

  // A page outside the range cannot be centred on; anchor to the nearest end
  // rather than producing a window with a hole in it.
  const current = Math.min(Math.max(page, 1), pageCount);

  // Near either end the window slides inward, so the gap appears on one side
  // only and the slot count still comes to seven.
  const EDGE = 4;
  if (current <= EDGE) {
    return [1, 2, 3, 4, 5, null, pageCount];
  }
  if (current >= pageCount - EDGE + 1) {
    return [
      1,
      null,
      pageCount - 4,
      pageCount - 3,
      pageCount - 2,
      pageCount - 1,
      pageCount,
    ];
  }

  return [1, null, current - 1, current, current + 1, null, pageCount];
}
