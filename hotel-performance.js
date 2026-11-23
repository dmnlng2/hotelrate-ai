"use strict";

const performanceData = typeof module === "undefined" ? hotelData : require("./hotel-data.js");

function groupHotelSnapshots(rows) {
  const snapshots = new Map();
  for (const row of rows) {
    if (!snapshots.has(row.snapshotDate)) snapshots.set(row.snapshotDate, new Map());
    snapshots.get(row.snapshotDate).set(row.date, row);
  }
  return snapshots;
}

function summarizeHotelMonth(snapshot, month, today) {
  let count = 0;
  let availableRooms = 0;
  let roomsSold = 0;
  let roomRevenue = 0;
  let futureDates = 0;
  for (const row of snapshot.values()) {
    if (row.date.slice(0, 7) !== month) continue;
    count += 1;
    availableRooms += row.availableRooms;
    roomsSold += row.roomsSold;
    roomRevenue += row.roomRevenue;
    if (row.date > today) futureDates += 1;
  }
  if (!count) return null;

  const mixed = futureDates > 0 && futureDates < count;
  return {
    count, availableRooms, roomsSold, roomRevenue, mixed,
    valueLabel: mixed ? "Room value" : futureDates ? "Booked room value" : "Room revenue",
    ...performanceData.hotelMetrics(availableRooms, roomsSold, roomRevenue)
  };
}

function setupHotelPerformance() {
  const get = (id) => document.getElementById("performance-" + id);
  const empty = get("empty");
  const content = get("content");
  const selector = get("snapshot");
  const heading = get("month");
  const previous = get("prev");
  const next = get("next");
  const grid = get("grid");
  const coverage = get("coverage");
  const monthly = get("monthly");
  const valueNote = get("value-note");
  const daily = get("daily");
  const detailStatus = get("detail-status");

  const currency = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
  const percentage = new Intl.NumberFormat("en-IE", { style: "percent", maximumFractionDigits: 2 });
  const count = new Intl.NumberFormat("en-IE");
  const monthName = new Intl.DateTimeFormat("en-IE", { month: "long", year: "numeric", timeZone: "UTC" });
  const dayName = new Intl.DateTimeFormat("en-IE", { dateStyle: "full", timeZone: "UTC" });
  const amount = (value) => value === null ? "N/A" : currency.format(value);
  let snapshots;
  let snapshot;
  let month;
  let selectedDate;

  function renderMetrics(list, values) {
    list.replaceChildren();
    for (const [label, value] of values) {
      const card = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = label;
      description.textContent = value;
      card.append(term, description);
      list.append(card);
    }
    list.hidden = !values.length;
  }

  function performanceMetrics(row, valueLabel) {
    return [
      ["Occupancy", percentage.format(row.occupancy)],
      ["ADR", amount(row.adr)],
      ["RevPAR", amount(row.revpar)],
      [valueLabel, amount(row.roomRevenue)]
    ];
  }

  function renderDetail() {
    const row = snapshot.get(selectedDate);
    detailStatus.textContent = row ? "" : `${selectedDate} · No imported data for this date.`;
    renderMetrics(daily, row ? [
      ["Stay date", row.date],
      ["Snapshot date", row.snapshotDate],
      ["Available rooms", count.format(row.availableRooms)],
      ["Rooms sold", count.format(row.roomsSold)],
      ...performanceMetrics(row, performanceData.hotelValueLabel(row.date, performanceData.localHotelDate()))
    ] : []);
  }

  function renderMonth() {
    const first = new Date(month + "-01T00:00:00Z");
    heading.textContent = monthName.format(first);
    previous.disabled = month === "0001-01";
    next.disabled = month === "9999-12";

    const today = performanceData.localHotelDate();
    const summary = summarizeHotelMonth(snapshot, month, today);
    coverage.textContent = summary
      ? `${summary.count} imported ${summary.count === 1 ? "date" : "dates"} in this month.`
      : "No imported data for this month in the selected snapshot.";
    valueNote.hidden = !summary?.mixed;
    renderMetrics(monthly, summary ? [
      ["Available room-nights", count.format(summary.availableRooms)],
      ["Sold room-nights", count.format(summary.roomsSold)],
      ...performanceMetrics(summary, summary.valueLabel)
    ] : []);

    grid.replaceChildren();
    for (const weekday of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      const label = document.createElement("span");
      label.className = "calendar-weekday";
      label.textContent = weekday;
      grid.append(label);
    }
    const offset = (first.getUTCDay() + 6) % 7;
    const last = new Date(first);
    last.setUTCMonth(first.getUTCMonth() + 1, 0);
    for (let day = 1; day <= last.getUTCDate(); day += 1) {
      const date = month + "-" + String(day).padStart(2, "0");
      const row = snapshot.get(date);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "calendar-day performance-day";
      if (day === 1) button.style.gridColumnStart = offset + 1;
      button.dataset.date = date;
      button.classList.toggle("performance-day-with-data", Boolean(row));
      button.setAttribute("aria-pressed", String(date === selectedDate));
      const stats = row ? [percentage.format(row.occupancy), amount(row.adr)] : ["—"];
      const description = row ? `${stats[0]} occupancy, ADR ${stats[1]}` : "no imported data";
      button.setAttribute("aria-label", `${dayName.format(new Date(date + "T00:00:00Z"))}, ${description}`);
      for (const text of [day, ...stats]) {
        const span = document.createElement("span");
        span.textContent = text;
        button.append(span);
      }
      grid.append(button);
    }
    renderDetail();
  }

  function selectSnapshot() {
    snapshot = snapshots.get(selector.value);
    selectedDate = Array.from(snapshot.keys()).reduce((first, date) => date < first ? date : first);
    month = selectedDate.slice(0, 7);
    renderMonth();
  }

  function moveMonth(offset) {
    const date = new Date(month + "-01T00:00:00Z");
    date.setUTCMonth(date.getUTCMonth() + offset);
    month = date.toISOString().slice(0, 7);
    selectedDate = month + "-01";
    renderMonth();
  }

  selector.addEventListener("change", selectSnapshot);
  previous.addEventListener("click", () => moveMonth(-1));
  next.addEventListener("click", () => moveMonth(1));
  grid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-date]");
    if (!button) return;
    grid.querySelector('[aria-pressed="true"]')?.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-pressed", "true");
    selectedDate = button.dataset.date;
    renderDetail();
  });

  return (rows) => {
    snapshots = groupHotelSnapshots(rows);
    const dates = Array.from(snapshots.keys()).sort().reverse();
    const options = document.createDocumentFragment();
    for (const date of dates) options.append(new Option(date, date));
    selector.replaceChildren(options);
    selector.value = dates[0];
    selectSnapshot();
    empty.hidden = true;
    content.hidden = false;
  };
}

if (typeof module !== "undefined") module.exports = { groupHotelSnapshots, summarizeHotelMonth };
