import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "out/**",
    "build/**",
    "dist/**",
    "*.config.js",
    "*.config.mjs",
    "test-amazon-api.js",
    "test-amazon-getitems.js",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
