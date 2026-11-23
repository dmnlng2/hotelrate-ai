"use strict";

const { join } = require("node:path");
const { test, expect } = require("@playwright/test");

const { headers, example, workbookBytes } = require("../xlsx-fixtures.js");

const sampleXlsx = join(__dirname, "../../sample-hotel-data.xlsx");
const excelUpload = (rows) => ({
  name: "hotel.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  buffer: workbookBytes(rows)
});
const sampleCsv = join(__dirname, "../../sample-hotel-data.csv");
const invalidCsv = {
  name: "invalid.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(
    "date,available_rooms,rooms_sold,room_revenue,snapshot_date\n" +
    "2027-08-06,100,101,7200,2026-11-20\n"
  )
};

const calendarDay = (page, date) =>
  page.getByRole("button", { name: new RegExp(`\\b${date},`) });

async function openView(page, name) {
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
}

async function enterScenario(page) {
  await openView(page, "Rate Simulator");
  await page.getByLabel("Rooms booked", { exact: true }).fill("72");
  await page.getByLabel("Base nightly rate (EUR)").fill("500");
  await page.getByRole("combobox", { name: "Season", exact: true }).selectOption("high");
  await page.getByRole("button", { name: "Calculate rate" }).click();
  await expect(page.locator("#rate")).toHaveText("€660.00");
}

async function saveFridayEdit(page) {
  await openView(page, "Pricing Calendar");
  await calendarDay(page, "6 August 2027").click();
  await page.getByLabel("Simulated booked rooms").fill("90");
  await page.getByRole("combobox", { name: "Simulated demand", exact: true }).selectOption("high");
  await page.getByRole("button", { name: "Save date" }).click();
  await expect(page.locator("#storage-message")).toHaveText("Date saved in this browser.");
  const friday = calendarDay(page, "6 August 2027");
  await expect(friday).toHaveAccessibleName(/€948\.75, 90% simulated occupancy, saved override/);
  await expect(friday).toHaveAttribute("aria-pressed", "true");
  await expect(friday.getByText("Override", { exact: true })).toBeVisible();
  await expect(page.locator("#day-override")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("calculates simulator metrics and rejects bookings above capacity", async ({ page }) => {
  await openView(page, "Rate Simulator");
  await expect(page.locator("#scenario-info")).toHaveText(/Enter a base rate above €0/);
  await expect(page.locator("#results")).toBeHidden();
  await enterScenario(page);
  await expect(page.locator("#occupancy")).toHaveText("72% occupancy");
  await expect(page.locator("#difference")).toHaveText("+32% vs base rate");
  await expect(page.locator("#adr")).toHaveText("€660.00");
  await expect(page.locator("#revpar")).toHaveText("€475.20");
  await expect(page.locator("#revenue")).toHaveText("€47,520.00");

  const bookings = page.getByLabel("Rooms booked", { exact: true });
  await bookings.fill("101");
  await page.getByRole("button", { name: "Calculate rate" }).click();
  await expect(page.locator("#error")).toHaveText("Booked rooms cannot exceed total rooms.");
  await expect(bookings).toBeFocused();
  await expect(page.locator("#results")).toBeHidden();
  await bookings.fill("0");
  await expect(page.locator("#adr")).toHaveText("N/A");
  await expect(page.locator("#revpar")).toHaveText("€0.00");
});

test("renders leap-year dates and applies weekend and per-date pricing", async ({ page }) => {
  await enterScenario(page);
  await openView(page, "Pricing Calendar");
  await expect(calendarDay(page, "6 August 2027")).toHaveAccessibleName(/€726\.00, 72%/);
  await expect(calendarDay(page, "7 August 2027")).toHaveAccessibleName(/€726\.00, 72%/);
  await expect(calendarDay(page, "8 August 2027")).toHaveAccessibleName(/€660\.00, 72%/);
  await saveFridayEdit(page);
  await expect(calendarDay(page, "7 August 2027")).toHaveAccessibleName(/€726\.00, 72%/);
  await openView(page, "Rate Simulator");
  await expect(page.locator("#rate")).toHaveText("€660.00");

  await openView(page, "Pricing Calendar");
  await page.getByRole("combobox", { name: "Month", exact: true }).selectOption({ label: "February" });
  await page.getByLabel("Year", { exact: true }).fill("2028");
  await expect(page.locator("#calendar-grid").getByRole("button")).toHaveCount(29);
  await expect(calendarDay(page, "29 February 2028")).toBeVisible();
  await expect(page.locator("#day-editor")).toBeHidden();
});

test("Reset restores and persists scenario defaults while retaining calendar edits", async ({ page }) => {
  await enterScenario(page);
  await saveFridayEdit(page);
  await openView(page, "Rate Simulator");
  await page.getByLabel("Total rooms").fill("120");
  await page.getByRole("combobox", { name: "Market demand", exact: true }).selectOption("low");
  await page.getByRole("button", { name: "Reset", exact: true }).click();

  const expectDefaults = async () => {
    await expect(page.getByLabel("Total rooms")).toHaveValue("100");
    await expect(page.getByLabel("Rooms booked", { exact: true })).toHaveValue("0");
    await expect(page.getByLabel("Base nightly rate (EUR)")).toHaveValue("0");
    await expect(page.getByRole("combobox", { name: "Season", exact: true })).toHaveValue("shoulder");
    await expect(page.getByRole("combobox", { name: "Market demand", exact: true })).toHaveValue("normal");
    await expect(page.locator("#results")).toBeHidden();
    await openView(page, "Pricing Calendar");
    await expect(calendarDay(page, "6 August 2027")).toHaveAccessibleName(/Rate pending, 90%/);
  };

  await expectDefaults();
  await page.reload();
  await openView(page, "Rate Simulator");
  await expectDefaults();
  await calendarDay(page, "6 August 2027").click();
  await expect(page.getByRole("combobox", { name: "Simulated demand", exact: true })).toHaveValue("high");
});

test("previews and confirms CSV separately from simulation, then clears the import on reload", async ({ page }) => {
  await enterScenario(page);
  await saveFridayEdit(page);
  await openView(page, "Data Import");

  const input = page.getByLabel("Hotel data CSV or Excel");
  const confirm = page.getByRole("button", { name: "Confirm Import" });
  const table = page.getByRole("table");
  await expect(confirm).toBeDisabled();
  await input.setInputFiles(sampleCsv);
  await expect(table).toHaveAccessibleName("CSV preview · Showing 4 of 4 records");
  await expect(table.locator("tbody tr")).toHaveCount(4);
  await expect(table.locator("tbody tr").first().getByRole("cell")).toHaveText([
    "2025-08-14", "2025-08-15", "100", "72", "€10,800.00",
    "Room revenue", "72%", "€150.00", "€108.00"
  ]);
  await expect(table.getByRole("row", { name: /2027-08-06/ })).toHaveCount(2);
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(table).toHaveAccessibleName("Imported data · Showing 4 of 4 records");
  await expect(page.locator("#hotel-import-status")).toHaveText(/4 records imported/);
  await expect(confirm).toBeDisabled();
  await openView(page, "Rate Simulator");
  await expect(page.locator("#rate")).toHaveText("€660.00");
  await openView(page, "Pricing Calendar");
  await expect(calendarDay(page, "6 August 2027")).toHaveAccessibleName(/€948\.75, 90%/);

  await openView(page, "Rate Simulator");
  await page.getByLabel("Base nightly rate (EUR)").fill("600");
  await expect(page.locator("#rate")).toHaveText("€792.00");
  await openView(page, "Overview");
  await expect(page.locator("[data-overview-metric=revpar]")).toHaveText("€570.24");
  await expect(table).toBeHidden();
  await openView(page, "Data Import");
  await expect(table.getByRole("cell", { name: "€108.00", exact: true })).toBeVisible();

  await page.reload();
  await expect(table).toBeHidden();
  await expect(confirm).toBeDisabled();
  await expect(page.locator("#hotel-import-status")).toBeEmpty();
  await openView(page, "Rate Simulator");
  await expect(page.getByLabel("Rooms booked", { exact: true })).toHaveValue("72");
  await expect(page.getByLabel("Base nightly rate (EUR)")).toHaveValue("600");
  await expect(page.getByRole("combobox", { name: "Season", exact: true })).toHaveValue("high");
  await expect(page.locator("#rate")).toHaveText("€792.00");
  await openView(page, "Pricing Calendar");
  await expect(calendarDay(page, "6 August 2027")).toHaveAccessibleName(/€1,138\.50, 90%/);
});

test("rejects invalid CSV before and after a valid import", async ({ page }) => {
  await openView(page, "Data Import");
  const input = page.getByLabel("Hotel data CSV or Excel");
  const confirm = page.getByRole("button", { name: "Confirm Import" });
  const table = page.getByRole("table");
  const expectRejection = async () => {
    await expect(page.locator("#hotel-import-error")).toHaveText(/row 2: rooms_sold/i);
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(confirm).toBeDisabled();
  };

  await input.setInputFiles(invalidCsv);
  await expectRejection();
  await expect(table).toBeHidden();

  await input.setInputFiles(sampleCsv);
  await expect(confirm).toBeEnabled();
  await expect(page.locator("#hotel-import-error")).toBeEmpty();
  await confirm.click();
  await expect(table).toHaveAccessibleName("Imported data · Showing 4 of 4 records");

  await input.setInputFiles(invalidCsv);
  await expectRejection();
  await expect(table).toHaveAccessibleName("Imported data · Showing 4 of 4 records");
  await expect(table.locator("tbody tr")).toHaveCount(4);
});

test("downloads, previews and confirms Excel without changing saved simulator data", async ({ page }) => {
  await enterScenario(page);
  await saveFridayEdit(page);
  const storage = () => page.evaluate(() => Object.entries(localStorage).sort());
  const saved = await storage();
  await openView(page, "Data Import");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download sample Excel" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("sample-hotel-data.xlsx");
  const input = page.getByLabel("Hotel data CSV or Excel");
  const confirm = page.getByRole("button", { name: "Confirm Import" });
  const table = page.getByRole("table");
  await expect(confirm).toBeDisabled();
  await input.setInputFiles(sampleXlsx);
  await expect(page.locator("#hotel-import-file")).toHaveText("sample-hotel-data.xlsx · Excel (.xlsx)");
  await expect(table).toHaveAccessibleName("Excel preview · Showing 4 of 4 records");
  await expect(table.locator("tbody tr").first().getByRole("cell")).toHaveText([
    "2025-08-14", "2025-08-15", "100", "72", "€10,800.00",
    "Room revenue", "72%", "€150.00", "€108.00"
  ]);
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(table).toHaveAccessibleName("Imported data · Showing 4 of 4 records");
  await expect(confirm).toBeDisabled();
  expect(await storage()).toEqual(saved);

  await openView(page, "Overview");
  await expect(page.locator("[data-overview-metric=revpar]")).toHaveText("€475.20");
  await openView(page, "Data Import");
  await page.reload();
  await expect(table).toBeHidden();
  await expect(confirm).toBeDisabled();
  await expect(page.locator("#hotel-import-file")).toBeHidden();
  expect(await storage()).toEqual(saved);
  await openView(page, "Pricing Calendar");
  await expect(calendarDay(page, "6 August 2027")).toHaveAccessibleName(/€948\.75, 90%/);
});

test("validates beyond the 50-row Excel preview and clears pending records on failure", async ({ page }) => {
  await openView(page, "Data Import");
  const input = page.getByLabel("Hotel data CSV or Excel");
  const confirm = page.getByRole("button", { name: "Confirm Import" });
  const table = page.getByRole("table");
  const rows = Array.from({ length: 55 }, (_, index) => [
    new Date(Date.UTC(2024, 0, index + 1)), ...example.slice(1)
  ]);
  const valid = excelUpload([headers, ...rows]);
  const invalid = excelUpload([headers, ...rows.slice(0, -1), [rows.at(-1)[0], 100, 101, 500, example[4]]]);

  await input.setInputFiles(valid);
  await expect(table).toHaveAccessibleName("Excel preview · Showing 50 of 55 records");
  await expect(table.locator("tbody tr")).toHaveCount(50);
  await expect(confirm).toBeEnabled();
  await input.setInputFiles(invalid);
  await expect(page.locator("#hotel-import-error")).toHaveText(/Excel row 56: rooms_sold/);
  await expect(table).toBeHidden();
  await expect(confirm).toBeDisabled();

  await input.setInputFiles(valid);
  await confirm.click();
  await expect(table).toHaveAccessibleName("Imported data · Showing 50 of 55 records");
  await expect(page.locator("#hotel-import-status")).toHaveText(/55 records imported/);
  await input.setInputFiles(invalid);
  await expect(page.locator("#hotel-import-error")).toHaveText(/Excel row 56: rooms_sold/);
  await expect(table).toHaveAccessibleName("Imported data · Showing 50 of 55 records");
  await expect(confirm).toBeDisabled();
});

test("workspace navigation shows one view and follows browser history", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const nav = page.getByRole("navigation", { name: "Workspace" });
  const expectView = async (name, hash) => {
    await expect(page).toHaveURL(new RegExp(`/${hash}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(nav.locator('[aria-current="page"]')).toHaveText(name);
    await expect(page.locator("[data-view]:visible")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  };

  await expectView("Overview", "");
  await expect(page.locator("#overview-empty")).toBeVisible();
  await openView(page, "Rate Simulator");
  await expectView("Rate Simulator", "#simulator");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await openView(page, "Pricing Calendar");
  await expectView("Pricing Calendar", "#calendar");
  await openView(page, "Data Import");
  await expectView("Data Import", "#data-import");
  await expect(page.locator("#workspace-mode")).toHaveText("Hotel CSV and Excel data");

  await page.goBack();
  await expectView("Pricing Calendar", "#calendar");
  await page.goBack();
  await expectView("Rate Simulator", "#simulator");
  await page.goBack();
  await expectView("Overview", "");
  await page.goForward();
  await expectView("Rate Simulator", "#simulator");
  await page.goForward();
  await expectView("Pricing Calendar", "#calendar");
  await page.goForward();
  await expectView("Data Import", "#data-import");

  await page.goto("/#calendar");
  await expectView("Pricing Calendar", "#calendar");
  await page.reload();
  await expectView("Pricing Calendar", "#calendar");
  await page.goto("/#unknown");
  await expectView("Overview", "#unknown");
});

test("Overview displays the current simulated metrics or an empty state", async ({ page }) => {
  await expect(page.locator("#overview-empty")).toBeVisible();
  await expect(page.locator("#overview-metrics")).toBeHidden();
  await enterScenario(page);
  await openView(page, "Overview");
  const metrics = page.locator("#overview-metrics");
  await expect(page.locator("#workspace-mode")).toHaveText("Simulation data");
  await expect(metrics.locator("dd")).toHaveText(["€660.00", "72%", "€660.00", "€475.20", "€47,520.00"]);
  await expect(metrics).toBeVisible();
  await expect(page.locator("#overview-empty")).toBeHidden();

  await openView(page, "Rate Simulator");
  await page.getByLabel("Rooms booked", { exact: true }).fill("101");
  await openView(page, "Overview");
  await expect(metrics).toBeHidden();
  await expect(page.locator("#overview-empty")).toBeVisible();
});
