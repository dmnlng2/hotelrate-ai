"use strict";

const hotelData = (() => {
  function hotelMetrics(availableRooms, roomsSold, roomRevenue) {
    return {
      occupancy: availableRooms > 0 && roomsSold !== null ? roomsSold / availableRooms : null,
      adr: roomsSold > 0 && roomRevenue !== null ? roomRevenue / roomsSold : null,
      revpar: availableRooms > 0 && roomRevenue !== null ? roomRevenue / availableRooms : null
    };
  }

  function localHotelDate() {
    const now = new Date();
    return [
      String(now.getFullYear()).padStart(4, "0"),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("-");
  }

  function hotelValueLabel(date, today) {
    return date > today ? "Booked room value" : "Room revenue";
  }

  function missingHotelMetrics({ availableRooms, roomsSold, roomRevenue }) {
    return [
      [availableRooms, "available rooms"],
      [roomsSold, "rooms sold"],
      [roomRevenue, "room revenue"]
    ].filter(([value]) => value === null).map(([, label]) => label);
  }

  function groupHotelSnapshots(rows) {
    const snapshots = new Map();
    for (const row of rows) {
      if (!snapshots.has(row.snapshotDate)) snapshots.set(row.snapshotDate, new Map());
      snapshots.get(row.snapshotDate).set(row.date, row);
    }
    return snapshots;
  }

  function createHotelDataset(rows) {
    const snapshots = groupHotelSnapshots(rows);
    const snapshotDates = [...snapshots.keys()].sort().reverse();
    const latestByStay = new Map();
    for (const date of snapshotDates) {
      for (const [stay, row] of snapshots.get(date)) {
        if (!latestByStay.has(stay)) latestByStay.set(stay, row);
      }
    }
    return { snapshots, snapshotDates, latestByStay };
  }

  return { hotelMetrics, localHotelDate, hotelValueLabel, missingHotelMetrics, groupHotelSnapshots, createHotelDataset };
})();

if (typeof module !== "undefined") module.exports = hotelData;
