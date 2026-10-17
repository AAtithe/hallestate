// Witherslack Orchards shop rules, shared by the basket in the browser and the
// checkout API, so the customer is charged exactly what the basket showed.
// Prices are in pounds in orchards/shop.json and worked in pence here. A price
// left as null means the item can be ordered by email but not paid online.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ShopRules = factory();
})(typeof self !== "undefined" ? self : this, function () {
  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function pence(pounds) {
    return typeof pounds === "number" && pounds >= 0 ? Math.round(pounds * 100) : null;
  }
  function money(p) {
    return "£" + (p / 100).toFixed(2);
  }

  // basket: { items: { productId: quantity }, fulfilment: id }
  function quote(config, basket) {
    var problems = [];
    var lines = [];
    var items = (basket && basket.items) || {};
    var payable = true;
    var hasAlcohol = false;
    var subtotal = 0;
    var count = 0;

    Object.keys(items).forEach(function (id) {
      var qty = Number(items[id]);
      if (!qty) return;
      var product = find(config.products, id);
      if (!product) return problems.push("unknown-product");
      if (!product.available) return problems.push("unavailable");
      if (!(qty >= 1 && qty <= config.maxPerItem && Math.floor(qty) === qty)) return problems.push("quantity");
      var unit = pence(product.price);
      if (unit === null) payable = false;
      if (product.alcohol) hasAlcohol = true;
      count += qty;
      lines.push({ product: product, qty: qty, unit: unit, amount: unit === null ? null : unit * qty });
      if (unit !== null) subtotal += unit * qty;
    });
    if (!lines.length && problems.indexOf("unknown-product") === -1) problems.push("empty");

    var option = find(config.fulfilment, basket && basket.fulfilment);
    if (!option) problems.push("fulfilment");
    var delivery = option ? pence(option.price) : null;
    if (option && delivery === null) payable = false;

    return {
      problems: problems,
      lines: lines,
      count: count,
      fulfilment: option,
      delivery: delivery,
      subtotal: payable ? subtotal : null,
      total: payable && delivery !== null ? subtotal + delivery : null,
      payable: payable && !problems.length,
      hasAlcohol: hasAlcohol,
    };
  }

  // One line about Christmas timing, or null once Christmas has gone.
  function christmasNote(config, todayIso) {
    var c = config.christmas || {};
    function nice(iso) {
      return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    }
    if (c.lastOrderForDelivery && todayIso <= c.lastOrderForDelivery) {
      return "Order by " + nice(c.lastOrderForDelivery) + " for delivery before Christmas.";
    }
    if (c.lastCollection && todayIso <= c.lastCollection) {
      return "Too late for Christmas delivery, but you can still collect from Halecat until " + nice(c.lastCollection) + ".";
    }
    return null;
  }

  // Plain text order lines, for emails and order notes.
  function summary(q) {
    return q.lines
      .map(function (l) { return l.qty + " x " + l.product.name + (l.amount !== null ? " (" + money(l.amount) + ")" : ""); })
      .join(", ");
  }

  return { quote: quote, christmasNote: christmasNote, summary: summary, money: money, pence: pence };
});
