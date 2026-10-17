// npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const R = require("../assets/js/shop-rules");
const { verifyWebhook, encode } = require("../api/_lib/stripe");

const config = {
  maxPerItem: 12,
  christmas: { lastOrderForDelivery: "2026-12-15", lastCollection: "2026-12-23" },
  products: [
    { id: "juice", name: "Apple juice", price: 4.5, alcohol: false, available: true },
    { id: "gin", name: "Damson gin liqueur", price: 28, alcohol: true, available: true },
    { id: "secret", name: "Unpriced", price: null, alcohol: false, available: true },
    { id: "gone", name: "Sold out", price: 5, alcohol: false, available: false },
  ],
  fulfilment: [
    { id: "collect", label: "Collect", price: 0 },
    { id: "post", label: "UK delivery", price: 6.95 },
    { id: "local", label: "Local", price: null },
  ],
};

test("prices in pence, delivery added, alcohol flagged", () => {
  const q = R.quote(config, { items: { juice: 3, gin: 1 }, fulfilment: "post" });
  assert.equal(q.subtotal, 4150);
  assert.equal(q.delivery, 695);
  assert.equal(q.total, 4845);
  assert.equal(q.payable, true);
  assert.equal(q.hasAlcohol, true);
  assert.equal(R.summary(q), "3 x Apple juice (£13.50), 1 x Damson gin liqueur (£28.00)");
});

test("an unpriced item or delivery means email order, not payment", () => {
  assert.equal(R.quote(config, { items: { secret: 1 }, fulfilment: "collect" }).payable, false);
  const local = R.quote(config, { items: { juice: 1 }, fulfilment: "local" });
  assert.deepEqual([local.payable, local.total], [false, null]);
});

test("bad baskets are refused", () => {
  assert.deepEqual(R.quote(config, { items: {}, fulfilment: "collect" }).problems, ["empty"]);
  assert.ok(R.quote(config, { items: { juice: 13 }, fulfilment: "collect" }).problems.includes("quantity"));
  assert.ok(R.quote(config, { items: { gone: 1 }, fulfilment: "collect" }).problems.includes("unavailable"));
  assert.ok(R.quote(config, { items: { nope: 1 }, fulfilment: "collect" }).problems.includes("unknown-product"));
  assert.ok(R.quote(config, { items: { juice: 1 }, fulfilment: "drone" }).problems.includes("fulfilment"));
  assert.equal(R.quote(config, { items: { juice: 1.5 }, fulfilment: "collect" }).payable, false);
});

test("Christmas note changes with the date", () => {
  assert.match(R.christmasNote(config, "2026-11-01"), /^Order by Tuesday 15 December/);
  assert.match(R.christmasNote(config, "2026-12-20"), /collect from Halecat until Wednesday 23 December/);
  assert.equal(R.christmasNote(config, "2026-12-24"), null);
});

test("Stripe form encoding nests keys", () => {
  assert.equal(
    encode({ a: 1, line_items: [{ quantity: 2, price_data: { currency: "gbp" } }], skip: undefined }),
    "a=1&line_items%5B0%5D%5Bquantity%5D=2&line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=gbp"
  );
});

test("webhook signatures: valid, tampered, stale", () => {
  const secret = "whsec_test";
  const body = '{"id":"evt_1"}';
  const t = 1800000000;
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const header = `t=${t},v1=${sig}`;
  assert.equal(verifyWebhook(body, header, secret, t * 1000), true);
  assert.equal(verifyWebhook(body + " ", header, secret, t * 1000), false);
  assert.equal(verifyWebhook(body, header, "wrong", t * 1000), false);
  assert.equal(verifyWebhook(body, header, secret, (t + 600) * 1000), false);
  assert.equal(verifyWebhook(body, undefined, secret, t * 1000), false);
});
