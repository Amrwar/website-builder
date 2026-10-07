import { describe, expect, it } from "vitest";

import { paginationRange } from "./pagination";

const shown = (page: number, pageCount: number) =>
  paginationRange(page, pageCount).filter((slot): slot is number => slot !== null);

describe("paginationRange", () => {
  it("lists every page when they all fit", () => {
    expect(paginationRange(1, 1)).toEqual([1]);
    expect(paginationRange(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationRange(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  /**
   * The regression this exists for: the window used to grow from four slots at
   * page 1 to seven at page 4, so everything beside the control moved every
   * time somebody clicked next.
   */
  it("keeps a constant width while paging from end to end", () => {
    const widths = new Set<number>();
    for (let page = 1; page <= 12; page += 1) {
      widths.add(paginationRange(page, 12).length);
    }
    expect([...widths]).toEqual([7]);
  });

  it("always includes the first and last page, so both ends stay reachable", () => {
    for (let page = 1; page <= 20; page += 1) {
      const pages = shown(page, 20);
      expect(pages, `page ${page}`).toContain(1);
      expect(pages, `page ${page}`).toContain(20);
    }
  });

  it("includes the current page and its neighbours in the middle", () => {
    expect(paginationRange(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
  });

  it("slides the window inward at the start rather than leaving a hole", () => {
    expect(paginationRange(1, 20)).toEqual([1, 2, 3, 4, 5, null, 20]);
    expect(paginationRange(4, 20)).toEqual([1, 2, 3, 4, 5, null, 20]);
    // Page 5 is the first that can be centred.
    expect(paginationRange(5, 20)).toEqual([1, null, 4, 5, 6, null, 20]);
  });

  it("slides the window inward at the end", () => {
    expect(paginationRange(20, 20)).toEqual([1, null, 16, 17, 18, 19, 20]);
    expect(paginationRange(17, 20)).toEqual([1, null, 16, 17, 18, 19, 20]);
    expect(paginationRange(16, 20)).toEqual([1, null, 15, 16, 17, null, 20]);
  });

  it("never emits two gaps in a row, or a gap at an edge", () => {
    for (let count = 1; count <= 30; count += 1) {
      for (let page = 1; page <= count; page += 1) {
        const slots = paginationRange(page, count);
        expect(slots.at(0), `${page}/${count}`).not.toBeNull();
        expect(slots.at(-1), `${page}/${count}`).not.toBeNull();
        for (let i = 1; i < slots.length; i += 1) {
          expect(slots[i] === null && slots[i - 1] === null).toBe(false);
        }
      }
    }
  });

  it("emits strictly ascending page numbers with no duplicates", () => {
    for (let count = 1; count <= 30; count += 1) {
      for (let page = 1; page <= count; page += 1) {
        const pages = shown(page, count);
        expect(new Set(pages).size, `${page}/${count}`).toBe(pages.length);
        expect(
          [...pages].sort((a, b) => a - b),
          `${page}/${count}`,
        ).toEqual(pages);
        for (const value of pages) {
          expect(value).toBeGreaterThanOrEqual(1);
          expect(value).toBeLessThanOrEqual(count);
        }
      }
    }
  });

  describe("values it should never have been given", () => {
    // A page number comes from the query string, so it is whatever somebody
    // typed. None of these should produce a hole or an out-of-range link.
    it("anchors an out-of-range page to the nearest end", () => {
      expect(paginationRange(0, 20)).toEqual(paginationRange(1, 20));
      expect(paginationRange(-5, 20)).toEqual(paginationRange(1, 20));
      expect(paginationRange(999, 20)).toEqual(paginationRange(20, 20));
    });

    it("returns nothing to render when there are no pages", () => {
      expect(paginationRange(1, 0)).toEqual([]);
      expect(paginationRange(1, -3)).toEqual([]);
    });
  });
});
