import { describe, expect, it } from "vitest";

import { businessSchema, preferencesSchema, profileSchema } from "./schema";

const validPreferences = {
  preferredLocale: "en",
  preferredCurrency: "CAD",
  timezone: "America/Toronto",
  notifyBuildUpdates: true,
  notifyMessages: true,
  notifyDeadlineAlerts: true,
  notifyProductNews: false,
};

describe("privilege escalation is impossible through account forms", () => {
  it("strips a role smuggled into the profile payload", () => {
    // The attack: post an extra field and hope the server spreads it into the
    // update. Zod drops unknown keys, so the write can only touch declared
    // columns.
    const parsed = profileSchema.parse({ displayName: "Ada", role: "admin" });

    expect(parsed).toEqual({ displayName: "Ada" });
    expect(Object.keys(parsed)).not.toContain("role");
  });

  it("strips an id, so one account cannot target another", () => {
    const parsed = businessSchema.parse({
      businessName: "Acme",
      businessWebsite: "",
      billingCountry: "",
      taxId: "",
      id: "00000000-0000-0000-0000-000000000000",
      clerkUserId: "user_someone_else",
    });

    expect(Object.keys(parsed).sort()).toEqual(
      ["billingCountry", "businessName", "businessWebsite", "taxId"].sort(),
    );
  });

  it("strips notification columns from the profile form", () => {
    const parsed = profileSchema.parse({ displayName: "Ada", notifyProductNews: true });
    expect(Object.keys(parsed)).toEqual(["displayName"]);
  });
});

describe("business details", () => {
  it("rejects a javascript: website", () => {
    // Stored and later rendered as a link, this would be stored XSS.
    const result = businessSchema.safeParse({
      businessName: "Acme",
      businessWebsite: "javascript:alert(1)",
      billingCountry: "",
      taxId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a data: website", () => {
    const result = businessSchema.safeParse({
      businessName: "",
      businessWebsite: "data:text/html,<script>alert(1)</script>",
      billingCountry: "",
      taxId: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a normal https address", () => {
    const result = businessSchema.safeParse({
      businessName: "Acme",
      businessWebsite: "https://acme.example",
      billingCountry: "ca",
      taxId: "",
    });
    expect(result.success).toBe(true);
    // Country is normalised so storage is consistent.
    expect(result.data?.billingCountry).toBe("CA");
  });

  it("rejects a country code that is not two letters", () => {
    const result = businessSchema.safeParse({
      businessName: "",
      businessWebsite: "",
      billingCountry: "Canada",
      taxId: "",
    });
    expect(result.success).toBe(false);
  });

  it("turns empty strings into null rather than storing blanks", () => {
    const parsed = businessSchema.parse({
      businessName: "   ",
      businessWebsite: "",
      billingCountry: "",
      taxId: "",
    });
    expect(parsed.businessName).toBeNull();
    expect(parsed.businessWebsite).toBeNull();
    expect(parsed.billingCountry).toBeNull();
  });
});

describe("preferences", () => {
  it("accepts a valid set", () => {
    expect(preferencesSchema.safeParse(validPreferences).success).toBe(true);
  });

  it("rejects an unsupported locale", () => {
    const result = preferencesSchema.safeParse({
      ...validPreferences,
      preferredLocale: "de",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unsupported currency", () => {
    const result = preferencesSchema.safeParse({
      ...validPreferences,
      preferredCurrency: "XYZ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a bogus time zone", () => {
    const result = preferencesSchema.safeParse({
      ...validPreferences,
      timezone: "Mars/Olympus_Mons",
    });
    expect(result.success).toBe(false);
  });

  it("accepts any zone the runtime knows", () => {
    for (const zone of ["Europe/Paris", "Asia/Dubai", "UTC"]) {
      expect(
        preferencesSchema.safeParse({ ...validPreferences, timezone: zone }).success,
        zone,
      ).toBe(true);
    }
  });

  it("requires booleans rather than coercing truthy strings", () => {
    const result = preferencesSchema.safeParse({
      ...validPreferences,
      notifyProductNews: "yes",
    });
    expect(result.success).toBe(false);
  });
});
