import { eventUidSlug } from "./event-identity.js";
import type { SaleEvent } from "./events.js";

function escapeText(text: string): string {
  return text.replace(/[\\;,]/g, (character) => `\\${character}`);
}

function timestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export function generateICal(
  events: readonly SaleEvent[],
  generatedAt: Date = new Date(),
): string {
  const occurrences = new Map<string, number>();
  const vevents = events
    .map((event) => {
      const baseUid = `${event.startDate.slice(0, 6)}-${eventUidSlug(event.name)}`;
      const occurrence = (occurrences.get(baseUid) ?? 0) + 1;
      occurrences.set(baseUid, occurrence);
      const uid = `${baseUid}${occurrence === 1 ? "" : `-${occurrence}`}@aliexpress-calendar`;

      return [
        "BEGIN:VEVENT",
        `DTSTART;VALUE=DATE:${event.startDate}`,
        `DTEND;VALUE=DATE:${event.endDate}`,
        `SUMMARY:${escapeText(event.name)}`,
        `UID:${uid}`,
        `DTSTAMP:${timestamp(generatedAt)}`,
        "DESCRIPTION:AliExpress promo event",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      ].join("\r\n");
    })
    .join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//kalenderabos.de//AliExpress Sales//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:AliExpress Sales",
    "X-WR-TIMEZONE:UTC",
    "SOURCE;VALUE=URI:https://kalenderabos.de/aesales.ics",
    "REFRESH-INTERVAL;VALUE=DURATION:P7D",
    "X-PUBLISHED-TTL:P7D",
    vevents,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function calendarMatchesEvents(
  calendar: string,
  events: readonly SaleEvent[],
): boolean {
  const lines = calendar.split("\r\n");
  const timestamps = lines.filter((line) =>
    /^DTSTAMP:\d{8}T\d{6}Z$/.test(line),
  );
  if (timestamps.length !== events.length) {
    return false;
  }

  const withoutTimestamps = (value: string) =>
    value
      .split("\r\n")
      .filter((line) => !line.startsWith("DTSTAMP:"))
      .join("\r\n");
  const expected = generateICal(events, new Date(0));

  return withoutTimestamps(calendar) === withoutTimestamps(expected);
}
