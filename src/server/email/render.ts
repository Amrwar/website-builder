import "server-only";

import { getTranslations } from "next-intl/server";

import { BRAND } from "@/config/brand";
import { getLocaleDefinition, type Locale } from "@/config/locales";
import type { NotificationKind } from "@/config/notifications";
import type { EmailMessage } from "./types";

/**
 * Composes a notification into an email in the recipient's language.
 *
 * The locale is an argument, never read from the request. The request belongs
 * to whoever triggered the notification -- often a staff member, sometimes a
 * Stripe webhook with no locale at all -- and composing in their language is
 * precisely the bug this module exists to make impossible.
 *
 * `getTranslations({ locale })` is the server-side form that takes an explicit
 * locale rather than the ambient one, which is also why notifications can be
 * sent from a route handler where `next/root-params` is unavailable.
 */
export interface NotificationEmailInput {
  kind: NotificationKind;
  locale: Locale;
  params: Record<string, string>;
  recipient: { email: string; name: string | null };
  /** Absolute URL the message points at, where there is somewhere to go. */
  actionUrl?: string | null;
}

export async function renderNotificationEmail(
  input: NotificationEmailInput,
): Promise<EmailMessage> {
  const { kind, locale, params, recipient, actionUrl } = input;

  const t = await getTranslations({ locale, namespace: "notifications" });
  const tEmail = await getTranslations({ locale, namespace: "email" });

  return composeEmail({
    locale,
    recipient,
    title: t(`${kind}.title`, params),
    body: t(`${kind}.body`, params),
    action: actionUrl ? t(`${kind}.action`) : null,
    actionUrl: actionUrl ?? null,
    greeting: recipient.name
      ? tEmail("greetingNamed", { name: recipient.name })
      : tEmail("greeting"),
    signoff: tEmail("signoff", { brand: BRAND.name }),
    why: tEmail("why"),
  });
}

/** Already-translated strings, ready to assemble. */
export interface ComposeEmailInput {
  locale: Locale;
  recipient: { email: string; name: string | null };
  title: string;
  body: string;
  action: string | null;
  actionUrl: string | null;
  greeting: string;
  signoff: string;
  why: string;
}

/**
 * Assembles the message from strings that are already in the right language.
 *
 * Separate from the translation step so that the parts most likely to be wrong
 * -- the escaping, the direction attribute, the plain-text fallback -- can be
 * tested without standing up a request context.
 */
export function composeEmail(input: ComposeEmailInput): EmailMessage {
  const { locale, recipient, title, body, action, actionUrl } = input;
  const { direction } = getLocaleDefinition(locale);

  const text = [
    input.greeting,
    "",
    title,
    body,
    ...(actionUrl && action ? ["", `${action}: ${actionUrl}`] : []),
    "",
    input.signoff,
    "",
    input.why,
  ].join("\n");

  return {
    to: recipient.email,
    ...(recipient.name ? { toName: recipient.name } : {}),
    subject: title,
    text,
    html: html({
      direction,
      locale,
      greeting: input.greeting,
      title,
      body,
      action,
      actionUrl,
      signoff: input.signoff,
      why: input.why,
    }),
    locale,
  };
}

/**
 * A deliberately plain HTML part.
 *
 * Email clients support roughly none of the stylesheet, so the design system
 * is no help here and inline styles are the only thing that survives. `dir`
 * and `lang` are on the `<html>` element rather than a wrapper because several
 * clients strip the wrapper, and an Arabic email without `dir` renders
 * left-to-right with the punctuation in the wrong place.
 */
function html(input: {
  direction: "ltr" | "rtl";
  locale: Locale;
  greeting: string;
  title: string;
  body: string;
  action: string | null;
  actionUrl?: string | null;
  signoff: string;
  why: string;
}): string {
  const align = input.direction === "rtl" ? "right" : "left";
  const button =
    input.action && input.actionUrl
      ? `<p style="margin:24px 0"><a href="${escape(input.actionUrl)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${escape(input.action)}</a></p>`
      : "";

  return `<!doctype html>
<html lang="${input.locale}" dir="${input.direction}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:24px;background:#f6f6f6;font-family:system-ui,-apple-system,Segoe UI,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px">
<tr><td style="padding:32px;text-align:${align}">
<p style="margin:0 0 16px;font-size:14px;color:#666">${escape(BRAND.name)}</p>
<p style="margin:0 0 16px;font-size:16px;color:#111">${escape(input.greeting)}</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#111">${escape(input.title)}</h1>
<p style="margin:0;font-size:16px;line-height:1.6;color:#333">${escape(input.body)}</p>
${button}
<p style="margin:24px 0 0;font-size:16px;color:#333">${escape(input.signoff)}</p>
<p style="margin:24px 0 0;font-size:12px;color:#888">${escape(input.why)}</p>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Escapes interpolated values.
 *
 * Notification parameters carry customer-supplied text -- a project name, a
 * message excerpt -- so every one of them is attacker-controlled as far as
 * this template is concerned.
 */
function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
