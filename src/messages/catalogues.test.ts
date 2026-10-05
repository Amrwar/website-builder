import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, LOCALES } from "@/config/locales";
import ar from "./ar.json";
import en from "./en.json";
import fr from "./fr.json";

const CATALOGUES: Record<string, unknown> = { en, fr, ar };

/** Flattens a catalogue to dotted key paths for structural comparison. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

/** Extracts ICU placeholder names, ignoring plural category bodies. */
function placeholders(message: string): Set<string> {
  const names = new Set<string>();
  for (const match of message.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*(?:,|\})/g)) {
    const name = match[1];
    if (name) names.add(name);
  }
  return names;
}

/** Collects every leaf string in a catalogue, keyed by its path. */
function leaves(value: unknown, prefix = "", into: Map<string, string> = new Map()) {
  if (typeof value === "string") {
    into.set(prefix, value);
    return into;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      leaves(child, prefix ? `${prefix}.${key}` : key, into);
    }
  }
  return into;
}

const referencePaths = keyPaths(en).sort();
const referenceLeaves = leaves(en);

describe("translation catalogues", () => {
  it("has a catalogue for every configured locale", () => {
    for (const locale of LOCALES) {
      expect(CATALOGUES[locale], `missing catalogue for "${locale}"`).toBeDefined();
    }
  });

  it("uses English as the reference catalogue", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });

  const translations = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

  it.each(translations)("%s has exactly the English key set", (locale) => {
    const paths = keyPaths(CATALOGUES[locale]).sort();

    const missing = referencePaths.filter((path) => !paths.includes(path));
    const extra = paths.filter((path) => !referencePaths.includes(path));

    expect(missing, `untranslated keys in "${locale}"`).toEqual([]);
    expect(extra, `keys in "${locale}" with no English counterpart`).toEqual([]);
  });

  it.each(translations)("%s preserves every ICU placeholder", (locale) => {
    const translated = leaves(CATALOGUES[locale]);
    const mismatches: string[] = [];

    for (const [path, source] of referenceLeaves) {
      const expected = placeholders(source);
      if (expected.size === 0) continue;

      const actual = placeholders(translated.get(path) ?? "");
      for (const name of expected) {
        if (!actual.has(name)) {
          mismatches.push(`${path} is missing {${name}}`);
        }
      }
    }

    // A dropped placeholder renders a broken sentence rather than throwing,
    // so it has to be caught here.
    expect(mismatches).toEqual([]);
  });

  it("has no empty strings", () => {
    for (const locale of LOCALES) {
      for (const [path, value] of leaves(CATALOGUES[locale])) {
        expect(value.trim(), `"${locale}" has an empty value at ${path}`).not.toBe("");
      }
    }
  });
});
