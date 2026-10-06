"use client";

import { useState, useTransition } from "react";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { UserRole } from "@/config/roles";
import { assignRole } from "@/server/admin-actions";

/**
 * Changing someone's role.
 *
 * The options come from `assignableRoles(actorRole)` on the server, so the
 * list never offers a role the actor cannot grant. That is a convenience, not
 * the control: the server re-derives the same answer and refuses regardless of
 * what gets posted, and an attempt either way lands in the audit log.
 */
export function RoleSelector({
  userId,
  currentRole,
  options,
  disabled,
  disabledReason,
}: {
  userId: string;
  currentRole: UserRole;
  options: readonly { value: UserRole; label: string }[];
  disabled?: boolean;
  disabledReason?: string;
}) {
  const t = useTranslations("adminConsole.team");
  const { toast } = useToast();
  const [role, setRole] = useState<string>(currentRole);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (disabled) {
    return <span className="text-caption text-tertiary">{disabledReason}</span>;
  }

  if (options.length === 0) {
    return <span className="text-caption text-tertiary">{t("noAssignable")}</span>;
  }

  const changed = role !== currentRole;

  return (
    <div className="flex flex-col gap-2">
      {error ? <Callout tone="danger" live title={error} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          disabled={!changed || pending}
          loading={pending}
          loadingLabel={t("saving")}
          onClick={() => {
            setError(null);
            start(async () => {
              const result = await assignRole(userId, role);
              if (!result.ok) {
                setError(result.message);
                setRole(currentRole);
                return;
              }
              toast({ title: t("changeBody"), tone: "success" });
            });
          }}
        >
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
