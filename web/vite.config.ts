import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Electron needs relative asset URLs for file://. Vercel needs root-relative
  // URLs so client-side routes can load hashed assets from /assets/.
  base: process.env.VITE_BASE_PATH || "./",
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\\/api/, ""),
      },
    },
  },
  preview: { host: "0.0.0.0", port: 3000 },
});
