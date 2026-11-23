"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const { MAX_XLSX_BYTES, parseHotelCsv, parseHotelXlsx, readHotelXlsx } = require("../hotel-import.js");
const { example, headers, workbookBytes } = require("./xlsx-fixtures.js");

const parse = (rows, options) => parseHotelXlsx(workbookBytes(rows, options));
const changed = (column, value) => example.with(column, value);
const expected = parseHotelCsv([headers, example].map(row => row.join(",")).join("\n"));

test("imports the downloadable workbook and matches every CSV record and metric", async () => {
  const read = (extension) => readFileSync(join(__dirname, `../sample-hotel-data.${extension}`));
  const file = Object.assign(new Blob([read("xlsx")]), { name: "sample-hotel-data.xlsx" });
  assert.deepEqual(await readHotelXlsx(file), parseHotelCsv(read("csv").toString()));
});

test("reads strict text dates and native numbers from only the first worksheet", () => {
  assert.deepEqual(parse([headers, example], { secondSheet: true }), expected);
});

test("converts native date cells in UTC", () => {
  const row = changed(0, { t: "d", v: new Date("2024-02-29T00:00:00Z"), z: "General" });
  assert.deepEqual(parse([headers, row]), expected);
});

test("converts formatted serial dates in the 1900 system across Excel's leap-year bug", () => {
  const date = (v) => ({ t: "n", v, z: "yyyy-mm-dd" });
  const rows = parse([headers, [date(59), 100, 72, 10800.5, date(61)]]);
  assert.equal(rows[0].date, "1900-02-28");
  assert.equal(rows[0].snapshotDate, "1900-03-01");
  assert.throws(() => parse([headers, changed(0, date(60))]), /Excel row 2: date must/);
});

test("converts formatted serial dates at the start of the 1904 system", () => {
  const date = (v) => ({ t: "n", v, z: "yyyy-mm-dd" });
  const rows = parse([headers, [date(0), 100, 72, 10800.5, date(1)]], { date1904: true });
  assert.equal(rows[0].date, "1904-01-01");
  assert.equal(rows[0].snapshotDate, "1904-01-02");
});

test("rejects ambiguous text, invalid calendar dates, plain numbers and time-only cells", () => {
  for (const invalid of ["29/02/2024", "2023-02-29", 45351, { t: "n", v: 0.5, z: "hh:mm" }, { t: "n", v: 2, z: "[h]" }]) {
    assert.throws(() => parse([headers, changed(0, invalid)]), /Excel row 2: date must/);
  }
  assert.throws(() => parse([headers, changed(4, "2024-04-31")]), /Excel row 2: snapshot_date must/);
});

test("rejects missing and duplicate required headers", () => {
  assert.throws(() => parse([headers.with(4, "Snapshot_Date"), example]), /Excel row 1: Missing.*snapshot_date/);
  assert.throws(() => parse([[...headers, "date"], example]), /Excel row 1: Use unique/);
});

test("rejects negative, fractional, nonnumeric and excessive room counts", () => {
  for (const invalid of [-1, 10.5, "one", true, 101]) {
    assert.throws(() => parse([headers, changed(2, invalid)]), /Excel row 2: rooms_sold/);
  }
  assert.throws(() => parse([headers, changed(1, 0)]), /Excel row 2: available_rooms/);
});

test("uses shared revenue validation for native and text cells", () => {
  for (const invalid of [-1, "€12", true]) {
    assert.throws(() => parse([headers, changed(3, invalid)]), /Excel row 2: room_revenue/);
  }
  assert.throws(() => parse([headers, changed(2, 0)]), /room_revenue must be 0/);
  assert.equal(parse([headers, changed(3, 1e-25)])[0].roomRevenue, 1e-25);
});

test("rejects duplicate normalized date and snapshot pairs with both row numbers", () => {
  const native = changed(0, { t: "d", v: new Date("2024-02-29T00:00:00Z") });
  assert.throws(() => parse([headers, example, native]), /Excel row 3: Duplicate.*Excel row 2/);
});

test("rejects empty and header-only worksheets and identifies physical blank rows", () => {
  assert.throws(() => parse([], { secondSheet: true }), /Excel row 1:.*empty/);
  assert.throws(() => parse([headers]), /Excel row 1: Add at least one/);
  assert.throws(() => parse([headers, [], example]), /Excel row 2: date must/);
});

test("rejects malformed workbooks and renamed non-XLSX files", () => {
  for (const file of [Buffer.alloc(0), Buffer.from("PK\x03\x04broken"), Buffer.from("date,available_rooms"), Uint8Array.of(1)]) {
    assert.throws(() => parseHotelXlsx(file), /Choose a valid .xlsx workbook/);
  }
});

test("rejects formulas with and without a cached value in every required field", () => {
  for (const [index, name] of headers.entries()) {
    for (const formula of [{ t: "n", f: "50+50", v: 100 }, { t: "n", f: "50+50" }]) {
      assert.throws(() => parse([headers, changed(index, formula)]), new RegExp(`Excel row 2: ${name}.*formula`));
    }
  }
});

test("rejects oversized Excel uploads before reading them", async () => {
  const file = { name: "large.xlsx", size: MAX_XLSX_BYTES + 1, arrayBuffer: () => assert.fail("File was read") };
  await assert.rejects(readHotelXlsx(file), /exceeds 5 MiB/);
});
