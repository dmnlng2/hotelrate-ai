"use strict";

const { join } = require("node:path");
const { test, expect } = require("@playwright/test");

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

async function enterScenario(page) {
  await page.getByLabel("Rooms booked", { exact: true }).fill("72");
  await page.getByLabel("Base nightly rate (EUR)").fill("500");
  await page.getByRole("combobox", { name: "Season", exact: true }).selectOption("high");
  await page.getByRole("button", { name: "Calculate rate" }).click();
  await expect(page.locator("#rate")).toHaveText("€660.00");
}

async function saveFridayEdit(page) {
  await calendarDay(page, "6 August 2027").click();
  await page.getByLabel("Simulated booked rooms").fill("90");
  await page.getByRole("combobox", { name: "Simulated demand", exact: true }).selectOption("high");
  await page.getByRole("button", { name: "Save date" }).click();
  await expect(page.locator("#storage-message")).toHaveText("Date saved in this browser.");
  await expect(calendarDay(page, "6 August 2027")).toHaveAccessibleName(/€948\.75, 90% simulated occupancy/);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("calculates simulator metrics and rejects bookings above capacity", async ({ page }) => {
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
  await expect(calendarDay(page, "6 August 2027")).toHaveAccessibleName(/€726\.00, 72%/);
  await expect(calendarDay(page, "7 August 2027")).toHaveAccessibleName(/€726\.00, 72%/);
  await expect(calendarDay(page, "8 August 2027")).toHaveAccessibleName(/€660\.00, 72%/);
  await saveFridayEdit(page);
  await expect(calendarDay(page, "7 August 2027")).toHaveAccessibleName(/€726\.00, 72%/);
  await expect(page.locator("#rate")).toHaveText("€660.00");

  await page.getByRole("combobox", { name: "Month", exact: true }).selectOption({ label: "February" });
  await page.getByLabel("Year", { exact: true }).fill("2028");
  await expect(page.locator("#calendar-grid").getByRole("button")).toHaveCount(29);
  await expect(calendarDay(page, "29 February 2028")).toBeVisible();
  await expect(page.locator("#day-editor")).toBeHidden();
});

test("Reset restores and persists scenario defaults while retaining calendar edits", async ({ page }) => {
  await enterScenario(page);
  await saveFridayEdit(page);
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
    await expect(calendarDay(page, "6 August 2027")).toHaveAccessibleName(/Rate pending, 90%/);
  };

  await expectDefaults();
  await page.reload();
  await expectDefaults();
  await calendarDay(page, "6 August 2027").click();
  await expect(page.getByRole("combobox", { name: "Simulated demand", exact: true })).toHaveValue("high");
});

test("previews and confirms CSV separately from simulation, then clears the import on reload", async ({ page }) => {
  await enterScenario(page);
  await saveFridayEdit(page);

  const input = page.getByLabel("Hotel data CSV");
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
  await expect(page.locator("#rate")).toHaveText("€660.00");
  await expect(calendarDay(page, "6 August 2027")).toHaveAccessibleName(/€948\.75, 90%/);

  await page.getByLabel("Base nightly rate (EUR)").fill("600");
  await expect(page.locator("#rate")).toHaveText("€792.00");
  await expect(table.getByRole("cell", { name: "€108.00", exact: true })).toBeVisible();

  await page.reload();
  await expect(table).toBeHidden();
  await expect(confirm).toBeDisabled();
  await expect(page.locator("#hotel-import-status")).toBeEmpty();
  await expect(page.getByLabel("Rooms booked", { exact: true })).toHaveValue("72");
  await expect(page.getByLabel("Base nightly rate (EUR)")).toHaveValue("600");
  await expect(page.getByRole("combobox", { name: "Season", exact: true })).toHaveValue("high");
  await expect(page.locator("#rate")).toHaveText("€792.00");
  await expect(calendarDay(page, "6 August 2027")).toHaveAccessibleName(/€1,138\.50, 90%/);
});

test("rejects invalid CSV before and after a valid import", async ({ page }) => {
  const input = page.getByLabel("Hotel data CSV");
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
