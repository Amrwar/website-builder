import type { ReactNode } from "react";

import { Container } from "@/components/layout/container";

/**
 * Validation pages: the customer's page, not ours.
 *
 * No site header or navigation -- a visitor deciding whether they want an
 * idea should not be offered our pricing in the middle of it. The page's
 * own footer says who published it and with what.
 */
export default function ValidationLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="flex-1">
      <Container width="content" className="py-12 sm:py-20">
        {children}
      </Container>
    </main>
  );
}
