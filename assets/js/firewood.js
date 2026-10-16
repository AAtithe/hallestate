// Witherslack Woodlands order rules, shared by the order form in the browser
// and the order API, so the customer sees exactly what the woodyard receives.
// Prices and delivery charges come from woodlands/firewood.json. A price left
// as null means "we'll confirm it when we call", never zero.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Firewood = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var POSTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/;

  // "la11 6rt" -> { postcode: "LA11 6RT", district: "LA11" }, or null.
  function parsePostcode(value) {
    var compact = String(value || "").toUpperCase().replace(/\s+/g, "");
    if (!POSTCODE.test(compact)) return null;
    var district = compact.slice(0, -3);
    return { postcode: district + " " + compact.slice(-3), district: district };
  }

  function product(config, id) {
    for (var i = 0; i < config.products.length; i++) if (config.products[i].id === id) return config.products[i];
    return null;
  }

  function money(n) {
    return "£" + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "");
  }

  // Work out an order. Returns what is wrong (problems) and what it costs so far.
  // order: { product, bags, method: "delivery"|"collect", area, postcode }
  function quote(config, order) {
    var problems = [];
    var item = product(config, order.product);
    var bags = Number(order.bags);
    if (!item) problems.push("product");
    if (!(bags >= 1 && bags <= config.maxBags && Math.floor(bags) === bags)) problems.push("bags");

    var delivery = { status: "collect", charge: 0 };
    var pc = null;
    if (order.method === "delivery") {
      pc = parsePostcode(order.postcode);
      if (!pc) problems.push("postcode");
      if (config.freeAreas.indexOf(order.area) !== -1) {
        delivery = { status: "free", charge: 0 };
      } else if (!pc) {
        delivery = { status: "unknown", charge: null };
      } else if (Object.prototype.hasOwnProperty.call(config.deliveryDistricts, pc.district)) {
        var charge = config.deliveryDistricts[pc.district];
        delivery = typeof charge === "number" ? { status: "priced", charge: charge } : { status: "quote", charge: null };
      } else {
        delivery = { status: "outside", charge: null };
      }
    } else if (order.method !== "collect") {
      problems.push("method");
    }

    var goods = item && typeof item.pricePerBag === "number" && problems.indexOf("bags") === -1 ? item.pricePerBag * bags : null;
    var total = goods !== null && delivery.charge !== null ? goods + delivery.charge : null;

    return {
      problems: problems,
      item: item,
      bags: bags,
      postcode: pc,
      goods: goods,
      delivery: delivery,
      total: total,
    };
  }

  // One line a customer can read, for the summary and the emails.
  function deliveryText(config, q) {
    switch (q.delivery.status) {
      case "collect": return "Collect from the woodyard, Monday to Friday 8.30am to 4pm";
      case "free": return "Free delivery";
      case "priced": return "Delivery " + money(q.delivery.charge);
      case "quote": return "Delivery " + config.deliveryNote + ", we'll quote when we call";
      case "outside": return "Outside our usual area, we'll let you know if we can reach you";
      default: return "Add your postcode to check delivery";
    }
  }

  return { parsePostcode: parsePostcode, product: product, quote: quote, deliveryText: deliveryText, money: money };
});
