"use strict";

(() => {
  const MAX_FILE_BYTES = 1024 * 1024;
  const MAX_XLSX_BYTES = 5 * 1024 * 1024;
  const PREVIEW_LIMIT = 50;
  const REQUIRED_HEADERS = ["date", "available_rooms", "rooms_sold", "room_revenue", "snapshot_date"];
  const DATE_HEADERS = new Set(["date", "snapshot_date"]);

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

    function* normalizedRecords() {
      for (const { line, cells } of records) {
        if (cells.length !== header.cells.length) {
          throw rowError(line, `Expected ${header.cells.length} fields, found ${cells.length}. Check commas and quoting.`);
        }
        yield { line, cells: positions.map((index) => cells[index]) };
      }
    }

    return validateRecords(normalizedRecords(), "CSV");
  }

  function validateRecords(records, format) {
    const fail = (line, message) => new Error(`${format} row ${line}: ${message}`);
    const rows = [];
    const firstLines = new Map();
    for (const { line, cells } of records) {
      const [date, capacity, bookings, revenue, snapshotDate] = cells;
      if (!validDate(date)) throw fail(line, "date must be a valid calendar date in YYYY-MM-DD format.");
      if (!validDate(snapshotDate)) throw fail(line, "snapshot_date must be a valid calendar date in YYYY-MM-DD format.");

      const availableRooms = Number(capacity);
      const roomsSold = Number(bookings);
      const roomRevenue = Number(revenue);
      if (!/^[0-9]+$/.test(capacity) || /\s/.test(capacity) || !Number.isSafeInteger(availableRooms) || availableRooms <= 0) {
        throw fail(line, "available_rooms must be a positive whole number within the supported integer range.");
      }
      if (!/^[0-9]+$/.test(bookings) || /\s/.test(bookings) || !Number.isSafeInteger(roomsSold) || roomsSold > availableRooms) {
        throw fail(line, "rooms_sold must be a whole number from 0 to available_rooms.");
      }
      if (!/^[0-9]+(?:\.[0-9]+)?$/.test(revenue) || /\s/.test(revenue) || !Number.isFinite(roomRevenue)) {
        throw fail(line, "room_revenue must be a finite nonnegative EUR amount. Use a decimal point and omit currency signs and thousands separators.");
      }
      // Check the source digits so extremely small positive amounts cannot round to zero.
      if (roomsSold === 0 && /[1-9]/.test(revenue)) {
        throw fail(line, "room_revenue must be 0 when rooms_sold is 0.");
      }
      if (roomRevenue === 0 && /[1-9]/.test(revenue)) {
        throw fail(line, "room_revenue is too small to represent.");
      }
      const key = date + "/" + snapshotDate;
      if (firstLines.has(key)) {
        throw fail(line, `Duplicate date and snapshot_date pair. First seen on ${format} row ${firstLines.get(key)}.`);
      }
      firstLines.set(key, line);
      rows.push({
        date, snapshotDate, availableRooms, roomsSold, roomRevenue,
        occupancy: roomsSold / availableRooms,
        adr: roomsSold > 0 ? roomRevenue / roomsSold : null,
        revpar: roomRevenue / availableRooms
      });
    }

    if (!rows.length) throw fail(1, "Add at least one data row below the header.");
    return rows;
  }

  async function readHotelCsv(file) {
    if (!/\.csv$/i.test(file.name)) throw new Error("Choose a file with the .csv extension.");
    if (file.size > MAX_FILE_BYTES) throw new Error("The CSV exceeds 1 MiB (1,048,576 bytes). Choose a smaller file.");
    const bytes = await readFileBytes(file);
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new Error("The file is not valid UTF-8. Export it as UTF-8 CSV and try again.");
    }
    return parseHotelCsv(text);
  }

  async function readFileBytes(file) {
    try {
      return await file.arrayBuffer();
    } catch {
      throw new Error("Could not read the file. Select it again and retry.");
    }
  }

  function excelValue(cell, isDate) {
    if (cell?.t === "s") return cell.v;
    if (isDate && cell?.t === "d" && Number.isFinite(+cell.v)) {
      // SheetJS interprets the workbook's epoch and keeps Excel dates in UTC.
      // An hour/minute format alone does not identify a calendar date.
      const format = cell.z?.replace(/"[^"]*"|[\\_*].|\[(?![hms]+\])[^\]]*\]/gi, "");
      if (format && /[hs]|\[m+\]/i.test(format) && !/[dy]/i.test(format)) return "";
      return cell.v.toISOString().split("T")[0];
    }
    if (isDate || cell?.t !== "n" || !Number.isFinite(cell.v)) return "";

    // Expand scientific notation so native numbers use the CSV decimal grammar.
    const [decimal, exponent] = String(cell.v).split("e");
    if (exponent === undefined || cell.v < 0) return String(cell.v);
    const [whole, fraction = ""] = decimal.split(".");
    const digits = whole + fraction;
    const point = whole.length + Number(exponent);
    return point <= 0
      ? "0." + "0".repeat(-point) + digits
      : digits.padEnd(point, "0");
  }

  function parseHotelXlsx(bytes) {
    const xlsx = typeof module === "undefined" ? globalThis.XLSX : require("xlsx");
    const signature = new Uint8Array(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, Math.min(bytes.byteLength, 4));
    const invalid = "Could not open the Excel file. Choose a valid .xlsx workbook.";
    let workbook;
    try {
      // Prevent the parser from treating renamed text or legacy files as workbooks.
      if (signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 3 || signature[3] !== 4) {
        throw new Error(invalid);
      }
      workbook = xlsx.read(bytes, {
        sheets: 0, dense: true, nodim: true, sheetStubs: true, cellDates: true, cellNF: true,
        cellFormula: true, cellHTML: false, cellText: false
      });
      if (workbook.bookType !== "xlsx" || workbook.Directory?.vba?.length) throw new Error(invalid);
    } catch {
      throw new Error(invalid);
    }

    const sheet = workbook.Sheets?.[workbook.SheetNames[0]]?.["!data"] ?? [];
    const hasValue = (cell) => cell && (cell.f !== undefined || cell.F !== undefined ||
      (cell.t !== "z" && cell.v !== ""));
    let last = sheet.length - 1;
    while (last >= 0 && !sheet[last]?.some(hasValue)) last -= 1;
    if (last < 0) throw new Error("Excel row 1: The first worksheet is empty. Include the header and at least one data row.");

    const headers = (sheet[0] ?? []).map((cell) => cell.t === "s" && !cell.f && !cell.F ? cell.v : "");
    const positions = REQUIRED_HEADERS.map((name) => headers.indexOf(name));
    const missing = REQUIRED_HEADERS.filter((_, index) => positions[index] === -1);
    if (missing.length) throw new Error(`Excel row 1: Missing required columns: ${missing.join(", ")}.`);
    const namedHeaders = headers.filter(Boolean);
    if (new Set(namedHeaders).size !== namedHeaders.length) throw new Error("Excel row 1: Use unique column names.");

    function* records() {
      for (let row = 1; row <= last; row += 1) {
        const cells = positions.map((column, index) => {
          const cell = sheet[row]?.[column];
          if (cell?.f !== undefined || cell?.F !== undefined || cell?.D) {
            throw new Error(`Excel row ${row + 1}: ${REQUIRED_HEADERS[index]} must not contain a formula.`);
          }
          return excelValue(cell, DATE_HEADERS.has(REQUIRED_HEADERS[index]));
        });
        yield { line: row + 1, cells };
      }
    }

    return validateRecords(records(), "Excel");
  }

  async function readHotelXlsx(file) {
    if (!/\.xlsx$/i.test(file.name)) throw new Error("Choose a file with the .xlsx extension.");
    if (file.size > MAX_XLSX_BYTES) throw new Error("The Excel file exceeds 5 MiB (5,242,880 bytes). Choose a smaller file.");
    return parseHotelXlsx(await readFileBytes(file));
  }

  function setupImport() {
    const input = document.getElementById("hotel-csv");
    const confirm = document.getElementById("hotel-import-confirm");
    const error = document.getElementById("hotel-import-error");
    const selectionInfo = document.getElementById("hotel-import-file");
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
      const format = /\.csv$/i.test(file?.name) ? "CSV" : /\.xlsx$/i.test(file?.name) ? "Excel (.xlsx)" : "";
      selectionInfo.textContent = file ? `${file.name} · ${format || "Unsupported format"}` : "";
      status.textContent = format ? `Validating ${format}…` : "";

      if (!file) return;
      try {
        if (!format) throw new Error("Choose a file with the .csv or .xlsx extension.");
        const rows = await (format === "CSV" ? readHotelCsv(file) : readHotelXlsx(file));
        if (currentSelection !== selection) return;
        pendingRows = rows;
        showRows(rows, format === "CSV" ? "CSV preview" : "Excel preview");
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
  if (typeof module !== "undefined") module.exports = { MAX_FILE_BYTES, MAX_XLSX_BYTES, parseHotelCsv, readHotelCsv, parseHotelXlsx, readHotelXlsx };
})();
