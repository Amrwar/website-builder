import { beforeAll, describe, expect, it, vi } from "vitest";

import type * as RenderModule from "./render";

// `server-only` throws outside a server bundle, and this module is server
// code, so it is imported dynamically after the mock is in place.
vi.mock("server-only", () => ({}));

let composeEmail: typeof RenderModule.composeEmail;

beforeAll(async () => {
  ({ composeEmail } = await import("./render"));
});

const base = {
  recipient: { email: "customer@example.com", name: "Amira" },
  title: "Your build has started",
  body: "Work on BL-2026-0001 is underway.",
  action: "Follow the build",
  actionUrl: "https://buildline.dev/projects/BL-2026-0001",
  greeting: "Hello Amira,",
  signoff: "— The Buildline team",
  why: "You are receiving this because you have an account with us.",
};

describe("composeEmail", () => {
  it("uses the title as the subject", () => {
    // The subject is the only part most people read, so it has to be the
    // sentence that says what happened, not a generic banner.
    const message = composeEmail({ ...base, locale: "en" });
    expect(message.subject).toBe(base.title);
  });

  it("always produces a plain text part", () => {
    const message = composeEmail({ ...base, locale: "en" });
    expect(message.text).toContain(base.greeting);
    expect(message.text).toContain(base.title);
    expect(message.text).toContain(base.body);
    expect(message.text).toContain(base.signoff);
    // The link has to survive in text: plenty of clients show only this part.
    expect(message.text).toContain(base.actionUrl);
  });

  it("omits the action from both parts when there is nowhere to go", () => {
    const message = composeEmail({
      ...base,
      locale: "en",
      action: null,
      actionUrl: null,
    });
    expect(message.text).not.toContain("Follow the build");
    expect(message.html).not.toContain("<a href");
  });

  it("declares the direction and language on the html element", () => {
    // An Arabic email without `dir` renders left-to-right in most clients,
    // with the punctuation at the wrong end of every line.
    const arabic = composeEmail({ ...base, locale: "ar" });
    expect(arabic.html).toContain('<html lang="ar" dir="rtl">');
    expect(arabic.html).toContain("text-align:right");
    expect(arabic.locale).toBe("ar");

    const english = composeEmail({ ...base, locale: "en" });
    expect(english.html).toContain('<html lang="en" dir="ltr">');
    expect(english.html).toContain("text-align:left");
  });

  it("carries the recipient name only when there is one", () => {
    expect(composeEmail({ ...base, locale: "en" }).toName).toBe("Amira");
    expect(
      composeEmail({
        ...base,
        locale: "en",
        recipient: { email: "customer@example.com", name: null },
      }).toName,
    ).toBeUndefined();
  });

  describe("escaping", () => {
    /**
     * Every interpolated value is attacker-controlled as far as this template
     * is concerned: a project name, a sender's display name and a message
     * excerpt all come from a text input.
     */
    it("escapes customer-supplied text in the html part", () => {
      const message = composeEmail({
        ...base,
        locale: "en",
        body: '<script>alert("x")</script> & "quotes"',
      });
      expect(message.html).not.toContain("<script>");
      expect(message.html).toContain("&lt;script&gt;");
      expect(message.html).toContain("&amp;");
      expect(message.html).toContain("&quot;");
    });

    it("escapes the action url, so a crafted link cannot break the attribute", () => {
      const message = composeEmail({
        ...base,
        locale: "en",
        actionUrl: 'https://example.com/"><script>alert(1)</script>',
      });
      expect(message.html).not.toContain("<script>");
      expect(message.html).toContain("&quot;");
    });

    it("leaves the plain text part unescaped, because it is not markup", () => {
      const message = composeEmail({ ...base, locale: "en", body: "5 < 6 & true" });
      expect(message.text).toContain("5 < 6 & true");
    });
  });
});
