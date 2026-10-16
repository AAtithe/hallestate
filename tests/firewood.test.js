// npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../assets/js/firewood");

const config = {
  maxBags: 6,
  products: [
    { id: "logs", label: "Seasoned logs", pricePerBag: 90 },
    { id: "cut", label: "Logs cut to fit", pricePerBag: null },
  ],
  freeAreas: ["Witherslack", "Meathop", "Ulpha"],
  deliveryDistricts: { LA11: 8, LA9: null },
  deliveryNote: "about £8 per 15 minute round trip",
};
const base = { product: "logs", bags: 2, method: "delivery", area: "", postcode: "LA11 6RT" };

test("postcodes are tidied and their district found", () => {
  assert.deepEqual(F.parsePostcode(" la116rt "), { postcode: "LA11 6RT", district: "LA11" });
  assert.deepEqual(F.parsePostcode("LA9 4AB"), { postcode: "LA9 4AB", district: "LA9" });
  assert.equal(F.parsePostcode("LA11"), null);
  assert.equal(F.parsePostcode("not a postcode"), null);
});

test("free villages pay nothing for delivery", () => {
  const q = F.quote(config, { ...base, area: "Witherslack" });
  assert.equal(q.delivery.status, "free");
  assert.equal(q.total, 180);
});

test("priced district adds its charge", () => {
  const q = F.quote(config, base);
  assert.equal(q.delivery.status, "priced");
  assert.equal(q.total, 188);
});

test("a district without a charge is quoted, so no total is shown", () => {
  const q = F.quote(config, { ...base, postcode: "LA9 4AB" });
  assert.equal(q.delivery.status, "quote");
  assert.equal(q.total, null);
  assert.match(F.deliveryText(config, q), /we'll quote/);
});

test("outside the area, unpriced product, collection", () => {
  assert.equal(F.quote(config, { ...base, postcode: "M1 1AA" }).delivery.status, "outside");
  assert.equal(F.quote(config, { ...base, product: "cut" }).total, null);
  const c = F.quote(config, { ...base, method: "collect", postcode: "" });
  assert.deepEqual([c.delivery.status, c.total, c.problems], ["collect", 180, []]);
});

test("bad orders are caught", () => {
  assert.deepEqual(F.quote(config, { ...base, bags: 7 }).problems, ["bags"]);
  assert.deepEqual(F.quote(config, { ...base, bags: 0 }).problems, ["bags"]);
  assert.deepEqual(F.quote(config, { ...base, postcode: "nope" }).problems, ["postcode"]);
  assert.deepEqual(F.quote(config, { ...base, product: "kindling" }).problems, ["product"]);
  assert.deepEqual(F.quote(config, { ...base, method: "post" }).problems, ["method"]);
});

test("free village shows free delivery before the postcode is typed", () => {
  const q = F.quote(config, { ...base, area: "Meathop", postcode: "" });
  assert.equal(q.delivery.status, "free");
  assert.deepEqual(q.problems, ["postcode"]);
});
