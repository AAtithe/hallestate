// POST /api/booking-request
// A guest asks to book Halecat House for a given week or weekend. The dates are
// checked again against the live diary, then Elaine gets an email she can reply
// to directly, and the guest gets an acknowledgement. Nothing is confirmed or
// charged here: Elaine confirms every booking herself.

const config = require("../halecat/booking.json");
const stays = require("../assets/js/stays");
const { fetchBooked, feedUrls } = require("./_lib/ical");
const { sendEmail, isEmailConfigured, isValidEmail } = require("./_lib/email");

const PHONE = "015395 52387";
const TO = process.env.HALECAT_BOOKINGS_TO;
const MAX_FIELD = 200;
const MAX_MESSAGE = 3000;

// Per-instance limit. It stops a stuck button or a casual script, not a
// determined attack; pair it with a Vercel Firewall rate limit on /api/.
const recent = new Map();
function tooMany(ip) {
  const now = Date.now();
  const hits = (recent.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > 5;
}

function str(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function int(value, min, max) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function longDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid request." });
    }
  }
  body = body || {};

  // Honeypot: a real person never fills the hidden field.
  if (str(body.website, MAX_FIELD)) return res.status(200).json({ ok: true });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (tooMany(ip)) {
    return res.status(429).json({ error: `That's a few requests in a row. Please ring Elaine on ${PHONE}.` });
  }

  const stayId = str(body.stay, 20);
  const arrival = str(body.arrival, 10);
  const name = str(body.name, MAX_FIELD);
  const email = str(body.email, MAX_FIELD);
  const phone = str(body.phone, MAX_FIELD);
  const message = str(body.message, MAX_MESSAGE);
  const guests = int(body.guests, 1, config.maxGuests);
  const dogs = int(body.dogs ?? 0, 0, config.maxDogs);

  if (!name) return res.status(400).json({ error: "Please tell us your name." });
  if (!isValidEmail(email)) return res.status(400).json({ error: "Please check your email address." });
  if (guests === null) return res.status(400).json({ error: `Please choose between 1 and ${config.maxGuests} guests.` });
  if (dogs === null) return res.status(400).json({ error: `We can welcome up to ${config.maxDogs} dogs.` });

  // Check the dates against the diary as it is now, not as the page saw it.
  let booked = config.blocked || [];
  let checked = false;
  const urls = feedUrls();
  if (urls.length) {
    try {
      booked = booked.concat(await fetchBooked(urls, stays.today()));
      checked = true;
    } catch (err) {
      console.error("Availability check failed during booking request", err);
    }
  }
  const issue = stays.problem(config, stayId, arrival, stays.bookedNights(booked), stays.today());
  if (issue === "booked") {
    return res.status(409).json({ error: "Sorry, those dates have just been taken. Please choose another." });
  }
  if (issue) {
    return res.status(400).json({ error: "Those dates aren't available to book online. Please choose another." });
  }

  if (!isEmailConfigured() || !TO) {
    console.error("Booking request dropped: RESEND_API_KEY or HALECAT_BOOKINGS_TO is not set");
    return res.status(503).json({ error: `Online booking requests aren't switched on yet. Please ring Elaine on ${PHONE}.` });
  }

  const type = stays.stayType(config, stayId);
  const leaving = stays.departure(config, stayId, arrival);
  const when = `${longDate(arrival)} to ${longDate(leaving)}`;

  const lines = [
    "New booking request from the website.",
    "",
    `Stay: ${type.label} (${type.nights} nights)`,
    `Arriving: ${longDate(arrival)}`,
    `Leaving: ${longDate(leaving)}`,
    checked ? "These dates were free in the diary when the request was made." : "The diary could not be checked automatically. Please check these dates.",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone || "-"}`,
    `Guests: ${guests}`,
    `Dogs: ${dogs}`,
    "",
    "Message:",
    message || "(none)",
    "",
    "Reply to this email to answer the guest directly.",
  ];

  try {
    await sendEmail({
      to: TO,
      replyTo: email,
      subject: `Booking request: ${type.label.toLowerCase()} from ${longDate(arrival)}, ${name}`,
      text: lines.join("\n"),
    });
  } catch (err) {
    console.error("Booking request email failed", err);
    return res.status(502).json({ error: `We couldn't send that just now. Please ring Elaine on ${PHONE}.` });
  }

  // The acknowledgement repeats only the dates, never the guest's own words,
  // so the form can't be used to send strangers a message of someone's choosing.
  await Promise.allSettled([
    sendEmail({
      to: email,
      replyTo: TO,
      subject: "Your Halecat booking request",
      text: [
        `Dear ${name.split(/\s+/)[0]},`,
        "",
        `Thank you for asking about staying at Halecat House, ${when}.`,
        "",
        "Elaine will check the diary and be in touch soon to confirm your dates and the price. Nothing is booked or paid for until she does.",
        "",
        `If you'd like to talk it through in the meantime, ring her on ${PHONE}.`,
        "",
        "Halecat House",
        "Witherslack, Grange-over-Sands, Cumbria LA11 6RT",
      ].join("\n"),
    }),
  ]);

  return res.status(200).json({ ok: true });
};
