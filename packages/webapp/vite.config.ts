import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
  },
  envPrefix: ["VITE_"],
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: {
      output: {
        // Vendor split — lets the browser cache stable third-party code
        // across app deploys. Heavy single deps (xlsx, qrcode) get their
        // own chunks and are only fetched on the pages that need them.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          jotai: ["jotai", "jotai/utils"],
          query: ["@tanstack/react-query"],
          xlsx: ["xlsx"],
          qrcode: ["qrcode"],
        },
      },
    },
  },
});
