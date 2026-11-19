// Shared ESLint flat config (lightweight, no internet needed after install).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const browserGlobals = Object.fromEntries([
  "AbortController", "Blob", "File", "FormData", "Headers", "URL", "URLSearchParams",
  "WebAssembly", "Window", "Worker", "atob", "btoa", "caches", "clearInterval",
  "clearTimeout", "console", "crypto", "document", "fetch", "localStorage", "location",
  "navigator", "performance", "requestAnimationFrame", "Response", "setInterval",
  "setTimeout", "window",
].map((name) => [name, "readonly"]));

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/build/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["web/**/*.{js,jsx,ts,tsx}"],
    languageOptions: { globals: browserGlobals },
  },
  {
    files: ["web/public/sw.js"],
    languageOptions: { globals: { ...browserGlobals, self: "readonly", clients: "readonly", skipWaiting: "readonly" } },
  }
);
