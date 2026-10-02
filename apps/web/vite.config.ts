import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Das Backend (FastAPI) läuft lokal auf MMY_API_PORT (Standard 8000); /api wird durchgereicht.
const apiPort = process.env.MMY_API_PORT ?? "8000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});
