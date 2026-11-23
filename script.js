"use strict";

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
const overviewMetrics = byId("overview-metrics");
const overviewEmpty = byId("overview-empty");

const euro = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
const percent = new Intl.NumberFormat("en-IE", { style: "percent", maximumFractionDigits: 2 });
const signedPercent = new Intl.NumberFormat("en-IE", {
  style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero"
});
const factorText = (factor) => "× " + factor.toFixed(2);

// Browser constraints check required values, minimums and decimal precision.
// The relationship between the two room counts needs a separate check.
function validateScenario(scenario) {
  const { total, booked } = scenario;
  if (!fields.total.validity.valid || !Number.isSafeInteger(total)) {
    return { field: "total", message: "Enter a positive whole number of total rooms." };
  }
  if (!fields.booked.validity.valid || !Number.isSafeInteger(booked)) {
    return { field: "booked", message: "Enter a whole number of booked rooms, zero or greater." };
  }
  if (booked > total) {
    return { field: "booked", message: "Booked rooms cannot exceed total rooms." };
  }
  return validatePricingInputs(scenario);
}

function validatePricingInputs({ base, season, demand }) {
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

// Copy the calculated values to the page without rebuilding the markup.
function renderPricing(scenario, result) {
  const { occupancy, band, seasonFactor, demandFactor, rate, difference, adr, revpar, revenue } = result;
  const metrics = {
    rate: euro.format(rate),
    occupancy: percent.format(occupancy),
    adr: adr === null ? "N/A" : euro.format(adr),
    revpar: euro.format(revpar),
    revenue: euro.format(revenue)
  };
  for (const metric of overviewMetrics.querySelectorAll("[data-overview-metric]")) {
    metric.textContent = metrics[metric.dataset.overviewMetric];
  }
  byId("rate").textContent = metrics.rate;
  byId("difference").textContent = signedPercent.format(difference) + " vs base rate";
  byId("occupancy").textContent = metrics.occupancy + " occupancy";
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
  byId("adr").textContent = metrics.adr;
  byId("revpar").textContent = metrics.revpar;
  byId("revenue").textContent = metrics.revenue;
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
  calendarPricing = validatePricingInputs(scenario) ? null : scenario;
  renderCalendar();
  overviewMetrics.hidden = Boolean(error) || waitingForRate;
  overviewEmpty.hidden = !overviewMetrics.hidden;
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
let calendarPricing = null;
let calendarDataset;
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
        (edit.booked === null || (Number.isSafeInteger(edit.booked) && edit.booked >= 0)) &&
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

function calendarDayData(date) {
  const key = dateKey(date);
  const row = calendarDataset?.latestByStay.get(key);
  const edit = dailyEdits.get(key);
  const missing = row ? hotelData.missingHotelMetrics(row) : [];
  const source = row ? (missing.length ? "INCOMPLETE DATA" : "IMPORTED DATA") : "SIMULATION";
  const pricing = row ? calendarPricing : calendarScenario;
  const total = row ? row.availableRooms : calendarScenario?.total;
  const booked = row ? row.roomsSold : calendarScenario
    ? Math.min(edit?.booked ?? calendarScenario.booked, total) : null;
  const occupancy = row ? row.occupancy : calendarScenario ? booked / total : null;
  const demand = edit?.demand ?? fields.demand.value;
  const weekend = PRICING_RULES.weekend;
  const factor = weekend.days.includes(date.getUTCDay()) ? weekend.factor : 1;
  const rate = pricing?.base > 0 && occupancy !== null
    ? calculatePricing({ ...pricing, total, booked, demand }, factor).rate : null;
  return { row, edit, missing, source, occupancy, rate, total, booked, demand };
}

function updateCalendarDataset(dataset) {
  if (!calendarDataset) {
    const stays = [...dataset.latestByStay.keys()].sort();
    const visibleMonth = calendarYear.validity.valid
      ? dateKey(calendarDate(calendarYear.valueAsNumber, Number(calendarMonth.value), 1)).slice(0, 7) : "";
    if (!stays.some((date) => date.slice(0, 7) === visibleMonth)) {
      calendarYear.value = Number(stays[0].slice(0, 4));
      calendarMonth.value = Number(stays[0].slice(5, 7)) - 1;
      selectedDate = null;
    }
  }
  calendarDataset = dataset;
  renderCalendar();
}

function renderCalendar() {
  calendarGrid.replaceChildren();
  dayEditor.hidden = true;
  if (!calendarYear.validity.valid) {
    calendarMessage.textContent = "Enter a year from 1 to 9999.";
    return;
  }
  calendarMessage.textContent = calendarScenario ? "" : "Correct the scenario inputs to see simulated occupancy and rates.";
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
    const { row, edit, missing, source, occupancy, rate } = calendarDayData(date);
    const rateText = rate === null ? "—" : euro.format(rate);
    const occupancyText = occupancy === null ? "Occupancy unavailable" : percent.format(occupancy) + " occ.";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.dataset.date = dateKey(date);
    button.dataset.source = source;
    button.setAttribute("aria-pressed", String(selectedDate !== null && +selectedDate === +date));
    button.setAttribute("aria-label", [
      dateFormat.format(date), rate === null ? "Rate pending" : rateText,
      occupancy === null ? occupancyText : percent.format(occupancy) + (row ? " imported occupancy" : " simulated occupancy"),
      ...(edit ? ["saved override"] : []), source,
      ...(missing.length ? ["Missing " + missing.join(", ")] : [])
    ].join(", "));
    for (const [value, className] of [
      [day, "calendar-desktop-date"],
      [shortDateFormat.format(date), "calendar-mobile-date"],
      [rateText, "calendar-rate"],
      [occupancyText, "calendar-occupancy"],
      [source, "calendar-source"],
      ...(edit ? [["Override", "calendar-override"]] : [])
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
      (dayBooked.disabled ? dayDemand : dayBooked).focus();
    });
    calendarGrid.append(button);
  }
  if (selectedDate) showDayEditor();
}

function showDayEditor() {
  const { row, edit, missing, source, rate, total, booked, demand } = calendarDayData(selectedDate);
  byId("day-title").textContent = dateFormat.format(selectedDate);
  byId("day-source").textContent = source;
  byId("day-override").hidden = !edit;
  byId("day-data-status").textContent = missing.length ? `Missing ${missing.join(", ")}.` : "";
  byId("day-import-metrics").hidden = !row;
  if (row) {
    const show = (value, format = String) => value === null ? "N/A" : format(value);
    byId("day-snapshot").textContent = row.snapshotDate;
    byId("day-available").textContent = show(row.availableRooms);
    byId("day-sold").textContent = show(row.roomsSold);
    byId("day-occupancy").textContent = show(row.occupancy, percent.format);
    byId("day-value-label").textContent = hotelData.hotelValueLabel(row.date, hotelData.localHotelDate());
    byId("day-value").textContent = show(row.roomRevenue, euro.format);
    byId("day-adr").textContent = show(row.adr, euro.format);
    byId("day-rate").textContent = rate === null ? "Pending" : euro.format(rate);
  }
  dayBooked.disabled = Boolean(row) || !calendarScenario;
  dayBooked.parentElement.hidden = dayBooked.disabled;
  dayBooked.max = total ?? "";
  dayBooked.value = booked ?? "";
  dayDemand.value = demand;
  byId("day-demand-label").textContent = row ? "Date demand" : "Simulated demand";
  dayDemand.disabled = !row && !calendarScenario;
  dayEditor.querySelector('button[type="submit"]').disabled = dayDemand.disabled;
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
  if (!selectedDate || dayDemand.disabled || !dayEditor.reportValidity()) return;
  const key = dateKey(selectedDate);
  const booked = dayBooked.disabled ? dailyEdits.get(key)?.booked ?? null : dayBooked.valueAsNumber;
  dailyEdits.set(key, { booked, demand: dayDemand.value });
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

function setupWorkspaceNavigation() {
  const views = new Map(
    Array.from(document.querySelectorAll("[data-view]"), (view) => [view.dataset.view, view])
  );
  const links = document.querySelectorAll(".workspace-nav a");
  const mode = byId("workspace-mode");
  let activeView;

  function showView() {
    const route = window.location.hash.slice(1);
    const nextView = views.get(route) ?? views.get("overview");
    if (nextView === activeView) return;

    const previousView = activeView;
    activeView = nextView;
    for (const view of views.values()) view.hidden = view !== activeView;
    for (const link of links) {
      if (link.hash === "#" + activeView.dataset.view) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }

    const isImport = activeView.dataset.view === "data-import";
    const isPerformance = activeView.dataset.view === "hotel-performance";
    const isCalendar = activeView.dataset.view === "calendar";
    mode.textContent = isImport ? "Hotel CSV and Excel data" : isPerformance ? "Imported hotel data"
      : isCalendar ? "Hybrid pricing" : "Simulation data";
    mode.classList.toggle("workspace-mode-import", isImport || isPerformance);
    const heading = byId(activeView.getAttribute("aria-labelledby"));
    document.title = heading.textContent + " | HotelRate AI";
    if (previousView) {
      heading.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }

  document.querySelector(".skip-link").addEventListener("click", (event) => {
    event.preventDefault();
    byId(activeView.getAttribute("aria-labelledby")).focus();
  });
  window.addEventListener("hashchange", showView);
  showView();
}

setupWorkspaceNavigation();
