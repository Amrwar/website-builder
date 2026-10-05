"use client";

import { ClerkLoaded, ClerkLoading, Show } from "@clerk/nextjs";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * The one auth control on the marketing site.
 *
 * Signed out it offers sign-in; signed in it offers the way into the account.
 * Both states occupy the same slot and look the same, so the header does not
 * rearrange itself when Clerk resolves.
 *
 * `<Show when="signed-in">` rather than `<SignedIn>` / `<SignedOut>`: those two
 * still exist as exports in Clerk Core 3 but throw at runtime, which takes the
 * whole page down with them. Nothing in a type check, a unit test or a
 * production build catches that -- only loading the page does.
 *
 * It is a client component on purpose. Reading the session during a server
 * render would opt every marketing page out of static generation for the sake
 * of one link; resolving in the browser keeps them prerendered and cacheable.
 *
 * Sign-out is deliberately not here. It lives in the application shell's
 * account menu, next to the page that explains what the account holds -- a
 * sign-out button one click from a pricing page is an easy mis-tap.
 */
export function AccountControl({ className }: { className?: string }) {
  const t = useTranslations("nav");

  const link = cn(
    "rounded-md px-3 py-2 text-body-sm whitespace-nowrap text-secondary",
    "duration-fast transition-colors ease-out-quint hover:bg-hover hover:text-primary",
    className,
  );

  return (
    <>
      {/* Holds the slot's width for the first paint, so the controls beside it
          do not jump once the session is known. */}
      <ClerkLoading>
        <span aria-hidden className={cn(link, "invisible")}>
          {t("signIn")}
        </span>
      </ClerkLoading>

      <ClerkLoaded>
        <Show
          when="signed-in"
          fallback={
            <Link href="/sign-in" className={link}>
              {t("signIn")}
            </Link>
          }
        >
          <Link href="/account" className={link}>
            {t("account")}
          </Link>
        </Show>
      </ClerkLoaded>
    </>
  );
}
