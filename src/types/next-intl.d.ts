import type { Locale } from "@/config/locales";
import type en from "@/messages/en.json";

/**
 * Binds the translation catalogue and locale union into next-intl's types.
 *
 * With this in place `t("home.hero.headline")` is checked at compile time and
 * a typo or a key removed from the catalogue fails `tsc` rather than silently
 * rendering the key path in production. English is the reference catalogue;
 * other locales are validated against it by a test.
 */
declare module "next-intl" {
  interface AppConfig {
    Messages: typeof en;
    Locale: Locale;
  }
}
