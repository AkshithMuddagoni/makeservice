import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:8080";
const SERVER_TIMEOUT_MS = 90_000;
let server;
let browser;

function log(message) {
  console.log("[fieldly-e2e] " + message);
}

async function waitForServer() {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < SERVER_TIMEOUT_MS) {
    if (server?.exitCode !== null && server?.exitCode !== undefined) {
      throw new Error("Fieldly dev server exited before becoming ready.\n" + lastError);
    }
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return;
      lastError = "HTTP " + response.status;
    } catch (error) {
      lastError = String(error);
    }
    await delay(500);
  }
  throw new Error("Timed out waiting for Fieldly at " + BASE_URL + ". Last error: " + lastError);
}

async function mockExternalServices(page) {
  await page.route("https://india-lgd-index-api.vercel.app/v1/**", async (route) => {
    const url = new URL(route.request().url());
    let data = [];
    if (url.pathname.endsWith("/states")) {
      data = [{ code: "36", name: "TELANGANA" }];
    } else if (url.pathname.endsWith("/districts")) {
      data = [{ code: "289", name: "HANUMAKONDA" }];
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ success: true, data, meta: { count: data.length, source_date: "test-fixture" } }),
    });
  });

  const address = {
    state: "Telangana",
    state_district: "Hanumakonda",
    city: "Kazipet",
    postcode: "506003",
    road: "Main Road",
    house_number: "42",
    neighbourhood: "Near Government School",
  };
  const searchResult = {
    display_name: "42 Main Road, Kazipet, Hanumakonda, Telangana, 506003, India",
    lat: "17.9722",
    lon: "79.5880",
    address,
  };
  const reverseResult = { ...searchResult, lat: "17.9722", lon: "79.5880" };

  await page.route("https://nominatim.openstreetmap.org/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([searchResult]),
    });
  });
  await page.route("https://nominatim.openstreetmap.org/reverse**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(reverseResult),
    });
  });
  await page.route("https://basemaps.cartocdn.com/**", (route) => route.abort());
  await page.route("https://images.pexels.com/**", (route) => route.abort());
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
}

async function assertNoHorizontalOverflow(page, label) {
  const diagnostics = await page.evaluate(() => {
    const viewport = window.innerWidth;
    const offenders = Array.from(document.querySelectorAll("body *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className.slice(0, 100) : "",
          right: Math.round(rect.right),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          position: style.position,
          overflowX: style.overflowX,
          text: (element.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 60),
        };
      })
      .filter((element) => element.width > 0 && element.right > viewport + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 12);
    return { viewport, document: document.documentElement.scrollWidth, offenders };
  });
  assert.ok(
    diagnostics.document <= diagnostics.viewport + 1,
    label + " has horizontal overflow: " + JSON.stringify(diagnostics),
  );
}

async function openLocationDialog(page) {
  await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Construction & Field Equipment Services/i }).waitFor();
  await page.getByRole("button", { name: /Enter location/ }).click();
  const locationHeading = page.locator("#fieldly-location-title");
  try {
    await locationHeading.waitFor({ state: "visible", timeout: 10_000 });
  } catch {
    const bodyText = (await page.locator("body").innerText()).slice(0, 1800);
    throw new Error("Location selector did not open after clicking Enter location. Visible page text:\n" + bodyText);
  }
  const dialog = page.locator('[aria-labelledby="fieldly-location-title"]');
  await dialog.waitFor({ state: "visible" });
  return dialog;
}

async function confirmManualWorkSite(dialog) {
  await dialog.getByRole("tab", { name: /Manual/ }).click();
  await dialog.getByLabel(/State \/ Union Territory/).selectOption({ label: "Telangana" });
  const district = dialog.getByRole("combobox", { name: /District/ });
  await district.waitFor({ state: "visible" });
  await district.selectOption("289");
  await dialog.getByLabel(/City \/ Town \/ Village/).fill("Kazipet");
  await dialog.getByLabel(/PIN code/).fill("506003");
  await dialog.getByLabel(/Exact work-site address/).fill("Near Government School, Main Road, Kazipet");
  await dialog.getByLabel(/Landmark/).fill("Opposite HP Petrol Bunk");

  await dialog.getByRole("button", { name: /Continue to map/ }).click();
  const result = dialog.getByRole("button", { name: /42 Main Road/ });
  await result.waitFor({ state: "visible" });
  await result.click();
  await dialog.getByRole("button", { name: /Confirm this location and find services/ }).click();
}

async function testMobileCustomerJourney() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mockExternalServices(page);

  try {
    log("mobile: opening location-first landing page");
    const dialog = await openLocationDialog(page);
    await assertNoHorizontalOverflow(page, "mobile landing/dialog");
    await confirmManualWorkSite(dialog);

    await page.getByRole("heading", { name: "Choose a service" }).waitFor();
    await assertNoHorizontalOverflow(page, "mobile marketplace");
    await page.getByRole("link", { name: /Borewell drilling/ }).first().click();
    await page.getByRole("heading", { name: "Borewell drilling", exact: true }).waitFor();

    const purposeOption = page.locator("button").filter({ hasText: /^Home$/ }).first();
    await purposeOption.waitFor({ state: "visible" });
    await purposeOption.click();
    await page.locator("button").filter({ hasText: /^Easy access$/ }).click();
    await page.locator("button").filter({ hasText: /^Today$/ }).click();
    await page.getByLabel(/Anything the operator should know/).fill("Mockup smoke test work site");
    await page.getByRole("button", { name: /See who can reach this site/ }).click();

    await page.getByRole("link", { name: /Sri Sai Borewell Works/ }).waitFor();
    await page.getByRole("button", { name: "Nearest", exact: true }).click();
    await page.getByRole("button", { name: "Top rated", exact: true }).click();
    await page.getByRole("button", { name: "Lowest quote", exact: true }).click();
    await page.getByPlaceholder("Filter by name").fill("Sri Sai");
    assert.equal(await page.getByRole("link", { name: /Sri Sai Borewell Works/ }).count(), 1);
    await page.getByPlaceholder("Filter by name").fill("");

    await page.getByRole("button", { name: "Request quotes", exact: true }).click();
    await page.getByPlaceholder("Your name").fill("Fieldly Test Customer");
    await page.getByPlaceholder("Mobile number").fill("9876543210");
    await page.getByRole("button", { name: "Get code", exact: true }).click();
    await page.getByPlaceholder("482609").fill("482609");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByText("Signed in", { exact: true }).waitFor();

    await page.goto(BASE_URL + "/find/borewell", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Request quotes", exact: true }).waitFor();
    await page.getByRole("button", { name: "Request quotes", exact: true }).click();
    await page.getByRole("heading", { name: "Borewell drilling", exact: true }).waitFor();
    await page.getByRole("button", { name: "Accept quote", exact: true }).waitFor();
    await page.getByRole("button", { name: "Accept quote", exact: true }).click();
    await page.getByText("FLD-1041", { exact: true }).waitFor();
    await page.getByText("Confirmed", { exact: true }).waitFor();
    await assertNoHorizontalOverflow(page, "mobile booking confirmation");
    assert.deepEqual(pageErrors, [], "mobile journey should have no uncaught page errors");
    log("mobile: location → service form → provider discovery → login → quote acceptance → booking passed");
  } finally {
    await context.close();
  }
}

async function testDesktopGpsJourney() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["geolocation"],
    geolocation: { latitude: 17.9722, longitude: 79.5880 },
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mockExternalServices(page);

  try {
    log("desktop: testing GPS work-site selection");
    const dialog = await openLocationDialog(page);
    await assertNoHorizontalOverflow(page, "desktop landing/dialog");
    await dialog.getByRole("tab", { name: /Use my location/ }).click();
    await dialog.getByRole("button", { name: /Use my current location/ }).click();
    await page.getByText("Address details found. Review them before confirming.").waitFor({ timeout: 20_000 });
    const confirmButton = dialog.getByRole("button", { name: /Confirm this location and find services/ });
    await confirmButton.waitFor({ state: "visible" });
    for (let attempt = 0; attempt < 50 && !(await confirmButton.isEnabled()); attempt += 1) {
      await delay(100);
    }
    assert.equal(await confirmButton.isEnabled(), true, "GPS address lookup should finish before confirmation");
    await confirmButton.click();
    await page.getByRole("heading", { name: "Choose a service" }).waitFor();
    await assertNoHorizontalOverflow(page, "desktop marketplace");
    assert.deepEqual(pageErrors, [], "desktop GPS journey should have no uncaught page errors");
    log("desktop: GPS → reverse-geocoded address → confirmed work site passed");
  } finally {
    await context.close();
  }
}

async function main() {
  server = spawn(
    process.execPath,
    ["scripts/with-app-env.mjs", "vite", "dev", "--host", "127.0.0.1", "--port", "8080", "--strictPort"],
    { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" } },
  );

  let serverOutput = "";
  server.stdout?.on("data", (chunk) => { serverOutput += chunk.toString(); });
  server.stderr?.on("data", (chunk) => { serverOutput += chunk.toString(); });

  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    await testMobileCustomerJourney();
    await testDesktopGpsJourney();
    log("all browser smoke checks passed");
  } catch (error) {
    if (serverOutput) console.error("Fieldly dev server output:\n" + serverOutput);
    throw error;
  } finally {
    await browser?.close().catch(() => undefined);
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => server.once("exit", resolve)),
        delay(5000),
      ]);
      if (server.exitCode === null) server.kill("SIGKILL");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
