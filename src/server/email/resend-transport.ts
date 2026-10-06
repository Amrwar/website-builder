import "server-only";

import { Resend } from "resend";

import { BRAND } from "@/config/brand";
import { serverEnv } from "@/config/env";
import { logger } from "@/lib/logger";
import type { EmailMessage, EmailResult, EmailTransport } from "./types";

/**
 * Delivery through Resend.
 *
 * The message arrives already composed and already in the recipient's
 * language; this file does nothing but post it and report what happened. That
 * separation is the point of the seam -- a transport that decided anything
 * about content would be a second place where language is chosen.
 *
 * The SDK is used rather than a hand-rolled `fetch` so the request shape comes
 * from the installed package's types rather than from memory, and so a change
 * in Resend's API surfaces as a type error at build time.
 */
export function resendTransport(apiKey: string, from: string): EmailTransport {
  // One client per process. Constructing it per send would be wasteful and
  // would defeat the SDK's own connection reuse.
  const client = new Resend(apiKey);

  return {
    id: "resend",
    canDeliver: true,

    async send(message: EmailMessage): Promise<EmailResult> {
      try {
        const { data, error } = await client.emails.send(
          {
            from,
            to: message.toName
              ? // Resend accepts "Name <addr>", which is what puts a human
                // name in the recipient's client rather than a bare address.
                `${sanitiseDisplayName(message.toName)} <${message.to}>`
              : message.to,
            subject: message.subject,
            text: message.text,
            ...(message.html ? { html: message.html } : {}),
            /**
             * Replies go to a mailbox a person reads. A `noreply` sender that
             * silently discards replies is hostile to the one customer who
             * does the obvious thing and hits reply.
             */
            replyTo: BRAND.supportEmail,
            headers: {
              // Declared so a client renders the body with the right language
              // and, for Arabic, the right direction.
              "Content-Language": message.locale,
            },
          },
          message.idempotencyKey
            ? // The notification row's id. A webhook delivered twice reaches
              // `notify` twice, and the database stops the second
              // notification -- this stops the second *email* in the window
              // before that, and after it if the row is ever resent.
              { idempotencyKey: message.idempotencyKey }
            : undefined,
        );

        if (error) {
          // Resend reports API failures in the result rather than by throwing.
          // `name` is its stable error code; the message is for humans.
          return { ok: false, reason: `${error.name}: ${truncate(error.message)}` };
        }

        return { ok: true, providerId: data?.id ?? null };
      } catch (cause) {
        // Thrown rather than returned means the request never completed: DNS,
        // TLS, a timeout. Worth distinguishing in the stored reason, because
        // this class is usually transient and an API error usually is not.
        const reason = cause instanceof Error ? cause.message : "unknown";
        logger.error("resend request failed", { reason: truncate(reason) });
        return { ok: false, reason: `request_failed: ${truncate(reason)}` };
      }
    },
  };
}

/**
 * Keeps a display name from breaking out of the address.
 *
 * The name is customer-supplied — it is whatever they typed into their
 * profile — and it is being interpolated into an RFC 5322 mailbox. A name
 * containing `<`, `>` or a comma could otherwise add a recipient.
 */
function sanitiseDisplayName(name: string): string {
  const cleaned = name.replace(/[<>,;"\\\r\n]/g, " ").trim();
  return cleaned.length > 0 ? `"${cleaned.slice(0, 78)}"` : "";
}

/** Provider messages are stored on the notification row and logged. */
function truncate(value: string): string {
  return value.length > 200 ? `${value.slice(0, 200)}…` : value;
}

/**
 * Reads the configuration, or explains precisely what is missing.
 *
 * Both values are needed: a key with no verified sender address fails on every
 * single send with an error from the provider, which is a worse failure than
 * not being configured at all.
 */
let cached: EmailTransport | null | undefined;

export function resendFromEnv(): EmailTransport | null {
  // Memoised: this is reached once per notification, and both the environment
  // and the client are process-wide. `undefined` means "not yet decided",
  // which is why it is distinct from the `null` meaning "not configured".
  if (cached !== undefined) return cached;

  const env = serverEnv();
  if (!env.RESEND_API_KEY) {
    cached = null;
    return cached;
  }

  if (!env.EMAIL_FROM) {
    // Logged once, not once per notification, for the same reason.
    logger.error(
      "RESEND_API_KEY is set but EMAIL_FROM is not, so no email will be sent. " +
        "Set EMAIL_FROM to an address on a domain verified in Resend.",
    );
    cached = null;
    return cached;
  }

  cached = resendTransport(env.RESEND_API_KEY, env.EMAIL_FROM);
  return cached;
}
