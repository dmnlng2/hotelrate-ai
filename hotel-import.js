"use strict";

(() => {
  const MAX_FILE_BYTES = 1024 * 1024;
  const PREVIEW_LIMIT = 50;
  const REQUIRED_HEADERS = ["date", "available_rooms", "rooms_sold", "room_revenue", "snapshot_date"];

  function rowError(line, message) {
    return new Error(`CSV row ${line}: ${message}`);
  }

  // Record numbers refer to physical lines, including line breaks inside quotes.
  function* csvRecords(source) {
    const text = source.replace(/^\uFEFF/, "");
    let line = 1;
    let startLine = 1;
    let cells = [];
    let field = "";
    let state = "start";

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const newline = character === "\r" || character === "\n";
      const crlf = character === "\r" && text[index + 1] === "\n";

      if (state === "quoted") {
        if (character === '"' && text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          state = "closed";
        } else {
          field += crlf ? "\r\n" : character;
          if (newline) line += 1;
          if (crlf) index += 1;
        }
      } else if (newline || character === ",") {
        cells.push(field);
        field = "";
        state = "start";
        if (newline) {
          yield { line: startLine, cells };
          cells = [];
          line += 1;
          startLine = line;
          if (crlf) index += 1;
        }
      } else if (state === "start" && character === '"') {
        state = "quoted";
      } else if (state === "closed" || character === '"') {
        throw rowError(line, "Unexpected character or quote. Wrap quoted fields in double quotes and escape a literal quote as two double quotes.");
      } else {
        field += character;
        state = "unquoted";
      }
    }

    if (state === "quoted") throw rowError(startLine, "Close the quoted field before the end of the file.");
    if (cells.length || state !== "start") yield { line: startLine, cells: [...cells, field] };
  }

  function validDate(value) {
    if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
  }

  function parseHotelCsv(text) {
    const records = csvRecords(text);
    const header = records.next().value;
    if (!header || (header.cells.length === 1 && header.cells[0] === "")) {
      throw rowError(1, "The file is empty. Include the header and at least one data row.");
    }

    const positions = REQUIRED_HEADERS.map((name) => header.cells.indexOf(name));
    const missing = REQUIRED_HEADERS.filter((_, index) => positions[index] === -1);
    if (missing.length) throw rowError(1, `Missing required columns: ${missing.join(", ")}. Use comma-separated headers.`);
    if (new Set(header.cells).size !== header.cells.length) throw rowError(1, "Use unique column names.");

    const rows = [];
    const firstLines = new Map();
    for (const { line, cells } of records) {
      if (cells.length !== header.cells.length) {
        throw rowError(line, `Expected ${header.cells.length} fields, found ${cells.length}. Check commas and quoting.`);
      }

      const [date, capacity, bookings, revenue, snapshotDate] = positions.map((index) => cells[index]);
      if (!validDate(date)) throw rowError(line, "date must be a valid calendar date in YYYY-MM-DD format.");
      if (!validDate(snapshotDate)) throw rowError(line, "snapshot_date must be a valid calendar date in YYYY-MM-DD format.");

      const availableRooms = Number(capacity);
      const roomsSold = Number(bookings);
      const roomRevenue = Number(revenue);
      if (!/^[0-9]+$/.test(capacity) || /\s/.test(capacity) || !Number.isSafeInteger(availableRooms) || availableRooms <= 0) {
        throw rowError(line, "available_rooms must be a positive whole number within the supported integer range.");
      }
      if (!/^[0-9]+$/.test(bookings) || /\s/.test(bookings) || !Number.isSafeInteger(roomsSold) || roomsSold > availableRooms) {
        throw rowError(line, "rooms_sold must be a whole number from 0 to available_rooms.");
      }
      if (!/^[0-9]+(?:\.[0-9]+)?$/.test(revenue) || /\s/.test(revenue) || !Number.isFinite(roomRevenue)) {
        throw rowError(line, "room_revenue must be a finite nonnegative EUR amount. Use a decimal point and omit currency signs and thousands separators.");
      }
      // Check the source digits so extremely small positive amounts cannot round to zero.
      if (roomsSold === 0 && /[1-9]/.test(revenue)) {
        throw rowError(line, "room_revenue must be 0 when rooms_sold is 0.");
      }
      if (roomRevenue === 0 && /[1-9]/.test(revenue)) {
        throw rowError(line, "room_revenue is too small to represent.");
      }
      const key = date + "/" + snapshotDate;
      if (firstLines.has(key)) {
        throw rowError(line, `Duplicate date and snapshot_date pair. First seen on CSV row ${firstLines.get(key)}.`);
      }
      firstLines.set(key, line);
      rows.push({
        date, snapshotDate, availableRooms, roomsSold, roomRevenue,
        occupancy: roomsSold / availableRooms,
        adr: roomsSold > 0 ? roomRevenue / roomsSold : null,
        revpar: roomRevenue / availableRooms
      });
    }

    if (!rows.length) throw rowError(1, "Add at least one data row below the header.");
    return rows;
  }

  async function readHotelCsv(file) {
    if (!/\.csv$/i.test(file.name)) throw new Error("Choose a file with the .csv extension.");
    if (file.size > MAX_FILE_BYTES) throw new Error("The CSV exceeds 1 MiB (1,048,576 bytes). Choose a smaller file.");
    let bytes;
    try {
      bytes = await file.arrayBuffer();
    } catch {
      throw new Error("Could not read the file. Select it again and retry.");
    }
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new Error("The file is not valid UTF-8. Export it as UTF-8 CSV and try again.");
    }
    return parseHotelCsv(text);
  }

  function setupImport() {
    const input = document.getElementById("hotel-csv");
    const confirm = document.getElementById("hotel-import-confirm");
    const error = document.getElementById("hotel-import-error");
    const status = document.getElementById("hotel-import-status");
    const preview = document.getElementById("hotel-import-preview");
    const tableBody = preview.querySelector("tbody");
    const caption = preview.querySelector("caption");
    const euro = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
    const percent = new Intl.NumberFormat("en-IE", { style: "percent", maximumFractionDigits: 2 });
    let selection = 0;
    let pendingRows;
    let importedRows = [];

    function showRows(rows, label) {
      const now = new Date();
      const today = [
        String(now.getFullYear()).padStart(4, "0"),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
      ].join("-");
      const visibleRows = rows.slice(0, PREVIEW_LIMIT);
      tableBody.replaceChildren();
      for (const row of visibleRows) {
        const tr = tableBody.insertRow();
        for (const value of [
          row.date, row.snapshotDate, row.availableRooms, row.roomsSold, euro.format(row.roomRevenue),
          row.date > today ? "Booked room value" : "Room revenue",
          percent.format(row.occupancy), row.adr === null ? "N/A" : euro.format(row.adr),
          euro.format(row.revpar)
        ]) {
          tr.insertCell().textContent = value;
        }
      }
      caption.textContent = `${label} · Showing ${visibleRows.length} of ${rows.length} records`;
      preview.hidden = !rows.length;
    }

    input.addEventListener("change", async () => {
      const currentSelection = ++selection;
      const file = input.files[0];
      pendingRows = undefined;
      confirm.disabled = true;
      error.textContent = "";
      input.removeAttribute("aria-invalid");
      showRows(importedRows, "Imported data");
      status.textContent = file ? "Validating CSV…" : "";

      if (!file) return;
      try {
        const rows = await readHotelCsv(file);
        if (currentSelection !== selection) return;
        pendingRows = rows;
        showRows(rows, "CSV preview");
        status.textContent = `${rows.length} valid records ready to import.`;
        confirm.disabled = false;
      } catch (failure) {
        if (currentSelection !== selection) return;
        input.setAttribute("aria-invalid", "true");
        error.textContent = failure.message || "Could not read the file. Select it again and retry.";
        status.textContent = "";
      }
    });

    confirm.addEventListener("click", () => {
      if (!pendingRows) return;
      importedRows = pendingRows;
      pendingRows = undefined;
      confirm.disabled = true;
      input.value = "";
      showRows(importedRows, "Imported data");
      status.textContent = `${importedRows.length} records imported. Refreshing the page clears this import.`;
    });
  }

  if (typeof document !== "undefined") setupImport();
  if (typeof module !== "undefined") module.exports = { MAX_FILE_BYTES, parseHotelCsv, readHotelCsv };
})();
