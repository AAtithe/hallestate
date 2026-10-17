// Witherslack Orchards shop: basket, delivery choice and checkout.
// With prices and Stripe set up, "Pay securely" goes to Stripe's checkout page.
// Until then the same basket is sent as an email instead.
(function () {
  var root = document.getElementById("shop-form");
  var R = window.ShopRules;
  if (!root || !R) return;

  var EMAIL = "juice@witherslackorchards.co.uk";
  var itemsEl = root.querySelector("[data-items]");
  var form = root.querySelector("form");
  var fulfilmentEl = root.querySelector("[data-fulfilment]");
  var ageEl = root.querySelector("[data-age]");
  var summaryEl = root.querySelector("[data-summary]");
  var totalEl = root.querySelector("[data-total]");
  var errorEl = root.querySelector("[data-error]");
  var payNote = root.querySelector("[data-pay-note]");
  var submit = form.querySelector("[type=submit]");
  var basket = { items: {}, fulfilment: null };
  var config;

  var thanks = document.querySelector("[data-thanks]");
  if (thanks && /[?&]order=thanks\b/.test(location.search)) {
    thanks.hidden = false;
    try { localStorage.removeItem("orchards-basket"); } catch (e) {}
    setTimeout(function () { thanks.focus(); }, 50);
  }

  fetch("shop.json")
    .then(function (r) {
      if (!r.ok) throw new Error("No shop config");
      return r.json();
    })
    .then(function (c) {
      config = c;
      basket.fulfilment = config.fulfilment[0].id;
      try {
        var saved = JSON.parse(localStorage.getItem("orchards-basket") || "null");
        if (saved && saved.items) basket.items = saved.items;
      } catch (e) {}
      var note = document.querySelector("[data-christmas]");
      var today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
      var text = R.christmasNote(config, today);
      if (note && text) {
        note.textContent = text;
        note.hidden = false;
      }
      build();
      root.hidden = false;
      update();
    })
    .catch(function () {
      /* The contact details further down still work. */
    });

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function build() {
    config.products.forEach(function (p) {
      var li = el("li", "shop__item");
      var info = el("div", "shop__info");
      info.appendChild(el("h3", null, p.name));
      info.appendChild(el("p", null, p.description));
      li.appendChild(info);
      li.appendChild(el("p", "shop__price", typeof p.price === "number" ? R.money(R.pence(p.price)) : "Price on request"));

      if (!p.available) {
        li.appendChild(el("p", "shop__sold", "Sold out"));
      } else {
        var qty = el("div", "qty");
        var minus = el("button", "qty__btn", "−");
        minus.type = "button";
        minus.setAttribute("aria-label", "One fewer " + p.name);
        var input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.max = String(config.maxPerItem);
        input.value = String(basket.items[p.id] || 0);
        input.inputMode = "numeric";
        input.id = "q-" + p.id;
        input.setAttribute("aria-label", "How many " + p.name);
        var plus = el("button", "qty__btn", "+");
        plus.type = "button";
        plus.setAttribute("aria-label", "One more " + p.name);
        function set(n) {
          n = Math.max(0, Math.min(config.maxPerItem, Math.floor(Number(n) || 0)));
          input.value = String(n);
          if (n) basket.items[p.id] = n;
          else delete basket.items[p.id];
          update();
        }
        minus.addEventListener("click", function () { set(Number(input.value) - 1); });
        plus.addEventListener("click", function () { set(Number(input.value) + 1); });
        input.addEventListener("change", function () { set(input.value); });
        qty.appendChild(minus);
        qty.appendChild(input);
        qty.appendChild(plus);
        li.appendChild(qty);
      }
      itemsEl.appendChild(li);
    });

    config.fulfilment.forEach(function (f, i) {
      var label = el("label", "segmented__option");
      var input = document.createElement("input");
      input.type = "radio";
      input.name = "fulfilment";
      input.value = f.id;
      input.checked = i === 0;
      input.addEventListener("change", function () {
        basket.fulfilment = f.id;
        update();
      });
      label.appendChild(input);
      var price = f.price === 0 ? "Free" : typeof f.price === "number" ? R.money(R.pence(f.price)) : "Price on request";
      label.appendChild(el("span", "segmented__label", f.label + ", " + price));
      label.appendChild(el("span", "segmented__sub", f.description));
      fulfilmentEl.appendChild(label);
    });
  }

  function row(term, value) {
    summaryEl.appendChild(el("dt", null, term));
    summaryEl.appendChild(el("dd", null, value));
  }

  function update() {
    try { localStorage.setItem("orchards-basket", JSON.stringify({ items: basket.items })); } catch (e) {}
    var q = R.quote(config, basket);
    ageEl.hidden = !q.hasAlcohol;
    summaryEl.textContent = "";
    if (!q.lines.length) {
      row("Your basket", "Add something above to get started.");
      totalEl.textContent = "";
      submit.disabled = true;
      return;
    }
    q.lines.forEach(function (l) {
      row(l.qty + " × " + l.product.name, l.amount !== null ? R.money(l.amount) : "Price on request");
    });
    if (q.fulfilment) row(q.fulfilment.label, q.delivery === null ? "Price on request" : q.delivery === 0 ? "Free" : R.money(q.delivery));
    totalEl.textContent = q.total !== null ? "Total " + R.money(q.total) : "We'll confirm the total by email.";
    submit.disabled = false;
    submit.textContent = q.payable ? "Pay securely" : "Email your order";
    payNote.textContent = q.payable
      ? "Payment is handled by Stripe. We never see your card details."
      : "Online payment isn't switched on yet. Your email app will open with your order filled in.";
  }

  function emailOrder(q) {
    var lines = q.lines.map(function (l) { return l.qty + " x " + l.product.name; });
    var body = [
      "Hello, I'd like to order:",
      "",
      lines.join("\n"),
      "",
      "How: " + (q.fulfilment ? q.fulfilment.label : ""),
      form.elements.giftMessage.value ? "Gift message: " + form.elements.giftMessage.value : "",
      "",
      "My name, address and phone number:",
      "",
    ].join("\n");
    location.href = "mailto:" + EMAIL + "?subject=" + encodeURIComponent("Christmas order") + "&body=" + encodeURIComponent(body);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errorEl.hidden = true;
    var q = R.quote(config, basket);
    if (!q.lines.length) return;
    if (q.hasAlcohol && !form.elements.ageConfirmed.checked) {
      return fail("Please confirm you're 18 or over to buy damson gin.");
    }
    if (!q.payable) return emailOrder(q);

    submit.disabled = true;
    submit.textContent = "Opening secure checkout...";
    fetch("/api/shop-checkout/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: basket.items,
        fulfilment: basket.fulfilment,
        giftMessage: form.elements.giftMessage.value,
        ageConfirmed: form.elements.ageConfirmed.checked,
        returnUrl: location.href.split("#")[0].split("?")[0],
        website: form.elements.website.value,
      }),
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, body: b }; });
      })
      .then(function (res) {
        if (res.status === 200 && res.body.url) {
          location.href = res.body.url;
          return;
        }
        if (res.body.emailOrder) {
          update();
          return emailOrder(q);
        }
        fail(res.body.error || "Something went wrong. Please email " + EMAIL + ".");
      })
      .catch(function () {
        fail("We couldn't reach the checkout just now. Please try again or email " + EMAIL + ".");
      });
  });

  function fail(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    update();
  }
})();
