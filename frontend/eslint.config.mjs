import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** @type {import('eslint').Linter.Config[]} */
export default [
  // 1. Core Next.js & Web Vitals flat rulesets (Loaded natively)
  ...nextVitals,
  ...nextTs,

  // 2. Global Ignores
  {
    ignores: [".next/*", "node_modules/*", "dist/*", "next-env.d.ts"],
  },

  // 3. Custom Rule Overrides & Layout
  {
    rules: {
      "no-unused-vars": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "error",
      "react/self-closing-comp": "error",
      "import/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },
];
