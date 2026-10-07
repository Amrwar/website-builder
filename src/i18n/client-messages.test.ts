import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import {
  APP_CLIENT_NAMESPACES,
  CONSOLE_CLIENT_NAMESPACES,
  pickMessages,
  PUBLIC_CLIENT_NAMESPACES,
} from "./client-messages";

/**
 * Every client component must receive the namespaces it reads.
 *
 * Getting this wrong fails silently: the component renders the raw key —
 * `workspace.files.title` — to whoever is looking, with no error and no test
 * failure anywhere else. So this scans the source rather than trusting the
 * lists to be kept in step by hand.
 */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sources = walk("src")
  .filter((path) => /\.tsx?$/.test(path) && !path.includes(".test."))
  .map((path) => ({ path: path.replace(/\\/g, "/"), text: readFileSync(path, "utf8") }))
  .filter(({ text }) => /^\s*["']use client["']/.test(text));

/** Which provider a client component renders beneath, judged by where it lives. */
function tierOf(path: string): readonly string[] {
  if (path.includes("components/admin/") || path.includes("/(console)/")) {
    return CONSOLE_CLIENT_NAMESPACES;
  }
  if (
    path.includes("components/workspace/") ||
    path.includes("components/account/") ||
    path.includes("/(app)/")
  ) {
    return APP_CLIENT_NAMESPACES;
  }
  return PUBLIC_CLIENT_NAMESPACES;
}

function namespacesUsed(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(
    /useTranslations\(\s*(?:"([^"]*)"|`([^`$]*)`)?\s*\)/g,
  )) {
    const namespace = match[1] ?? match[2] ?? "";
    found.push(namespace.split(".")[0] || "(root)");
  }
  return found;
}

describe("client message namespaces", () => {
  it("finds the client components to check", () => {
    // A scan that finds nothing passes everything.
    expect(sources.length).toBeGreaterThan(30);
  });

  it("sends every namespace each client component reads", () => {
    const missing: string[] = [];
    for (const { path, text } of sources) {
      const tier = tierOf(path);
      for (const namespace of namespacesUsed(text)) {
        if (!tier.includes(namespace)) missing.push(`${path} reads "${namespace}"`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("names only namespaces that exist in the catalogue", () => {
    for (const namespace of CONSOLE_CLIENT_NAMESPACES) {
      expect(Object.keys(en), namespace).toContain(namespace);
    }
  });

  /**
   * The point of the split. The console's copy is the largest namespace in the
   * catalogue, and it used to ship to every visitor of the marketing site.
   */
  it("keeps staff console copy off public pages", () => {
    expect(PUBLIC_CLIENT_NAMESPACES).not.toContain("adminConsole");
    expect(APP_CLIENT_NAMESPACES).not.toContain("adminConsole");
  });

  it("sends public pages a fraction of the catalogue", () => {
    const full = JSON.stringify(en).length;
    const publicPart = JSON.stringify(pickMessages(en, PUBLIC_CLIENT_NAMESPACES)).length;
    expect(publicPart / full).toBeLessThan(0.6);
  });
});

describe("pickMessages", () => {
  it("keeps only the named namespaces and ignores unknown ones", () => {
    const picked = pickMessages({ a: 1, b: 2, c: 3 }, ["a", "c", "missing"]);
    expect(picked).toEqual({ a: 1, c: 3 });
  });
});
