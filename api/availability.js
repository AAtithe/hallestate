// GET /api/availability
// Booked dates for Halecat House, from the bookings diary's iCal feed(s) plus
// any manual closures in halecat/booking.json.

const config = require("../halecat/booking.json");
const { today } = require("../assets/js/stays");
const { fetchBooked, feedUrls } = require("./_lib/ical");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const urls = feedUrls();
  const from = today();
  let booked = [];
  if (urls.length) {
    try {
      booked = await fetchBooked(urls, from);
    } catch (err) {
      console.error("Availability feed failed", err);
      res.setHeader("Cache-Control", "no-store");
      return res.status(502).json({ error: "We couldn't load the calendar just now." });
    }
  }

  // Shared caches hold this for ten minutes, so a busy day costs one diary read.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=1800");
  return res.status(200).json({
    live: urls.length > 0,
    booked: booked.concat(config.blocked || []),
  });
};
