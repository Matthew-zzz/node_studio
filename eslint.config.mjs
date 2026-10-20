import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "react/jsx-one-expression-per-line": ["error", { allow: "single-child" }],
      "react/jsx-indent": ["error", 2],
      "react/jsx-indent-props": ["error", 2],
      "react/jsx-max-props-per-line": ["error", { maximum: 1, when: "multiline" }],
      "react/jsx-first-prop-new-line": ["error", "multiline-multiprop"],
      "react/jsx-closing-bracket-location": ["error", "tag-aligned"],
      "react/jsx-wrap-multilines": ["error", {
        declaration: "parens-new-line",
        assignment: "parens-new-line",
        return: "parens-new-line",
        arrow: "parens-new-line",
        condition: "parens-new-line",
        logical: "parens-new-line"
      }],
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["../*"], message: "Use the @/ alias across module boundaries." }]
      }]
    }
  },
  globalIgnores([".next/**", "out/**", "dist/**", ".cache/**", "next-env.d.ts", "test-results/**"])
]);
