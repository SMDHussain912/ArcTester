// Shared ESLint flat config (lightweight, no internet needed after install).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/build/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended
);
