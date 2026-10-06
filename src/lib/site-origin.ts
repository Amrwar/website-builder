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
