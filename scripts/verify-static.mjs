import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = resolve(process.argv[2] || resolve(projectDirectory, "www"));
const catalog = JSON.parse(await readFile(resolve(outputDirectory, "catalog.json"), "utf8"));
const manifest = JSON.parse(await readFile(resolve(outputDirectory, "build.json"), "utf8"));
const indexHtml = await readFile(resolve(outputDirectory, "index.html"), "utf8");
const app = await readFile(resolve(outputDirectory, "app.js"), "utf8");
const humans = await readFile(resolve(outputDirectory, "humans.txt"), "utf8");
const expectedSupplementRevision = process.env.EXPECTED_SUPPLEMENT_REVISION || "";
const errors = [];
let checkedFeeds = 0;
const feedPaths = new Set();
const calendarKeys = new Set();
const feedsDirectory = resolve(outputDirectory, "feeds");

function fail(message) {
  errors.push(message);
}

if (catalog.v !== 1 || !catalog.c || typeof catalog.c !== "object") {
  fail("catalog.json does not use compact UI schema version 1");
}

for (const [countryCode, country] of Object.entries(catalog.c || {})) {
  if (!/^[a-z]{2}$/.test(countryCode)) {
    fail(`${countryCode}: country key is not a lowercase ISO code`);
    continue;
  }
  if (!country || typeof country.n !== "string" || !country.n) {
    fail(`${countryCode}: country name is missing`);
    continue;
  }
  const languages = typeof country.l === "string" ? country.l.split(",") : [];
  if (
    !languages.length ||
    languages.some((language) => !/^[a-z]{2}$/.test(language)) ||
    languages.length !== new Set(languages).size
  ) {
    fail(`${countryCode}: language list is invalid`);
    continue;
  }

  let calendars;
  if (country.r === undefined) {
    calendars = [[countryCode, country.n]];
  } else if (country.r && typeof country.r === "object" && !Array.isArray(country.r)) {
    calendars = Object.entries(country.r).map(([suffix, name]) => [
      `${countryCode}-${suffix}`,
      name,
    ]);
    if (!calendars.length) fail(`${countryCode}: regional calendar map is empty`);
  } else {
    fail(`${countryCode}: regional calendar map is invalid`);
    continue;
  }

  for (const [regionCode, name] of calendars) {
    const suffix = regionCode === countryCode ? "" : regionCode.slice(countryCode.length + 1);
    if (
      (suffix && !/^[a-z0-9-]+$/.test(suffix)) ||
      typeof name !== "string" ||
      !name
    ) {
      fail(`${countryCode}/${regionCode}: region is invalid`);
      continue;
    }
    const calendarKey = `${countryCode}/${regionCode}`;
    if (calendarKeys.has(calendarKey)) fail(`${calendarKey}: duplicate calendar code`);
    calendarKeys.add(calendarKey);

    for (const language of languages) {
      const feedPath = `/feeds/${countryCode}/${regionCode}/${language}.ics`;
      if (feedPaths.has(feedPath)) {
        fail(`${feedPath}: duplicate feed path`);
        continue;
      }
      feedPaths.add(feedPath);
      const path = resolve(outputDirectory, feedPath.slice(1));
      if (path !== feedsDirectory && !path.startsWith(`${feedsDirectory}${sep}`)) {
        fail(`${feedPath}: path escapes the feed directory`);
        continue;
      }
      let body;
      try {
        body = await readFile(path, "utf8");
      } catch {
        fail(`${feedPath}: file is missing`);
        continue;
      }
      checkedFeeds += 1;
      if (!body.startsWith("BEGIN:VCALENDAR\r\n") || !body.endsWith("END:VCALENDAR\r\n")) {
        fail(`${feedPath}: invalid VCALENDAR envelope or line endings`);
      }
      const unfolded = body.replace(/\r\n[ \t]/g, "");
      if (!unfolded.includes(`SOURCE;VALUE=URI:https://schulferien.kalenderabos.de${feedPath}`)) {
        fail(`${feedPath}: SOURCE metadata does not match its static URL`);
      }
      if (!unfolded.includes("DESCRIPTION:Bereitgestellt von kalenderabos.de\\nDatenquelle: ")) {
        fail(`${feedPath}: event attribution is missing`);
      }
      if (unfolded.includes("URL:https://github.com/openpotato/openholidaysapi.data")) {
        fail(`${feedPath}: event URL points to the data repository instead of our site`);
      }
      const lines = body.split("\r\n").filter(Boolean);
      if (lines.some((line) => Buffer.byteLength(line, "utf8") > 75)) {
        fail(`${feedPath}: contains a line longer than 75 UTF-8 octets`);
      }
      const starts = [...unfolded.matchAll(/\r\nDTSTART;VALUE=DATE:(\d{8})\r\n/g)]
        .map((match) => match[1]);
      const ends = [...unfolded.matchAll(/\r\nDTEND;VALUE=DATE:(\d{8})\r\n/g)]
        .map((match) => match[1]);
      if (!starts.length || starts.length !== ends.length) {
        fail(`${feedPath}: DTSTART/DTEND count mismatch`);
      } else if (starts.some((start, index) => ends[index] <= start)) {
        fail(`${feedPath}: DTEND is not exclusive`);
      }
      const uids = [...unfolded.matchAll(/\r\nUID:([^\r\n]+)\r\n/g)].map((match) => match[1]);
      if (uids.length !== new Set(uids).size) {
        fail(`${feedPath}: duplicate UID inside calendar`);
      }
    }
  }
}

const expectedGermanRegions = [
  "bb", "be", "bw", "by", "hb", "he", "hh", "mv",
  "ni", "nw", "rp", "sh", "sl", "sn", "st", "th",
].sort();
const actualGermanRegions = Object.keys(catalog.c?.de?.r || {}).sort();
if (JSON.stringify(actualGermanRegions) !== JSON.stringify(expectedGermanRegions)) {
  fail(`Germany must contain exactly its 16 Bundesländer; got ${actualGermanRegions.join(", ")}`);
}
const expectedDutchRegions = ["mi", "no", "zu"];
const actualDutchRegions = Object.keys(catalog.c?.nl?.r || {}).sort();
if (JSON.stringify(actualDutchRegions) !== JSON.stringify(expectedDutchRegions)) {
  fail(`The Netherlands must contain exactly its 3 holiday regions; got ${actualDutchRegions.join(", ")}`);
}
if (checkedFeeds !== manifest.feedCount) {
  fail(`manifest reports ${manifest.feedCount} feeds, verified ${checkedFeeds}`);
}
if (Object.keys(catalog.c || {}).length !== manifest.countryCount) {
  fail(`manifest reports ${manifest.countryCount} countries, catalog differs`);
}
if (calendarKeys.size !== manifest.calendarCount) {
  fail(`manifest reports ${manifest.calendarCount} calendars, catalog has ${calendarKeys.size}`);
}
if (indexHtml.includes("GENERATED_COUNTRY_OPTIONS") || indexHtml.includes("GENERATED_UI_TEMPLATES")) {
  fail("obsolete generated UI markers remain in index.html");
}
if (indexHtml.includes("<template")) {
  fail("pre-generated UI templates remain in index.html");
}
if (!indexHtml.includes('rel="preload" href="/catalog.json" as="fetch" crossorigin')) {
  fail("catalog.json is not preloaded by index.html");
}
if (!app.includes('fetch("/catalog.json")')) {
  fail("app.js does not load the compact UI catalog");
}
if (app.includes("BEGIN:VCALENDAR") || app.includes("VEVENT")) {
  fail("app.js unexpectedly contains iCalendar parsing or rendering code");
}
if (catalog.c?.de?.r?.st !== "Sachsen-Anhalt") {
  fail("compact catalog is missing Sachsen-Anhalt");
}
if (
  !catalog.c?.ru?.a?.includes("Bundesweite Empfehlung") ||
  !catalog.c.ru.l.split(",").includes("ru") ||
  !manifest.supplementCountries?.includes("RU") ||
  !/^[a-f0-9]{64}$/.test(manifest.supplementRevision || "")
) {
  fail("Russian recommended calendar or its advisory metadata is missing");
}
if (
  expectedSupplementRevision &&
  manifest.supplementRevision !== expectedSupplementRevision
) {
  fail("generated supplement revision differs from the checked pipeline input");
}
if (
  !indexHtml.includes('<link rel="author" href="/humans.txt"') ||
  !humans.includes("Holiday data: OpenHolidays API project")
) {
  fail("humans.txt or its author link is missing");
}

if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Verified compact UI catalog, ${manifest.calendarCount} calendars and ${checkedFeeds} static feeds.\n`,
  );
}
