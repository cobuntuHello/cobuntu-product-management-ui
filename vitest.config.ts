/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  /*
   * @iconify/react is imported by CategoryEditModal but is NOT a dependency of
   * this package -- every host app supplies it. Unaliased, the three test files
   * that reach that import fail to load, and `npm test` reports them as failures
   * with no tests run. That silence is how a stale ordering assertion reached
   * main. The real Icon is not under test here, so a stub is the right stand-in.
   */
  resolve: {
    alias: {
      "@iconify/react": fileURLToPath(
        new URL("./src/__tests__/stubs/iconify-react.tsx", import.meta.url),
      ),
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
