import { readFile, rename, rm, writeFile } from "node:fs/promises";
import type { SaleEvent } from "./events.js";
import { calendarMatchesEvents, generateICal } from "./ical.js";
import {
  diffEvents,
  eventsEqual,
  parseSalesPage,
  renderEventsModule,
  validateCandidate,
  type EventDiff,
  type ValidationReport,
} from "./scrape.js";

export const SALES_URL = "https://en.ali-shop.net/sales";
const MIN_HTML_BYTES = 1_000;
const MAX_HTML_BYTES = 2_000_000;

type Sleep = (milliseconds: number) => Promise<void>;

export interface UpdateCalendarOptions {
  previousEvents: readonly SaleEvent[];
  now: Date;
  sourceUrl: string;
  eventsPath: string;
  calendarPath: string;
  fetchPage?: (url: string) => Promise<string>;
}

export interface UpdateResult {
  changed: boolean;
  eventCount: number;
  diff: EventDiff;
  validation: ValidationReport;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readExistingFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

export async function fetchSalesPage(
  url: string,
  fetchImpl: typeof fetch = fetch,
  sleep: Sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<string> {
  const expectedHost = new URL(url).hostname;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        redirect: "follow",
        headers: {
          "user-agent":
            "aliexpress-calendar/1.0 (+https://github.com/pke/aliexpress-calendar)",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(`Source returned HTTP ${response.status}`);
      }
      if (new URL(response.url).hostname !== expectedHost) {
        throw new Error(`Source redirected to unexpected host: ${response.url}`);
      }
      const contentType = response.headers.get("content-type");
      if (!contentType?.toLowerCase().includes("text/html")) {
        throw new Error(`Source returned non-HTML content: ${contentType}`);
      }

      const html = await response.text();
      if (html.length < MIN_HTML_BYTES || html.length > MAX_HTML_BYTES) {
        throw new Error(`Source HTML size is implausible: ${html.length} bytes`);
      }
      return html;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await sleep(attempt * 500);
      }
    }
  }

  throw new Error(
    `Could not fetch a valid sales page after 3 attempts: ${errorMessage(lastError)}`,
    { cause: lastError },
  );
}

export async function updateCalendar(
  options: UpdateCalendarOptions,
): Promise<UpdateResult> {
  const fetchPage = options.fetchPage ?? fetchSalesPage;
  const html = await fetchPage(options.sourceUrl);
  const parsed = parseSalesPage(html);
  const validation = validateCandidate(
    options.previousEvents,
    parsed.events,
    options.now,
  );
  const diff = diffEvents(options.previousEvents, parsed.events);
  const eventDataChanged = !eventsEqual(options.previousEvents, parsed.events);
  const existingCalendar = await readExistingFile(options.calendarPath);
  const calendarIsCurrent =
    existingCalendar !== undefined &&
    calendarMatchesEvents(existingCalendar, parsed.events);

  if (!eventDataChanged && calendarIsCurrent) {
    return {
      changed: false,
      eventCount: parsed.events.length,
      diff,
      validation,
    };
  }

  const calendar = generateICal(parsed.events, options.now);
  const veventCount = calendar
    .split("\r\n")
    .filter((line) => line === "BEGIN:VEVENT").length;
  if (veventCount !== parsed.events.length) {
    throw new Error(
      `Generated ${veventCount} VEVENT blocks for ${parsed.events.length} events`,
    );
  }

  const calendarTemporaryPath = `${options.calendarPath}.tmp`;
  const eventsTemporaryPath = `${options.eventsPath}.tmp`;
  try {
    if (eventDataChanged) {
      const eventsModule = renderEventsModule(
        parsed.events,
        options.sourceUrl,
        options.now,
      );
      await Promise.all([
        writeFile(eventsTemporaryPath, eventsModule, "utf8"),
        writeFile(calendarTemporaryPath, calendar, "utf8"),
      ]);
      await rename(eventsTemporaryPath, options.eventsPath);
    } else {
      await writeFile(calendarTemporaryPath, calendar, "utf8");
    }
    await rename(calendarTemporaryPath, options.calendarPath);
  } finally {
    await Promise.all([
      rm(eventsTemporaryPath, { force: true }),
      rm(calendarTemporaryPath, { force: true }),
    ]);
  }

  return {
    changed: true,
    eventCount: parsed.events.length,
    diff,
    validation,
  };
}
