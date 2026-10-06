"use client";

import { useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Numeric } from "@/components/ui/numeric";
import { useToast } from "@/components/ui/toast";
import { getLocaleDefinition, resolveLocale, type Locale } from "@/config/locales";
import type { NotificationKind } from "@/config/notifications";
import { markNotificationsRead } from "@/server/notification-actions";

/**
 * One notification as the reader sees it.
 *
 * The sentence is rendered here from the kind and its stored parameters rather
 * than read back as text, because a corrected translation should fix every
 * past notification. The one thing that *is* read back is the locale: it is
 * the language the email in their inbox was written in, and the in-app copy
 * has to match it or the two disagree the moment someone switches languages.
 */
export interface NotificationView {
  id: string;
  kind: NotificationKind;
  locale: string;
  params: Record<string, string>;
  /** Pre-formatted on the server, in the viewer's zone. */
  when: string;
  unread: boolean;
  href: string | null;
}

export function NotificationList({
  items,
  unreadCount,
  viewerLocale,
}: {
  items: readonly NotificationView[];
  unreadCount: number;
  viewerLocale: Locale;
}) {
  const t = useTranslations("notifications.page");
  const tKind = useTranslations("notifications");
  // Named in the reader's language: "Arabic", not "العربية", to a French reader.
  const tLanguages = useTranslations("languages");
  const { toast } = useToast();
  const [pending, start] = useTransition();

  if (items.length === 0) {
    return <EmptyState title={t("empty")} description={t("emptyBody")} />;
  }

  const onMarkRead = () => {
    start(async () => {
      const result = await markNotificationsRead();
      if (result.ok) toast({ title: t("marked") });
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-secondary">
          {t("unreadCount", { count: unreadCount })}
        </p>
        {unreadCount > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={onMarkRead}
            disabled={pending}
            startIcon={<CheckCheck className="size-4" />}
          >
            {t("markAllRead")}
          </Button>
        ) : null}
      </div>

      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const locale = resolveLocale(item.locale);
          const definition = getLocaleDefinition(locale);
          return (
            <li key={item.id}>
              <Card
                padding="lg"
                className="flex flex-col gap-2"
                /* The notification keeps the direction it was written in. An
                   Arabic notice inside an English page reads right-to-left. */
                dir={definition.direction}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="text-body font-medium text-primary">
                    {tKind(`${item.kind}.title`, item.params)}
                  </p>
                  <p className="text-caption text-tertiary">
                    <Numeric>{item.when}</Numeric>
                  </p>
                </div>

                <p className="text-body-sm text-secondary">
                  {tKind(`${item.kind}.body`, item.params)}
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  {item.href ? (
                    <a
                      href={item.href}
                      className="duration-fast text-body-sm text-primary underline decoration-line underline-offset-4 transition-colors ease-out-quint hover:decoration-current"
                    >
                      {tKind(`${item.kind}.action`)}
                    </a>
                  ) : null}
                  {locale !== viewerLocale ? (
                    <p className="text-caption text-tertiary">
                      {t("languageNote", { language: tLanguages(locale) })}
                    </p>
                  ) : null}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
