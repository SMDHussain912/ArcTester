import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Read private .env values for the development proxy. These are not exposed
  // to browser code because they do not use Vite's public VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    // Vercel serves from the domain root; Electron needs relative file:// URLs.
    base: process.env.VERCEL ? "/" : "./",
    server: {
      host: "0.0.0.0",
      port: 3000,
      proxy: {
        "/api": {
          target: env.API_ORIGIN || "http://localhost:4000",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
    preview: { host: "0.0.0.0", port: 3000 },
  };
});
