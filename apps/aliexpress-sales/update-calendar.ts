import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { events } from "./lib/events.js";
import { SALES_URL, updateCalendar } from "./lib/update.js";

try {
  const projectDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
  const outputDirectory = resolve(projectDirectory, "www");
  await mkdir(outputDirectory, { recursive: true });
  const result = await updateCalendar({
    previousEvents: events,
    now: new Date(),
    sourceUrl: SALES_URL,
    eventsPath: resolve(projectDirectory, "lib/events.ts"),
    calendarPath: resolve(outputDirectory, "aesales.ics"),
  });

  if (!result.changed) {
    console.log(`No calendar changes (${result.eventCount} events).`);
  } else {
    console.log(`Updated ${result.eventCount} events.`);
    console.log(`Added: ${result.diff.added.length}`);
    console.log(`Removed: ${result.diff.removed.length}`);
    console.log(`Changed: ${result.diff.changed.length}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
