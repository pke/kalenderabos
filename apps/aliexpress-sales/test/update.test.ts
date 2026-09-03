import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { SaleEvent } from "../lib/events.js";
import { generateICal } from "../lib/ical.js";
import { parseSalesPage } from "../lib/scrape.js";
import {
  SALES_URL,
  fetchSalesPage,
  updateCalendar,
} from "../lib/update.js";

const fixture = await readFile(
  new URL("./fixtures/sales-2026.html", import.meta.url),
  "utf8",
);

function htmlResponse(
  body: string,
  overrides: Partial<Response> = {},
): Response {
  return {
    ok: true,
    status: 200,
    url: SALES_URL,
    headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
    text: async () => body,
    ...overrides,
  } as Response;
}

test("fetchSalesPage retries two transient failures before succeeding", async () => {
  let calls = 0;
  const html = fixture.padEnd(1_200, " ");
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    if (calls < 3) throw new Error("temporary network failure");
    return htmlResponse(html);
  };

  assert.equal(
    await fetchSalesPage(SALES_URL, fetchImpl, async () => {}),
    html,
  );
  assert.equal(calls, 3);
});

test("fetchSalesPage rejects redirects away from the approved host", async () => {
  const fetchImpl: typeof fetch = async () =>
    htmlResponse(fixture.padEnd(1_200, " "), {
      url: "https://example.com/sales",
    });

  await assert.rejects(
    fetchSalesPage(SALES_URL, fetchImpl, async () => {}),
    /unexpected host/i,
  );
});

test("fetchSalesPage rejects a non-HTML response", async () => {
  const fetchImpl: typeof fetch = async () =>
    htmlResponse(fixture.padEnd(1_200, " "), {
      headers: new Headers({ "content-type": "application/json" }),
    });

  await assert.rejects(
    fetchSalesPage(SALES_URL, fetchImpl, async () => {}),
    /non-html/i,
  );
});

test("updateCalendar leaves both files unchanged when validation fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aliexpress-calendar-"));
  const eventsPath = join(directory, "events.ts");
  const calendarPath = join(directory, "calendar.ics");
  const previousEvents = parseSalesPage(fixture).events;
  await writeFile(eventsPath, "old events\n");
  await writeFile(calendarPath, "old calendar\n");

  try {
    await assert.rejects(
      updateCalendar({
        previousEvents,
        now: new Date("2026-09-01T06:00:00Z"),
        sourceUrl: SALES_URL,
        eventsPath,
        calendarPath,
        fetchPage: async () =>
          "<h1>AliExpress Sales Calendar for 2026</h1>",
      }),
      /sales calendar table/i,
    );
    assert.equal(await readFile(eventsPath, "utf8"), "old events\n");
    assert.equal(await readFile(calendarPath, "utf8"), "old calendar\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("updateCalendar does not rewrite files when events are unchanged", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aliexpress-calendar-"));
  const eventsPath = join(directory, "events.ts");
  const calendarPath = join(directory, "calendar.ics");
  const previousEvents = parseSalesPage(fixture).events;
  const existingCalendar = generateICal(
    previousEvents,
    new Date("2026-08-01T06:00:00Z"),
  );
  await writeFile(eventsPath, "old events\n");
  await writeFile(calendarPath, existingCalendar);

  try {
    const result = await updateCalendar({
      previousEvents,
      now: new Date("2026-09-01T06:00:00Z"),
      sourceUrl: SALES_URL,
      eventsPath,
      calendarPath,
      fetchPage: async () => fixture,
    });
    assert.equal(result.changed, false);
    assert.equal(await readFile(eventsPath, "utf8"), "old events\n");
    assert.equal(await readFile(calendarPath, "utf8"), existingCalendar);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("updateCalendar repairs an empty feed even when events are unchanged", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aliexpress-calendar-"));
  const eventsPath = join(directory, "events.ts");
  const calendarPath = join(directory, "calendar.ics");
  await writeFile(eventsPath, "old events\n");
  await writeFile(calendarPath, "");
  const previousEvents = parseSalesPage(fixture).events;

  try {
    const result = await updateCalendar({
      previousEvents,
      now: new Date("2026-09-01T06:00:00Z"),
      sourceUrl: SALES_URL,
      eventsPath,
      calendarPath,
      fetchPage: async () => fixture,
    });
    assert.equal(result.changed, true);
    assert.equal(await readFile(eventsPath, "utf8"), "old events\n");
    const repairedFeed = await readFile(calendarPath, "utf8");
    assert.equal(
      repairedFeed
        .split("\r\n")
        .filter((line) => line === "BEGIN:VEVENT").length,
      previousEvents.length,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("updateCalendar writes both validated outputs and reports changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aliexpress-calendar-"));
  const eventsPath = join(directory, "events.ts");
  const calendarPath = join(directory, "calendar.ics");
  await writeFile(eventsPath, "old events\n");
  await writeFile(calendarPath, "old calendar\n");
  const parsed = parseSalesPage(fixture).events;
  const previousEvents: SaleEvent[] = parsed.map((event, index) =>
    index === 0 ? { ...event, endDate: "20260107" } : event,
  );

  try {
    const result = await updateCalendar({
      previousEvents,
      now: new Date("2026-09-01T06:00:00Z"),
      sourceUrl: SALES_URL,
      eventsPath,
      calendarPath,
      fetchPage: async () => fixture,
    });
    assert.equal(result.changed, true);
    assert.equal(result.diff.changed.length, 1);
    assert.match(
      await readFile(eventsPath, "utf8"),
      /Choice Day \+ New Year Deals/,
    );
    const ical = await readFile(calendarPath, "utf8");
    assert.equal(
      ical.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length,
      parsed.length,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
