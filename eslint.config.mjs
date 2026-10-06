import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {
      /**
       * Unused code is a defect, not a style preference: it is usually a
       * half-finished change. Leading underscore is the documented escape
       * hatch for a deliberately ignored binding.
       */
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      /** A type-only import that survives to runtime can pull a server module
       * into the client bundle. Force the intent to be explicit. */
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],

      /** `console` is for debugging; the logger is for anything kept. */
      "no-console": ["warn", { allow: ["warn", "error"] }],

      "no-implicit-coercion": "error",
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
      "object-shorthand": "error",
    },
  },

  {
    // Tests and tooling legitimately log and use loose typing. `scripts/` are
    // one-off operator commands whose whole output is console.
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "*.config.{ts,mts,mjs}",
      "vitest.setup.ts",
      "scripts/**",
    ],
    rules: { "no-console": "off" },
  },

  // Must stay last: switches off every stylistic rule Prettier owns, so the
  // two tools cannot disagree about the same line.
  prettier,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "drizzle/**",
    // Vendored provider agent skills; not our source.
    ".agents/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
