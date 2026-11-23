"use strict";

const { join } = require("node:path");
const { test, expect } = require("@playwright/test");

const sampleXlsx = join(__dirname, "../../sample-hotel-data.xlsx");
const headers = "date,available_rooms,rooms_sold,room_revenue,snapshot_date";
const csv = (...records) => ({
  name: "performance.csv",
  mimeType: "text/csv",
  buffer: Buffer.from([headers, ...records].join("\n"))
});
const data = csv(
  "2025-06-02,30,10,800,2025-05-31",
  "2025-06-02,50,50,2500,2025-06-01",
  "2025-06-01,100,20,2000,2025-06-01",
  "2025-06-03,100,0,0,2025-06-01",
  "2025-07-01,50,40,4000,2025-06-01"
);

const navigate = (page, name) => page.getByRole("navigation", { name: "Workspace" })
  .getByRole("link", { name, exact: true }).click();
const snapshot = (page) => page.getByLabel("Snapshot date", { exact: true });
const day = (page, date) => page.locator(`#performance-grid button[data-date="${date}"]`);
const month = (page) => page.locator("#performance-month");
const metric = (page, scope, label) => page.locator(`#performance-${scope} div`)
  .filter({ has: page.getByText(label, { exact: true }) }).locator("dd");
const confirmImport = (page) => page.getByRole("button", { name: "Confirm Import" });

async function previewFile(page, file) {
  await navigate(page, "Data Import");
  await page.getByLabel("Hotel data CSV or Excel").setInputFiles(file);
  await expect(confirmImport(page)).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("shows a useful empty workspace and follows browser history", async ({ page }) => {
  await navigate(page, "Hotel Performance");
  await expect(page).toHaveURL(/#hotel-performance$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page.locator("#workspace-mode")).toHaveText("Imported hotel data");
  await expect(page.getByText("No hotel data imported yet. Import a CSV or Excel file to explore daily performance.")).toBeVisible();
  await expect(snapshot(page)).toBeHidden();
  await page.getByRole("link", { name: "Go to Data Import" }).click();
  await expect(page).toHaveURL(/#data-import$/);
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hotel Performance");
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Data Import");
});

test("uses only confirmed CSV data and shows weighted monthly and daily KPIs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await previewFile(page, data);
  await navigate(page, "Hotel Performance");
  await expect(page.locator("#performance-empty")).toBeVisible();
  await navigate(page, "Data Import");
  await confirmImport(page).click();
  await navigate(page, "Hotel Performance");
  await expect(snapshot(page)).toHaveValue("2025-06-01");
  await expect(snapshot(page).locator("option")).toHaveText(["2025-06-01", "2025-05-31"]);
  await expect(month(page)).toHaveText("June 2025");
  await expect(page.locator("#performance-coverage")).toHaveText("3 imported dates in this month.");
  await expect(page.locator("#performance-grid .calendar-weekday")).toHaveText(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  await expect(day(page, "2025-06-01")).toHaveCSS("grid-column-start", "7");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  for (const [label, value] of [
    ["Available room-nights", "250"], ["Sold room-nights", "70"], ["Occupancy", "28%"],
    ["ADR", "€64.29"], ["RevPAR", "€18.00"], ["Room revenue", "€4,500.00"]
  ]) {
    await expect(metric(page, "monthly", label)).toHaveText(value);
  }

  const populated = day(page, "2025-06-02");
  await expect(populated).toHaveAccessibleName(/100% occupancy, ADR €50\.00/);
  await populated.focus();
  await page.keyboard.press("Enter");
  await expect(populated).toBeFocused();
  await expect(populated).toHaveAttribute("aria-pressed", "true");
  for (const [label, value] of [
    ["Stay date", "2025-06-02"], ["Snapshot date", "2025-06-01"], ["Available rooms", "50"],
    ["Rooms sold", "50"], ["Occupancy", "100%"], ["ADR", "€50.00"],
    ["RevPAR", "€50.00"], ["Room revenue", "€2,500.00"]
  ]) {
    await expect(metric(page, "daily", label)).toHaveText(value);
  }
  await day(page, "2025-06-03").click();
  await expect(metric(page, "daily", "Occupancy")).toHaveText("0%");
  await expect(metric(page, "daily", "ADR")).toHaveText("N/A");
  const missing = day(page, "2025-06-04");
  await expect(missing).toHaveAccessibleName(/no imported data/);
  await expect(missing).toHaveText("4—");
  await missing.click();
  await expect(page.locator("#performance-detail-status")).toHaveText(/No imported data for this date/);
  await expect(page.locator("#performance-daily")).toBeHidden();
});

test("switches snapshots without combining stays, navigates months and preserves selection", async ({ page }) => {
  await previewFile(page, data);
  await confirmImport(page).click();
  await navigate(page, "Hotel Performance");
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(month(page)).toHaveText("July 2025");
  await expect(metric(page, "monthly", "Occupancy")).toHaveText("80%");
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.locator("#performance-coverage")).toHaveText("No imported data for this month in the selected snapshot.");
  await expect(page.locator("#performance-monthly")).toBeHidden();
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(month(page)).toHaveText("July 2025");

  await snapshot(page).selectOption("2025-05-31");
  await expect(month(page)).toHaveText("June 2025");
  await expect(page.locator("#performance-coverage")).toHaveText("1 imported date in this month.");
  await expect(day(page, "2025-06-02")).toHaveAttribute("aria-pressed", "true");
  await expect(metric(page, "daily", "Occupancy")).toHaveText("33.33%");
  await expect(metric(page, "monthly", "ADR")).toHaveText("€80.00");
  await navigate(page, "Overview");
  await page.goBack();
  await expect(snapshot(page)).toHaveValue("2025-05-31");
  await expect(day(page, "2025-06-02")).toHaveAttribute("aria-pressed", "true");
});

test("replaces the dataset with XLSX and clears it on refresh while preserving simulation and overrides", async ({ page }) => {
  await navigate(page, "Rate Simulator");
  await page.getByLabel("Rooms booked", { exact: true }).fill("72");
  await page.getByLabel("Base nightly rate (EUR)").fill("500");
  await navigate(page, "Pricing Calendar");
  const friday = page.getByRole("button", { name: /Friday 6 August 2027,/ });
  await friday.click();
  await page.getByLabel("Simulated booked rooms").fill("90");
  await page.getByRole("button", { name: "Save date" }).click();
  await expect(friday).toHaveAccessibleName(/90% simulated occupancy, saved override/);
  const calendarLabel = await friday.getAttribute("aria-label");
  const storage = () => page.evaluate(() => Object.entries(localStorage).sort());
  const saved = await storage();

  await previewFile(page, data);
  await confirmImport(page).click();
  await navigate(page, "Hotel Performance");
  await snapshot(page).selectOption("2025-05-31");
  await previewFile(page, sampleXlsx);
  await navigate(page, "Hotel Performance");
  await expect(snapshot(page)).toHaveValue("2025-05-31");
  await navigate(page, "Data Import");
  await confirmImport(page).click();
  await navigate(page, "Hotel Performance");
  await expect(snapshot(page)).toHaveValue("2026-11-21");
  await expect(snapshot(page).locator("option")).toHaveCount(4);
  await expect(month(page)).toHaveText("August 2027");
  await expect(metric(page, "daily", "Rooms sold")).toHaveText("55");
  expect(await storage()).toEqual(saved);

  await navigate(page, "Pricing Calendar");
  await page.locator("#calendar-month").selectOption("7");
  await page.locator("#calendar-year").fill("2027");
  await expect(page.locator('#calendar-grid [data-date="2027-08-06"]')).toHaveAccessibleName(/55% imported occupancy.*IMPORTED DATA/);

  await navigate(page, "Hotel Performance");
  await page.reload();
  await expect(page.locator("#performance-empty")).toBeVisible();
  await expect(snapshot(page)).toBeHidden();
  expect(await storage()).toEqual(saved);
  await navigate(page, "Pricing Calendar");
  await expect(friday).toHaveAccessibleName(calendarLabel);
  await navigate(page, "Rate Simulator");
  await expect(page.getByLabel("Rooms booked", { exact: true })).toHaveValue("72");
  await expect(page.getByLabel("Base nightly rate (EUR)")).toHaveValue("500");
});

test("prices imported stays from actual occupancy while retaining simulated overrides and source labels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, "Rate Simulator");
  await page.getByLabel("Rooms booked", { exact: true }).fill("90");
  await page.getByLabel("Base nightly rate (EUR)").fill("500");
  await navigate(page, "Pricing Calendar");
  const calendarDay = (date) => page.locator(`#calendar-grid [data-date="${date}"]`);
  const friday = calendarDay("2027-08-06");
  await friday.click();
  await page.getByLabel("Simulated booked rooms").fill("95");
  await page.getByRole("button", { name: "Save date" }).click();

  await previewFile(page, csv(
    "2027-08-06,100,80,8000,2027-07-01",
    "2027-08-05,100,20,2000,2027-07-01",
    "2027-08-06,100,55,5500,2027-07-02",
    "2027-08-08,100,,800,2027-07-02",
    "2027-08-09,100,55,,2027-07-02"
  ));
  await confirmImport(page).click();
  await navigate(page, "Hotel Performance");
  await expect(metric(page, "daily", "Occupancy")).toHaveText("55%");
  await expect(metric(page, "monthly", "Occupancy")).toHaveText("N/A");

  await navigate(page, "Pricing Calendar");
  await expect(friday.locator(".calendar-source")).toHaveText("IMPORTED DATA");
  await expect(friday).toHaveAccessibleName(/€550\.00, 55% imported occupancy/);
  await expect(calendarDay("2027-08-05")).toHaveAccessibleName(/20% imported occupancy/);
  await expect(calendarDay("2027-08-07").locator(".calendar-source")).toHaveText("SIMULATION");
  await expect(calendarDay("2027-08-07")).toHaveAccessibleName(/90% simulated occupancy/);
  const incomplete = calendarDay("2027-08-08");
  await expect(incomplete.locator(".calendar-source")).toHaveText("INCOMPLETE DATA");
  await expect(incomplete).toHaveAccessibleName(/Occupancy unavailable.*Missing rooms sold/);
  await incomplete.click();
  await expect(page.locator("#day-data-status")).toHaveText("Missing rooms sold.");
  await expect(page.locator("#day-value")).toHaveText("€800.00");
  await expect(calendarDay("2027-08-09")).toHaveAccessibleName(/€500\.00, 55% imported occupancy.*INCOMPLETE DATA.*Missing room revenue/);

  await friday.click();
  await expect(page.locator("#day-snapshot")).toHaveText("2027-07-02");
  await expect(page.locator("#day-available")).toHaveText("100");
  await expect(page.locator("#day-sold")).toHaveText("55");
  await expect(page.locator("#day-value")).toHaveText("€5,500.00");
  await expect(page.locator("#day-adr")).toHaveText("€100.00");
  await expect(page.getByLabel("Simulated booked rooms")).toBeHidden();
  await page.getByLabel("Date demand").selectOption("high");
  await page.getByRole("button", { name: "Save date" }).click();
  await expect(page.locator("#day-rate")).toHaveText("€632.50");
  await expect(page.locator("#day-occupancy")).toHaveText("55%");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await navigate(page, "Rate Simulator");
  await expect(page.locator("#occupancy")).toHaveText("90% occupancy");
  await page.getByLabel("Total rooms", { exact: true }).fill("10");
  await navigate(page, "Pricing Calendar");
  await expect(friday).toHaveAccessibleName(/€632\.50, 55% imported occupancy/);
  await expect(calendarDay("2027-08-07")).toHaveAccessibleName(/Occupancy unavailable.*SIMULATION/);

  await previewFile(page, csv("2027-08-06,100,75,9000,2027-07-03"));
  await navigate(page, "Pricing Calendar");
  await expect(friday).toHaveAccessibleName(/55% imported occupancy/);
  await navigate(page, "Data Import");
  await confirmImport(page).click();
  await navigate(page, "Hotel Performance");
  await expect(metric(page, "daily", "Occupancy")).toHaveText("75%");
  await navigate(page, "Pricing Calendar");
  await expect(friday).toHaveAccessibleName(/€695\.75, 75% imported occupancy/);
  await expect(page.locator("#day-value")).toHaveText("€9,000.00");
  await expect(calendarDay("2027-08-05").locator(".calendar-source")).toHaveText("SIMULATION");
});
