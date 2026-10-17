// POST /api/shop-checkout
// Turns the basket into a Stripe Checkout page. The basket is priced again here
// from orchards/shop.json, never from what the browser says it costs.

const config = require("../orchards/shop.json");
const Shop = require("../assets/js/shop-rules");
const { isStripeConfigured, createCheckoutSession } = require("./_lib/stripe");
const { tooMany } = require("./_lib/limit");

const EMAIL = "juice@witherslackorchards.co.uk";

function str(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Send the customer back to the page they came from, on this site only.
function returnBase(req, returnUrl) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || (String(host).startsWith("localhost") ? "http" : "https");
  try {
    const url = new URL(returnUrl);
    if (url.host === host) return `${url.origin}${url.pathname}`;
  } catch {}
  return `${proto}://${host}/`;
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
  if (tooMany(req, "shop", 10)) {
    return res.status(429).json({ error: `That's a few tries in a row. Please email ${EMAIL}.` });
  }

  const items = {};
  if (body.items && typeof body.items === "object") {
    for (const [id, qty] of Object.entries(body.items).slice(0, 20)) items[str(id, 40)] = Number.parseInt(qty, 10) || 0;
  }
  const q = Shop.quote(config, { items, fulfilment: str(body.fulfilment, 20) });
  const gift = str(body.giftMessage, 300);

  if (q.problems.includes("empty")) return res.status(400).json({ error: "Your basket is empty." });
  if (q.problems.length) return res.status(400).json({ error: "Please check your basket and try again." });
  if (q.hasAlcohol && body.ageConfirmed !== true) {
    return res.status(400).json({ error: "Please confirm you're 18 or over to buy damson gin." });
  }
  if (!q.payable || !isStripeConfigured()) {
    return res.status(409).json({ error: "Online payment isn't switched on yet.", emailOrder: true });
  }

  const base = returnBase(req, str(body.returnUrl, 500));
  const lineItems = q.lines.map((l) => ({
    quantity: l.qty,
    price_data: { currency: "gbp", unit_amount: l.unit, product_data: { name: l.product.name } },
  }));
  if (q.delivery > 0) {
    lineItems.push({
      quantity: 1,
      price_data: { currency: "gbp", unit_amount: q.delivery, product_data: { name: q.fulfilment.label } },
    });
  }

  const params = {
    mode: "payment",
    success_url: `${base}?order=thanks#shop`,
    cancel_url: `${base}#shop`,
    line_items: lineItems,
    phone_number_collection: { enabled: true },
    billing_address_collection: "auto",
    metadata: {
      fulfilment: q.fulfilment.id,
      summary: Shop.summary(q).slice(0, 500),
      gift_message: gift || undefined,
      age_confirmed: q.hasAlcohol ? "yes" : undefined,
    },
    payment_intent_data: { description: `Witherslack Orchards: ${Shop.summary(q)}`.slice(0, 1000) },
  };
  if (q.fulfilment.address) params.shipping_address_collection = { allowed_countries: ["GB"] };
  if (q.hasAlcohol) {
    params.custom_text = {
      submit: { message: "Damson gin is sold to over-18s only. ID may be checked on delivery or collection." },
    };
  }

  try {
    const session = await createCheckoutSession(params);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout failed", err);
    return res.status(502).json({ error: `We couldn't start the payment just now. Please try again or email ${EMAIL}.` });
  }
};
