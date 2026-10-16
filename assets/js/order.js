// Witherslack Woodlands order form: live summary and sending the order.
// Prices and delivery areas come from firewood.json via the shared rules.
(function () {
  var root = document.getElementById("order-form");
  var F = window.Firewood;
  if (!root || !F) return;

  var form = root.querySelector("form");
  var productsEl = root.querySelector("[data-products]");
  var lengthField = root.querySelector("[data-length]");
  var deliveryEl = root.querySelector("[data-delivery]");
  var summaryEl = root.querySelector("[data-summary]");
  var totalEl = root.querySelector("[data-total]");
  var errorEl = root.querySelector("[data-error]");
  var submit = form.querySelector("[type=submit]");
  var done = root.querySelector("[data-done]");
  var ELSEWHERE = "Somewhere else in South Cumbria";
  var config;

  fetch("firewood.json")
    .then(function (r) {
      if (!r.ok) throw new Error("No firewood config");
      return r.json();
    })
    .then(function (c) {
      config = c;
      build();
      root.hidden = false;
      update();
    })
    .catch(function () {
      /* The phone details below the form still work. */
    });

  function option(select, value, label, selected) {
    var o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    if (selected) o.selected = true;
    select.appendChild(o);
  }

  function build() {
    config.products.forEach(function (p, i) {
      var label = document.createElement("label");
      label.className = "segmented__option";
      var input = document.createElement("input");
      input.type = "radio";
      input.name = "product";
      input.value = p.id;
      input.checked = i === 0;
      var title = document.createElement("span");
      title.className = "segmented__label";
      title.textContent = p.label + (typeof p.pricePerBag === "number" ? ", " + F.money(p.pricePerBag) + " a bag" : "");
      var sub = document.createElement("span");
      sub.className = "segmented__sub";
      sub.textContent = p.description;
      label.appendChild(input);
      label.appendChild(title);
      label.appendChild(sub);
      productsEl.appendChild(label);
    });
    for (var n = 1; n <= config.maxBags; n++) option(form.elements.bags, n, n === 1 ? "1 bag" : n + " bags", n === 1);
    option(form.elements.area, "", "Choose...", true);
    config.freeAreas.forEach(function (a) { option(form.elements.area, a, a + " (free delivery)"); });
    option(form.elements.area, ELSEWHERE, ELSEWHERE);
    form.addEventListener("input", update);
    form.addEventListener("change", update);
  }

  function order() {
    return {
      product: form.elements.product.value,
      bags: form.elements.bags.value,
      method: form.elements.method.value,
      area: form.elements.area.value,
      postcode: form.elements.postcode.value,
    };
  }

  function row(term, value) {
    var dt = document.createElement("dt");
    dt.textContent = term;
    var dd = document.createElement("dd");
    dd.textContent = value;
    summaryEl.appendChild(dt);
    summaryEl.appendChild(dd);
  }

  function update() {
    var o = order();
    var q = F.quote(config, o);
    var delivering = o.method === "delivery";
    deliveryEl.hidden = !delivering;
    lengthField.hidden = o.product !== "cut";

    summaryEl.textContent = "";
    if (q.item) row(q.item.label, q.bags + (q.bags === 1 ? " dumpy bag" : " dumpy bags") + (q.goods !== null ? ", " + F.money(q.goods) : ""));
    row(delivering ? "Delivery" : "Collection", F.deliveryText(config, q));
    totalEl.textContent = q.total !== null ? "Estimated total " + F.money(q.total) : "We'll confirm the price when we ring you.";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errorEl.hidden = true;
    var o = order();
    var q = F.quote(config, o);
    if (o.method === "delivery") {
      form.elements.address.required = true;
      form.elements.postcode.required = true;
      form.elements.area.required = true;
    } else {
      form.elements.address.required = form.elements.postcode.required = form.elements.area.required = false;
    }
    form.elements.logLength.required = o.product === "cut";
    if (!form.reportValidity()) return;
    if (q.problems.indexOf("postcode") !== -1) return fail("Please check the delivery postcode.");

    var data = {
      product: o.product,
      bags: o.bags,
      method: o.method,
      area: o.area,
      postcode: o.postcode,
      address: form.elements.address.value,
      length: form.elements.logLength.value,
      name: form.elements.name.value,
      phone: form.elements.phone.value,
      email: form.elements.email.value,
      notes: form.elements.notes.value,
      reminder: form.elements.reminder.checked,
      website: form.elements.website.value,
    };
    submit.disabled = true;
    submit.textContent = "Sending...";

    fetch("/api/firewood-order/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) { return { status: r.status, body: body }; });
      })
      .then(function (res) {
        if (res.status === 200 && res.body.ok) {
          done.querySelector("[data-done-what]").textContent =
            q.bags + (q.bags === 1 ? " bag" : " bags") + " of " + q.item.label.toLowerCase();
          form.hidden = true;
          root.querySelector(".order__summary").hidden = true;
          done.hidden = false;
          done.focus();
          return;
        }
        fail(res.body.error || "Something went wrong. Please ring us on 015395 52353.");
      })
      .catch(function () {
        fail("We couldn't send that just now. Please ring us on 015395 52353.");
      });
  });

  function fail(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    submit.disabled = false;
    submit.textContent = "Send order";
  }
})();
