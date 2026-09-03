import assert from "node:assert/strict";
import test from "node:test";
import type { SaleEvent } from "../lib/events.js";
import { generateICal } from "../lib/ical.js";

function uid(ical: string): string {
  const match = /^UID:(.+)$/m.exec(ical);
  assert.ok(match);
  return match[1].trim();
}

test("a date shift within one month preserves the event UID", () => {
  const before: SaleEvent = {
    name: "Fall Sale",
    startDate: "20260915",
    endDate: "20260922",
  };
  const after: SaleEvent = {
    name: "Fall Sale",
    startDate: "20260914",
    endDate: "20260921",
  };
  const generatedAt = new Date("2026-09-01T06:00:00Z");

  assert.equal(
    uid(generateICal([before], generatedAt)),
    uid(generateICal([after], generatedAt)),
  );
});

test("equivalent ampersand and word spellings preserve the event UID", () => {
  const ampersand: SaleEvent = {
    name: "Choice Day & Summer Savings",
    startDate: "20260701",
    endDate: "20260708",
  };
  const word: SaleEvent = {
    ...ampersand,
    name: "Choice Day and Summer Savings",
  };
  const generatedAt = new Date("2026-09-01T06:00:00Z");

  assert.equal(
    uid(generateICal([ampersand], generatedAt)),
    uid(generateICal([word], generatedAt)),
  );
});

test("duplicate names in one month receive distinct deterministic UIDs", () => {
  const events: SaleEvent[] = [
    { name: "Brand Day", startDate: "20260901", endDate: "20260903" },
    { name: "Brand Day", startDate: "20260920", endDate: "20260922" },
  ];
  const generatedAt = new Date("2026-09-01T06:00:00Z");
  const firstFeed = generateICal(events, generatedAt);
  const secondFeed = generateICal(events, generatedAt);
  const firstUids = [...firstFeed.matchAll(/^UID:(.+)$/gm)].map((match) =>
    match[1].trim(),
  );
  const secondUids = [...secondFeed.matchAll(/^UID:(.+)$/gm)].map((match) =>
    match[1].trim(),
  );

  assert.equal(new Set(firstUids).size, 2);
  assert.deepEqual(firstUids, secondUids);
});

test("the feed contains exactly one VEVENT per source event", () => {
  const events: SaleEvent[] = [
    { name: "Choice Day", startDate: "20260901", endDate: "20260908" },
    { name: "Fall Sale", startDate: "20260914", endDate: "20260921" },
  ];
  const ical = generateICal(events, new Date("2026-09-01T06:00:00Z"));

  assert.equal(
    ical.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length,
    events.length,
  );
  assert.match(
    ical,
    /SOURCE;VALUE=URI:https:\/\/kalenderabos\.de\/aesales\.ics/,
  );
});
