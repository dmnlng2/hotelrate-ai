"use strict";

const hotelData = (() => {
  function hotelMetrics(availableRooms, roomsSold, roomRevenue) {
    return {
      occupancy: availableRooms > 0 ? roomsSold / availableRooms : null,
      adr: roomsSold > 0 ? roomRevenue / roomsSold : null,
      revpar: availableRooms > 0 ? roomRevenue / availableRooms : null
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

  return { hotelMetrics, localHotelDate, hotelValueLabel };
})();

if (typeof module !== "undefined") module.exports = hotelData;
