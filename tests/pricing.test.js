"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { calculatePricing } = require("../pricing.js");

const scenario = { total: 100, booked: 72, base: 500, season: "high", demand: "normal" };

test("calculates the documented rate, occupancy, price change and nightly metrics", () => {
  const { rate, occupancy, difference, revenue, adr, revpar } = calculatePricing(scenario);
  assert.deepEqual({ rate, occupancy, difference, revenue, adr, revpar }, {
    rate: 660,
    occupancy: 0.72,
    difference: 0.32,
    revenue: 47520,
    adr: 660,
    revpar: 475.2
  });
});

test("uses exclusive occupancy cutoffs and the unrounded ratio", () => {
  const cases = [
    [3999, 0.3999, 90], [4000, 0.4, 100],
    [6999, 0.6999, 100], [7000, 0.7, 110],
    [8999, 0.8999, 110], [9000, 0.9, 125],
    [10000, 1, 125]
  ];
  for (const [booked, occupancy, rate] of cases) {
    const result = calculatePricing({ ...scenario, total: 10000, booked, base: 100, season: "shoulder" });
    assert.equal(result.occupancy, occupancy);
    assert.equal(result.rate, rate, `rate at occupancy ${occupancy}`);
  }
});

test("applies every season and demand multiplier", () => {
  const neutral = { ...scenario, booked: 50, base: 100, season: "shoulder" };
  for (const [season, rate] of Object.entries({ low: 85, shoulder: 100, high: 120, peak: 140 })) {
    assert.equal(calculatePricing({ ...neutral, season }).rate, rate, season);
  }
  for (const [demand, rate] of Object.entries({ low: 90, normal: 100, high: 115 })) {
    assert.equal(calculatePricing({ ...neutral, demand }).rate, rate, demand);
  }
});

test("applies the weekend multiplier before rounding and uses the rounded rate for revenue", () => {
  const result = calculatePricing({
    total: 2, booked: 1, base: 100.03, season: "peak", demand: "high"
  }, 1.10);
  assert.equal(result.rate, 177.15);
  assert.equal(result.revenue, 177.15);
  assert.equal(result.adr, 177.15);
  assert.equal(result.revpar, 88.575);
});

test("with no bookings, ADR is undefined and occupancy, revenue and RevPAR are zero", () => {
  const { rate, occupancy, revenue, adr, revpar } = calculatePricing({ ...scenario, booked: 0 });
  assert.deepEqual({ rate, occupancy, revenue, adr, revpar }, {
    rate: 540, occupancy: 0, revenue: 0, adr: null, revpar: 0
  });
});
