import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fingerprintDirectory } from "./data-fingerprint.js";

const SITE_ORIGIN = "https://schulferien.kalenderabos.de";
const SOURCE_REPOSITORY = "https://github.com/openpotato/openholidaysapi.data";
const OPEN_HOLIDAYS_SOURCE = {
  name: [{ language: "DE", text: "OpenHolidays" }],
  url: SOURCE_REPOSITORY,
  license: "ODbL 1.0",
  recommended: false,
  notice: [],
};
const COUNTRY_CODE = /^[A-Z]{2}$/;
const LANGUAGE_CODE = /^[A-Z]{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function decodeDataText(value) {
  return String(value || "").replace(/%2C/gi, ",");
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const input = String(text).replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === ";") {
      row.push(field);
      field = "";
      continue;
    }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += character;
  }

  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value !== "")) rows.push(row);
  }
  if (!rows.length) return [];

  const headers = rows.shift().map((value) => value.trim());
  return rows.map((values) => Object.fromEntries(
    headers
      .map((header, index) => [header, values[index] || ""])
      .filter(([header]) => header),
  ));
}

export function parseLocalized(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(" ");
      if (separator < 1) return null;
      const language = entry.slice(0, separator).toUpperCase();
      if (!LANGUAGE_CODE.test(language)) {
        throw new Error(`Invalid localized language code: ${language}`);
      }
      return {
        language,
        text: decodeDataText(entry.slice(separator + 1).trim()),
      };
    })
    .filter(Boolean);
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function localize(items, language, fallbacks = []) {
  const wanted = [language, ...fallbacks, "EN", "DE"]
    .filter(Boolean)
    .map((value) => value.toUpperCase());
  for (const code of wanted) {
    const match = items.find((item) => item.language === code);
    if (match) return match.text;
  }
  return items[0]?.text || "";
}

async function readCsv(path) {
  return parseCsv(await readFile(path, "utf8"));
}

async function readCsvIfExists(path) {
  return readCsv(path).catch((error) => error.code === "ENOENT" ? [] : Promise.reject(error));
}

async function readJsonIfExists(path) {
  return readFile(path, "utf8")
    .then((contents) => JSON.parse(contents))
    .catch((error) => error.code === "ENOENT" ? {} : Promise.reject(error));
}

async function filesMatching(directory, expression) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && expression.test(entry.name))
    .map((entry) => join(directory, entry.name))
    .sort();
}

function addOneDay(value) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function normalizeDate(value) {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(value || ""));
  if (!match) throw new Error(`Invalid source date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid source date: ${value}`);
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function compactDate(value) {
  return value.replaceAll("-", "");
}

function timestamp(value) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function escapeIcsText(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

export function foldIcsLine(line) {
  const folded = [];
  let current = "";
  for (const character of String(line)) {
    const next = current + character;
    if (Buffer.byteLength(next, "utf8") > 75) {
      folded.push(current);
      current = ` ${character}`;
    } else {
      current = next;
    }
  }
  folded.push(current);
  return folded.join("\r\n");
}

function dateRange(events) {
  const starts = events.map((event) => event.startDate).sort();
  const ends = events.map((event) => event.endDate || event.startDate).sort();
  return { from: starts[0], to: ends.at(-1) };
}

function eventLanguages(events) {
  return [...new Set(events.flatMap((event) => event.name.map((item) => item.language)))]
    .sort();
}

function targetDisplayName(target, language, country) {
  return localize(target.name, language, country.officialLanguages) ||
    target.shortName || target.code || country.isoCode;
}

export function renderCalendar({
  calendar,
  country,
  events,
  language,
  generatedAt,
  sourceCommit,
  siteOrigin = SITE_ORIGIN,
  feedPath,
  dataSource = OPEN_HOLIDAYS_SOURCE,
}) {
  const targetName = targetDisplayName(calendar, language, country);
  const calendarName = `Schulferien - ${targetName}`;
  const sourceName = localize(dataSource.name, language, ["DE", "EN"]) || "OpenHolidays";
  const sourceReference = dataSource.url ? `${sourceName} (${dataSource.url})` : sourceName;
  const notice = localize(dataSource.notice, language, ["DE", "EN"]);
  const description = [
    "Bereitgestellt von kalenderabos.de",
    `Datenquelle: ${sourceName}`,
    notice,
    dataSource.license ? `Lizenz: ${dataSource.license}` : "",
  ].filter(Boolean).join(" · ");
  const eventDescription = [
    "Bereitgestellt von kalenderabos.de",
    `Datenquelle: ${sourceReference}`,
    notice ? `Hinweis: ${notice}` : "",
    dataSource.license ? `Lizenz: ${dataSource.license}` : "",
  ].filter(Boolean).join("\n");
  const sourceUrl = new URL(feedPath, `${siteOrigin}/`).toString();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "PRODID:-//kalenderabos.de//Schulferien Kalenderabo//DE",
    `NAME:${escapeIcsText(calendarName)}`,
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `X-WR-CALDESC:${escapeIcsText(description)}`,
    `SOURCE;VALUE=URI:${sourceUrl}`,
    `URL:${siteOrigin}`,
    "REFRESH-INTERVAL;VALUE=DURATION:P1M",
    "X-PUBLISHED-TTL:P1M",
    `X-SOURCE-REVISION:${sourceCommit}`,
  ];

  for (const event of events) {
    const holidayName = localize(event.name, language, country.officialLanguages) || "Schulferien";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}`,
      `DTSTAMP:${timestamp(generatedAt)}`,
      `DTSTART;VALUE=DATE:${compactDate(event.startDate)}`,
      `DTEND;VALUE=DATE:${compactDate(addOneDay(event.endDate || event.startDate))}`,
      `SUMMARY;LANGUAGE=${language}:${escapeIcsText(`${holidayName} – ${targetName}`)}`,
      `DESCRIPTION:${escapeIcsText(eventDescription)}`,
      `URL:${siteOrigin}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

function subdivisionAncestors(subdivision, byShortName) {
  const ancestors = [];
  const seen = new Set();
  let current = subdivision;
  while (current && !seen.has(current.shortName)) {
    seen.add(current.shortName);
    ancestors.push(current);
    current = current.parent ? byShortName.get(current.parent) : null;
  }
  return ancestors;
}

function targetEvents(target, events, subdivisionsByShortName) {
  if (target.kind === "country") return events;
  if (target.kind === "group") {
    return events.filter((event) =>
      (!event.subdivisions.length && !event.groups.length) ||
      event.groups.includes(target.shortName) ||
      event.groups.includes(target.code),
    );
  }

  const lineage = subdivisionAncestors(target, subdivisionsByShortName);
  const subdivisionKeys = new Set(lineage.flatMap((item) => [item.code, item.shortName]));
  const groupKeys = new Set(lineage.flatMap((item) => item.groups));
  return events.filter((event) => {
    if (!event.subdivisions.length && !event.groups.length) return true;
    if (event.subdivisions.some((code) => subdivisionKeys.has(code))) return true;
    return event.groups.some((code) => groupKeys.has(code));
  });
}

function calendarTargets(events, subdivisions, groups, country) {
  const referencedSubdivisions = new Set(events.flatMap((event) => event.subdivisions));
  const standaloneReferencedGroups = new Set(
    events
      .filter((event) => event.subdivisions.length === 0)
      .flatMap((event) => event.groups),
  );
  const subdivisionsByShortName = new Map(subdivisions.map((item) => [item.shortName, item]));

  if (referencedSubdivisions.size === 0 && standaloneReferencedGroups.size > 0) {
    const targets = groups
      .filter((group) =>
        standaloneReferencedGroups.has(group.shortName) ||
        standaloneReferencedGroups.has(group.code),
      )
      .map((group) => ({ ...group, kind: "group" }))
      .sort((a, b) => a.code.localeCompare(b.code));
    return { targets, subdivisionsByShortName };
  }

  const parentKeys = new Set(subdivisions.map((item) => item.parent).filter(Boolean));
  const directCandidates = subdivisions.filter((item) =>
    referencedSubdivisions.has(item.shortName) || referencedSubdivisions.has(item.code),
  );
  const direct = directCandidates.filter((item) =>
    !directCandidates.some((candidate) =>
      candidate !== item &&
      subdivisionAncestors(candidate, subdivisionsByShortName)
        .slice(1)
        .some((ancestor) => ancestor.shortName === item.shortName),
    ),
  );
  const groupMembers = subdivisions.filter((item) =>
    !parentKeys.has(item.shortName) &&
    item.groups.some((group) => standaloneReferencedGroups.has(group)),
  );
  const targets = new Map(
    [...direct, ...groupMembers].map((item) => [item.code, { ...item, kind: "subdivision" }]),
  );
  const representedGroups = new Set(
    [...targets.values()].flatMap((item) =>
      subdivisionAncestors(item, subdivisionsByShortName).flatMap((ancestor) => ancestor.groups),
    ),
  );
  for (const group of groups) {
    if (
      (standaloneReferencedGroups.has(group.shortName) || standaloneReferencedGroups.has(group.code)) &&
      !representedGroups.has(group.shortName) &&
      !representedGroups.has(group.code)
    ) {
      targets.set(group.code, { ...group, kind: "group" });
    }
  }
  if (!targets.size) {
    targets.set(country.isoCode, {
      kind: "country",
      code: country.isoCode,
      shortName: country.isoCode,
      name: country.name,
      category: [],
      groups: [],
    });
  }
  return {
    targets: [...targets.values()].sort((a, b) => a.code.localeCompare(b.code)),
    subdivisionsByShortName,
  };
}

function mapCountry(row) {
  const isoCode = String(row.IsoCode || "").trim().toUpperCase();
  if (!COUNTRY_CODE.test(isoCode)) {
    throw new Error(`Invalid country code: ${row.IsoCode || "(empty)"}`);
  }
  const name = parseLocalized(row.Name);
  if (!name.length) throw new Error(`${isoCode}: country name is missing`);
  const officialLanguages = parseList(row.OfficialLanguages).map((language) => language.toUpperCase());
  if (!officialLanguages.length || officialLanguages.some((language) => !LANGUAGE_CODE.test(language))) {
    throw new Error(`${isoCode}: invalid official languages`);
  }
  return {
    isoCode,
    name,
    officialLanguages,
  };
}

function mapSubdivision(row) {
  return {
    code: row.Code,
    isoCode: row.IsoCode || "",
    shortName: row.ShortName || row.Code,
    name: parseLocalized(row.Name),
    category: parseLocalized(row.Category),
    officialLanguages: parseList(row.OfficialLanguages),
    parent: row.Parent || "",
    groups: parseList(row.Groups),
  };
}

function mapGroup(row) {
  return {
    code: row.Code,
    shortName: row.ShortName || row.Code,
    name: parseLocalized(row.Name),
    category: parseLocalized(row.Category),
    officialLanguages: parseList(row.OfficialLanguages),
    groups: [],
  };
}

function validateCountryData(country, events, subdivisions, groups) {
  const subdivisionCodes = new Set();
  const subdivisionShortNames = new Set();
  for (const subdivision of subdivisions) {
    if (!subdivision.code || !subdivision.shortName) {
      throw new Error(`${country.isoCode}: subdivision code or short name is missing`);
    }
    if (subdivisionCodes.has(subdivision.code)) {
      throw new Error(`${country.isoCode}: duplicate subdivision code ${subdivision.code}`);
    }
    if (subdivisionShortNames.has(subdivision.shortName)) {
      throw new Error(`${country.isoCode}: duplicate subdivision short name ${subdivision.shortName}`);
    }
    subdivisionCodes.add(subdivision.code);
    subdivisionShortNames.add(subdivision.shortName);
  }

  const groupCodes = new Set();
  const groupShortNames = new Set();
  for (const group of groups) {
    if (!group.code || !group.shortName) {
      throw new Error(`${country.isoCode}: group code or short name is missing`);
    }
    if (groupCodes.has(group.code)) {
      throw new Error(`${country.isoCode}: duplicate group code ${group.code}`);
    }
    if (groupShortNames.has(group.shortName)) {
      throw new Error(`${country.isoCode}: duplicate group short name ${group.shortName}`);
    }
    groupCodes.add(group.code);
    groupShortNames.add(group.shortName);
  }

  const subdivisionKeys = new Set([...subdivisionCodes, ...subdivisionShortNames]);
  const groupKeys = new Set([...groupCodes, ...groupShortNames]);
  const subdivisionsByShortName = new Map(
    subdivisions.map((subdivision) => [subdivision.shortName, subdivision]),
  );
  for (const subdivision of subdivisions) {
    if (subdivision.parent && !subdivisionShortNames.has(subdivision.parent)) {
      throw new Error(`${country.isoCode}: unknown parent subdivision ${subdivision.parent}`);
    }
    const ancestors = new Set();
    let current = subdivision;
    while (current) {
      if (ancestors.has(current.shortName)) {
        throw new Error(`${country.isoCode}: subdivision cycle at ${current.shortName}`);
      }
      ancestors.add(current.shortName);
      current = current.parent ? subdivisionsByShortName.get(current.parent) : null;
    }
    for (const group of subdivision.groups) {
      if (!groupKeys.has(group)) {
        throw new Error(`${country.isoCode}: subdivision ${subdivision.code} references unknown group ${group}`);
      }
    }
  }

  for (const event of events) {
    if (event.endDate < event.startDate) {
      throw new Error(`${country.isoCode}: event ${event.id} ends before it starts`);
    }
    for (const subdivision of event.subdivisions) {
      if (!subdivisionKeys.has(subdivision)) {
        throw new Error(`${country.isoCode}: event ${event.id} references unknown subdivision ${subdivision}`);
      }
    }
    for (const group of event.groups) {
      if (!groupKeys.has(group)) {
        throw new Error(`${country.isoCode}: event ${event.id} references unknown group ${group}`);
      }
    }
  }
}

function mapEvent(row, sourceFile, expectedCountry) {
  const id = String(row.Id || "").trim().toLowerCase();
  if (!UUID.test(id)) throw new Error(`${basename(sourceFile)}: invalid event UUID ${row.Id || "(empty)"}`);
  const country = String(row.Country || "").trim().toUpperCase();
  if (country !== expectedCountry) {
    throw new Error(`${basename(sourceFile)}: expected country ${expectedCountry}, got ${country || "(empty)"}`);
  }
  const startDate = normalizeDate(row.StartDate);
  const name = parseLocalized(row.Name);
  if (!name.length) throw new Error(`${basename(sourceFile)}: event ${id} has no name`);
  return {
    id,
    country,
    startDate,
    endDate: row.EndDate ? normalizeDate(row.EndDate) : startDate,
    name,
    subdivisions: parseList(row.Subdivisions),
    groups: parseList(row.Groups),
    sourceFile: basename(sourceFile),
  };
}

function commonLanguages(calendars) {
  if (!calendars.length) return [];
  const common = calendars[0].languages.filter((language) =>
    calendars.every((calendar) => calendar.languages.includes(language)),
  );
  return common.length
    ? common
    : [...new Set(calendars.flatMap((calendar) => calendar.languages))].sort();
}

function feedSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
}

export function buildUiCatalog(catalog) {
  const countries = {};

  for (const country of catalog.countries) {
    const code = country.isoCode.toLowerCase();
    const availableLanguages = new Set(country.languages);
    const orderedLanguages = [
      ...country.officialLanguages.filter((language) => availableLanguages.has(language)),
      ...country.languages.filter((language) => !country.officialLanguages.includes(language)),
    ];

    for (const calendar of country.calendars) {
      if (
        calendar.languages.length !== country.languages.length ||
        country.languages.some((language) => !calendar.languages.includes(language))
      ) {
        throw new Error(
          `${country.isoCode}: calendar ${calendar.code} has languages that cannot be represented by the compact UI catalog`,
        );
      }
    }

    const entry = {
      n: localize(country.name, "DE", country.officialLanguages) || country.isoCode,
      l: orderedLanguages.map((language) => language.toLowerCase()).join(","),
    };
    const advisory = localize(country.advisory, "DE", country.officialLanguages);
    if (advisory) entry.a = advisory;
    const nationwide = country.calendars.length === 1 &&
      country.calendars[0].kind === "country";

    if (!nationwide) {
      const regions = {};
      for (const calendar of country.calendars) {
        const slug = feedSlug(calendar.code);
        const prefix = `${code}-`;
        if (!slug.startsWith(prefix)) {
          throw new Error(
            `${country.isoCode}: calendar ${calendar.code} cannot be shortened to a regional feed key`,
          );
        }
        const region = slug.slice(prefix.length);
        if (!region || Object.hasOwn(regions, region)) {
          throw new Error(`${country.isoCode}: duplicate or empty UI region key ${region}`);
        }
        regions[region] = targetDisplayName(calendar, "DE", country);
      }
      entry.r = regions;
    }

    countries[code] = entry;
  }

  return { v: 1, c: countries };
}

export async function buildStaticData({
  sourceDirectory,
  supplementDirectory,
  outputDirectory,
  sourceCommit,
  sourceTreeSha,
  generatedAt = new Date().toISOString(),
  cutoffYear = new Date(generatedAt).getUTCFullYear() - 1,
  siteOrigin = SITE_ORIGIN,
  onCalendar,
}) {
  const sourceRoot = join(sourceDirectory, "src");
  const upstreamCountries = (await readCsv(join(sourceRoot, "countries.csv"))).map(mapCountry);
  const supplementCountries = supplementDirectory
    ? (await readCsvIfExists(join(supplementDirectory, "countries.csv"))).map(mapCountry)
    : [];
  const countries = [...upstreamCountries];
  const knownCountries = new Set(countries.map((country) => country.isoCode));
  for (const country of supplementCountries) {
    if (knownCountries.has(country.isoCode)) continue;
    countries.push(country);
    knownCountries.add(country.isoCode);
  }
  const supplementSources = supplementDirectory
    ? await readJsonIfExists(join(supplementDirectory, "sources.json"))
    : {};
  const supplementRevision = supplementDirectory
    ? await fingerprintDirectory(supplementDirectory)
    : "";
  const countryCodes = countries.map((country) => country.isoCode);
  if (new Set(countryCodes).size !== countryCodes.length) {
    throw new Error("Duplicate country code in countries.csv");
  }
  const languages = (await readCsv(join(sourceRoot, "languages.csv"))).map((row) => {
    const isoCode = String(row.IsoCode || "").trim().toUpperCase();
    if (!LANGUAGE_CODE.test(isoCode)) {
      throw new Error(`Invalid language code: ${row.IsoCode || "(empty)"}`);
    }
    const name = parseLocalized(row.Name);
    if (!name.length) throw new Error(`${isoCode}: language name is missing`);
    return { isoCode, name };
  });
  const languageCodes = languages.map((language) => language.isoCode);
  if (new Set(languageCodes).size !== languageCodes.length) {
    throw new Error("Duplicate language code in languages.csv");
  }
  const cutoff = `${cutoffYear}-01-01`;
  const catalogCountries = [];
  let feedCount = 0;
  let eventCount = 0;
  const eventIds = new Set();
  const feedPaths = new Set();
  const usedSupplements = new Set();

  for (const country of countries) {
    const code = country.isoCode.toLowerCase();
    const countryDirectory = join(sourceRoot, code);
    const upstreamHolidayFiles = await filesMatching(
      join(countryDirectory, "holidays"),
      /^holidays\.school(?:\.[^.]+)?\.csv$/i,
    );
    const supplementCountryDirectory = supplementDirectory
      ? join(supplementDirectory, code)
      : null;
    const supplementHolidayFiles = supplementCountryDirectory
      ? await filesMatching(
        join(supplementCountryDirectory, "holidays"),
        /^holidays\.school(?:\.[^.]+)?\.csv$/i,
      )
      : [];
    const usesSupplement = upstreamHolidayFiles.length === 0 && supplementHolidayFiles.length > 0;
    const holidayFiles = usesSupplement ? supplementHolidayFiles : upstreamHolidayFiles;
    if (!holidayFiles.length) continue;
    const dataSource = usesSupplement
      ? supplementSources[country.isoCode]
      : OPEN_HOLIDAYS_SOURCE;
    if (usesSupplement && !dataSource) {
      throw new Error(`${country.isoCode}: supplemental source metadata is missing`);
    }
    if (usesSupplement) usedSupplements.add(country.isoCode);

    const allEventRows = [];
    for (const file of holidayFiles) {
      const rows = await readCsv(file);
      for (const row of rows) {
        const event = mapEvent(row, file, country.isoCode);
        if (eventIds.has(event.id)) {
          throw new Error(`${basename(file)}: duplicate event UUID ${event.id}`);
        }
        eventIds.add(event.id);
        allEventRows.push(event);
      }
    }
    const events = allEventRows
      .filter((event) => event.endDate >= cutoff)
      .sort((a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        a.endDate.localeCompare(b.endDate) ||
        a.id.localeCompare(b.id),
      );
    if (!events.length) continue;

    const activeCountryDirectory = usesSupplement
      ? supplementCountryDirectory
      : countryDirectory;
    const subdivisionRows = await readCsvIfExists(join(activeCountryDirectory, "subdivisions.csv"));
    const groupRows = await readCsvIfExists(join(activeCountryDirectory, "groups.csv"));
    const subdivisions = subdivisionRows.map(mapSubdivision);
    const groups = groupRows.map(mapGroup);
    validateCountryData(country, events, subdivisions, groups);
    const { targets, subdivisionsByShortName } = calendarTargets(
      events,
      subdivisions,
      groups,
      country,
    );
    const calendars = [];

    for (const target of targets) {
      const selectedEvents = targetEvents(target, events, subdivisionsByShortName);
      if (!selectedEvents.length) continue;
      const targetLanguages = eventLanguages(selectedEvents);
      if (!targetLanguages.length) continue;
      const pathBase = `feeds/${code}/${feedSlug(target.code)}`;
      const feeds = {};
      await mkdir(join(outputDirectory, ...pathBase.split("/")), { recursive: true });
      for (const language of targetLanguages) {
        const feedPath = `${pathBase}/${language.toLowerCase()}.ics`;
        if (feedPaths.has(feedPath)) throw new Error(`Duplicate generated feed path: ${feedPath}`);
        feedPaths.add(feedPath);
        const outputPath = join(outputDirectory, ...feedPath.split("/"));
        const contents = renderCalendar({
          calendar: target,
          country,
          events: selectedEvents,
          language,
          generatedAt,
          sourceCommit,
          siteOrigin,
          feedPath,
          dataSource,
        });
        await writeFile(outputPath, contents, "utf8");
        feeds[language] = `/${feedPath}`;
        feedCount += 1;
        eventCount += selectedEvents.length;
      }
      const coverage = dateRange(selectedEvents);
      calendars.push({
        kind: target.kind,
        code: target.code,
        shortName: target.shortName,
        name: target.name,
        category: target.category,
        languages: targetLanguages,
        feeds,
        coverage,
        eventCount: selectedEvents.length,
        recommended: Boolean(dataSource.recommended),
      });
      onCalendar?.({ country, target, selectedEvents, feeds });
    }
    if (!calendars.length) continue;
    catalogCountries.push({
      ...country,
      advisory: dataSource.notice || [],
      languages: commonLanguages(calendars),
      calendars,
    });
  }

  const source = {
    repository: SOURCE_REPOSITORY,
    branch: "main",
    commit: sourceCommit,
    tree: sourceTreeSha,
    license: "ODbL-1.0",
    supplements: [...usedSupplements].sort(),
    supplementRevision: usedSupplements.size ? supplementRevision : null,
  };
  const catalog = {
    schemaVersion: 1,
    generatedAt,
    cutoffYear,
    source,
    languages,
    countries: catalogCountries,
  };
  const uiCatalog = buildUiCatalog(catalog);
  const manifest = {
    generatedAt,
    sourceCommit,
    sourceTreeSha,
    cutoffYear,
    countryCount: catalogCountries.length,
    calendarCount: catalogCountries.reduce(
      (total, country) => total + country.calendars.length,
      0,
    ),
    feedCount,
    renderedEventCount: eventCount,
    supplementCountries: [...usedSupplements].sort(),
    supplementRevision: usedSupplements.size ? supplementRevision : null,
  };
  await writeFile(
    join(outputDirectory, "catalog.json"),
    `${JSON.stringify(uiCatalog)}\n`,
    "utf8",
  );
  await writeFile(
    join(outputDirectory, "build.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return { catalog, uiCatalog, manifest };
}
