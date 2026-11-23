"use strict";

// Edit these hypothetical pricing assumptions to try a different policy.
// Occupancy bands use exclusive upper bounds and must stay in ascending order.
const PRICING_RULES = {
  occupancy: [
    { below: 0.40, factor: 0.90, label: "under 40%" },
    { below: 0.70, factor: 1.00, label: "40% to under 70%" },
    { below: 0.90, factor: 1.10, label: "70% to under 90%" },
    { below: Infinity, factor: 1.25, label: "90% and above" }
  ],
  season: { low: 0.85, shoulder: 1.00, high: 1.20, peak: 1.40 },
  demand: { low: 0.90, normal: 1.00, high: 1.15 },
  weekend: { days: [5, 6], factor: 1.10 } // Friday and Saturday
};

// Use the unrounded occupancy ratio to choose a band, then multiply
// the base by all three factors. Round the final nightly price to cents.
function calculatePricing({ total, booked, base, season, demand }, weekendFactor = 1) {
  const occupancy = booked / total;
  const band = PRICING_RULES.occupancy.find((rule) => occupancy < rule.below);
  const seasonFactor = PRICING_RULES.season[season];
  const demandFactor = PRICING_RULES.demand[demand];
  const rate = Math.round(base * band.factor * seasonFactor * demandFactor * weekendFactor * 100) / 100;

  // One night, with each booked room modeled at the same suggested rate.
  const revenue = booked * rate;
  return {
    occupancy, band, seasonFactor, demandFactor, rate, revenue,
    difference: (rate - base) / base,
    adr: booked > 0 ? revenue / booked : null,
    revpar: revenue / total
  };
}

if (typeof module !== "undefined") module.exports = { calculatePricing };
