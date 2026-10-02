import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Das Backend (FastAPI + FFmpeg) läuft lokal auf :8000; /api wird durchgereicht.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
