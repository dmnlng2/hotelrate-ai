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
  demand: { low: 0.90, normal: 1.00, high: 1.15 }
};

const byId = (id) => document.getElementById(id);
const form = byId("scenario");
const fields = {
  total: byId("total"),
  booked: byId("booked"),
  base: byId("base"),
  season: byId("season"),
  demand: byId("demand")
};

const euro = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
const percent = new Intl.NumberFormat("en-IE", { style: "percent", maximumFractionDigits: 2 });
const signedPercent = new Intl.NumberFormat("en-IE", {
  style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero"
});
const factorText = (factor) => "× " + factor.toFixed(2);

// Browser constraints check required values, minimums and decimal precision.
// The relationship between the two room counts needs a separate check.
function validateScenario(scenario) {
  const { total, booked, base, season, demand } = scenario;
  if (!fields.total.validity.valid || !Number.isSafeInteger(total)) {
    return { field: "total", message: "Enter a positive whole number of total rooms." };
  }
  if (!fields.booked.validity.valid || !Number.isSafeInteger(booked)) {
    return { field: "booked", message: "Enter a whole number of booked rooms, zero or greater." };
  }
  if (booked > total) {
    return { field: "booked", message: "Booked rooms cannot exceed total rooms." };
  }
  if (!fields.base.validity.valid || !Number.isSafeInteger(Math.round(base * 100))) {
    return { field: "base", message: "Enter a base rate of at least €0.01, in euros and cents." };
  }
  if (!Object.hasOwn(PRICING_RULES.season, season)) {
    return { field: "season", message: "Select a valid season." };
  }
  if (!Object.hasOwn(PRICING_RULES.demand, demand)) {
    return { field: "demand", message: "Select a valid market demand level." };
  }
  return null;
}

// Use the unrounded occupancy ratio to choose a band, then multiply
// the base by all three factors. Round the final nightly price to cents.
function calculatePricing({ total, booked, base, season, demand }) {
  const occupancy = booked / total;
  const band = PRICING_RULES.occupancy.find((rule) => occupancy < rule.below);
  const seasonFactor = PRICING_RULES.season[season];
  const demandFactor = PRICING_RULES.demand[demand];
  const rate = Math.round(base * band.factor * seasonFactor * demandFactor * 100) / 100;

  // One night, with each booked room modeled at the same suggested rate.
  const revenue = booked * rate;
  return {
    occupancy, band, seasonFactor, demandFactor, rate, revenue,
    difference: (rate - base) / base,
    adr: booked > 0 ? revenue / booked : null,
    revpar: revenue / total
  };
}

// Copy the calculated values to the page without rebuilding the markup.
function renderPricing(scenario, result) {
  const { occupancy, band, seasonFactor, demandFactor, rate, difference, adr, revpar, revenue } = result;
  byId("rate").textContent = euro.format(rate);
  byId("difference").textContent = signedPercent.format(difference) + " vs base rate";
  byId("occupancy").textContent = percent.format(occupancy) + " occupancy";
  byId("occupancy-rule").textContent = "Occupancy · " + band.label;
  byId("season-rule").textContent = "Season · " + fields.season.selectedOptions[0].text;
  byId("demand-rule").textContent = "Market demand · " + fields.demand.selectedOptions[0].text;
  byId("occupancy-factor").textContent = factorText(band.factor);
  byId("season-factor").textContent = factorText(seasonFactor);
  byId("demand-factor").textContent = factorText(demandFactor);
  byId("formula").textContent = [
    euro.format(scenario.base), factorText(band.factor), factorText(seasonFactor),
    factorText(demandFactor), "≈ " + euro.format(rate)
  ].join(" ");
  byId("adr").textContent = adr === null ? "N/A" : euro.format(adr);
  byId("revpar").textContent = euro.format(revpar);
  byId("revenue").textContent = euro.format(revenue);
  byId("results").hidden = false;
}

function runSimulation(focusError = false) {
  const scenario = {
    total: fields.total.valueAsNumber,
    booked: fields.booked.valueAsNumber,
    base: fields.base.valueAsNumber,
    season: fields.season.value,
    demand: fields.demand.value
  };
  const error = validateScenario(scenario);
  for (const field of Object.values(fields)) {
    field.removeAttribute("aria-invalid");
  }
  byId("error").textContent = error ? error.message : "";
  if (error) {
    byId("results").hidden = true;
    fields[error.field].setAttribute("aria-invalid", "true");
    if (focusError) fields[error.field].focus();
    return;
  }
  renderPricing(scenario, calculatePricing(scenario));
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSimulation(true);
});
form.addEventListener("input", () => runSimulation());
form.addEventListener("reset", () => {
  // The native reset applies the original field values after this event.
  setTimeout(runSimulation, 0);
});

runSimulation();
