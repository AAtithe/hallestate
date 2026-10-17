// POST /api/stripe-webhook
// Stripe calls this when a customer has paid. The signature is checked, then
// the orchards team gets the order to pack and the customer gets a note about
// what happens next. Stripe sends its own payment receipt as well.

const config = require("../orchards/shop.json");
const { verifyWebhook } = require("./_lib/stripe");
const { sendEmail, isEmailConfigured } = require("./_lib/email");

const TO = process.env.ORCHARDS_ORDERS_TO || "juice@witherslackorchards.co.uk";
const FROM = process.env.ORCHARDS_FROM_EMAIL || process.env.RESEND_FROM_EMAIL;
const NEXT_STEPS = {
  collect: "Your order will be ready to collect from the yard at Halecat, Witherslack, LA11 6RT, Monday to Friday. We'll email when it's packed.",
  local: "We'll deliver locally and be in touch to arrange a day.",
  post: "We'll send your order by tracked courier and email you when it's on its way. If there's gin in your parcel, ID may be checked on delivery.",
};

// Stripe may send the same event twice; this stops a double email from one instance.
const seen = new Set();

function readRaw(req) {
  if (typeof req.rawBody === "string") return Promise.resolve(req.rawBody);
  // If the platform has already consumed the stream, use the buffer it kept.
  if (req.readableEnded) {
    const b = req.body;
    return Promise.resolve(Buffer.isBuffer(b) ? b.toString("utf8") : typeof b === "string" ? b : JSON.stringify(b));
  }
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function address(a) {
  if (!a) return "-";
  return [a.line1, a.line2, a.city, a.state, a.postal_code].filter(Boolean).join(", ");
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const raw = await readRaw(req);
  if (!verifyWebhook(raw, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET)) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  const event = JSON.parse(raw);
  if (event.type !== "checkout.session.completed" || seen.has(event.id)) {
    return res.status(200).json({ received: true });
  }
  const s = event.data.object;
  if (s.payment_status !== "paid") return res.status(200).json({ received: true });

  if (!isEmailConfigured()) {
    console.error("Paid order not emailed: RESEND_API_KEY is not set", s.id);
    return res.status(500).json({ error: "Email not configured" });
  }

  const meta = s.metadata || {};
  const customer = s.customer_details || {};
  const shipping = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details;
  const total = typeof s.amount_total === "number" ? `£${(s.amount_total / 100).toFixed(2)}` : "-";
  const firstName = String(customer.name || "").split(/\s+/)[0] || "there";

  const lines = [
    "New paid order from the website shop.",
    "",
    `Order: ${meta.summary || "-"}`,
    `Paid: ${total}`,
    `How: ${(config.fulfilment.find((f) => f.id === meta.fulfilment) || {}).label || meta.fulfilment || "-"}`,
    shipping ? `Send to: ${shipping.name || customer.name || ""}, ${address(shipping.address)}` : null,
    meta.gift_message ? `Gift message: ${meta.gift_message}` : "Gift message: (none)",
    meta.age_confirmed ? "Contains gin: customer confirmed they are 18 or over. Check ID on handover." : null,
    "",
    `Customer: ${customer.name || "-"}`,
    `Email: ${customer.email || "-"}`,
    `Phone: ${customer.phone || "-"}`,
    "",
    `Stripe payment: ${s.payment_intent || s.id}`,
  ].filter((l) => l !== null);

  try {
    await sendEmail({
      from: FROM,
      to: TO,
      replyTo: customer.email || undefined,
      subject: `Shop order ${total}: ${meta.summary || s.id}`.slice(0, 200),
      text: lines.join("\n"),
    });
  } catch (err) {
    console.error("Paid order email failed", err);
    // A 500 makes Stripe try again later, so the order is not lost.
    return res.status(500).json({ error: "Email failed" });
  }
  seen.add(event.id);

  if (customer.email) {
    await sendEmail({
      from: FROM,
      to: customer.email,
      replyTo: TO,
      subject: "Thank you for your Witherslack Orchards order",
      text: [
        `Dear ${firstName},`,
        "",
        `Thank you for your order: ${meta.summary || "your juice and gin"}.`,
        "",
        NEXT_STEPS[meta.fulfilment] || "We'll be in touch about delivery.",
        "",
        `Any questions, just reply to this email or write to ${TO}.`,
        "",
        "Witherslack Orchards",
        "Halecat, Witherslack, Grange-over-Sands, Cumbria LA11 6RT",
      ].join("\n"),
    }).catch((err) => console.error("Customer confirmation failed", err));
  }

  return res.status(200).json({ received: true });
}

module.exports = handler;
// Stripe signs the exact bytes it sent, so the body must not be parsed first.
module.exports.config = { api: { bodyParser: false } };
