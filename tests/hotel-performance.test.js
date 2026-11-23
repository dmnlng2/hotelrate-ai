"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { parseHotelCsv } = require("../hotel-import.js");
const { groupHotelSnapshots, summarizeHotelMonth } = require("../hotel-performance.js");

const rows = parseHotelCsv([
  "date,available_rooms,rooms_sold,room_revenue,snapshot_date",
  "2025-06-02,30,10,800,2025-05-31",
  "2025-06-01,100,20,2000,2025-06-01",
  "2025-06-02,50,50,2500,2025-06-01",
  "2025-06-03,100,0,0,2025-06-01",
  "2025-07-01,50,40,4000,2025-06-01"
].join("\n"));
const snapshot = groupHotelSnapshots(rows).get("2025-06-01");

test("indexes each stay date within its own snapshot without replacing another snapshot's record", () => {
  const snapshots = groupHotelSnapshots(rows);
  assert.equal(snapshots.size, 2);
  assert.equal(snapshots.get("2025-05-31").get("2025-06-02").roomsSold, 10);
  assert.equal(snapshot.get("2025-06-02").roomsSold, 50);
  assert.equal(snapshot.get("2025-06-04"), undefined);
});

test("uses weighted occupancy, ADR and RevPAR from the visible month and selected snapshot", () => {
  assert.deepEqual(summarizeHotelMonth(snapshot, "2025-06", "2025-06-02"), {
    count: 3, availableRooms: 250, roomsSold: 70, roomRevenue: 4500,
    occupancy: 70 / 250, adr: 4500 / 70, revpar: 18, mixed: true, valueLabel: "Room value"
  });
});

test("labels past-only and future-only totals and returns no metrics for an empty month", () => {
  assert.equal(summarizeHotelMonth(snapshot, "2025-06", "2025-06-03").valueLabel, "Room revenue");
  assert.equal(summarizeHotelMonth(snapshot, "2025-07", "2025-06-03").valueLabel, "Booked room value");
  assert.equal(summarizeHotelMonth(snapshot, "2025-08", "2025-06-03"), null);
});

test("reports zero sold rooms as zero occupancy and RevPAR with undefined ADR", () => {
  const zero = new Map([["2025-06-03", snapshot.get("2025-06-03")]]);
  const summary = summarizeHotelMonth(zero, "2025-06", "2025-06-03");
  assert.equal(summary.occupancy, 0);
  assert.equal(summary.adr, null);
  assert.equal(summary.revpar, 0);
});
