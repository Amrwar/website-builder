/**
 * Seeds the sellable catalogue.
 *
 * Idempotent: every row is upserted on `key`, so running it twice is safe and
 * re-running it after a price change updates the catalogue in place.
 *
 *   node --env-file=.env.local scripts/seed-products.mjs
 *
 * Prices here are the *published* figures. For `scope_assessed` products the
 * base price is the marketing "from" number only -- the sellable price comes
 * from the scope engine against a specific brief. See db/schema/products.ts.
 */
import { Client } from "pg";

const PRODUCTS = [
  {
    key: "build.website",
    type: "build",
    pricingModel: "scope_assessed",
    category: "builds",
    name: "Website build",
    description: "A marketing or brochure website, delivered to a fixed deadline.",
    translationKey: "website",
    buildType: "website",
    basePriceMinorUnits: 40000,
    includedFeatures: ["fixedPrice", "guarantee", "ownership", "responsive", "seo"],
    configurationRules: { usesScopeEngine: true, allowsPlatforms: false },
    eligibilityRules: {},
    sortOrder: 10,
  },
  {
    key: "build.system",
    type: "build",
    pricingModel: "scope_assessed",
    category: "builds",
    name: "Business system build",
    description: "An internal tool or customer-facing system with real workflows.",
    translationKey: "system",
    buildType: "system",
    basePriceMinorUnits: 40000,
    includedFeatures: ["fixedPrice", "guarantee", "ownership", "accounts", "admin"],
    configurationRules: { usesScopeEngine: true, allowsPlatforms: false },
    eligibilityRules: {},
    sortOrder: 20,
  },
  {
    key: "build.mobileApp",
    type: "build",
    pricingModel: "scope_assessed",
    category: "builds",
    name: "Mobile app build",
    description: "A constrained mobile MVP, submitted to the stores on your behalf.",
    translationKey: "mobileApp",
    buildType: "mobileApp",
    basePriceMinorUnits: 60000,
    includedFeatures: ["fixedPrice", "guarantee", "ownership", "storeSubmission"],
    configurationRules: { usesScopeEngine: true, allowsPlatforms: true },
    eligibilityRules: {},
    sortOrder: 30,
  },
  {
    key: "service.design",
    type: "design_service",
    pricingModel: "fixed",
    category: "services",
    name: "Design service",
    description: "Typography, colour and layout chosen for a business with no brand yet.",
    translationKey: "design",
    buildType: null,
    basePriceMinorUnits: 5000,
    includedFeatures: ["typography", "palette", "layout"],
    configurationRules: {},
    // Only meaningful alongside a build; enforced server-side at order time.
    eligibilityRules: { requiresBuildInSameOrder: true },
    sortOrder: 40,
  },
];

const SQL = `
insert into products (
  key, type, pricing_model, category, name, description, translation_key,
  build_type, base_price_minor_units, currency, is_active,
  configuration_rules, included_features, eligibility_rules, sort_order, updated_at
) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'CAD',true,$10,$11,$12,$13, now())
on conflict (key) do update set
  type = excluded.type,
  pricing_model = excluded.pricing_model,
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  translation_key = excluded.translation_key,
  build_type = excluded.build_type,
  base_price_minor_units = excluded.base_price_minor_units,
  configuration_rules = excluded.configuration_rules,
  included_features = excluded.included_features,
  eligibility_rules = excluded.eligibility_rules,
  sort_order = excluded.sort_order,
  updated_at = now()
`;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

for (const product of PRODUCTS) {
  await client.query(SQL, [
    product.key,
    product.type,
    product.pricingModel,
    product.category,
    product.name,
    product.description,
    product.translationKey,
    product.buildType,
    product.basePriceMinorUnits,
    JSON.stringify(product.configurationRules),
    JSON.stringify(product.includedFeatures),
    JSON.stringify(product.eligibilityRules),
    product.sortOrder,
  ]);
  console.log(`  ${product.key.padEnd(20)} ${product.type}`);
}

const { rows } = await client.query("select count(*)::int as n from products");
console.log(`\n${rows[0].n} products in the catalogue.`);
await client.end();
