"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const { MAX_FILE_BYTES, parseHotelCsv, readHotelCsv } = require("../hotel-import.js");

const header = "date,available_rooms,rooms_sold,room_revenue,snapshot_date";
const validRow = "2024-02-29,100,72,10800.50,2024-03-01";
const csv = (row) => header + "\n" + row;
const file = (text, name = "data.csv") => Object.assign(new Blob([text]), { name });

test("reads the sample and computes occupancy, ADR and RevPAR", async () => {
  const sample = readFileSync(join(__dirname, "../sample-hotel-data.csv"));
  const rows = await readHotelCsv(file(sample));
  assert.equal(rows.length, 4);
  assert.equal(rows[0].occupancy, 0.72);
  assert.equal(rows[0].adr, 150);
  assert.equal(rows[0].revpar, 108);
  assert.equal(rows[2].date, rows[3].date);
  assert.notEqual(rows[2].snapshotDate, rows[3].snapshotDate);
});

test("handles BOM, reordered headers, CRLF, quoted fields and escaped quotes", async () => {
  const text = '\uFEFF"snapshot_date",date,rooms_sold,room_revenue,available_rooms,notes\r\n' +
    '"2024-03-01","2024-02-29",2,"201.50",4,"Check-in, ""confirmed""\r\nby staff"\r\n';
  const [row] = await readHotelCsv(file(text, "DATA.CSV"));
  assert.equal(row.roomRevenue, 201.5);
  assert.equal(row.occupancy, 0.5);
  assert.equal(row.adr, 100.75);
  assert.equal(row.revpar, 50.375);
});

test("rejects malformed CSV with physical line numbers", () => {
  assert.throws(() => parseHotelCsv(csv('"2024-02-29')), /row 2.*Close the quoted field/);
  assert.throws(() => parseHotelCsv(csv('"2024-02-29"x,100,72,10800,2024-03-01')), /row 2.*Unexpected/);
  assert.throws(() => parseHotelCsv(csv('2024-02-29,100,72,108"00,2024-03-01')), /row 2.*Unexpected/);
  assert.throws(() => parseHotelCsv(csv(validRow + ",extra")), /row 2.*Expected 5 fields/);
  const multiline = header + ",notes\r\n" + validRow + ',"first\r\nsecond"\r\nshort';
  assert.throws(() => parseHotelCsv(multiline), /row 4.*Expected 6 fields/);
});

test("rejects duplicate date and snapshot_date pairs and reports the original row", () => {
  assert.throws(() => parseHotelCsv(csv(validRow + "\n" + validRow)), /row 3.*Duplicate.*row 2/);
});

test("rejects invalid dates in either date column", () => {
  for (const date of ["2025-02-29", "2024-04-31", "2024-2-29", "0000-01-01", "2024-13-01", "2024-02-29 "]) {
    assert.throws(() => parseHotelCsv(csv(`${date},100,72,10800,2024-03-01`)), /row 2: date must/);
    assert.throws(() => parseHotelCsv(csv(`2024-02-29,100,72,10800,${date}`)), /row 2: snapshot_date must/);
  }
});

test("rejects invalid capacity, bookings and revenue", () => {
  for (const capacity of ["0", "-1", "2.5", "", "9007199254740992"]) {
    assert.throws(() => parseHotelCsv(csv(`2024-02-29,${capacity},1,10,2024-03-01`)), /row 2: available_rooms/);
  }
  for (const bookings of ["101", "-1", "2.5", "", '"1\n"']) {
    assert.throws(() => parseHotelCsv(csv(`2024-02-29,100,${bookings},10,2024-03-01`)), /row 2: rooms_sold/);
  }
  for (const revenue of ["-1", "", "Infinity", "NaN", '"1,00"', "9".repeat(310)]) {
    assert.throws(() => parseHotelCsv(csv(`2024-02-29,100,1,${revenue},2024-03-01`)), /row 2: room_revenue/);
  }
});

test("rejects missing columns, repeated headers and empty datasets", () => {
  assert.throws(() => parseHotelCsv("date,available_rooms,rooms_sold"), /row 1.*room_revenue, snapshot_date/);
  assert.throws(() => parseHotelCsv(header + ",date"), /row 1.*unique column names/);
  for (const empty of ["", "\uFEFF", "\r\n", header + "\n"]) {
    assert.throws(() => parseHotelCsv(empty), /row 1.*at least one data row/);
  }
});

test("zero bookings produce zero occupancy and RevPAR and no ADR", () => {
  const [row] = parseHotelCsv(csv("2024-02-29,100,0,0.00,2024-03-01"));
  assert.equal(row.occupancy, 0);
  assert.equal(row.adr, null);
  assert.equal(row.revpar, 0);
  assert.throws(() => parseHotelCsv(csv("2024-02-29,100,0,0.01,2024-03-01")), /row 2.*must be 0/);
});

test("accepts exactly 1 MiB and rejects larger files before reading", async () => {
  const prefix = header + ",notes\n" + validRow + ",";
  const exact = file(prefix + "é".repeat(Math.floor((MAX_FILE_BYTES - prefix.length) / 2)) +
    "x".repeat((MAX_FILE_BYTES - prefix.length) % 2));
  assert.equal(exact.size, MAX_FILE_BYTES);
  assert.equal((await readHotelCsv(exact)).length, 1);
  await assert.rejects(readHotelCsv({
    name: "data.csv",
    size: MAX_FILE_BYTES + 1,
    arrayBuffer: () => assert.fail("Oversized file should not be read")
  }), /exceeds 1 MiB/);
});

test("rejects other file extensions and invalid UTF-8", async () => {
  await assert.rejects(readHotelCsv(file(csv(validRow), "data.xlsx")), /\.csv extension/);
  await assert.rejects(readHotelCsv(file(Uint8Array.of(255))), /valid UTF-8/);
});
