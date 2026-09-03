import { load } from "cheerio";
import { normalizeEventName } from "./event-identity.js";
import type { SaleEvent } from "./events.js";

export { normalizeEventName } from "./event-identity.js";

const DAY_MS = 86_400_000;
const DATE_RANGE = /^(\d{1,2})\.(\d{1,2})\s*[-–—]\s*(\d{1,2})\.(\d{1,2})$/;
const MAX_EVENT_DAYS = 45;

export interface ParsedSalesPage {
  year: number;
  events: SaleEvent[];
}

export interface ValidationReport {
  candidateYear: number;
  exactRatio: number;
  recognizableRatio: number;
  rollover: boolean;
}

export interface EventChange {
  before: SaleEvent;
  after: SaleEvent;
}

export interface EventDiff {
  added: SaleEvent[];
  removed: SaleEvent[];
  changed: EventChange[];
}

function utcDate(year: number, month: number, day: number): Date {
  const result = new Date(Date.UTC(year, month - 1, day));
  if (
    result.getUTCFullYear() !== year ||
    result.getUTCMonth() !== month - 1 ||
    result.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${day}.${month}.${year}`);
  }
  return result;
}

function compactDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function parseCompactDate(value: string): Date {
  if (!/^\d{8}$/.test(value)) {
    throw new Error(`Invalid compact date: ${value}`);
  }
  return utcDate(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)),
    Number(value.slice(6, 8)),
  );
}

function exactKey(event: SaleEvent): string {
  return `${normalizeEventName(event.name)}|${event.startDate}|${event.endDate}`;
}

function recognizableKey(event: SaleEvent): string {
  return `${normalizeEventName(event.name)}|${event.startDate.slice(0, 6)}`;
}

function sameEventContent(left: SaleEvent, right: SaleEvent): boolean {
  return (
    left.name === right.name &&
    left.startDate === right.startDate &&
    left.endDate === right.endDate
  );
}

function overlapCount(
  left: readonly SaleEvent[],
  right: readonly SaleEvent[],
  key: (event: SaleEvent) => string,
): number {
  const remaining = new Map<string, number>();
  for (const event of right) {
    remaining.set(key(event), (remaining.get(key(event)) ?? 0) + 1);
  }

  let matches = 0;
  for (const event of left) {
    const value = key(event);
    const count = remaining.get(value) ?? 0;
    if (count > 0) {
      matches += 1;
      remaining.set(value, count - 1);
    }
  }
  return matches;
}

function parseDateRange(
  text: string,
  year: number,
): Pick<SaleEvent, "startDate" | "endDate"> {
  const match = DATE_RANGE.exec(text.trim());
  if (!match) {
    throw new Error(`Invalid date range: ${text}`);
  }

  const [, startDayText, startMonthText, endDayText, endMonthText] = match;
  const startDay = Number(startDayText);
  const startMonth = Number(startMonthText);
  const endDay = Number(endDayText);
  const endMonth = Number(endMonthText);
  const endYear = endMonth < startMonth ? year + 1 : year;
  const start = utcDate(year, startMonth, startDay);
  const endInclusive = utcDate(endYear, endMonth, endDay);
  const endExclusive = new Date(endInclusive.getTime() + DAY_MS);

  return {
    startDate: compactDate(start),
    endDate: compactDate(endExclusive),
  };
}

export function parseSalesPage(html: string): ParsedSalesPage {
  const $ = load(html);
  const heading = $("h1").first().text().replace(/\s+/g, " ").trim();
  const yearMatch = /sales calendar for\s+(20\d{2})/i.exec(heading);
  if (!yearMatch) {
    throw new Error("Could not determine sales calendar year");
  }
  const year = Number(yearMatch[1]);

  const table = $("table")
    .filter((_, element) => {
      const headers = $(element)
        .find("th")
        .map((__, header) => $(header).text().trim().toLowerCase())
        .get();
      return headers.includes("name") && headers.includes("date");
    })
    .first();

  if (table.length === 0) {
    throw new Error("Could not find the sales calendar table");
  }

  const events: SaleEvent[] = [];
  table.find("tr").each((_, row) => {
    const cells = $(row)
      .find("td")
      .map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .get();
    if (cells.length === 0) return;
    if (cells.length < 2) {
      throw new Error("Sales calendar row has too few cells");
    }

    const name = cells.at(-2) ?? "";
    const rangeText = cells.at(-1) ?? "";
    if (!name) {
      throw new Error("Sales calendar row has an empty event name");
    }
    events.push({ name, ...parseDateRange(rangeText, year) });
  });

  if (events.length === 0) {
    throw new Error("Sales calendar table contains no events");
  }

  events.sort(
    (left, right) =>
      left.startDate.localeCompare(right.startDate) ||
      left.endDate.localeCompare(right.endDate) ||
      left.name.localeCompare(right.name),
  );

  return { year, events };
}

export function validateCandidate(
  previous: readonly SaleEvent[],
  candidate: readonly SaleEvent[],
  now: Date,
): ValidationReport {
  if (candidate.length === 0) {
    throw new Error("Candidate calendar is empty");
  }

  const duplicateKeys = new Set<string>();
  for (const event of candidate) {
    const start = parseCompactDate(event.startDate);
    const end = parseCompactDate(event.endDate);
    const durationDays = (end.getTime() - start.getTime()) / DAY_MS;
    if (durationDays <= 0 || durationDays > MAX_EVENT_DAYS) {
      throw new Error(
        `Implausible event duration for ${event.name}: ${durationDays} days`,
      );
    }

    const key = exactKey(event);
    if (duplicateKeys.has(key)) {
      throw new Error(`Duplicate event: ${event.name}`);
    }
    duplicateKeys.add(key);
  }

  const candidateYears = new Set(
    candidate.map((event) => Number(event.startDate.slice(0, 4))),
  );
  if (candidateYears.size !== 1) {
    throw new Error("Candidate spans multiple start years");
  }
  const candidateYear = [...candidateYears][0];

  if (previous.length === 0) {
    if (candidate.length < 20) {
      throw new Error("Initial calendar must contain at least 20 events");
    }
    return {
      candidateYear,
      exactRatio: 0,
      recognizableRatio: 0,
      rollover: true,
    };
  }

  const maximumCandidateCount = Math.max(previous.length * 2, 60);
  if (candidate.length > maximumCandidateCount) {
    throw new Error(
      `Rejected implausible event-count growth: ${previous.length} to ${candidate.length}`,
    );
  }

  const previousYear = Number(previous[0].startDate.slice(0, 4));
  const rolloverWindow = [10, 11, 0, 1].includes(now.getUTCMonth());
  const rollover = candidateYear === previousYear + 1;

  if (rollover) {
    if (!rolloverWindow || candidate.length < 20) {
      throw new Error("Rejected implausible year rollover");
    }
    const currentYear = now.getUTCFullYear();
    if (candidateYear !== currentYear && candidateYear !== currentYear + 1) {
      throw new Error(
        `Rollover year ${candidateYear} is unrelated to current year ${currentYear}`,
      );
    }
    const coveredMonths = new Set(
      candidate.map((event) => event.startDate.slice(4, 6)),
    );
    if (coveredMonths.size < 9) {
      throw new Error(
        `Rollover calendar has insufficient month coverage: ${coveredMonths.size}`,
      );
    }
    const startTimes = candidate.map((event) =>
      parseCompactDate(event.startDate).getTime(),
    );
    const spanDays =
      (Math.max(...startTimes) - Math.min(...startTimes)) / DAY_MS;
    if (spanDays < 270) {
      throw new Error(`Rollover calendar spans only ${spanDays} days`);
    }
    return {
      candidateYear,
      exactRatio: 0,
      recognizableRatio: 0,
      rollover: true,
    };
  }

  if (candidateYear !== previousYear) {
    throw new Error(
      `Candidate year ${candidateYear} does not match previous year ${previousYear}`,
    );
  }
  if (candidate.length < Math.ceil(previous.length * 0.6)) {
    throw new Error("Candidate contains less than 60% of the previous event count");
  }

  const exactRatio = overlapCount(previous, candidate, exactKey) / previous.length;
  const recognizableRatio =
    overlapCount(previous, candidate, recognizableKey) / previous.length;
  if (exactRatio < 0.5) {
    throw new Error(`Exact overlap is below 50%: ${exactRatio}`);
  }
  if (recognizableRatio < 0.7) {
    throw new Error(
      `Recognizable name/month overlap is below 70%: ${recognizableRatio}`,
    );
  }

  return {
    candidateYear,
    exactRatio,
    recognizableRatio,
    rollover: false,
  };
}

export function eventsEqual(
  left: readonly SaleEvent[],
  right: readonly SaleEvent[],
): boolean {
  return (
    left.length === right.length &&
    left.every((event, index) => sameEventContent(event, right[index]))
  );
}

export function diffEvents(
  previous: readonly SaleEvent[],
  candidate: readonly SaleEvent[],
): EventDiff {
  const groupByIdentity = (events: readonly SaleEvent[]) => {
    const groups = new Map<string, SaleEvent[]>();
    for (const event of events) {
      const identity = recognizableKey(event);
      const group = groups.get(identity) ?? [];
      group.push(event);
      groups.set(identity, group);
    }
    return groups;
  };

  const oldGroups = groupByIdentity(previous);
  const newGroups = groupByIdentity(candidate);
  const identities = new Set([...oldGroups.keys(), ...newGroups.keys()]);
  const added: SaleEvent[] = [];
  const removed: SaleEvent[] = [];
  const changed: EventChange[] = [];

  for (const identity of identities) {
    const oldRemaining = [...(oldGroups.get(identity) ?? [])];
    const newRemaining = [...(newGroups.get(identity) ?? [])];

    for (let oldIndex = oldRemaining.length - 1; oldIndex >= 0; oldIndex -= 1) {
      const newIndex = newRemaining.findIndex((event) =>
        sameEventContent(oldRemaining[oldIndex], event),
      );
      if (newIndex >= 0) {
        oldRemaining.splice(oldIndex, 1);
        newRemaining.splice(newIndex, 1);
      }
    }

    while (oldRemaining.length > 0 && newRemaining.length > 0) {
      changed.push({
        before: oldRemaining.shift()!,
        after: newRemaining.shift()!,
      });
    }
    removed.push(...oldRemaining);
    added.push(...newRemaining);
  }

  return { added, removed, changed };
}

export function renderEventsModule(
  events: readonly SaleEvent[],
  sourceUrl: string,
  scrapedAt: Date,
): string {
  const rows = events
    .map(
      (event) =>
        `  { name: ${JSON.stringify(event.name)}, startDate: ${JSON.stringify(event.startDate)}, endDate: ${JSON.stringify(event.endDate)} },`,
    )
    .join("\n");

  return `export interface SaleEvent {
  name: string;
  startDate: string; // YYYYMMDD
  endDate: string; // YYYYMMDD (exclusive for iCal)
}

// Generated from ${sourceUrl} on ${scrapedAt.toISOString().slice(0, 10)}
export const events: SaleEvent[] = [
${rows}
];
`;
}
