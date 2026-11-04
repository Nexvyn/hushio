import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  envPrefix: ["VITE_", "HUSHIO_"],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    outDir: "dist",
    target: "es2022",
    chunkSizeWarningLimit: 4000,
  },
  test: {
    passWithNoTests: true,
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
