import { z } from "zod";

import { LOCALES } from "@/config/locales";
import { isTimeZone } from "@/config/time";
import { SUPPORTED_CURRENCIES } from "@/lib/pricing/money";

/**
 * Account form validation.
 *
 * One schema per form, used by the client to decide what to show and by the
 * server action to decide what to trust. The server always re-parses: a
 * disabled button is a convenience, not a control.
 *
 * Note what is absent. Email, password and role are not editable here. Email
 * and password belong to Clerk, which owns verification and re-authentication;
 * role is an administrative act and lives behind `user:manage`. A form that
 * accepted a `role` field would be an obvious privilege-escalation hole, and
 * the safest way to avoid one is to have no such field at all.
 */

export const MAX_NAME = 120;
export const MAX_URL = 300;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable();

export const profileSchema = z.object({
  displayName: optionalText(MAX_NAME),
});

export const businessSchema = z.object({
  businessName: optionalText(MAX_NAME),
  businessWebsite: optionalText(MAX_URL).refine(
    (value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        // http(s) only: a stored `javascript:` URL rendered as a link later is
        // a cross-site scripting hole with extra steps.
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Enter a full web address starting with https://" },
  ),
  /** ISO 3166-1 alpha-2, upper-cased so storage is consistent. */
  billingCountry: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => value === "" || /^[A-Z]{2}$/.test(value), {
      message: "Use a two-letter country code.",
    })
    .transform((value) => (value === "" ? null : value)),
  taxId: optionalText(60),
});

export const preferencesSchema = z.object({
  preferredLocale: z.enum(LOCALES),
  preferredCurrency: z.enum(SUPPORTED_CURRENCIES),
  /** Validated against the runtime's own zone database. See `isTimeZone`. */
  timezone: z.string().refine(isTimeZone, { message: "Choose a valid time zone." }),
  notifyBuildUpdates: z.boolean(),
  notifyMessages: z.boolean(),
  notifyDeadlineAlerts: z.boolean(),
  notifyProductNews: z.boolean(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
export type BusinessInput = z.infer<typeof businessSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;
