"use client";

import { useState, useTransition } from "react";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PARTNER_KIND_IDS } from "@/config/growth";
import type { PartnerKind } from "@/db/schema/enums";
import { submitPartnerApplication } from "@/server/growth-actions";

/**
 * The partner application.
 *
 * Open to signed-out visitors. An agency principal deciding whether to refer
 * clients should not have to create an account to ask the question, and
 * requiring one turns a single step into two with a password in the middle.
 *
 * Collects nothing that is not needed to make the decision: who they are, how
 * to reach them, and who they work with. No commission is offered or accepted
 * here — the rate is set by a person on approval.
 */
export function PartnerApplicationForm() {
  const t = useTranslations("growth.partners.form");

  const [kind, setKind] = useState<PartnerKind>("agency");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [country, setCountry] = useState("");
  const [pitch, setPitch] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const result = await submitPartnerApplication({
        kind,
        companyName,
        contactName,
        email,
        website: website.trim() || null,
        country: country.trim() || null,
        pitch,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <Card padding="lg">
        <Callout tone="success" title={t("sent")} />
      </Card>
    );
  }

  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <h2 className="text-display-sm text-primary">{t("title")}</h2>

      {error ? <Callout tone="danger" live title={error} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("kind")}>
          <Select value={kind} onValueChange={(value) => setKind(value as PartnerKind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PARTNER_KIND_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {t(`kinds.${id}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t("company")} required>
          <Input
            value={companyName}
            maxLength={120}
            onChange={(event) => setCompanyName(event.target.value)}
          />
        </Field>

        <Field label={t("contact")} required>
          <Input
            value={contactName}
            maxLength={120}
            onChange={(event) => setContactName(event.target.value)}
          />
        </Field>

        <Field label={t("email")} required>
          <Input
            type="email"
            value={email}
            maxLength={200}
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field label={t("website")}>
          <Input
            type="url"
            value={website}
            maxLength={300}
            placeholder="https://"
            onChange={(event) => setWebsite(event.target.value)}
          />
        </Field>

        <Field label={t("country")}>
          <Input
            value={country}
            maxLength={80}
            onChange={(event) => setCountry(event.target.value)}
          />
        </Field>
      </div>

      <Field label={t("pitch")} required>
        <Textarea
          value={pitch}
          rows={4}
          maxLength={2000}
          placeholder={t("pitchPlaceholder")}
          onChange={(event) => setPitch(event.target.value)}
        />
      </Field>

      <Button
        className="self-start"
        disabled={
          pending ||
          companyName.trim().length < 2 ||
          contactName.trim().length < 2 ||
          !email.includes("@") ||
          pitch.trim().length < 20
        }
        onClick={submit}
      >
        {t("submit")}
      </Button>
    </Card>
  );
}
