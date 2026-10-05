import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Configurator } from "@/components/configurator/configurator";
import { Container } from "@/components/layout/container";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("configurator.meta");
  return {
    title: t("title"),
    description: t("description"),
    // A half-finished configuration is not a landing page.
    robots: { index: false, follow: true },
  };
}

/**
 * Configurator route.
 *
 * Synchronous on purpose, and this is load-bearing. The segment has a
 * `loading.tsx`, which wraps it in a Suspense boundary; an async page suspends
 * into that boundary and -- in this combination -- never settles. The markup
 * renders, the fallback stays mounted, the tree is never committed, and every
 * event handler beneath it silently fails to attach, with no error in dev or
 * production.
 *
 * Nothing here needs to await: the locale reaches the client configurator
 * through next-intl's provider, which it reads with `useLocale`.
 */
export default function ConfigurePage() {
  return (
    <Container width="content" className="py-12 sm:py-16">
      <Configurator />
    </Container>
  );
}
