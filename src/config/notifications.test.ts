import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { LOCALES } from "./locales";
import {
  isTransactional,
  NOTIFICATION_KIND_IDS,
  NOTIFICATION_KINDS,
  NOTIFICATION_PREFERENCES,
  notificationKind,
} from "./notifications";

const catalogues = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")) as Record<
      string,
      Record<string, Record<string, string>>
    >,
  ]),
);

describe("the notification registry", () => {
  it("names a preference that exists, or declares itself transactional", () => {
    for (const kind of NOTIFICATION_KIND_IDS) {
      const { preference } = notificationKind(kind);
      if (preference === null) continue;
      expect(NOTIFICATION_PREFERENCES, kind).toContain(preference);
    }
  });

  /**
   * The rule this pins: you cannot opt out of a receipt, and you cannot opt
   * out of being told we missed your deadline -- that notice is how a customer
   * learns they may claim a refund, so burying it behind a toggle would make
   * the guarantee depend on a setting.
   */
  it("makes money and the guarantee transactional", () => {
    for (const kind of [
      "order_paid",
      "invoice_issued",
      "refund_issued",
      "deadline_missed",
    ] as const) {
      expect(isTransactional(kind), kind).toBe(true);
    }
  });

  it("makes progress and conversation optional", () => {
    for (const kind of [
      "build_started",
      "preview_ready",
      "project_launched",
      "approval_requested",
      "message_received",
      "deadline_approaching",
      "product_news",
    ] as const) {
      expect(isTransactional(kind), kind).toBe(false);
    }
  });

  it("covers every kind: no kind is left undeclared", () => {
    expect(NOTIFICATION_KIND_IDS).toHaveLength(Object.keys(NOTIFICATION_KINDS).length);
    expect(new Set(NOTIFICATION_KIND_IDS).size).toBe(NOTIFICATION_KIND_IDS.length);
  });
});

describe("notification copy", () => {
  /**
   * A kind with no copy renders its own message path into a customer's inbox,
   * and the subject line is the first thing they see. Checked against the JSON
   * directly, in all three languages, because the type check only covers the
   * English catalogue.
   */
  it("exists in all three languages for every kind", () => {
    for (const locale of LOCALES) {
      const notifications = catalogues[locale]?.notifications;
      expect(notifications, locale).toBeDefined();
      for (const kind of NOTIFICATION_KIND_IDS) {
        const entry = notifications?.[kind];
        expect(entry, `${locale}/${kind}`).toBeDefined();
        expect(entry?.title, `${locale}/${kind}.title`).toBeTruthy();
        expect(entry?.body, `${locale}/${kind}.body`).toBeTruthy();
        expect(entry?.action, `${locale}/${kind}.action`).toBeTruthy();
      }
    }
  });

  it("uses the same ICU arguments in every language", () => {
    // A missing argument in one translation renders the placeholder to the
    // customer; an extra one is a key the sender never passes.
    const argsOf = (value: string) =>
      [...value.matchAll(/\{(\w+)/g)].map((match) => match[1]).sort();

    for (const kind of NOTIFICATION_KIND_IDS) {
      for (const field of ["title", "body"] as const) {
        const reference = argsOf(catalogues.en?.notifications?.[kind]?.[field] ?? "");
        for (const locale of LOCALES) {
          const translated = argsOf(
            catalogues[locale]?.notifications?.[kind]?.[field] ?? "",
          );
          expect(translated, `${locale}/${kind}.${field}`).toEqual(reference);
        }
      }
    }
  });

  it("has the shared email wrapper in all three languages", () => {
    for (const locale of LOCALES) {
      const email = catalogues[locale]?.email as unknown as
        Record<string, string> | undefined;
      expect(email, locale).toBeDefined();
      for (const key of ["greeting", "greetingNamed", "signoff", "why"]) {
        expect(email?.[key], `${locale}/email.${key}`).toBeTruthy();
      }
    }
  });
});
