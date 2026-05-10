import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port — must match devUrl in tauri.conf.json
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: false,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          jotai: ["jotai", "jotai/utils"],
          query: ["@tanstack/react-query"],
          xlsx: ["xlsx"],
          qrcode: ["qrcode"],
        },
      },
    },
  },
});
