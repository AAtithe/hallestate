// npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../assets/js/stays");
const { parseIcs } = require("../api/_lib/ical");

const config = {
  minNoticeDays: 2,
  horizonMonths: 18,
  stays: [
    { id: "week", nights: 7, arrivalDays: [5] },
    { id: "weekend", nights: 3, arrivalDays: [5] },
  ],
};
const TODAY = "2026-10-16"; // a Friday

test("date helpers cross month, year and clock changes", () => {
  assert.equal(S.addDays("2026-10-24", 2), "2026-10-26"); // clocks go back 25 Oct
  assert.equal(S.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(S.addMonths("2026-12-15", 1), "2027-01-01");
  assert.equal(S.weekday("2026-10-23"), 5);
  assert.equal(S.isIso("2026-02-30"), false);
  assert.equal(S.today(new Date("2026-06-30T23:30:00Z")), "2026-07-01"); // BST
});

test("departure day is free for the next arrival", () => {
  const nights = S.bookedNights([{ start: "2026-10-23", end: "2026-10-30" }]);
  assert.ok(nights.has("2026-10-29"));
  assert.ok(!nights.has("2026-10-30"));
  assert.equal(S.problem(config, "week", "2026-10-30", nights, TODAY), null);
  assert.equal(S.problem(config, "week", "2026-10-23", nights, TODAY), "booked");
});

test("a weekend fits where a week does not", () => {
  const nights = S.bookedNights([{ start: "2026-10-26", end: "2026-10-28" }]);
  assert.equal(S.problem(config, "weekend", "2026-10-23", nights, TODAY), null);
  assert.equal(S.problem(config, "week", "2026-10-23", nights, TODAY), "booked");
});

test("rules: arrival day, notice and horizon", () => {
  const none = new Set();
  assert.equal(S.problem(config, "week", "2026-10-24", none, TODAY), "arrival-day");
  assert.equal(S.problem(config, "week", "2026-10-16", none, TODAY), "too-soon");
  assert.equal(S.problem(config, "week", "2028-06-02", none, TODAY), "too-far");
  assert.equal(S.problem(config, "fortnight", "2026-10-23", none, TODAY), "unknown-stay");
  assert.equal(S.problem(config, "week", "not-a-date", none, TODAY), "bad-date");
});

test("iCal: all-day, timed, folded, cancelled and single-day events", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20261023",
    "DTEND;VALUE=DATE:20261030",
    "SUMMARY:Smith fami",
    " ly",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;TZID=Europe/London:20261106T160000",
    "DTEND;TZID=Europe/London:20261109T100000",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20261113",
    "DTEND;VALUE=DATE:20261116",
    "STATUS:CANCELLED",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20261120",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  assert.deepEqual(parseIcs(ics), [
    { start: "2026-10-23", end: "2026-10-30" },
    { start: "2026-11-06", end: "2026-11-09" },
    { start: "2026-11-20", end: "2026-11-21" },
  ]);
});
