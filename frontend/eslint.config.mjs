import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /**
     * Passing an explicit list REPLACES eslint's own default ignores, so
     * `node_modules` has to be named or it gets linted — `next dev` bundles
     * its docs under `node_modules/next/dist/docs`, which alone is ~4,700
     * findings and makes `bun run lint` unable to pass. `**​/.next/**` catches
     * build output that lands somewhere other than the project root.
     */
    "node_modules/**",
    "**/.next/**",
  ]),
]);

export default eslintConfig;
