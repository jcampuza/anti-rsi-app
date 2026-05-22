import { defineConfig } from "eslint/config"
import tseslint from "typescript-eslint"

export default defineConfig(
  {
    ignores: [
      "**/node_modules",
      "**/dist",
      "**/dist-electron",
      "**/out",
      ".turbo",
      "artifacts",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
)
