import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173/",
    trace: "on-first-retry",
    reducedMotion: "reduce",
    // The suite asserts the Italian copy and formatting: pin the browser locale
    // instead of depending on the runner's system language.
    locale: "it-IT",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    // iPad mini portrait: 744 CSS px, just under the 767px breakpoint, so the
    // tablet layout is exercised on a touch device with the mobile navigation.
    {
      name: "ipad-mini",
      use: {
        viewport: { width: 744, height: 1133 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
