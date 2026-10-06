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
  ]),
  {
    files: ['src/lib/**/*.ts'],
    ignores: ['src/lib/db/**'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'react', message: 'src/lib must stay framework-free.' },
          { name: 'dexie', message: 'Database access belongs in src/lib/db.' },
        ],
        patterns: [
          { group: ['next', 'next/*'], message: 'src/lib must stay framework-free.' },
        ],
      }],
    },
  },
]);

export default eslintConfig;
