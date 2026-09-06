import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("landing supports demo navigation without serious accessibility violations", async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  const firstPartyFailures = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
      consoleErrors.push(message.text());
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === "http://127.0.0.1:4173" && response.status() >= 400) {
      firstPartyFailures.push(`${response.status()} ${url.pathname}`);
    }
  });
  await page.goto(".");
  await expect(page).toHaveTitle(/Soldi Sotto/i);
  const demo = page.getByRole("button", { name: /try demo|prova demo/i }).first();
  await expect(demo).toBeVisible();
  await page.locator(".animate-page-in").evaluateAll((elements) =>
    Promise.all(elements.flatMap((element) => element.getAnimations().map((animation) => animation.finished)))
  );

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact))).toEqual([]);

  await demo.click();
  await expect(page).toHaveURL(/\/soldi-sotto\/transactions$/);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(firstPartyFailures).toEqual([]);
  await expect(page.getByRole("heading", { name: /transactions|transazioni/i })).toBeVisible();
});

test("unsafe deep links fall back to home", async ({ page }) => {
  await page.goto("does-not-exist");
  await expect(page).toHaveURL(/\/soldi-sotto\/$/);
});

test("transaction fields remain readable on mobile before and after focus", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile form regression");
  await page.goto(".");
  await page.getByRole("button", { name: /try demo|prova demo/i }).first().click();
  await page.getByRole("button", { name: "Add transaction", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (const id of ["transaction-amount", "transaction-description", "transaction-date", "transaction-category"]) {
    const field = dialog.locator(`#${id}`);
    await expect(field).toHaveCSS("font-size", "16px");
    await field.focus();
    await expect(field).toHaveCSS("font-size", "16px");
  }
  await dialog.locator("#transaction-amount").fill("12.50");
  await dialog.locator("#transaction-description").fill("Pranzo");
  await expect(dialog.locator("#transaction-description")).toHaveValue("Pranzo");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/);
});
