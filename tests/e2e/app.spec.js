import { Buffer } from "node:buffer";
import process from "node:process";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createVaultKeys, newRecoveryCode, unwrapVaultKey, vaultCrypto } from "../../src/utils/vaultCrypto.js";

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
  await expect(page).toHaveTitle(/Ducat/i);
  const demo = page.getByRole("button", { name: /try (the )?demo|prova (la )?demo/i }).first();
  await expect(demo).toBeVisible();
  await page.locator(".animate-page-in").evaluateAll((elements) =>
    Promise.all(elements.flatMap((element) => element.getAnimations().map((animation) => animation.finished)))
  );

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact))).toEqual([]);

  await demo.click();
  await expect(page).toHaveURL(/\/transactions$/);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(firstPartyFailures).toEqual([]);
  await expect(page.getByRole("heading", { level: 1, name: /transactions|movimenti/i })).toBeVisible();
});

test("unsafe deep links fall back to home", async ({ page }) => {
  await page.goto("does-not-exist");
  await expect(page).toHaveURL(/\/$/);
});

test("auth pages load the account client without errors", async ({ page }) => {
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) problems.push(message.text());
  });
  await page.goto("login");
  await expect(page.locator("#email")).toBeVisible();
  await page.goto("reset-password");
  await expect(page.getByText(/link (non è valido|is invalid)/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /nuovo link|new link/i })).toBeVisible();
  // Waiting for the email confirmation: the app shows the verification page.
  await page.evaluate(() => localStorage.setItem("ducat-pending-verification", "ada@example.com"));
  await page.goto("dashboard");
  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(page.getByText("ada@example.com")).toBeVisible();
  expect(problems).toEqual([]);
});

const ADD_BUTTON = /^(nuovo movimento|new transaction)$/i;

const mockVaultAccount = (uid, keys) => {
  const authUser = { id: uid, email: "vault@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { lang: "it" } };
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  const token = Buffer.from(JSON.stringify({ sub: uid, exp: expires_at, role: "authenticated", session_id: "vault-test-session" })).toString("base64url");
  const session = { access_token: `eyJhbGciOiJIUzI1NiJ9.${token}.dGVzdA`, refresh_token: "fixture", expires_at, user: authUser };
  const records = new Map();
  const pairings = new Map();
  const writes = [];
  let revision = 0;
  let active = Boolean(keys);
  const prepare = async (tab) => {
    await tab.addInitScript((auth) => {
      if (!localStorage.getItem("ducat-auth")) localStorage.setItem("ducat-auth", JSON.stringify(auth));
    }, session);
    await tab.routeWebSocket("**/realtime/v1/websocket*", () => {});
    await tab.route((url) => url.pathname.startsWith("/rest/v1/") || url.pathname.startsWith("/auth/v1/"), async (route) => {
      const endpoint = new URL(route.request().url()).pathname.split("/").at(-1);
      if (endpoint === "vault_accounts") return route.fulfill({ json: keys ? [{ keys, active, revision }] : [] });
      if (endpoint === "start_vault") {
        if (keys) return route.fulfill({ json: false });
        ({ p_keys: keys } = route.request().postDataJSON());
        return route.fulfill({ json: true });
      }
      if (endpoint === "vault_pairings") {
        const id = new URL(route.request().url()).searchParams.get("id")?.slice(3);
        const row = pairings.get(id);
        return route.fulfill({ json: row ? [row] : [] });
      }
      if (endpoint === "start_vault_pairing") {
        const { p_id, p_receiver } = route.request().postDataJSON();
        pairings.set(p_id, { receiver_public: p_receiver, sender_public: null, ciphertext: null });
        return route.fulfill({ json: true });
      }
      if (endpoint === "approve_vault_pairing") {
        const { p_id, p_sender, p_receiver, p_ciphertext } = route.request().postDataJSON();
        const request = pairings.get(p_id);
        if (request?.receiver_public !== p_receiver || request.ciphertext) return route.fulfill({ json: false });
        pairings.set(p_id, { receiver_public: p_receiver, sender_public: p_sender, ciphertext: p_ciphertext });
        return route.fulfill({ json: true });
      }
      if (endpoint === "remove_vault_pairing") {
        pairings.delete(route.request().postDataJSON().p_id);
        return route.fulfill({ status: 204 });
      }
      if (endpoint === "read_vault_legacy") return route.fulfill({ json: [] });
      if (endpoint === "finish_vault") {
        active = true;
        return route.fulfill({ json: true });
      }
      if (endpoint === "read_vault_changes") {
        const { p_after, p_id, p_through } = route.request().postDataJSON();
        return route.fulfill({ json: [...records.values()].filter((row) => row.revision <= p_through
          && (row.revision > p_after || (p_id !== null && row.revision === p_after && row.id > p_id))) });
      }
      if (endpoint === "write_vault") {
        const payload = route.request().postDataJSON();
        if (payload.p_revision !== revision) return route.fulfill({ json: false });
        revision += 1;
        writes.push(payload);
        for (const record of payload.p_changes) records.set(record.id, { ...record, revision });
        return route.fulfill({ json: true });
      }
      if (endpoint === "user") return route.fulfill({ json: authUser });
      if (endpoint === "profiles") return route.fulfill({ json: [{ username: "Ada", display_name: "Ada", email: authUser.email }] });
      return route.fulfill({ status: 404, json: { message: `Unexpected test request: ${endpoint}` } });
    });
  };
  return { prepare, records, writes, getKeys: () => keys };
};

test("unlocks an archive on two devices and persists offline writes only as ciphertext", async ({ page, browser, context }) => {
  const uid = "00000000-0000-4000-8000-0000000000aa";
  const passphrase = "a separate archive passphrase";
  const code = newRecoveryCode();
  const keys = await createVaultKeys(uid, passphrase, code);
  const key = await unwrapVaultKey(uid, keys, passphrase);
  const archive = await vaultCrypto(uid, key);
  key.fill(0);
  const { prepare, records, writes } = mockVaultAccount(uid, keys);
  await prepare(page);
  await page.goto("transactions");
  await page.getByLabel("Passphrase dell’archivio").fill("wrong passphrase");
  await page.getByRole("button", { name: /^sblocca$/i }).click();
  await expect(page.getByRole("alert")).toContainText(/non è valido/);
  await page.getByLabel("Passphrase dell’archivio").fill(passphrase);
  await page.getByRole("button", { name: /^sblocca$/i }).click();
  const description = "Movimento inserito offline";
  await expect(page.getByRole("button", { name: ADD_BUTTON }).first()).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: ADD_BUTTON }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#transaction-amount").fill("12,50");
  await dialog.getByRole("radio", { name: /^(trasporti|transportation)$/i }).click();
  await dialog.locator("#transaction-description").fill(description);
  await dialog.getByRole("button", { name: /12,50|12\.50/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: new RegExp(description) })).toBeVisible();
  expect(writes).toHaveLength(0);
  const persistedQueue = await page.evaluate((userId) => new Promise((resolve, reject) => {
    const request = indexedDB.open("ducat-encrypted-archive");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const record = db.transaction("accounts").objectStore("accounts").get(`${userId}:queue`);
      record.onsuccess = () => { db.close(); resolve(record.result); };
      record.onerror = () => reject(record.error);
    };
  }), uid);
  expect(persistedQueue).not.toContain(description);
  expect(JSON.stringify(await archive.open(persistedQueue, "queue"))).toContain(description);
  await context.setOffline(false);
  await expect.poll(() => writes.length).toBe(1);
  const [record] = [...records.values()];
  expect(JSON.stringify(writes)).not.toContain(description);
  expect(await archive.open(record.ciphertext, "record", record.id)).toMatchObject({ value: { description, amount_minor: 1250 } });

  const second = await browser.newContext({ locale: "it-IT", baseURL: page.url() });
  try {
    const tab = await second.newPage();
    await prepare(tab);
    await tab.goto("/reset-password");
    await expect(tab.locator("#new-password")).toBeVisible();
    await tab.goto(page.url());
    await tab.getByRole("button", { name: "Usa il codice di recupero" }).click();
    await tab.getByLabel("Codice di recupero", { exact: true }).fill(code);
    await tab.getByRole("button", { name: /^sblocca$/i }).click();
    await expect(tab.getByRole("button", { name: new RegExp(description) })).toContainText("12,50");
  } finally {
    await second.close();
  }
});

test("activates an archive with a device PIN and resumes or recovers on demand", async ({ page, browser, context }) => {
  test.skip(process.env.VITE_ENABLE_ENCRYPTED_VAULT !== "true", "New activation is opt-in for test builds");
  test.setTimeout(60_000);
  const uid = "00000000-0000-4000-8000-0000000000bb";
  const pin = "012345";
  const fixture = mockVaultAccount(uid);
  const fillPin = async (tab, value) => {
    await tab.getByLabel("Scegli un PIN di 6 cifre").fill(value);
    await tab.getByLabel("Conferma il PIN").fill(value);
  };
  const unlock = (tab) => tab.getByRole("button", { name: /^sblocca$/i }).click();
  const ready = (tab) => expect(tab.getByRole("button", { name: ADD_BUTTON }).first()).toBeVisible();

  await fixture.prepare(page);
  await page.goto("transactions");
  const recoveryCode = await page.locator("#archive-recovery-code").innerText();
  expect(recoveryCode).toMatch(/^[a-f0-9-]{71}$/);
  await fillPin(page, pin);
  await page.getByLabel("Ho salvato il codice di recupero").check();
  await page.getByLabel("Ricorda lo sblocco su questo dispositivo").check();
  await page.getByRole("button", { name: "Attiva la cifratura" }).click();
  await ready(page);
  expect(fixture.getKeys()).toEqual({ v: 2, recovery: expect.stringMatching(/^[A-Za-z0-9+/]{80}$/) });
  await page.reload();
  await ready(page);

  const anotherTab = await context.newPage();
  await fixture.prepare(anotherTab);
  await anotherTab.goto(page.url());
  await ready(anotherTab);
  await anotherTab.close();

  await page.evaluate((userId) => new Promise((resolve, reject) => {
    const request = indexedDB.open("ducat-encrypted-archive");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("accounts", "readwrite");
      transaction.objectStore("accounts").delete(`${userId}:device-unlock`);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => reject(transaction.error);
    };
  }), uid);
  await page.reload();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.getByLabel("PIN del dispositivo", { exact: true }).fill("999999");
    await unlock(page);
    await expect(page.getByRole("alert")).toContainText(attempt === 4 ? /esaurito i tentativi/ : /PIN del dispositivo è errato/);
  }
  await page.reload();
  await expect(page.getByLabel("Codice di recupero", { exact: true })).toBeVisible();
  await page.getByLabel("Codice di recupero", { exact: true }).fill(recoveryCode);
  await fillPin(page, "135791");
  await unlock(page);
  await ready(page);
  await page.reload();
  await page.getByLabel("PIN del dispositivo", { exact: true }).fill("135791");
  await unlock(page);
  await ready(page);

  await page.goto("profile");
  await page.getByLabel("PIN del dispositivo", { exact: true }).fill("135791");
  await unlock(page);
  await page.getByRole("button", { name: "Approva un dispositivo", exact: true }).click();

  const second = await browser.newContext({ locale: "it-IT", baseURL: page.url() });
  try {
    const tab = await second.newPage();
    await fixture.prepare(tab);
    await tab.goto("transactions");
    await tab.getByRole("button", { name: "Approva da un altro dispositivo" }).click();
    const pairingCode = await tab.getByTestId("pairing-request-code").innerText();
    const source = page.getByRole("dialog");
    await source.getByLabel("Codice di abbinamento").fill(pairingCode);
    await source.getByRole("button", { name: "Approva un dispositivo" }).click();
    const confirmation = await source.getByTestId("pairing-confirmation").innerText();
    const request = tab.getByRole("dialog");
    await request.getByLabel("Codice di conferma").fill("0000 0000 0000");
    await request.getByRole("button", { name: "Conferma abbinamento" }).click();
    await expect(request.getByRole("alert")).toBeVisible();
    await request.getByLabel("Codice di conferma").fill(confirmation);
    await request.getByRole("button", { name: "Conferma abbinamento" }).click();
    await expect(request).toBeHidden();
    await expect(tab.getByText("Dispositivo approvato. Scegli il PIN da usare qui.")).toBeVisible();
    await fillPin(tab, "135791");
    await tab.getByLabel("Ricorda lo sblocco su questo dispositivo").check();
    await unlock(tab);
    await ready(tab);
    await tab.reload();
    await ready(tab);
    await tab.evaluate(() => {
      const auth = JSON.parse(localStorage.getItem("ducat-auth"));
      const [header, payload, signature] = auth.access_token.split(".");
      const claims = JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/")));
      claims.session_id = "new-vault-test-session";
      auth.access_token = [header, btoa(JSON.stringify(claims)).replace(/=+$/, ""), signature].join(".");
      localStorage.setItem("ducat-auth", JSON.stringify(auth));
    });
    await tab.reload();
    await expect(tab.getByLabel("PIN del dispositivo", { exact: true })).toBeVisible();
  } finally {
    await second.close();
  }
});

test("a sign-up waiting for the confirmation can try the app with local data", async ({ page }) => {
  await page.goto(".");
  await page.evaluate(() => localStorage.setItem("ducat-pending-verification", "ada@example.com"));
  await page.goto("verify-email");
  await page.getByRole("button", { name: /esplora ducat mentre aspetti|explore ducat while you wait/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("status").filter({ hasText: "ada@example.com" })).toBeVisible();
  // The account pages stay closed until the email is confirmed.
  await page.goto("profile");
  await expect(page).toHaveURL(/\/verify-email$/);
  await page.getByRole("button", { name: /continua la prova|continue the trial/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("status").filter({ hasText: "ada@example.com" })).toBeVisible();
  await page.getByRole("button", { name: /^(conferma email|confirm email)$/i }).first().click();
  await expect(page).toHaveURL(/\/verify-email$/);
});

test("transaction fields remain readable on mobile before and after focus", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile form regression");
  await page.goto(".");
  await page.getByRole("button", { name: /try (the )?demo|prova (la )?demo/i }).first().click();
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
  await page.getByRole("button", { name: /try (the )?demo|prova (la )?demo/i }).first().click();
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
  // Optimistic delete: the row disappears at once, and the toast can undo it.
  await expect(page.getByRole("button", { name: /Biglietto treno/ })).toHaveCount(0);
  await page.getByRole("status").getByRole("button", { name: /^(annulla|undo)$/i }).click();
  await expect(page.getByRole("button", { name: /Biglietto treno/ })).toHaveCount(1);

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
    await page.getByRole("button", { name: /try (the )?demo|prova (la )?demo/i }).first().click();
    await expect(page).toHaveURL(/\/transactions$/);
    const closeToast = page.getByRole("button", { name: /chiudi notifica|close notification/i }).first();
    if (await closeToast.isVisible()) {
      await closeToast.click();
      await expect(closeToast).toBeHidden();
    }
    for (const path of ["dashboard", "transactions", "analytics", "recurring", "budgets"]) {
      await page.evaluate((target) => {
        window.history.pushState({}, "", `/${target}`);
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
  await page.getByRole("button", { name: /try (the )?demo|prova (la )?demo/i }).first().click();
  await page.getByRole("button", { name: ADD_BUTTON }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#transaction-amount").fill("1234,56");
  await dialog.locator("#transaction-description").fill("Canone di competenza ottobre 2026 Via La Salle 14 appartamento secondo piano interno 7");
  await dialog.getByRole("button", { name: /1\.234,56/ }).click();
  await expect(dialog).toBeHidden();
  for (const path of ["dashboard", "transactions", "analytics", "recurring", "budgets"]) {
    await page.evaluate((target) => {
      window.history.pushState({}, "", `/${target}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // <main> clips horizontal overflow, so check the cards themselves.
    const overflow = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll("main section, main .surface")]
      .map((element) => Math.ceil(element.getBoundingClientRect().right - window.innerWidth))));
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  }
});

test("desktop dashboard uses the window and keeps quick entry fields separate", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop quick entry");
  await page.goto(".");
  await page.getByRole("button", { name: /try (the )?demo|prova (la )?demo/i }).first().click();
  await page.getByRole("link", { name: /^(panoramica|overview)$/i }).click();
  const form = page.getByRole("form", { name: /aggiunta rapida|quick add/i });
  for (const width of [1920, 1200, 1024]) {
    await page.setViewportSize({ width, height: 600 });
    await expect(form).toBeVisible();
    await expect(form.locator("input").first()).toHaveCSS("font-size", "15px");
    if (width === 1920) expect((await form.boundingBox()).width).toBeGreaterThan(1200);
    const fields = await form.locator("input, select, button").evaluateAll(elements =>
      elements.map(el => el.getBoundingClientRect().toJSON())
    );
    for (const [index, field] of fields.entries()) {
      for (const next of fields.slice(index + 1)) {
        expect(field.right <= next.left || field.bottom <= next.top || next.right <= field.left).toBe(true);
      }
    }
  }
  await form.getByRole("textbox", { name: /importo|amount/i }).fill("6,50");
  await form.getByRole("textbox", { name: /descrizione|description/i }).fill("Caffè in stazione");
  await form.getByRole("button").click();
  await expect(page.getByRole("button", { name: /Caffè in stazione/ })).toBeVisible();
});

test("a wide Mac workspace fills the space beside the sidebar and scales with preferred text", async ({ page, isMobile }) => {
  test.skip(isMobile, "Mac window layout");
  await page.setViewportSize({ width: 2560, height: 1200 });
  await page.goto(".");
  await page.evaluate(() => localStorage.setItem("ducat-demo-enabled", "true"));
  await page.goto("dashboard");
  const dashboard = page.locator(".dashboard-page");
  await expect(dashboard).toBeVisible();
  for (const mode of ["desktop", "mobile"]) {
    // Both native shells supply the host independently of the layout viewport.
    await page.locator("html").evaluate((html, mode) => {
      html.dataset.mode = mode;
      html.dataset.host = "macos";
    }, mode);
    await expect(dashboard).toHaveCSS("font-size", "20px");
    const sidebar = await page.locator(".app-sidebar").boundingBox();
    const content = await dashboard.boundingBox();
    expect(content.x - sidebar.x - sidebar.width).toBeCloseTo(30);
    expect(2560 - content.x - content.width).toBeCloseTo(30);
  }
  await page.locator("html").evaluate(html => html.style.setProperty("--system-text-size", "24px"));
  await expect(dashboard).toHaveCSS("font-size", "30px");
});

// iPhone Duo: outer screen, and the inner screen in landscape and portrait.
for (const [name, viewport, columns] of [
  ["outer screen", { width: 466, height: 678 }, 1],
  ["inner screen in landscape", { width: 951, height: 669 }, 2],
  ["inner screen in portrait", { width: 669, height: 951 }, 2],
]) {
  test(`iPhone Duo ${name} uses the space without overflowing`, async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Sets its own viewport: one project is enough");
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, locale: "it-IT" });
    const page = await context.newPage();
    await page.goto(".");
    await page.evaluate(() => {
      localStorage.setItem("ducat-demo-enabled", "true");
      localStorage.setItem("ducat-demo-transactions", JSON.stringify([{
        id: "duo-income", type: "income", amountMinor: 1263000, currency: "EUR", description: "Stipendio",
        category: "stipendio", dateKey: new Date().toISOString().slice(0, 10), isSample: false,
      }]));
    });
    await page.goto("dashboard");
    const summary = page.getByRole("region", { name: /riepilogo|summary/i });
    await expect(summary).toBeVisible();
    const money = page.locator("section[aria-labelledby='where-money-goes']");
    const [a, b] = await Promise.all([summary.boundingBox(), money.boundingBox()]);
    // Two columns: the cards share a row; one column: they are stacked.
    expect(Math.abs(a.y - b.y) < 2).toBe(columns === 2);
    const overflow = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll("main section, main .surface, .amount")]
      .map((element) => Math.ceil(element.getBoundingClientRect().right - window.innerWidth))));
    expect(overflow).toBeLessThanOrEqual(0);
    // The balance never runs under the privacy toggle next to it.
    const amount = await summary.locator(".amount").first().evaluate((element) => element.scrollWidth - element.parentElement.clientWidth);
    expect(amount).toBeLessThanOrEqual(0);
    await context.close();
  });
}

test("iPhone Duo outer screen: transaction actions rise from the bottom and the delete prompt fits", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Sets its own viewport: one project is enough");
  const viewport = { width: 466, height: 678 };
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, locale: "it-IT" });
  const page = await context.newPage();
  await page.goto(".");
  await page.evaluate(() => {
    localStorage.setItem("ducat-demo-enabled", "true");
    localStorage.setItem("ducat-demo-transactions", JSON.stringify([{
      id: "duo-lunch", type: "expense", amountMinor: 1250, currency: "EUR", description: "Pranzo al sacco",
      category: "alimentazione", dateKey: new Date().toISOString().slice(0, 10), isSample: false,
    }]));
  });
  await page.goto("transactions");
  await page.getByRole("button", { name: /Pranzo al sacco/ }).click();

  const sheet = page.getByRole("dialog", { name: "Pranzo al sacco" });
  await expect(sheet).toBeVisible();
  await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const box = await sheet.boundingBox();
  // Full width, resting on the bottom edge.
  expect(Math.abs(box.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.width - viewport.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThanOrEqual(1);

  await sheet.getByRole("button", { name: /^elimina$/i }).click();
  const prompt = page.getByRole("dialog", { name: /eliminare questo movimento/i });
  await expect(prompt).toBeVisible();
  await prompt.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const [card, cancel, confirm, close] = await Promise.all([
    prompt.boundingBox(),
    prompt.getByRole("button", { name: /^annulla$/i }).boundingBox(),
    prompt.getByRole("button", { name: /elimina definitivamente/i }).boundingBox(),
    prompt.getByRole("button", { name: /chiudi|close/i }).boundingBox(),
  ]);
  for (const part of [card, cancel, confirm, close]) {
    expect(part.x).toBeGreaterThanOrEqual(0);
    expect(part.x + part.width).toBeLessThanOrEqual(viewport.width);
    expect(part.y + part.height).toBeLessThanOrEqual(viewport.height);
  }
  // Cancel and delete share one row.
  expect(Math.abs(cancel.y - confirm.y)).toBeLessThan(2);
  await context.close();
});

const openDuoDemo = async (browser, viewport, transactions) => {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, locale: "it-IT" });
  const page = await context.newPage();
  await page.goto(".");
  await page.evaluate((items) => {
    localStorage.setItem("ducat-demo-enabled", "true");
    localStorage.setItem("ducat-demo-transactions", JSON.stringify(items));
  }, transactions.map((item) => ({ currency: "EUR", dateKey: new Date().toISOString().slice(0, 10), isSample: false, ...item })));
  return { context, page };
};

const duoSpending = [
  { id: "duo-salary", type: "income", amountMinor: 653400, description: "Stipendio", category: "stipendio" },
  { id: "duo-laptop", type: "expense", amountMinor: 1234567, description: "Portatile", category: "shopping" },
  { id: "duo-bills", type: "expense", amountMinor: 43810, description: "Bollette", category: "casa" },
];

test("iPhone Duo inner screen: the new transaction form fits in two columns", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Sets its own viewport: one project is enough");
  const { context, page } = await openDuoDemo(browser, { width: 951, height: 669 }, duoSpending);
  await page.goto("dashboard");
  await page.getByRole("button", { name: "Nuovo movimento" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Nuovo movimento" });
  await expect(dialog).toBeVisible();
  await dialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  // The window itself has focus, not its first button.
  await expect(dialog).toBeFocused();
  const [amount, description, repeat, box] = await Promise.all([
    dialog.getByRole("textbox", { name: /importo/i }).boundingBox(),
    dialog.getByRole("textbox", { name: "Descrizione" }).boundingBox(),
    dialog.getByText("Si ripete").boundingBox(),
    dialog.boundingBox(),
  ]);
  // Amount on the left, description on the right, side by side.
  expect(description.x).toBeGreaterThan(amount.x + amount.width);
  expect(Math.abs(description.y - amount.y)).toBeLessThan(120);
  // Repeat, the last section, is in view without scrolling.
  expect(repeat.y + repeat.height).toBeLessThanOrEqual(box.y + box.height);
  await context.close();
});

test("iPhone Duo outer screen: one Export button offers both formats", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Sets its own viewport: one project is enough");
  const { context, page } = await openDuoDemo(browser, { width: 466, height: 678 }, duoSpending);
  await page.goto("analytics");
  await expect(page.getByRole("heading", { name: "Analisi", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Esporta CSV" })).toBeHidden();
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Esporta" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Esporta PDF" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Esporta CSV" })).toBeVisible();
  await context.close();
});

test("iPhone Duo inner screen: the four insight figures share a row without overflowing", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Sets its own viewport: one project is enough");
  const { context, page } = await openDuoDemo(browser, { width: 951, height: 669 }, duoSpending);
  await page.goto("analytics");
  const tiles = page.getByRole("region", { name: /indicatori del periodo/i }).locator(":scope > div");
  await expect(tiles).toHaveCount(4);
  const boxes = await tiles.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
  expect(Math.max(...boxes) - Math.min(...boxes)).toBeLessThan(2);
  // Every figure in the row shares the same horizontal baseline even when a
  // label wraps onto two lines.
  const amountTops = await tiles.locator(".amount").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
  expect(Math.max(...amountTops) - Math.min(...amountTops)).toBeLessThan(2);
  // Even "€12.345,67" stays on one line inside its tile.
  const overflow = await tiles.locator(".amount").evaluateAll((items) => items.map((item) => item.scrollWidth - item.clientWidth));
  expect(Math.max(...overflow)).toBeLessThanOrEqual(0);
  await context.close();
});

test("landing page offers platform download links on web", async ({ page }) => {
  await page.route("https://api.github.com/repos/**/releases/latest", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      tag_name: "v4.0.65",
      assets: [
        { name: "Ducat-4.0.65-macos-arm64.dmg", browser_download_url: "https://github.com/solomontaiwo/ducat/releases/download/v4.0.65/Ducat-4.0.65-macos-arm64.dmg" },
        { name: "Ducat-4.0.65-windows-x64-setup.exe", browser_download_url: "https://github.com/solomontaiwo/ducat/releases/download/v4.0.65/Ducat-4.0.65-windows-x64-setup.exe" },
      ],
    }),
  }));
  await page.goto(".");
  const section = page.locator("#download");
  await expect(section).toBeVisible();
  await expect(section.getByRole("link", { name: /scarica \.dmg|download \.dmg/i })).toHaveAttribute(
    "href",
    "https://github.com/solomontaiwo/ducat/releases/download/v4.0.65/Ducat-4.0.65-macos-arm64.dmg"
  );
  await expect(section.getByRole("link", { name: /scarica \.exe|download \.exe/i })).toHaveAttribute(
    "href",
    "https://github.com/solomontaiwo/ducat/releases/download/v4.0.65/Ducat-4.0.65-windows-x64-setup.exe"
  );
  await expect(section.getByRole("link", { name: /testflight/i })).toHaveAttribute(
    "href",
    "https://testflight.apple.com/join/C3BV5sCa"
  );
  await expect(section.getByRole("link", { name: /github/i })).toHaveAttribute("href", /github\.com\/solomontaiwo\/ducat\/releases\/latest/);
});

test("numbers align horizontally and vertically across Overview and Insights", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Sets its own viewport: one project is enough");
  const fiveCategories = [
    { id: "aln-inc", type: "income", amountMinor: 653400, description: "Stipendio", category: "stipendio" },
    { id: "aln-1", type: "expense", amountMinor: 63800, description: "Treno", category: "trasporti" },
    { id: "aln-2", type: "expense", amountMinor: 44000, description: "Volo", category: "viaggi" },
    { id: "aln-3", type: "expense", amountMinor: 43810, description: "Bollette", category: "casa" },
    { id: "aln-4", type: "expense", amountMinor: 19000, description: "Streaming", category: "abbonamenti" },
    { id: "aln-5", type: "expense", amountMinor: 45800, description: "Spesa", category: "cibo" },
  ];
  const { context, page } = await openDuoDemo(browser, { width: 951, height: 669 }, fiveCategories);
  await page.goto("dashboard");
  const heroValues = page.getByRole("region", { name: /riepilogo del mese/i }).locator("dl dd.amount");
  await expect(heroValues).toHaveCount(2);
  const heroBottoms = await heroValues.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().bottom));
  expect(Math.abs(heroBottoms[0] - heroBottoms[1])).toBeLessThan(2);

  // All 5 category amounts in "Where your money goes" (including "Altre categorie"
  // which has no chevron) right-align vertically in the same column.
  const spendingAmounts = page.locator(".spending-card .spending-figures [data-amount='true']");
  await expect(spendingAmounts).toHaveCount(5);
  const spendingRights = await spendingAmounts.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right));
  expect(Math.max(...spendingRights) - Math.min(...spendingRights)).toBeLessThan(2);

  // In Insights "By category", single-digit and two-digit percentages keep the
  // euro amounts vertically right-aligned too.
  await page.goto("analytics");
  const categoryAmounts = page.locator(".category-card ul li button [data-amount='true']");
  await expect(categoryAmounts).toHaveCount(5);
  const categoryRights = await categoryAmounts.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right));
  expect(Math.max(...categoryRights) - Math.min(...categoryRights)).toBeLessThan(2);
  await context.close();
});

test("iPhone Duo portrait top-corner bar places titles and actions beside the status cluster", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Sets its own viewport: one project is enough");
  const { context, page } = await openDuoDemo(browser, { width: 669, height: 951 }, duoSpending);
  await page.addInitScript(() => {
    const apply = () => {
      const r = document.documentElement;
      if (!r) return;
      r.dataset.topCornerBar = "true";
      r.style.setProperty("--top-bar-top", "10px");
      r.style.setProperty("--top-bar-left", "16px");
      r.style.setProperty("--top-bar-right", "228px");
      r.style.setProperty("--top-bar-height", "58px");
    };
    if (document.documentElement) apply();
    document.addEventListener("DOMContentLoaded", apply);
  });

  await page.goto("analytics");
  const header = page.locator(".mobile-glass-header:visible").first();
  await expect(header).toBeVisible();
  const headerBox = await header.boundingBox();
  expect(headerBox.y).toBeLessThanOrEqual(2);
  // Uses the single compact Export button so the bar stays clear of the status cluster.
  const exportBtn = page.getByRole("button", { name: "Esporta", exact: true });
  await expect(exportBtn).toBeVisible();
  await expect(page.getByRole("button", { name: "Esporta CSV" })).toBeHidden();
  const rightmostBtn = header.locator("a, button").last();
  const rightmostBox = await rightmostBtn.boundingBox();
  // Header controls stop strictly before the 228px top-right status/battery zone.
  expect(rightmostBox.x + rightmostBox.width).toBeLessThanOrEqual(669 - 228 + 2);
  // Stays pinned at top:0 after scrolling down.
  await page.evaluate(() => window.scrollTo(0, 320));
  await page.waitForFunction(() => window.scrollY >= 200);
  const scrolledHeaderBox = await header.boundingBox();
  expect(scrolledHeaderBox.y).toBeLessThanOrEqual(2);

  // Transactions header keeps MonthSwitcher and profile/register button on one line clear of the cluster.
  await page.goto("transactions");
  const txHeader = page.locator(".mobile-glass-header:visible").first();
  const txRightmostBox = await txHeader.locator("a, button").last().boundingBox();
  expect(txRightmostBox.x + txRightmostBox.width).toBeLessThanOrEqual(669 - 228 + 2);
  await context.close();
});

test("main tabs stay as they were left and switch without skeletons", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Uses the mobile tab bar");
  await page.goto(".");
  await page.evaluate(() => {
    const today = new Date();
    const items = Array.from({ length: 10 }, (_, index) => {
      const day = new Date(today.getFullYear(), today.getMonth(), Math.max(1, today.getDate() - index));
      const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      return { id: `keep-${index}`, type: index % 4 ? "expense" : "income", amountMinor: 1000 + index, currency: "EUR", description: `Movimento ${index}`, category: index % 4 ? "altro" : "stipendio", dateKey, isSample: false };
    });
    localStorage.setItem("ducat-demo-enabled", "true");
    localStorage.setItem("ducat-demo-transactions", JSON.stringify(items));
  });
  await page.goto("dashboard");
  const tabBar = page.getByRole("navigation", { name: /navigazione principale|main navigation/i });
  await tabBar.getByRole("button", { name: /^(movimenti|transactions)/i }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await page.getByRole("button", { name: /^(uscite|expenses)$/i }).click();
  const target = await page.evaluate(() => Math.min(300, document.documentElement.scrollHeight - window.innerHeight));
  await page.evaluate((y) => window.scrollTo(0, y), target);
  await page.waitForFunction((y) => Math.abs(window.scrollY - y) < 2, target);
  const scrolled = await page.evaluate(() => window.scrollY);

  await tabBar.getByRole("button", { name: /^(panoramica|overview)/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await tabBar.getByRole("button", { name: /^(movimenti|transactions)/i }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  // Same filter and same position, with no loading placeholders.
  await expect(page.getByRole("button", { name: /^(uscite|expenses)$/i })).toHaveAttribute("aria-pressed", "true");
  expect(Math.abs(await page.evaluate(() => window.scrollY) - scrolled)).toBeLessThan(4);
  await expect(page.locator(".react-loading-skeleton:visible")).toHaveCount(0);

  // Insights was warmed up in the background: it opens without a skeleton.
  await page.waitForFunction(() => document.querySelector('[data-tab-page="/analytics"]') !== null);
  await tabBar.getByRole("button", { name: /^(analisi|insights)/i }).click();
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.getByRole("heading", { level: 1, name: /analisi|insights/i })).toBeVisible();
  await expect(page.locator(".react-loading-skeleton:visible")).toHaveCount(0);
});

test("a horizontal swipe does not change page on mobile", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Touch gesture regression");
  await page.goto(".");
  await page.getByRole("button", { name: /try (the )?demo|prova (la )?demo/i }).first().click();
  await expect(page).toHaveURL(/\/transactions$/);
  await page.locator("main h1:visible").evaluate((element) => {
    const touch = (x) => new Touch({ identifier: 1, target: element, clientX: x, clientY: 200 });
    element.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [touch(320)], changedTouches: [touch(320)] }));
    element.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [touch(40)] }));
  });
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/transactions$/);
});

const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const goTo = (page, path) => page.evaluate((target) => {
  window.history.pushState({}, "", `/${target}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}, path);

test("suggests the category and turns a movement into a recurring one", async ({ page }) => {
  await page.goto(".");
  await page.getByRole("button", { name: /prova (la )?demo/i }).first().click();
  await page.getByRole("button", { name: ADD_BUTTON }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#transaction-amount").fill("13,99");
  await dialog.locator("#transaction-description").fill("Netflix");
  await expect(dialog.getByTestId("category-suggestion")).toBeVisible();
  await expect(dialog.getByRole("radio", { name: /^abbonamenti$/i })).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("radio", { name: /altra data/i }).click();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  await dialog.locator("#transaction-date").fill(iso(weekAgo));
  await dialog.getByRole("switch").click();
  await dialog.getByRole("radio", { name: /^settimana$/i }).click();
  await dialog.getByRole("radio", { name: /chiedimi prima/i }).click();
  await dialog.getByRole("button", { name: /13,99/ }).click();
  await expect(dialog).toBeHidden();

  await goTo(page, "dashboard");
  const upcoming = page.getByRole("region", { name: /in arrivo/i });
  await expect(upcoming.getByText("Netflix")).toBeVisible();
  await upcoming.getByRole("button", { name: /registra/i }).click();
  // The next weekly occurrence is still within the 7-day window, but no longer waits for confirmation.
  await expect(upcoming.getByRole("button", { name: /registra/i })).toHaveCount(0);

  await goTo(page, "transactions");
  await page.getByRole("searchbox").fill("netf");
  await expect(page.getByRole("button", { name: /Netflix/ })).toHaveCount(2);

  await goTo(page, "recurring");
  await expect(page.getByRole("heading", { level: 1, name: /ricorrenti/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Netflix.*ogni settimana/i })).toBeVisible();
});

test("budgets appear on the overview only once set", async ({ page }) => {
  await page.goto(".");
  await page.getByRole("button", { name: /prova (la )?demo/i }).first().click();
  await expect(page).toHaveURL(/\/transactions$/);
  await goTo(page, "dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: /budget del mese/i })).toHaveCount(0);
  await goTo(page, "budgets");
  await page.getByLabel(/budget mensile per spesa$/i).fill("40");
  await page.getByRole("button", { name: /salva budget/i }).click();
  await expect(page).toHaveURL(/dashboard$/);
  const card = page.getByRole("region", { name: /budget del mese/i });
  await expect(card.getByTestId("budget-row")).toHaveAttribute("data-status", "over");
});

test("mobile header keeps the profile shortcut clear of other controls", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile header");
  await page.goto(".");
  await page.getByRole("button", { name: /prova (la )?demo/i }).first().click();
  await expect(page).toHaveURL(/\/transactions$/);
  const nav = page.getByRole("navigation", { name: /navigazione principale/i });
  await expect(nav.getByRole("button")).toHaveCount(4);
  for (const path of ["dashboard", "transactions", "analytics"]) {
    await goTo(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const shortcut = page.getByRole("link", { name: /registrati/i });
    await expect(shortcut).toBeVisible();
    const box = await shortcut.boundingBox();
    const overlaps = await page.evaluate(({ x, y, width, height }) => [...document.querySelectorAll("main header *")]
      .filter((element) => !element.closest("a") && element.children.length === 0 && element.getBoundingClientRect().width > 0)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < x + width && rect.right > x && rect.top < y + height && rect.bottom > y;
      }).length, box);
    expect(overlaps, `${path} header overlaps the profile shortcut`).toBe(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  }
});

test("a payday month start moves the overview period", async ({ page }) => {
  await page.goto(".");
  await page.evaluate(() => localStorage.setItem("ducat-demo-preferences", JSON.stringify({ monthStartDay: 27 })));
  await page.getByRole("button", { name: /prova (la )?demo/i }).first().click();
  await expect(page).toHaveURL(/\/transactions$/);
  await goTo(page, "dashboard");
  await expect(page.getByTestId("cycle-range")).toHaveText(/27 \w+ – 26 \w+/);
});

test('starting demo again preserves saved user transactions', async ({ page }) => {
  await page.goto('.');
  await page.evaluate(() => {
    localStorage.setItem('ducat-demo-transactions', JSON.stringify([{
      id: 'saved-restart', type: 'expense', amountMinor: 1250, currency: 'EUR', description: 'Movimento conservato',
      category: 'altro', dateKey: '2026-01-01', isSample: false,
    }]));
  });
  await page.getByRole('button', { name: /try (the )?demo|prova (la )?demo/i }).first().click();
  await page.getByRole('searchbox').fill('Movimento conservato');
  await expect(page.getByRole('button', { name: /Movimento conservato/ })).toBeVisible();
  const ids = await page.evaluate(() => JSON.parse(localStorage.getItem('ducat-demo-transactions')).map(item => item.id));
  expect(ids).toEqual(['saved-restart']);
  await page.reload();
  await page.getByRole('searchbox').fill('Movimento conservato');
  await expect(page.getByRole('button', { name: /Movimento conservato/ })).toBeVisible();
});

test("inline amount calculator, privacy mode toggle and category drill-down work in demo mode", async ({ page }) => {
  await page.goto(".");
  await page.getByRole("button", { name: /try (the )?demo|prova (la )?demo/i }).first().click();
  await expect(page).toHaveURL(/\/transactions$/);

  // 1. Inline calculator in TransactionForm
  await page.getByRole("button", { name: ADD_BUTTON }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#transaction-amount").fill("12,50+4,80");
  await expect(dialog.getByTestId("amount-calc-result")).toContainText(/17,30|17\.30/);
  await dialog.getByRole("radio", { name: /^(transportation|trasporti)$/i }).click();
  await dialog.locator("#transaction-description").fill("Taxi condiviso");
  await dialog.getByRole("button", { name: /17,30|17\.30/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /Taxi condiviso/ })).toContainText(/17,30|17\.30/);

  // 2. Privacy mode toggle masks amounts on the root element
  await goTo(page, "dashboard");
  const privacyToggle = page.getByRole("button", { name: /nascondi importi|hide amounts/i });
  await privacyToggle.click();
  await expect(page.locator("html")).toHaveClass(/privacy-masked/);
  await page.getByRole("button", { name: /mostra importi|show amounts/i }).click();
  await expect(page.locator("html")).not.toHaveClass(/privacy-masked/);

  // 3. Category drill-down from "Where money goes" pre-filters Transactions
  const spendingSection = page.getByRole("region", { name: /dove vanno i soldi|where your money goes/i });
  await spendingSection.getByRole("link", { name: /trasporti|transportation/i }).click();
  await expect(page).toHaveURL(/\/transactions\?.*category=trasporti/);
  await expect(page.getByRole("button", { name: /Taxi condiviso/ })).toBeVisible();
});

test("quick-add deep link, sorting, bulk recategorization, annual recap and shortcuts work", async ({ page, isMobile }) => {
  await page.goto(".");
  await page.getByRole("button", { name: /try (the )?demo|prova (la )?demo/i }).first().click();
  await expect(page).toHaveURL(/\/transactions$/);

  // 1. Quick-add URL prefill (used by iOS Quick Actions & Shortcuts)
  await page.evaluate(() => {
    window.history.pushState({}, "", "/dashboard?quickAdd=1&type=expense&amount=45&description=Cena%20amici");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await expect(modal.locator("#transaction-amount")).toHaveValue("45");
  await expect(modal.locator("#transaction-description")).toHaveValue("Cena amici");
  await modal.getByRole("button", { name: /45,00|45\.00/ }).click();
  await expect(modal).toBeHidden();

  // 2. Sorting by amount and bulk recategorization in Transactions
  await goTo(page, "transactions");
  await page.getByLabel(/^(ordina|sort)$/i).selectOption("amount-desc");
  await page.getByTestId("toggle-bulk-select").click();
  await expect(page.getByTestId("bulk-action-bar")).toBeVisible();
  await page.getByRole("button", { name: /Cena amici/ }).click();
  await expect(page.getByTestId("bulk-action-bar")).toContainText(/1/);
  await page.getByLabel(/cambia categoria|change category/i).selectOption("viaggi");
  await expect(page.getByTestId("bulk-action-bar")).toBeHidden();

  // 3. Annual recap in Analytics
  await goTo(page, "analytics");
  await page.getByRole("radio", { name: /quest'anno|this year/i }).click();
  await expect(page.getByTestId("annual-summary")).toBeVisible();

  // 4. Desktop keyboard shortcuts (`?` opens shortcuts dialog, `P` toggles privacy)
  if (!isMobile) {
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.keyboard.press("p");
    await expect(page.locator("html")).toHaveClass(/privacy-masked/);
    await page.keyboard.press("p");
    await expect(page.locator("html")).not.toHaveClass(/privacy-masked/);
  }
});

test("table preference survives the detail panel and falls back to cards on a phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Controls its own window size");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(".");
  await page.getByRole("button", { name: /prova (la )?demo/i }).first().click();
  await page.getByRole("button", { name: /vista tabella/i }).click();
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveCount(4);
  await table.getByRole("button").first().click();
  const editor = page.getByRole("complementary", { name: /modifica movimento/i });
  await expect(editor).toBeVisible();
  await expect(table).toBeHidden();
  await editor.getByRole("button", { name: /chiudi/i }).click();
  await expect(table).toBeVisible();
  await page.getByTestId("toggle-bulk-select").click();
  const first = table.getByRole("button").first();
  await first.focus();
  await first.press("Space");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(table).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await expect(table).toBeVisible();
});

test("transaction modal opens centered on desktop and animates open and close", async ({ page }) => {
  await page.goto(".");
  await page.getByRole("button", { name: /try (the )?demo|prova (la )?demo/i }).first().click();
  await expect(page).toHaveURL(/\/transactions$/);
  await page.getByRole("button", { name: ADD_BUTTON }).first().click();

  const viewport = page.viewportSize();
  const isPhone = viewport.width < 640;
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const openAnimation = await dialog.evaluate((el) => getComputedStyle(el).animationName);
  expect(openAnimation).toBe(isPhone ? "dialog-sheet-in" : "dialog-pop-in");

  // Wait for the opening animation to settle, then check placement.
  await dialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  if (isPhone) {
    expect(Math.abs(box.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.width - viewport.width)).toBeLessThanOrEqual(2);
  } else {
    expect(Math.abs((box.x + box.width / 2) - viewport.width / 2)).toBeLessThanOrEqual(2);
    expect(Math.abs((box.y + box.height / 2) - viewport.height / 2)).toBeLessThanOrEqual(2);
  }

  // Trigger close and verify the closing animation runs before unmounting.
  const closeAnimationPromise = dialog.evaluate((el) => new Promise((resolve) => {
    const check = () => {
      if (el.getAttribute("data-state") === "closed") {
        resolve(getComputedStyle(el).animationName);
        return true;
      }
      return false;
    };
    if (check()) return;
    const observer = new MutationObserver(() => {
      if (check()) observer.disconnect();
    });
    observer.observe(el, { attributes: true, attributeFilter: ["data-state"] });
  }));
  await page.keyboard.press("Escape");
  expect(await closeAnimationPromise).toBe(isPhone ? "dialog-sheet-out" : "dialog-pop-out");
  await expect(dialog).toBeHidden();
});

test("advanced filters, future scheduled transactions and safe bulk delete with undo work", async ({ page }) => {
  await page.goto(".");
  await page.getByRole("button", { name: /try (the )?demo|prova (la )?demo/i }).first().click();
  await expect(page).toHaveURL(/\/transactions$/);

  // 1. Add a future/scheduled expense and verify its badge.
  await page.getByRole("button", { name: ADD_BUTTON }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#transaction-amount").fill("89,00");
  await dialog.locator("#transaction-description").fill("Bolletta futura");
  await dialog.getByRole("radio", { name: /altra data|other date/i }).click();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await dialog.locator("#transaction-date").fill(iso(tomorrow));
  await dialog.getByRole("button", { name: /89,00|89\.00/ }).click();
  await expect(dialog).toBeHidden();

  // Switch to all-time so tomorrow's movement is visible even on the last day of the month.
  await page.getByRole("button", { name: /tutto lo storico|all time/i }).click();
  const scheduledRow = page.getByRole("button", { name: /Bolletta futura/ });
  await expect(scheduledRow).toBeVisible();
  await expect(scheduledRow).toContainText(/programmato|scheduled/i);

  // 2. Advanced filter by minimum amount narrows to the 89€ expense (plus 2500€ salary).
  await page.getByTestId("toggle-advanced-filters").click();
  const panel = page.getByTestId("advanced-filters-panel");
  await expect(panel).toBeVisible();
  await panel.getByLabel(/min €/i).fill("80");
  await panel.getByLabel(/max €/i).fill("100");
  await expect(page.getByRole("button", { name: /Bolletta futura/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Benzina|Fuel/ })).toHaveCount(0);
  await page.getByRole("button", { name: /azzera filtri|clear filters/i }).click();

  // 3. Bulk delete asks for confirmation and supports Undo.
  await page.getByTestId("toggle-bulk-select").click();
  await page.getByRole("button", { name: /Bolletta futura/ }).click();
  await page.getByTestId("bulk-action-bar").getByRole("button", { name: /^(elimina|delete)$/i }).click();
  const confirm = page.getByRole("dialog", { name: /eliminare 1|delete 1/i });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: /elimina definitivamente|delete permanently/i }).click();
  await expect(page.getByRole("button", { name: /Bolletta futura/ })).toHaveCount(0);
  await page.getByRole("status").getByRole("button", { name: /^(annulla|undo)$/i }).click();
  await expect(page.getByRole("button", { name: /Bolletta futura/ })).toHaveCount(1);
});
