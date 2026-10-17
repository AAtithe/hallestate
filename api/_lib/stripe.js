// Minimal Stripe REST client: create a Checkout Session and verify webhooks.
// No SDK, so there is nothing to install. The secret key never reaches the browser.

const crypto = require("crypto");

function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// Stripe takes form encoding with bracketed keys: line_items[0][quantity]=2
function encode(obj, prefix, out = []) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object") encode(value, name, out);
    else out.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }
  return out.join("&");
}

async function createCheckoutSession(params) {
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encode(params),
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe HTTP ${res.status}: ${body.error ? body.error.message : "unknown error"}`);
  return body;
}

// Checks the Stripe-Signature header against the raw request body, so only
// Stripe can tell us an order was paid. Rejects anything older than 5 minutes.
function verifyWebhook(rawBody, header, secret, now = Date.now()) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=")).filter((p) => p.length === 2 && p[0] === "t")
  );
  const signatures = header
    .split(",")
    .map((p) => p.split("="))
    .filter((p) => p[0] === "v1")
    .map((p) => p[1]);
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return signatures.some((s) => {
    const a = Buffer.from(s, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

module.exports = { isStripeConfigured, createCheckoutSession, verifyWebhook, encode };
