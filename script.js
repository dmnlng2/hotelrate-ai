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

const byId = (id) => document.getElementById(id);
const form = byId("scenario");
const fields = {
  total: byId("total"),
  booked: byId("booked"),
  base: byId("base"),
  season: byId("season"),
  demand: byId("demand")
};

const scenarioStorageKey = "hotelrate-ai-v2-scenario";
const scenarioInfo = byId("scenario-info");

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
    return { field: "base", message: "Enter a non-negative base rate in euros and cents." };
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

function readScenario() {
  return {
    total: fields.total.valueAsNumber,
    booked: fields.booked.valueAsNumber,
    base: fields.base.valueAsNumber,
    season: fields.season.value,
    demand: fields.demand.value
  };
}

function restoreScenario() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(scenarioStorageKey));
  } catch {
    return;
  }
  if (!saved || Object.entries(fields).some(([name, field]) =>
    typeof saved[name] !== (field.type === "number" ? "number" : "string")
  )) return;

  for (const [name, field] of Object.entries(fields)) {
    field.value = saved[name];
  }
  if (validateScenario(readScenario())) form.reset();
}

function runSimulation({ focusError = false, save = false } = {}) {
  const scenario = readScenario();
  const error = validateScenario(scenario);
  const waitingForRate = !error && scenario.base === 0;
  let info = waitingForRate ? "Enter a base rate above €0 to calculate nightly rates." : "";
  if (save && !error) {
    try {
      localStorage.setItem(scenarioStorageKey, JSON.stringify(scenario));
    } catch {
      info += (info ? " " : "") + "This browser could not save the scenario.";
    }
  }
  scenarioInfo.textContent = info;
  scenarioInfo.hidden = !info;
  for (const field of Object.values(fields)) {
    field.removeAttribute("aria-invalid");
  }
  byId("error").textContent = error ? error.message : "";
  calendarScenario = error ? null : scenario;
  renderCalendar();
  if (error) {
    byId("results").hidden = true;
    fields[error.field].setAttribute("aria-invalid", "true");
    if (focusError) fields[error.field].focus();
    return;
  }
  if (waitingForRate) {
    byId("results").hidden = true;
    return;
  }
  renderPricing(scenario, calculatePricing(scenario));
}

const calendarMonth = byId("calendar-month");
const calendarYear = byId("calendar-year");
const calendarGrid = byId("calendar-grid");
const calendarMessage = byId("calendar-message");
const dayEditor = byId("day-editor");
const dayBooked = byId("day-booked");
const dayDemand = byId("day-demand");
const storageMessage = byId("storage-message");
const storageKey = "hotelrate-ai-v2-daily-edits";
const monthFormat = new Intl.DateTimeFormat("en-IE", { month: "long", timeZone: "UTC" });
const dateFormat = new Intl.DateTimeFormat("en-IE", { dateStyle: "full", timeZone: "UTC" });
const shortDateFormat = new Intl.DateTimeFormat("en-IE", {
  weekday: "short", day: "numeric", timeZone: "UTC"
});
let calendarScenario = null;
let selectedDate = null;
const dailyEdits = new Map();

function calendarDate(year, month, day) {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  return date;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

try {
  const savedEdits = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
  for (const [key, edit] of Object.entries(savedEdits ?? {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key) && edit &&
        Number.isSafeInteger(edit.booked) && edit.booked >= 0 &&
        Object.hasOwn(PRICING_RULES.demand, edit.demand)) {
      dailyEdits.set(key, edit);
    }
  }
} catch {
  storageMessage.textContent = "Saved date edits could not be loaded from this browser.";
}

for (let month = 0; month < 12; month += 1) {
  calendarMonth.add(new Option(monthFormat.format(calendarDate(2027, month, 1)), month));
}
calendarMonth.value = "7";
for (const option of fields.demand.options) {
  dayDemand.add(new Option(option.text, option.value));
}

function scenarioForDate(date) {
  const edit = dailyEdits.get(dateKey(date));
  if (!edit) return calendarScenario;
  return { ...calendarScenario, ...edit, booked: Math.min(edit.booked, calendarScenario.total) };
}

function renderCalendar() {
  calendarGrid.replaceChildren();
  dayEditor.hidden = true;
  if (!calendarYear.validity.valid) {
    calendarMessage.textContent = "Enter a year from 1 to 9999.";
    return;
  }
  if (!calendarScenario) {
    calendarMessage.textContent = "Correct the scenario inputs to see the simulated calendar.";
    return;
  }
  calendarMessage.textContent = "";
  const year = calendarYear.valueAsNumber;
  const month = Number(calendarMonth.value);
  const firstDay = calendarDate(year, month, 1);
  const daysInMonth = calendarDate(year, month + 1, 0).getUTCDate();
  for (const weekday of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
    const heading = document.createElement("span");
    heading.className = "calendar-weekday";
    heading.textContent = weekday;
    calendarGrid.append(heading);
  }
  const leadingGaps = (firstDay.getUTCDay() + 6) % 7;
  for (let gap = 0; gap < leadingGaps; gap += 1) {
    const empty = document.createElement("span");
    empty.className = "calendar-gap";
    empty.setAttribute("aria-hidden", "true");
    calendarGrid.append(empty);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = calendarDate(year, month, day);
    const weekend = PRICING_RULES.weekend;
    const factor = weekend.days.includes(date.getUTCDay()) ? weekend.factor : 1;
    const scenario = scenarioForDate(date);
    const occupancy = scenario.booked / scenario.total;
    const hasRate = scenario.base > 0;
    const rateText = hasRate ? euro.format(calculatePricing(scenario, factor).rate) : "—";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.setAttribute("aria-pressed", String(selectedDate !== null && +selectedDate === +date));
    button.setAttribute("aria-label", [
      dateFormat.format(date), hasRate ? rateText : "Rate pending",
      percent.format(occupancy) + " simulated occupancy"
    ].join(", "));
    for (const [value, className] of [
      [day, "calendar-desktop-date"],
      [shortDateFormat.format(date), "calendar-mobile-date"],
      [rateText, ""],
      [percent.format(occupancy) + " occ.", ""]
    ]) {
      const span = document.createElement("span");
      span.className = className;
      span.textContent = value;
      button.append(span);
    }
    button.addEventListener("click", () => {
      calendarGrid.querySelector('[aria-pressed="true"]')?.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-pressed", "true");
      selectedDate = date;
      showDayEditor();
      dayBooked.focus();
    });
    calendarGrid.append(button);
  }
  if (selectedDate) showDayEditor();
}

function showDayEditor() {
  const scenario = scenarioForDate(selectedDate);
  byId("day-title").textContent = dateFormat.format(selectedDate);
  dayBooked.max = scenario.total;
  dayBooked.value = scenario.booked;
  dayDemand.value = scenario.demand;
  dayEditor.hidden = false;
}

function changeCalendarMonth() {
  selectedDate = null;
  renderCalendar();
}

calendarMonth.addEventListener("change", changeCalendarMonth);
calendarYear.addEventListener("input", changeCalendarMonth);
dayEditor.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!selectedDate || !calendarScenario || !dayEditor.reportValidity()) return;
  dailyEdits.set(dateKey(selectedDate), { booked: dayBooked.valueAsNumber, demand: dayDemand.value });
  try {
    localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(dailyEdits)));
    storageMessage.textContent = "Date saved in this browser.";
  } catch {
    storageMessage.textContent = "Browser storage is unavailable. This edit will last until the page closes or reloads.";
  }
  renderCalendar();
});

restoreScenario();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSimulation({ focusError: true, save: true });
});
form.addEventListener("input", () => runSimulation({ save: true }));
form.addEventListener("reset", () => {
  // The native reset applies the original field values after this event.
  setTimeout(() => runSimulation({ save: true }), 0);
});

runSimulation();
