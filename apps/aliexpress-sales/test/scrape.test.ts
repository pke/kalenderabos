import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SaleEvent } from "../lib/events.js";
import {
  diffEvents,
  eventsEqual,
  normalizeEventName,
  parseSalesPage,
  renderEventsModule,
  validateCandidate,
} from "../lib/scrape.js";

const fixture = readFileSync(
  new URL("./fixtures/sales-2026.html", import.meta.url),
  "utf8",
);

test("parseSalesPage converts inclusive source ranges to exclusive end dates", () => {
  const result = parseSalesPage(fixture);

  assert.equal(result.year, 2026);
  assert.deepEqual(result.events, [
    { name: "Choice Day + New Year Deals", startDate: "20260101", endDate: "20260108" },
    { name: "Winter Sale", startDate: "20260112", endDate: "20260119" },
    { name: "Black Friday", startDate: "20261120", endDate: "20261204" },
    { name: "Christmas Sale", startDate: "20261208", endDate: "20261215" },
  ]);
});

test("parseSalesPage rejects a missing calendar table", () => {
  assert.throws(
    () => parseSalesPage("<h1>AliExpress Sales Calendar for 2026</h1>"),
    /sales calendar table/i,
  );
});

test("parseSalesPage rejects malformed date ranges instead of skipping rows", () => {
  const malformed = fixture.replace("01.01-07.01", "not-a-date");
  assert.throws(() => parseSalesPage(malformed), /date range/i);
});

test("normalizeEventName ignores punctuation, spacing, case, and accents", () => {
  assert.equal(normalizeEventName("  Fäll—SALE & Deals! "), "fall sale and deals");
});

function makeYear(year: number, count: number): SaleEvent[] {
  return Array.from({ length: count }, (_, index) => {
    const month = Math.floor(index / 2) + 1;
    const day = index % 2 === 0 ? 1 : 10;
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const end = String(day + 2).padStart(2, "0");
    return {
      name: `Event ${index + 1}`,
      startDate: `${year}${mm}${dd}`,
      endDate: `${year}${mm}${end}`,
    };
  });
}

test("validateCandidate accepts the exact continuity thresholds", () => {
  const previous = makeYear(2026, 10);
  const candidate = previous.map((event, index) => {
    if (index < 5) return event;
    if (index < 7) {
      return {
        ...event,
        startDate: `${event.startDate.slice(0, 6)}${String(Number(event.startDate.slice(6)) + 1).padStart(2, "0")}`,
        endDate: `${event.endDate.slice(0, 6)}${String(Number(event.endDate.slice(6)) + 1).padStart(2, "0")}`,
      };
    }
    return { ...event, name: `Replacement ${index + 1}` };
  });

  const report = validateCandidate(
    previous,
    candidate,
    new Date("2026-09-01T06:00:00Z"),
  );
  assert.equal(report.exactRatio, 0.5);
  assert.equal(report.recognizableRatio, 0.7);
});

test("validateCandidate rejects an empty result", () => {
  assert.throws(
    () => validateCandidate(makeYear(2026, 10), [], new Date("2026-09-01T06:00:00Z")),
    /empty/i,
  );
});

test("validateCandidate rejects a result below 60 percent of the old size", () => {
  const previous = makeYear(2026, 10);
  assert.throws(
    () => validateCandidate(
      previous,
      previous.slice(0, 5),
      new Date("2026-09-01T06:00:00Z"),
    ),
    /60%/,
  );
});

test("validateCandidate rejects an unrelated same-sized result", () => {
  const previous = makeYear(2026, 10);
  const unrelated = previous.map((event, index) => ({
    ...event,
    name: `Unrelated ${index + 1}`,
  }));
  assert.throws(
    () => validateCandidate(previous, unrelated, new Date("2026-09-01T06:00:00Z")),
    /exact overlap/i,
  );
});

test("validateCandidate rejects duplicate events", () => {
  const previous = makeYear(2026, 10);
  assert.throws(
    () => validateCandidate(
      previous,
      [...previous, previous[0]],
      new Date("2026-09-01T06:00:00Z"),
    ),
    /duplicate/i,
  );
});

test("validateCandidate rejects reversed event ranges", () => {
  const previous = makeYear(2026, 10);
  const reversed = previous.map((event, index) =>
    index === 0 ? { ...event, endDate: event.startDate } : event,
  );
  assert.throws(
    () => validateCandidate(previous, reversed, new Date("2026-09-01T06:00:00Z")),
    /duration/i,
  );
});

test("validateCandidate permits a complete next-year calendar during rollover", () => {
  assert.doesNotThrow(() =>
    validateCandidate(
      makeYear(2026, 20),
      makeYear(2027, 20),
      new Date("2026-12-01T06:00:00Z"),
    ),
  );
});

test("validateCandidate rejects a next-year calendar outside rollover", () => {
  assert.throws(
    () => validateCandidate(
      makeYear(2026, 20),
      makeYear(2027, 20),
      new Date("2026-06-01T06:00:00Z"),
    ),
    /year rollover/i,
  );
});

test("validateCandidate rejects a rollover calendar clustered in one month", () => {
  const clustered: SaleEvent[] = Array.from({ length: 20 }, (_, index) => ({
    name: `January Event ${index + 1}`,
    startDate: "20270101",
    endDate: "20270103",
  }));

  assert.throws(
    () => validateCandidate(
      makeYear(2026, 20),
      clustered,
      new Date("2026-12-01T06:00:00Z"),
    ),
    /month coverage/i,
  );
});

test("validateCandidate rejects a stale rollover year", () => {
  assert.throws(
    () => validateCandidate(
      makeYear(2024, 20),
      makeYear(2025, 20),
      new Date("2026-12-01T06:00:00Z"),
    ),
    /current year/i,
  );
});

test("validateCandidate rejects implausible event-count growth", () => {
  const previous = makeYear(2026, 20);
  const extras: SaleEvent[] = Array.from({ length: 80 }, (_, index) => {
    const month = String((index % 12) + 1).padStart(2, "0");
    return {
      name: `Injected Event ${index + 1}`,
      startDate: `2026${month}01`,
      endDate: `2026${month}03`,
    };
  });

  assert.throws(
    () => validateCandidate(
      previous,
      [...previous, ...extras],
      new Date("2026-09-01T06:00:00Z"),
    ),
    /event-count growth/i,
  );
});

test("eventsEqual and diffEvents describe a date change", () => {
  const previous = makeYear(2026, 10);
  const candidate = previous.map((event, index) =>
    index === 0 ? { ...event, endDate: "20260104" } : event,
  );

  assert.equal(eventsEqual(previous, previous), true);
  assert.equal(eventsEqual(previous, candidate), false);
  assert.deepEqual(diffEvents(previous, candidate), {
    added: [],
    removed: [],
    changed: [{ before: previous[0], after: candidate[0] }],
  });
});

test("eventsEqual notices display-name changes with the same normalized identity", () => {
  const ampersand: SaleEvent = {
    name: "Choice Day & Summer Savings",
    startDate: "20260701",
    endDate: "20260708",
  };
  const word: SaleEvent = {
    ...ampersand,
    name: "Choice Day and Summer Savings",
  };

  assert.equal(eventsEqual([ampersand], [word]), false);
  assert.deepEqual(diffEvents([ampersand], [word]), {
    added: [],
    removed: [],
    changed: [{ before: ampersand, after: word }],
  });
});

test("diffEvents reports removal among duplicate names in one month", () => {
  const first: SaleEvent = {
    name: "Brand Day",
    startDate: "20260901",
    endDate: "20260903",
  };
  const second: SaleEvent = {
    name: "Brand Day",
    startDate: "20260920",
    endDate: "20260922",
  };

  assert.deepEqual(diffEvents([first, second], [second]), {
    added: [],
    removed: [first],
    changed: [],
  });
});

test("renderEventsModule records source provenance and escapes names", () => {
  const output = renderEventsModule(
    [
      {
        name: "Brand \"Day\"",
        startDate: "20260901",
        endDate: "20260903",
      },
    ],
    "https://en.ali-shop.net/sales",
    new Date("2026-09-01T06:00:00Z"),
  );

  assert.match(
    output,
    /Generated from https:\/\/en\.ali-shop\.net\/sales on 2026-09-01/,
  );
  assert.match(output, /name: "Brand \\\"Day\\\""/);
});
