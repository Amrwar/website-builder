import type { Locale } from "@/config/locales";

/**
 * The email seam.
 *
 * Deliberately shaped the same way as `ScopeAssessor`: one narrow interface, a
 * default implementation that is honest about doing nothing, and a real
 * provider dropped in later without any caller changing. No provider is
 * configured yet, and nothing in the application pretends otherwise.
 *
 * A message arrives here already rendered and already in the recipient's
 * language. Composing is the caller's job precisely so that the transport
 * cannot accidentally become the thing that decides what language a customer
 * is written to in.
 */
export interface EmailMessage {
  to: string;
  /** Display name for the `To` header, where one is known. */
  toName?: string;
  subject: string;
  /** Plain text. Always present: it is the fallback and the accessible form. */
  text: string;
  html?: string;
  /**
   * The language the body is written in, for the `Content-Language` header and
   * for the `dir` attribute on the HTML part. An Arabic email that does not
   * declare its direction renders left-to-right in most clients.
   */
  locale: Locale;
  /**
   * Stable id for this exact message, so a retry cannot send it twice.
   *
   * Passed to the provider as an idempotency key. The notification row's id is
   * the natural value: it is unique, it already exists before the send, and it
   * survives a redelivered webhook.
   */
  idempotencyKey?: string;
}

export type EmailResult =
  | { ok: true; providerId: string | null }
  /** `reason` is for our logs and the notification row. Never a credential. */
  | { ok: false; reason: string };

export interface EmailTransport {
  /** Stable id, recorded so a delivery can be traced to what sent it. */
  readonly id: string;
  /**
   * False when the transport cannot actually deliver. The caller uses this to
   * decide whether to record an attempt at all, so a notification is not
   * marked "failed" for the entirely expected reason that no provider is
   * configured yet.
   */
  readonly canDeliver: boolean;
  send(message: EmailMessage): Promise<EmailResult>;
}
