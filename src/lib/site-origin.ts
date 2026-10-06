import { headers } from "next/headers";

/**
 * The origin this request arrived on.
 *
 * Read from the request rather than from a client value, for the same reason
 * the checkout's return URL is: an origin a caller can choose is an origin a
 * caller can point somewhere else. `NEXT_PUBLIC_SITE_ORIGIN` wins where it is
 * configured, so a deployment behind a custom domain builds the links its
 * customers actually see.
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_ORIGIN;
  if (configured) return configured.replace(/\/+$/, "");

  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

/**
 * The origin to put in an outbound message, or null when none is configured.
 *
 * Deliberately *not* `siteOrigin()`. That function falls back to the request's
 * own `Host` header, which is right for a redirect the same browser is about
 * to follow and wrong for a link that will sit in an inbox: an email is read
 * later, by someone else's client, and a `Host` header is attacker-chosen on
 * any request that is not routed by a trusted proxy — including a webhook.
 * A link built from it would be a phishing link we sent ourselves.
 *
 * Returning null rather than guessing means a deployment without the variable
 * set sends messages with no link, which is a visibly incomplete email rather
 * than a quietly wrong one. It also needs no request scope, so notifications
 * can be sent from a background job.
 */
export function outboundOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_SITE_ORIGIN;
  return configured ? configured.replace(/\/+$/, "") : null;
}
