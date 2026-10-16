// Halecat stay rules, shared by the booking calendar in the browser and the
// booking request API, so both always agree on what can be booked.
//
// Dates are plain "YYYY-MM-DD" strings and all arithmetic is done in UTC, so
// clocks going forward or back can never shift a day. A booked range's `end` is
// the departure day and is exclusive: a stay ending on a Friday leaves that
// Friday free for the next arrival.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HalecatStays = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var DAY = 86400000;
  var ISO = /^\d{4}-\d{2}-\d{2}$/;

  function isIso(value) {
    if (typeof value !== "string" || !ISO.test(value)) return false;
    return toIso(toTime(value)) === value;
  }
  function toTime(iso) {
    var p = iso.split("-");
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }
  function toIso(time) {
    return new Date(time).toISOString().slice(0, 10);
  }
  function addDays(iso, n) {
    return toIso(toTime(iso) + n * DAY);
  }
  function addMonths(iso, n) {
    var d = new Date(toTime(iso));
    return toIso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  }
  // 0 = Sunday ... 6 = Saturday
  function weekday(iso) {
    return new Date(toTime(iso)).getUTCDay();
  }
  // Today's date at Halecat, wherever the code happens to run.
  function today(now) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now || new Date());
  }

  // Every booked night as a set of dates.
  function bookedNights(ranges) {
    var nights = new Set();
    (ranges || []).forEach(function (r) {
      if (!isIso(r.start)) return;
      var t = toTime(r.start);
      var end = isIso(r.end) ? toTime(r.end) : t + DAY;
      if (end <= t) end = t + DAY;
      for (; t < end; t += DAY) nights.add(toIso(t));
    });
    return nights;
  }

  function stayType(config, id) {
    for (var i = 0; i < config.stays.length; i++) if (config.stays[i].id === id) return config.stays[i];
    return null;
  }

  // Why a stay cannot be booked, or null if it can.
  function problem(config, stayId, arrival, nights, todayIso) {
    var type = stayType(config, stayId);
    if (!type) return "unknown-stay";
    if (!isIso(arrival)) return "bad-date";
    if (type.arrivalDays.indexOf(weekday(arrival)) === -1) return "arrival-day";
    if (arrival < addDays(todayIso, config.minNoticeDays || 0)) return "too-soon";
    if (arrival >= addMonths(todayIso, (config.horizonMonths || 18) + 1)) return "too-far";
    for (var i = 0; i < type.nights; i++) {
      if (nights.has(addDays(arrival, i))) return "booked";
    }
    return null;
  }

  function departure(config, stayId, arrival) {
    var type = stayType(config, stayId);
    return type ? addDays(arrival, type.nights) : null;
  }

  return {
    isIso: isIso,
    addDays: addDays,
    addMonths: addMonths,
    weekday: weekday,
    today: today,
    bookedNights: bookedNights,
    stayType: stayType,
    problem: problem,
    departure: departure,
  };
});
