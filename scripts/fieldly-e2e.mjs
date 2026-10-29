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

async function assertHomepageSectionLayout(page, width) {
  const result = await page.evaluate(() => {
    const strip = document.querySelector('[data-testid="benefit-strip"]');
    const grid = document.querySelector('[data-testid="popular-services-grid"]');
    if (!strip || !grid) return { error: "The benefits strip or popular services grid is missing" };
    const benefitItems = Array.from(strip.children).map((el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    const serviceCards = Array.from(grid.children).map((el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    return {
      benefitColumns: getComputedStyle(strip).gridTemplateColumns.split(" ").length,
      serviceColumns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
      benefitItems,
      serviceCards,
    };
  });

  assert.equal(result.error, undefined, "Homepage service sections should render at " + width + "px");
  assert.equal(result.benefitItems.length, 4, "Exactly four benefit items must be present");
  assert.equal(result.serviceColumns, 3, "Popular Services must use three columns at " + width + "px");
  assert.equal(result.benefitColumns, 4, "Benefit strip must remain four columns at " + width + "px");
  for (let i = 1; i < result.benefitItems.length; i += 1) {
    assert.ok(
      Math.abs(result.benefitItems[i].y - result.benefitItems[0].y) <= 2,
      "The four benefit items must stay on one horizontal row at " + width + "px",
    );
  }
  assert.ok(result.serviceCards.length >= 3, "Popular Services should show at least three cards");
  for (let i = 1; i < 3; i += 1) {
    assert.ok(
      Math.abs(result.serviceCards[i].y - result.serviceCards[0].y) <= 2,
      "The first three service images must be aligned in one row at " + width + "px",
    );
    assert.ok(
      result.serviceCards[i].x > result.serviceCards[i - 1].x,
      "Service cards should progress horizontally at " + width + "px",
    );
  }
}

async function testResponsiveViewportMatrix() {
  const widths = [320, 360, 375, 390, 414, 640, 768, 820, 1024, 1280, 1440, 1920];
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await context.newPage();
  await mockExternalServices(page);

  try {
    await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /Construction & Field Equipment Services/i }).waitFor();

    for (const width of widths) {
      const height = width < 600 ? 844 : width < 1024 ? 900 : 1000;
      await page.setViewportSize({ width, height });
      await assertNoHorizontalOverflow(page, "landing at " + width + "px");
      await assertHomepageSectionLayout(page, width);
      const locationButton = page.getByRole("button", { name: /Enter location/ });
      await locationButton.click();
      const dialog = page.locator('[aria-labelledby="fieldly-location-title"]');
      await dialog.waitFor({ state: "visible" });
      await assertNoHorizontalOverflow(page, "location dialog at " + width + "px");
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      await assertNoHorizontalOverflow(page, "landing after closing dialog at " + width + "px");
      log("responsive viewport passed: " + width + "px × " + height + "px");
    }
  } finally {
    await context.close();
  }
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

async function assertMarketplaceServicesLayout(page, width) {
  const result = await page.evaluate(() => {
    const grid = document.querySelector('[data-testid="marketplace-services-grid"]');
    if (!grid) return { error: "Marketplace services grid is missing" };
    const cards = Array.from(grid.children).filter((element) => element.matches("a"));
    return {
      columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
      cards: cards.map((card) => ({
        rect: (() => {
          const r = card.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        })(),
        text: (card.textContent || "").trim().replace(/\s+/g, " "),
        imageCount: card.querySelectorAll("img").length,
        titleCount: card.querySelectorAll("div > span").length,
      })),
    };
  });

  assert.equal(result.error, undefined, "The location-selected services grid should render at " + width + "px");
  assert.equal(result.columns, 3, "Location-selected services must use three columns at " + width + "px");
  assert.ok(result.cards.length >= 3, "The location-selected services view should show service cards");
  for (const card of result.cards) {
    assert.equal(card.imageCount, 1, "Each marketplace service card should have exactly one image");
    assert.ok(card.text.length > 0, "Each marketplace service card should retain its service title");
    assert.ok(
      !/Explore service and request a quote|Rigs, compressors|Digging, earthwork|Lifting for slabs/i.test(card.text),
      "Marketplace service cards should not show description or CTA copy",
    );
  }
  for (let i = 1; i < Math.min(3, result.cards.length); i += 1) {
    assert.ok(
      Math.abs(result.cards[i].rect.y - result.cards[0].rect.y) <= 2,
      "The first three marketplace cards should be in one row at " + width + "px. Positions: " + JSON.stringify(result.cards.map((card) => card.rect)),
    );
  }
}

async function testMarketplaceServicesMatrix() {
  const widths = [320, 360, 375, 390, 414, 640, 768, 820, 1024, 1280, 1440, 1920];
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mockExternalServices(page);

  try {
    const dialog = await openLocationDialog(page);
    await confirmManualWorkSite(dialog);
    await page.getByRole("heading", { name: "Choose a service" }).waitFor();

    for (const width of widths) {
      const height = width < 600 ? 844 : width < 1024 ? 900 : 1000;
      await page.setViewportSize({ width, height });
      await page.mouse.move(2, 2);
      await assertNoHorizontalOverflow(page, "location-selected marketplace at " + width + "px");
      await assertMarketplaceServicesLayout(page, width);
      log("marketplace service-card layout passed: " + width + "px × " + height + "px");
    }

    assert.deepEqual(pageErrors, [], "marketplace service-card view should have no uncaught page errors");
  } finally {
    await context.close();
  }
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
    await page.getByRole("heading", { name: "Confirmed", exact: true }).waitFor();
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
    await testResponsiveViewportMatrix();
    await testMarketplaceServicesMatrix();
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
