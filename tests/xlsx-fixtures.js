"use strict";

const xlsx = require("xlsx");

const headers = ["date", "available_rooms", "rooms_sold", "room_revenue", "snapshot_date"];
const example = ["2024-02-29", 100, 72, 10800.5, "2024-03-01"];

function workbookBytes(rows, { date1904 = false, secondSheet = false } = {}) {
  const book = xlsx.utils.book_new();
  book.Workbook = { WBProps: { date1904 } };
  const sheet = xlsx.utils.aoa_to_sheet(rows, { cellDates: true });
  xlsx.utils.book_append_sheet(book, sheet, "Hotel data");
  if (secondSheet) xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet([["ignored"]]), "Other");
  return xlsx.write(book, { type: "buffer", bookType: "xlsx", cellDates: true });
}

module.exports = { headers, example, workbookBytes };
