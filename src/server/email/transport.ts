import "server-only";

import { logger } from "@/lib/logger";
import { resendFromEnv } from "./resend-transport";
import type { EmailMessage, EmailResult, EmailTransport } from "./types";

/**
 * The fallback when no provider credential is present.
 *
 * It records that a message *would* have been sent and reports that it cannot
 * deliver. It does not return `ok: true`, because a success from something
 * that sent nothing is how a product ends up believing it has been emailing
 * customers for a month.
 *
 * The recipient address is logged, the body is not: an email body contains
 * whatever the notification's parameters contained, and logs are a lower
 * security tier than the database.
 */
export const noopTransport: EmailTransport = {
  id: "noop",
  canDeliver: false,
  async send(message: EmailMessage): Promise<EmailResult> {
    logger.info("email not sent: no provider configured", {
      to: message.to,
      locale: message.locale,
      subjectLength: message.subject.length,
    });
    return { ok: false, reason: "no_transport" };
  },
};

/**
 * Resolves the transport for this process.
 *
 * A single function rather than a module-level constant so that configuring a
 * provider is one edit here, and so tests can pass their own transport in
 * without reaching into module state.
 */
export function emailTransport(): EmailTransport {
  // Selected on the presence of the credential, never on NODE_ENV. A deploy
  // missing the key falls back to not sending, rather than to sending from
  // somewhere unexpected -- and a developer who happens to have a key in
  // `.env.local` sends for real, which is the honest behaviour: the way to
  // not send from a laptop is to not hold a key on it.
  return resendFromEnv() ?? noopTransport;
}
