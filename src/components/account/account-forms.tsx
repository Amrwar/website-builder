"use client";

import { useState, useTransition } from "react";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { LOCALES, LOCALE_DEFINITIONS } from "@/config/locales";
import { SUPPORTED_CURRENCIES } from "@/lib/pricing/money";
import {
  updateBusiness,
  updatePreferences,
  updateProfile,
  type ActionResult,
} from "@/server/account-actions";

/** Values the server already holds; the forms start from these. */
export interface AccountValues {
  email: string;
  displayName: string;
  businessName: string;
  businessWebsite: string;
  billingCountry: string;
  taxId: string;
  preferredLocale: string;
  preferredCurrency: string;
  timezone: string;
  notifyBuildUpdates: boolean;
  notifyMessages: boolean;
  notifyDeadlineAlerts: boolean;
  notifyProductNews: boolean;
}

/**
 * Account forms.
 *
 * Three independent sections, each saving on its own. Splitting them means a
 * validation error in a tax number cannot block a notification change, and a
 * save is small enough to be obviously reversible.
 *
 * Field errors come back from the server action rather than being re-derived
 * here: the server is the authority on what it accepted, and mirroring the
 * rules in two places is how the two drift apart.
 */
export function AccountForms({ values }: { values: AccountValues }) {
  const t = useTranslations("account");

  return (
    <Tabs defaultValue="profile" className="w-full">
      <TabsList>
        <TabsTrigger value="profile">{t("tabs.profile")}</TabsTrigger>
        <TabsTrigger value="business">{t("tabs.business")}</TabsTrigger>
        <TabsTrigger value="preferences">{t("tabs.preferences")}</TabsTrigger>
      </TabsList>

      <TabsContent value="profile">
        <ProfileForm values={values} />
      </TabsContent>
      <TabsContent value="business">
        <BusinessForm values={values} />
      </TabsContent>
      <TabsContent value="preferences">
        <PreferencesForm values={values} />
      </TabsContent>
    </Tabs>
  );
}

/** Shared submit plumbing: pending state, field errors, success toast. */
function useSection(action: (raw: unknown) => Promise<ActionResult>) {
  const t = useTranslations("account");
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function submit(payload: unknown) {
    setFormError(null);
    setErrors({});
    start(async () => {
      const result = await action(payload);
      if (result.ok) {
        toast({ title: t("saved"), tone: "success" });
        return;
      }
      setErrors(result.fieldErrors ?? {});
      setFormError(result.message);
    });
  }

  const firstError = (field: string) => errors[field]?.[0];

  return { pending, submit, firstError, formError };
}

function SectionShell({
  children,
  pending,
  formError,
  onSubmit,
  saveLabel,
}: {
  children: React.ReactNode;
  pending: boolean;
  formError: string | null;
  onSubmit: () => void;
  saveLabel: string;
}) {
  return (
    <form
      className="flex max-w-xl flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
      {formError ? <Callout tone="danger" live title={formError} /> : null}
      <Button
        type="submit"
        loading={pending}
        loadingLabel={saveLabel}
        className="self-start"
      >
        {saveLabel}
      </Button>
    </form>
  );
}

function ProfileForm({ values }: { values: AccountValues }) {
  const t = useTranslations("account");
  const [displayName, setDisplayName] = useState(values.displayName);
  const { pending, submit, firstError, formError } = useSection(updateProfile);

  return (
    <SectionShell
      pending={pending}
      formError={formError}
      saveLabel={t("save")}
      onSubmit={() => submit({ displayName })}
    >
      {/* Email is Clerk's to change: it owns verification and the
          re-authentication that changing it requires. Read-only, not
          disabled: it is the person's own address, and disabling it dimmed
          the label to 2.3:1, dropped it from the tab order and made it
          impossible to copy. */}
      <Field label={t("email.label")} description={t("email.help")}>
        <Input value={values.email} readOnly />
      </Field>

      <Field label={t("name.label")} error={firstError("displayName")}>
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </Field>
    </SectionShell>
  );
}

function BusinessForm({ values }: { values: AccountValues }) {
  const t = useTranslations("account");
  const [form, setForm] = useState({
    businessName: values.businessName,
    businessWebsite: values.businessWebsite,
    billingCountry: values.billingCountry,
    taxId: values.taxId,
  });
  const { pending, submit, firstError, formError } = useSection(updateBusiness);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <SectionShell
      pending={pending}
      formError={formError}
      saveLabel={t("save")}
      onSubmit={() => submit(form)}
    >
      <Field label={t("business.name")} error={firstError("businessName")}>
        <Input
          value={form.businessName}
          autoComplete="organization"
          onChange={(e) => set("businessName")(e.target.value)}
        />
      </Field>
      <Field label={t("business.website")} error={firstError("businessWebsite")}>
        <Input
          value={form.businessWebsite}
          type="url"
          inputMode="url"
          placeholder="https://"
          onChange={(e) => set("businessWebsite")(e.target.value)}
        />
      </Field>
      <Field
        label={t("business.country")}
        description={t("business.countryHelp")}
        error={firstError("billingCountry")}
      >
        <Input
          value={form.billingCountry}
          maxLength={2}
          autoComplete="country"
          className="uppercase"
          onChange={(e) => set("billingCountry")(e.target.value)}
        />
      </Field>
      <Field label={t("business.taxId")} error={firstError("taxId")}>
        <Input value={form.taxId} onChange={(e) => set("taxId")(e.target.value)} />
      </Field>
    </SectionShell>
  );
}

function PreferencesForm({ values }: { values: AccountValues }) {
  const t = useTranslations("account");
  const [form, setForm] = useState({
    preferredLocale: values.preferredLocale,
    preferredCurrency: values.preferredCurrency,
    timezone: values.timezone,
    notifyBuildUpdates: values.notifyBuildUpdates,
    notifyMessages: values.notifyMessages,
    notifyDeadlineAlerts: values.notifyDeadlineAlerts,
    notifyProductNews: values.notifyProductNews,
  });
  const { pending, submit, firstError, formError } = useSection(updatePreferences);

  // Offered from the runtime's own database so the list cannot go stale.
  const zones =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [form.timezone];

  return (
    <SectionShell
      pending={pending}
      formError={formError}
      saveLabel={t("save")}
      onSubmit={() => submit(form)}
    >
      <Field label={t("prefs.language")}>
        <Select
          value={form.preferredLocale}
          onValueChange={(v) => setForm((f) => ({ ...f, preferredLocale: v }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOCALES.map((locale) => (
              <SelectItem key={locale} value={locale}>
                {LOCALE_DEFINITIONS[locale].nativeName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label={t("prefs.currency")} description={t("prefs.currencyHelp")}>
        <Select
          value={form.preferredCurrency}
          onValueChange={(v) => setForm((f) => ({ ...f, preferredCurrency: v }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_CURRENCIES.map((currency) => (
              <SelectItem key={currency} value={currency}>
                {currency}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label={t("prefs.timezone")} error={firstError("timezone")}>
        <Select
          value={form.timezone}
          onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {zones.map((zone) => (
              <SelectItem key={zone} value={zone}>
                {zone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-body-sm font-medium text-primary">
          {t("prefs.notifications")}
        </legend>
        {(
          [
            ["notifyBuildUpdates", "buildUpdates"],
            ["notifyMessages", "messages"],
            ["notifyDeadlineAlerts", "deadlines"],
            ["notifyProductNews", "productNews"],
          ] as const
        ).map(([key, label]) => (
          <Checkbox
            key={key}
            label={t(`prefs.${label}`)}
            description={t(`prefs.${label}Help`)}
            checked={form[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
          />
        ))}
      </fieldset>
    </SectionShell>
  );
}
