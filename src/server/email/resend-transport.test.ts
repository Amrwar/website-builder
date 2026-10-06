import { beforeAll, describe, expect, it, vi } from "vitest";

import type * as TransportModule from "./resend-transport";
import type { EmailMessage } from "./types";

vi.mock("server-only", () => ({}));

/**
 * The SDK is replaced so nothing leaves the machine, and so the exact payload
 * handed to Resend can be asserted. Everything below is about that payload --
 * the transport makes no decisions about content, only about the envelope.
 */
const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

let resendTransport: typeof TransportModule.resendTransport;

beforeAll(async () => {
  ({ resendTransport } = await import("./resend-transport"));
});

const message: EmailMessage = {
  to: "customer@example.com",
  toName: "Amira Hassan",
  subject: "Your build has started",
  text: "Work on BL-2026-0001 is underway.",
  html: "<p>Work on BL-2026-0001 is underway.</p>",
  locale: "ar",
};

const transport = () =>
  resendTransport("re_test_key", "Buildline <noreply@send.example>");

beforeAll(() => send.mockReset());

describe("resendTransport", () => {
  it("reports that it can deliver", () => {
    expect(transport().canDeliver).toBe(true);
    expect(transport().id).toBe("resend");
  });

  it("sends the composed message and returns the provider id", async () => {
    send.mockResolvedValueOnce({ data: { id: "email_123" }, error: null });

    const result = await transport().send(message);

    expect(result).toEqual({ ok: true, providerId: "email_123" });
    const [payload] = send.mock.calls.at(-1)!;
    expect(payload.from).toBe("Buildline <noreply@send.example>");
    expect(payload.subject).toBe(message.subject);
    expect(payload.text).toBe(message.text);
    expect(payload.html).toBe(message.html);
  });

  it("declares the body's language, so Arabic renders right-to-left", () => {
    send.mockResolvedValueOnce({ data: { id: "e" }, error: null });
    return transport()
      .send(message)
      .then(() => {
        const [payload] = send.mock.calls.at(-1)!;
        expect(payload.headers["Content-Language"]).toBe("ar");
      });
  });

  it("sets a reply-to a person reads", async () => {
    // A noreply sender that discards replies is hostile to the one customer
    // who does the obvious thing.
    send.mockResolvedValueOnce({ data: { id: "e" }, error: null });
    await transport().send(message);
    const [payload] = send.mock.calls.at(-1)!;
    expect(payload.replyTo).toMatch(/@/);
    expect(payload.replyTo).not.toBe(payload.from);
  });

  describe("the recipient address", () => {
    it("carries the display name when there is one", async () => {
      send.mockResolvedValueOnce({ data: { id: "e" }, error: null });
      await transport().send(message);
      expect(send.mock.calls.at(-1)![0].to).toBe('"Amira Hassan" <customer@example.com>');
    });

    it("falls back to the bare address", async () => {
      send.mockResolvedValueOnce({ data: { id: "e" }, error: null });
      const { toName: _omitted, ...withoutName } = message;
      await transport().send(withoutName);
      expect(send.mock.calls.at(-1)![0].to).toBe("customer@example.com");
    });

    it("cannot be used to add a recipient", async () => {
      // The name is whatever the customer typed into their profile, and it is
      // being interpolated into an RFC 5322 mailbox.
      send.mockResolvedValueOnce({ data: { id: "e" }, error: null });
      await transport().send({
        ...message,
        toName: 'Evil" <attacker@example.com>, "X',
      });
      const to = send.mock.calls.at(-1)![0].to as string;

      // The property that matters is not "the string mentions no other
      // address" -- harmless text can -- but that it still parses as exactly
      // one mailbox, pointing at the intended recipient. So: one angle-bracket
      // pair, nothing after it, and no comma or quote able to end the display
      // name early.
      expect(to.endsWith("<customer@example.com>")).toBe(true);
      expect(to.match(/</g)).toHaveLength(1);
      expect(to.match(/>/g)).toHaveLength(1);
      const displayName = to.slice(0, to.indexOf("<")).trim();
      expect(displayName.startsWith('"')).toBe(true);
      expect(displayName.endsWith('"')).toBe(true);
      expect(displayName.slice(1, -1)).not.toContain('"');
      expect(displayName).not.toContain(",");
    });

    it("drops a name that sanitises away to nothing", async () => {
      send.mockResolvedValueOnce({ data: { id: "e" }, error: null });
      await transport().send({ ...message, toName: '<<>>",,' });
      expect(send.mock.calls.at(-1)![0].to).toContain("customer@example.com");
    });
  });

  describe("idempotency", () => {
    it("passes the key through, so a retry cannot send twice", async () => {
      send.mockResolvedValueOnce({ data: { id: "e" }, error: null });
      await transport().send({ ...message, idempotencyKey: "notification-abc" });
      expect(send.mock.calls.at(-1)![1]).toEqual({ idempotencyKey: "notification-abc" });
    });

    it("omits the options entirely when there is no key", async () => {
      send.mockResolvedValueOnce({ data: { id: "e" }, error: null });
      await transport().send(message);
      expect(send.mock.calls.at(-1)![1]).toBeUndefined();
    });
  });

  describe("failure", () => {
    it("reports an API error without throwing", async () => {
      // Resend returns errors in the result rather than throwing; treating a
      // result as success because nothing threw is the bug being guarded.
      send.mockResolvedValueOnce({
        data: null,
        error: {
          name: "validation_error",
          message: "domain is not verified",
          statusCode: 403,
        },
      });

      const result = await transport().send(message);

      expect(result.ok).toBe(false);
      expect(result).toMatchObject({
        reason: expect.stringContaining("validation_error"),
      });
    });

    it("distinguishes a request that never completed", async () => {
      // Transient, unlike an API error, and the stored reason should say so.
      send.mockRejectedValueOnce(new Error("ETIMEDOUT"));

      const result = await transport().send(message);

      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ reason: expect.stringContaining("request_failed") });
    });

    it("truncates a long provider message, which is stored and logged", async () => {
      send.mockResolvedValueOnce({
        data: null,
        error: {
          name: "internal_server_error",
          message: "x".repeat(5000),
          statusCode: 500,
        },
      });

      const result = await transport().send(message);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason.length).toBeLessThan(260);
    });
  });
});
