import type { ReactNode } from "react";

import { Container } from "@/components/layout/container";
import { Logo } from "@/components/site/logo";
import { Link } from "@/i18n/navigation";

/**
 * Authentication route group.
 *
 * Deliberately without the marketing chrome: a sign-in page with a full
 * navigation bar invites people to wander off mid-task. Just the wordmark,
 * which doubles as the way back out.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col">
      <Container width="wide" className="py-6">
        <Link href="/" className="inline-flex rounded-sm text-primary hover:opacity-70">
          <Logo />
        </Link>
      </Container>
      <div className="flex flex-1 items-start justify-center px-5 pb-16 sm:items-center sm:pb-24">
        {children}
      </div>
    </main>
  );
}
