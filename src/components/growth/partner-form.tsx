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
import {
  submitAffiliateApplication,
  submitPartnerApplication,
} from "@/server/growth-actions";

/**
 * The partner and affiliate application.
 *
 * Open to signed-out visitors. An agency principal deciding whether to refer
 * clients should not have to create an account to ask the question, and
 * requiring one turns a single step into two with a password in the middle.
 *
 * One form, two tracks, because they are two different relationships: an
 * agency briefs the work and stands behind it, an affiliate sends an audience.
 * They earn different rates and are approved on different grounds, so the form
 * asks which one you are first and then only asks for what that track needs.
 *
 * Collects nothing beyond what the decision requires. No commission is offered
 * or accepted here — the rate is set by a person on approval.
 */
export function PartnerApplicationForm() {
  const t = useTranslations("growth.partners.form");

  const [track, setTrack] = useState<"clients" | "audience">("clients");
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
      // Two tracks, two records. Sending an affiliate through the partner
      // action would file them as an agency and pay them an agency rate.
      const result =
        track === "audience"
          ? await submitAffiliateApplication({
              name: companyName,
              email,
              website: website.trim() || null,
              pitch,
            })
          : await submitPartnerApplication({
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

      <Field label={t("track")}>
        <Select
          value={track}
          onValueChange={(value) => setTrack(value as "clients" | "audience")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="clients">{t("tracks.clients")}</SelectItem>
            <SelectItem value="audience">{t("tracks.audience")}</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        {track === "clients" ? (
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
        ) : null}

        <Field label={track === "audience" ? t("audienceName") : t("company")} required>
          <Input
            value={companyName}
            maxLength={120}
            onChange={(event) => setCompanyName(event.target.value)}
          />
        </Field>

        {track === "clients" ? (
          <Field label={t("contact")} required>
            <Input
              value={contactName}
              maxLength={120}
              onChange={(event) => setContactName(event.target.value)}
            />
          </Field>
        ) : null}

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

        {track === "clients" ? (
          <Field label={t("country")}>
            <Input
              value={country}
              maxLength={80}
              onChange={(event) => setCountry(event.target.value)}
            />
          </Field>
        ) : null}
      </div>

      <Field label={track === "audience" ? t("audiencePitch") : t("pitch")} required>
        <Textarea
          value={pitch}
          rows={4}
          maxLength={2000}
          placeholder={
            track === "audience" ? t("audiencePlaceholder") : t("pitchPlaceholder")
          }
          onChange={(event) => setPitch(event.target.value)}
        />
      </Field>

      <Button
        className="self-start"
        disabled={
          pending ||
          companyName.trim().length < 2 ||
          (track === "clients" && contactName.trim().length < 2) ||
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
