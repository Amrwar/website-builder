import { resolveLocale } from "@/config/locales";
import { SiteShell } from "@/components/site/site-shell";
import { locale as localeRootParam } from "next/root-params";

/**
 * Marketing route group.
 *
 * Exists so the public site and the signed-in application can carry different
 * chrome without one having to undo the other's. A route group does not affect
 * the URL, so `/(marketing)/pricing` is still served at `/pricing`.
 */
export default async function MarketingLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = resolveLocale(await localeRootParam());
  return <SiteShell locale={locale}>{children}</SiteShell>;
}
