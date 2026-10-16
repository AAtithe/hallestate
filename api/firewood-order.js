// POST /api/firewood-order
// A customer orders logs from Witherslack Woodlands. The order is priced with
// the same rules the form showed, emailed to the woodyard (reply goes straight
// to the customer), and acknowledged to the customer. Nothing is charged here:
// the team calls back to arrange delivery and takes payment then.

const config = require("../woodlands/firewood.json");
const Firewood = require("../assets/js/firewood");
const { sendEmail, isEmailConfigured, isValidEmail } = require("./_lib/email");
const { tooMany } = require("./_lib/limit");

const PHONE = "015395 52353";
const TO = process.env.WOODLANDS_ORDERS_TO || "sales@witherslackwoodlands.co.uk";
const FROM = process.env.WOODLANDS_FROM_EMAIL || process.env.RESEND_FROM_EMAIL;
const AUDIENCE = process.env.WOODLANDS_RESEND_AUDIENCE_ID;

function str(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Customers who ticked the box get the September "time to stock up" email.
// Best effort: the order matters more than the mailing list.
async function addToReminders(email, name) {
  if (!AUDIENCE) return;
  const [first, ...rest] = name.split(/\s+/);
  const res = await fetch(`https://api.resend.com/audiences/${encodeURIComponent(AUDIENCE)}/contacts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, first_name: first || "", last_name: rest.join(" "), unsubscribed: false }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Resend contacts HTTP ${res.status}`);
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

  if (str(body.website, 200)) return res.status(200).json({ ok: true });
  if (tooMany(req, "firewood")) {
    return res.status(429).json({ error: `That's a few orders in a row. Please ring us on ${PHONE}.` });
  }

  const order = {
    product: str(body.product, 20),
    bags: Number.parseInt(body.bags, 10),
    method: str(body.method, 20),
    area: str(body.area, 60),
    postcode: str(body.postcode, 12),
  };
  const name = str(body.name, 200);
  const phone = str(body.phone, 60);
  const email = str(body.email, 200);
  const address = str(body.address, 500);
  const length = str(body.length, 40);
  const notes = str(body.notes, 2000);
  const reminder = body.reminder === true;

  if (!name) return res.status(400).json({ error: "Please tell us your name." });
  if (!phone) return res.status(400).json({ error: "Please give us a phone number so we can arrange delivery." });
  if (!isValidEmail(email)) return res.status(400).json({ error: "Please check your email address." });

  const q = Firewood.quote(config, order);
  if (q.problems.includes("postcode")) return res.status(400).json({ error: "Please check the delivery postcode." });
  if (q.problems.length) return res.status(400).json({ error: "Please check your order and try again." });
  if (order.method === "delivery" && !address) return res.status(400).json({ error: "Please give us the delivery address." });
  if (order.product === "cut" && !length) return res.status(400).json({ error: "Please tell us the log length you need." });

  if (!isEmailConfigured()) {
    console.error("Firewood order dropped: RESEND_API_KEY is not set");
    return res.status(503).json({ error: `Online ordering isn't switched on yet. Please ring us on ${PHONE}.` });
  }

  const what = `${q.bags} ${q.bags === 1 ? "bag" : "bags"} of ${q.item.label.toLowerCase()}`;
  const delivery = Firewood.deliveryText(config, q);
  const price = q.total !== null ? Firewood.money(q.total) : "to confirm when we call";

  const lines = [
    "New firewood order from the website.",
    "",
    `Order: ${what}`,
    order.product === "cut" ? `Log length: ${length}` : null,
    order.method === "delivery" ? `Delivery to: ${address}, ${q.postcode.postcode}` : "Collecting from the yard",
    order.method === "delivery" ? `Area: ${order.area || "-"}` : null,
    `Delivery: ${delivery}`,
    `Estimated total: ${price}`,
    "",
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Email: ${email}`,
    `September reminder: ${reminder ? "yes, please add" : "no"}`,
    "",
    "Access and other notes:",
    notes || "(none)",
    "",
    "Reply to this email to answer the customer directly.",
  ].filter((l) => l !== null);

  try {
    await sendEmail({
      from: FROM,
      to: TO,
      replyTo: email,
      subject: `Firewood order: ${what}, ${order.method === "delivery" ? q.postcode.postcode : "collection"}, ${name}`,
      text: lines.join("\n"),
    });
  } catch (err) {
    console.error("Firewood order email failed", err);
    return res.status(502).json({ error: `We couldn't send that just now. Please ring us on ${PHONE}.` });
  }

  // The acknowledgement repeats only the order details, never free text, so the
  // form can't be used to send strangers a message of someone's choosing.
  await Promise.allSettled([
    sendEmail({
      from: FROM,
      to: email,
      replyTo: TO,
      subject: "Your Witherslack Woodlands order",
      text: [
        `Dear ${name.split(/\s+/)[0]},`,
        "",
        `Thank you for your order: ${what}.`,
        delivery + ".",
        "",
        "We'll ring you as soon as we can to arrange the best time and confirm the price. We're often out in the woods with ear defenders on, so it may not be straight away.",
        "",
        "You can pay by card, BACS or cheque (payable to Witherslack Woodlands).",
        "",
        `Witherslack Woodlands, ${PHONE}`,
        "The Yard, Halecat, Witherslack, Grange-over-Sands LA11 6RT",
      ].join("\n"),
    }),
    reminder ? addToReminders(email, name) : Promise.resolve(),
  ]).then((results) => results.forEach((r) => r.status === "rejected" && console.error("Firewood follow-up failed", r.reason)));

  return res.status(200).json({ ok: true });
};
