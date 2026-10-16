// Halecat availability calendar and booking request form.
// Reads the stay rules from booking.json and booked dates from /api/availability,
// then lets a guest pick an arrival day and send a request to Elaine.
(function () {
  var root = document.getElementById("booking");
  var S = window.HalecatStays;
  if (!root || !S) return;

  var fallback = document.querySelector("[data-booking-fallback]");
  var monthsEl = root.querySelector("[data-months]");
  var staysEl = root.querySelector("[data-stays]");
  var prevBtn = root.querySelector("[data-prev]");
  var nextBtn = root.querySelector("[data-next]");
  var form = root.querySelector("form");
  var summary = root.querySelector("[data-summary]");
  var submit = form.querySelector("[type=submit]");
  var errorEl = form.querySelector("[data-error]");
  var done = root.querySelector("[data-done]");

  var config = null;
  var nights = new Set();
  var today = S.today();
  var firstMonth = today.slice(0, 8) + "01";
  var state = { stay: null, arrival: null, month: firstMonth };

  var WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function longDate(iso) {
    return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
      weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
    });
  }
  function monthTitle(iso) {
    return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function loadAvailability() {
    return fetch("/api/availability", { headers: { Accept: "application/json" } }).then(function (r) {
      // No API (a static preview): fall back to the manual closures in booking.json.
      if (r.status === 404) return { booked: config.blocked || [] };
      if (!r.ok) throw new Error("Availability unavailable");
      return r.json();
    });
  }

  function showFallback() {
    root.hidden = true;
    if (fallback) fallback.hidden = false;
  }

  fetch("booking.json")
    .then(function (r) {
      if (!r.ok) throw new Error("No booking config");
      return r.json();
    })
    .then(function (c) {
      config = c;
      state.stay = config.stays[0].id;
      return loadAvailability();
    })
    .then(function (data) {
      nights = S.bookedNights(data.booked);
      buildStayPicker();
      fillSelect(form.elements.guests, 1, config.maxGuests, 2);
      fillSelect(form.elements.dogs, 0, config.maxDogs, 0);
      root.hidden = false;
      if (fallback) fallback.hidden = true;
      render();
    })
    .catch(showFallback);

  function fillSelect(select, min, max, initial) {
    for (var i = min; i <= max; i++) {
      var opt = el("option", null, String(i));
      opt.value = String(i);
      if (i === initial) opt.selected = true;
      select.appendChild(opt);
    }
  }

  function buildStayPicker() {
    config.stays.forEach(function (stay, i) {
      var label = el("label", "segmented__option");
      var input = document.createElement("input");
      input.type = "radio";
      input.name = "stay";
      input.value = stay.id;
      input.checked = i === 0;
      input.addEventListener("change", function () {
        state.stay = stay.id;
        if (state.arrival && S.problem(config, state.stay, state.arrival, nights, today)) state.arrival = null;
        render();
      });
      label.appendChild(input);
      label.appendChild(el("span", "segmented__label", stay.label));
      label.appendChild(el("span", "segmented__sub", stay.description));
      staysEl.appendChild(label);
    });
  }

  prevBtn.addEventListener("click", function () {
    state.month = S.addMonths(state.month, -1);
    render();
  });
  nextBtn.addEventListener("click", function () {
    state.month = S.addMonths(state.month, 1);
    render();
  });

  function render() {
    var lastMonth = S.addMonths(firstMonth, config.horizonMonths - 1);
    if (state.month < firstMonth) state.month = firstMonth;
    if (state.month > lastMonth) state.month = lastMonth;
    prevBtn.disabled = state.month <= firstMonth;
    nextBtn.disabled = state.month >= lastMonth;

    monthsEl.textContent = "";
    monthsEl.appendChild(renderMonth(state.month));
    monthsEl.appendChild(renderMonth(S.addMonths(state.month, 1)));
    renderSummary();
  }

  function renderMonth(first) {
    var wrap = el("div", "cal-month");
    wrap.appendChild(el("h3", "cal-title", monthTitle(first)));
    var table = el("table", "cal-grid");
    table.setAttribute("role", "grid");
    var head = el("tr");
    WEEKDAYS.forEach(function (d) {
      var th = el("th", null, d.charAt(0));
      th.setAttribute("abbr", d);
      th.scope = "col";
      head.appendChild(th);
    });
    table.appendChild(el("thead")).appendChild(head);
    var body = table.appendChild(el("tbody"));

    var leaving = state.arrival ? S.departure(config, state.stay, state.arrival) : null;
    var offset = (S.weekday(first) + 6) % 7;
    var day = S.addDays(first, -offset);
    var nextMonth = S.addMonths(first, 1);
    while (day < nextMonth) {
      var row = body.appendChild(el("tr"));
      for (var i = 0; i < 7; i++, day = S.addDays(day, 1)) {
        var td = row.appendChild(el("td"));
        if (day < first || day >= nextMonth) continue;
        td.appendChild(dayCell(day, leaving));
      }
    }
    wrap.appendChild(table);
    return wrap;
  }

  function dayCell(day, leaving) {
    var num = String(+day.slice(8));
    var inStay = state.arrival && day >= state.arrival && day < leaving;
    var label = longDate(day);

    if (inStay || day === leaving) {
      var stayCell = el("span", "cal-day " + (day === leaving ? "is-leaving" : "is-stay"), num);
      if (day === state.arrival) stayCell.className += " is-start";
      stayCell.setAttribute("aria-label", label + (day === leaving ? ", you leave" : ", your stay"));
      if (day === state.arrival) {
        var btn = el("button", stayCell.className, num);
        btn.type = "button";
        btn.dataset.date = day;
        btn.setAttribute("aria-pressed", "true");
        btn.setAttribute("aria-label", label + ", your arrival day");
        return btn;
      }
      return stayCell;
    }
    if (nights.has(day)) {
      var booked = el("span", "cal-day is-booked", num);
      booked.setAttribute("aria-label", label + ", booked");
      return booked;
    }
    if (!S.problem(config, state.stay, day, nights, today)) {
      var pick = el("button", "cal-day is-arrival", num);
      pick.type = "button";
      pick.dataset.date = day;
      pick.setAttribute("aria-pressed", "false");
      pick.setAttribute("aria-label", label + ", available to arrive");
      pick.addEventListener("click", function () {
        state.arrival = day;
        render();
        var again = monthsEl.querySelector('[data-date="' + day + '"]');
        if (again) again.focus();
      });
      return pick;
    }
    var plain = el("span", "cal-day" + (day < today ? " is-past" : ""), num);
    plain.setAttribute("aria-label", label);
    return plain;
  }

  function renderSummary() {
    var type = S.stayType(config, state.stay);
    if (!state.arrival) {
      summary.textContent = "Choose an arrival day on the calendar. " + type.label + " runs " + type.description.toLowerCase() + ".";
      summary.classList.remove("is-chosen");
      submit.disabled = true;
      return;
    }
    summary.textContent = "";
    summary.classList.add("is-chosen");
    summary.appendChild(el("strong", null, type.label + ", " + type.nights + " nights"));
    summary.appendChild(el("span", null, longDate(state.arrival) + " to " + longDate(S.departure(config, state.stay, state.arrival))));
    submit.disabled = false;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!state.arrival) return;
    errorEl.hidden = true;
    if (!form.reportValidity()) return;

    var data = {
      stay: state.stay,
      arrival: state.arrival,
      name: form.elements.name.value,
      email: form.elements.email.value,
      phone: form.elements.phone.value,
      guests: form.elements.guests.value,
      dogs: form.elements.dogs.value,
      message: form.elements.message.value,
      website: form.elements.website.value,
    };
    submit.disabled = true;
    submit.textContent = "Sending...";

    fetch("/api/booking-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          return { status: r.status, body: body };
        });
      })
      .then(function (res) {
        if (res.status === 200 && res.body.ok) {
          var when = longDate(state.arrival) + " to " + longDate(S.departure(config, state.stay, state.arrival));
          done.querySelector("[data-done-dates]").textContent = when;
          form.hidden = true;
          done.hidden = false;
          done.focus();
          return;
        }
        fail(res.body.error || "Something went wrong. Please ring Elaine on 015395 52387.");
        if (res.status === 409) {
          loadAvailability().then(function (d) {
            nights = S.bookedNights(d.booked);
            state.arrival = null;
            render();
          });
        }
      })
      .catch(function () {
        fail("We couldn't send that just now. Please ring Elaine on 015395 52387.");
      });
  });

  function fail(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    submit.textContent = "Send booking request";
    submit.disabled = !state.arrival;
  }
})();
