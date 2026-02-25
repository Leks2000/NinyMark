import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
    proxy: {
      "/process": {
        target: "http://localhost:8765",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:8765",
        changeOrigin: true,
      },
      "/presets": {
        target: "http://localhost:8765",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
