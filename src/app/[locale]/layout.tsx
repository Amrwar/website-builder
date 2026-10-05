import { notFound } from "next/navigation";
import { locale as localeRootParam } from "next/root-params";
import type { Metadata } from "next";
import { Geist, Geist_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";

import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { BRAND } from "@/config/brand";
import {
  DEFAULT_LOCALE,
  LOCALES,
  getLocaleDefinition,
  isLocale,
  resolveLocale,
} from "@/config/locales";
import { cn } from "@/lib/cn";
import { THEME_SCRIPT } from "@/lib/theme";
import "@/styles/globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Arabic needs a native face: falling back to a Latin grotesk produces
 * mismatched glyph weights and broken letter joining. Applied only on the
 * Arabic locale, so Latin visitors never pay for the extra family.
 */
const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  // Root params are typed as plain strings, so narrow to the `Locale` union
  // before handing the value to anything locale-aware.
  const locale = resolveLocale(await localeRootParam());
  const t = await getTranslations({ locale, namespace: "home.meta" });

  return {
    title: {
      default: `${BRAND.name} — ${t("title")}`,
      template: `%s — ${BRAND.name}`,
    },
    description: t("description"),
    applicationName: BRAND.name,
    metadataBase: new URL(`https://${BRAND.domain}`),
    alternates: {
      canonical: locale === DEFAULT_LOCALE ? "/" : `/${locale}`,
      // hreflang pairs, so each locale is indexed as an alternate of the
      // others rather than as duplicate content.
      languages: Object.fromEntries([
        ...LOCALES.map((code) => [code, code === DEFAULT_LOCALE ? "/" : `/${code}`]),
        ["x-default", "/"],
      ]),
    },
    openGraph: {
      type: "website",
      siteName: BRAND.name,
      locale,
      title: `${BRAND.name} — ${t("title")}`,
      description: t("description"),
    },
    robots: { index: true, follow: true },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;

  // The `[locale]` segment catches unknown top-level paths, so an unsupported
  // value is a genuine 404 rather than something to silently coerce.
  if (!isLocale(locale)) notFound();

  setRequestLocale(locale);

  const { direction } = getLocaleDefinition(locale);
  const t = await getTranslations("nav");

  return (
    <html
      lang={locale}
      dir={direction}
      // No `data-theme` here on purpose: the pre-paint script sets it from the
      // cookie. Reading cookies server-side would make every page dynamic.
      suppressHydrationWarning
      className={cn(
        geistSans.variable,
        geistMono.variable,
        locale === "ar" && plexArabic.variable,
        "h-full",
      )}
    >
      <head>
        <script
          // Sets the theme before first paint so `system` does not flash.
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body className="flex min-h-full flex-col antialiased">
        <a
          href="#main"
          className={cn(
            "sr-only-focusable",
            "absolute z-50 m-3 rounded-md px-4 py-2",
            "bg-action text-action-fg text-body-sm font-medium",
          )}
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider>
          <SiteHeader locale={locale} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
