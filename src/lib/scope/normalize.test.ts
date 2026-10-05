import { describe, expect, it } from "vitest";

import { containsPhrase, firstMatch, normalize } from "./normalize";

describe("normalize", () => {
  it("lowercases and collapses punctuation", () => {
    expect(normalize("Hello,   World!")).toBe("hello world");
  });

  it("strips French accents so accented and plain spellings match", () => {
    expect(normalize("réservation")).toBe("reservation");
    expect(normalize("gérer les commandes")).toBe("gerer les commandes");
  });

  it("removes Arabic diacritics", () => {
    // "نظامًا" carries tanween that must not defeat a match.
    expect(normalize("نظامًا")).toBe("نظاما");
  });

  it("unifies Arabic alef variants", () => {
    expect(normalize("أريد")).toBe(normalize("اريد"));
    expect(normalize("إدارة")).toBe(normalize("اداره"));
  });

  it("folds the attached Arabic conjunction", () => {
    // "ويدير" is "and he manages"; the lexicon only ever lists "يدير".
    expect(normalize("ويدير")).toBe("يدير");
  });

  it("unifies Arabic sound-plural case endings", () => {
    // Nominative "الموظفون" and oblique "الموظفين" are the same group.
    expect(normalize("الموظفون")).toBe(normalize("الموظفين"));
    expect(normalize("السائقون")).toBe(normalize("السائقين"));
  });

  it("folds text and patterns identically, so folding cannot break matching", () => {
    // "وقت" genuinely starts with waw and is mangled by the fold -- which is
    // harmless precisely because both sides are folded the same way.
    expect(containsPhrase(normalize("وقت التسليم"), "وقت التسليم")).toBe(true);
  });
});

describe("containsPhrase", () => {
  it("matches on whole words only", () => {
    // The regression this guards: "order" matching inside "reorder".
    expect(containsPhrase(normalize("please reorder the list"), "order")).toBe(false);
    expect(containsPhrase(normalize("manage the order"), "order")).toBe(true);
  });

  it("matches multi-word phrases across punctuation", () => {
    expect(containsPhrase(normalize("staff manage orders, daily"), "manage orders")).toBe(
      true,
    );
  });

  it("does not match across a phrase boundary", () => {
    expect(containsPhrase(normalize("drivers manage deliveries"), "orders manage")).toBe(
      false,
    );
  });

  it("ignores an empty phrase", () => {
    expect(containsPhrase(normalize("anything"), "")).toBe(false);
  });
});

describe("firstMatch", () => {
  it("returns the matching phrase for use as evidence", () => {
    const haystack = normalize("Customers can pay online at checkout.");
    expect(firstMatch(haystack, ["subscription", "pay online"])).toBe("pay online");
  });

  it("returns undefined when nothing matches", () => {
    expect(
      firstMatch(normalize("a simple brochure site"), ["inventory"]),
    ).toBeUndefined();
  });
});
