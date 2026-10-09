import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.{test,spec}.{js,jsx,mjs}"],
    exclude: ["tests/firestore.rules.test.js", "tests/e2e/**", "node_modules/**", "dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html"],
      include: ["src/**/*.{js,jsx}"],
      exclude: ["src/main.jsx", "src/theme-init.js"],
      // Floor just below the current measurement: it fails on regressions and
      // should be raised as coverage of Dashboard, Profile and Stats grows.
      thresholds: { statements: 47, branches: 39, functions: 41, lines: 48 },
    },
  },
});
