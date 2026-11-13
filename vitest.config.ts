import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "firebase-admin": path.resolve(__dirname, "functions/node_modules/firebase-admin"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
