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
  await expect(page.getByRole("heading", { level: 1, name: /transactions|movimenti/i })).toBeVisible();
});

test("unsafe deep links fall back to home", async ({ page }) => {
  await page.goto("does-not-exist");
  await expect(page).toHaveURL(/\/soldi-sotto\/$/);
});

const ADD_BUTTON = /^(nuovo movimento|new transaction)$/i;

test("transaction fields remain readable on mobile before and after focus", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile form regression");
  await page.goto(".");
  await page.getByRole("button", { name: /try demo|prova demo/i }).first().click();
  await page.getByRole("button", { name: ADD_BUTTON }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("radio", { name: /other date|altra data/i }).click();
  for (const id of ["transaction-amount", "transaction-description", "transaction-date"]) {
    const field = dialog.locator(`#${id}`);
    const size = async () => parseFloat(await field.evaluate((element) => getComputedStyle(element).fontSize));
    expect(await size()).toBeGreaterThanOrEqual(16);
    await field.focus();
    expect(await size()).toBeGreaterThanOrEqual(16);
  }
  await dialog.locator("#transaction-amount").fill("12.50");
  await dialog.locator("#transaction-description").fill("Pranzo");
  await expect(dialog.locator("#transaction-description")).toHaveValue("Pranzo");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/);
});

test("adds, edits and deletes a transaction in demo mode", async ({ page, isMobile }) => {
  await page.goto(".");
  await page.getByRole("button", { name: /try demo|prova demo/i }).first().click();
  await expect(page).toHaveURL(/\/transactions$/);
  await page.getByRole("button", { name: ADD_BUTTON }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#transaction-amount").fill("12,50");
  await dialog.getByRole("radio", { name: /^(transportation|trasporti)$/i }).click();
  await dialog.locator("#transaction-description").fill("Biglietto treno");
  await dialog.getByRole("button", { name: /12,50|12\.50/ }).click();
  await expect(dialog).toBeHidden();
  const row = page.getByRole("button", { name: /Biglietto treno/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("12,50");

  await row.click();
  if (isMobile) {
    await page.getByRole("dialog").getByRole("button", { name: /^(edit|modifica)$/i }).click();
  }
  const editor = isMobile ? page.getByRole("dialog") : page.getByRole("complementary", { name: /edit transaction|modifica movimento/i });
  await editor.locator("input[inputmode=decimal]").fill("15");
  await editor.getByRole("button", { name: /save changes|salva modifiche/i }).click();
  await expect(page.getByRole("button", { name: /Biglietto treno/ })).toContainText("15,00");

  await page.getByRole("button", { name: /Biglietto treno/ }).click();
  if (isMobile) {
    await page.getByRole("dialog").getByRole("button", { name: /^(delete|elimina)$/i }).click();
  } else {
    await page.getByRole("complementary").getByRole("button", { name: /^(delete|elimina)$/i }).click();
  }
  await page.getByRole("dialog").getByRole("button", { name: /elimina definitivamente|delete permanently/i }).click();
  await expect(page.getByRole("button", { name: /Biglietto treno/ })).toHaveCount(0);
});

for (const colorScheme of ["light", "dark"]) {
  test(`app pages have no serious accessibility violations (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(".");
    await page.getByRole("button", { name: /try demo|prova demo/i }).first().click();
    await expect(page).toHaveURL(/\/transactions$/);
    for (const path of ["dashboard", "transactions", "analytics"]) {
      await page.evaluate((target) => {
        window.history.pushState({}, "", `/soldi-sotto/${target}`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact));
      expect(serious.map((violation) => `${path}: ${violation.id} ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
    }
  });
}

test("pages never scroll horizontally on mobile, even with long descriptions", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile layout regression");
  await page.goto(".");
  await page.getByRole("button", { name: /try demo|prova demo/i }).first().click();
  await page.getByRole("button", { name: ADD_BUTTON }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#transaction-amount").fill("1234,56");
  await dialog.locator("#transaction-description").fill("Canone di competenza ottobre 2026 Via La Salle 14 appartamento secondo piano interno 7");
  await dialog.getByRole("button", { name: /1\.234,56/ }).click();
  await expect(dialog).toBeHidden();
  for (const path of ["dashboard", "transactions", "analytics"]) {
    await page.evaluate((target) => {
      window.history.pushState({}, "", `/soldi-sotto/${target}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // <main> clips horizontal overflow, so check the cards themselves.
    const overflow = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll("main section, main .surface")]
      .map((element) => Math.ceil(element.getBoundingClientRect().right - window.innerWidth))));
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  }
});

test("a horizontal swipe does not change page on mobile", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Touch gesture regression");
  await page.goto(".");
  await page.getByRole("button", { name: /try demo|prova demo/i }).first().click();
  await expect(page).toHaveURL(/\/transactions$/);
  await page.locator("main h1").evaluate((element) => {
    const touch = (x) => new Touch({ identifier: 1, target: element, clientX: x, clientY: 200 });
    element.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [touch(320)], changedTouches: [touch(320)] }));
    element.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [touch(40)] }));
  });
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/transactions$/);
});
