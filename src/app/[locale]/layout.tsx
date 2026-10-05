import { notFound } from "next/navigation";
import { locale as localeRootParam } from "next/root-params";
import type { Metadata } from "next";
import { Geist, Geist_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import Script from "next/script";

import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BRAND } from "@/config/brand";
import {
  DEFAULT_LOCALE,
  LOCALES,
  getLocaleDefinition,
  isLocale,
  resolveLocale,
} from "@/config/locales";
import { ToastProvider } from "@/components/ui/toast";
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
        {/*
          Sets the theme before first paint so `system` does not flash.
          `beforeInteractive` is the supported way to emit a pre-hydration
          script: it is injected into the initial HTML and runs before any
          Next.js module. A bare <script> element works too, but React 19
          warns about script tags rendered inside components.
        */}
        <Script
          id="theme-preference"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body className="flex min-h-full flex-col antialiased">
        {/* Chrome belongs to the route group, so marketing and application
         * surfaces can differ. Providers live here because they must wrap
         * every group, including the error and not-found screens. */}
        <NextIntlClientProvider>
          <ToastProvider label={t("notifications")} dismissLabel={t("dismiss")}>
            {children}
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
