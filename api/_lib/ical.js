// Reads booked dates from one or more iCal feeds: a Google Calendar secret
// address, an Airbnb or Booking.com export, or a channel manager. Only the
// dates are kept, never guest names or notes, so nothing private reaches the
// public calendar.

const { addDays, isIso } = require("../../assets/js/stays");

function unfold(text) {
  return String(text).replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "");
}

// The calendar date of a DATE or DATE-TIME value. Times are dropped: an event
// ending at 10am on a Friday frees that Friday for the next arrival.
function dateOf(value) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value || "");
  const iso = m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  return isIso(iso) ? iso : null;
}

function parseIcs(text) {
  const events = [];
  let cur = null;
  for (const line of unfold(text).split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (trimmed === "END:VEVENT") {
      if (cur && cur.start && cur.status !== "CANCELLED") {
        const end = cur.end && cur.end > cur.start ? cur.end : addDays(cur.start, 1);
        events.push({ start: cur.start, end });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;
    const name = trimmed.slice(0, colon).split(";")[0].toUpperCase();
    const value = trimmed.slice(colon + 1).trim();
    if (name === "DTSTART") cur.start = dateOf(value);
    else if (name === "DTEND") cur.end = dateOf(value);
    else if (name === "STATUS") cur.status = value.toUpperCase();
  }
  return events;
}

function feedUrls() {
  return (process.env.HALECAT_ICAL_URLS || "")
    .split(/[\s,]+/)
    .filter((u) => /^https:\/\//i.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)[:/]/i.test(u));
}

// Booked ranges from every feed that ends on or after `fromIso`.
// Throws if any feed cannot be read: showing a half-loaded diary as free is
// worse than showing nothing.
async function fetchBooked(urls, fromIso) {
  const all = await Promise.all(
    urls.map(async (url) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "text/calendar" } });
      if (!res.ok) throw new Error(`Calendar feed returned HTTP ${res.status}`);
      const text = await res.text();
      if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Calendar feed is not an iCal file");
      return parseIcs(text);
    })
  );
  return all.flat().filter((e) => !fromIso || e.end > fromIso);
}

module.exports = { parseIcs, fetchBooked, feedUrls };
