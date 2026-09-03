import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildStaticData,
  buildUiCatalog,
  foldIcsLine,
  normalizeDate,
  parseCsv,
  parseLocalized,
  renderCalendar,
} from "../src/static-generator.js";

test("CSV and localized values preserve encoded commas", () => {
  assert.deepEqual(parseCsv("A;B\r\n1;\"two;parts\"\r\n"), [
    { A: "1", B: "two;parts" },
  ]);
  assert.deepEqual(parseLocalized("DE Ferien%2C regional,EN Regional break"), [
    { language: "DE", text: "Ferien, regional" },
    { language: "EN", text: "Regional break" },
  ]);
  assert.throws(
    () => parseLocalized("DE;VALUE=TEXT Injected"),
    /Invalid localized language code/,
  );
});

test("source dates are normalized and impossible dates are rejected", () => {
  assert.equal(normalizeDate("2029-04-4"), "2029-04-04");
  assert.throws(() => normalizeDate("2029-02-30"), /Invalid source date/);
});

test("iCalendar output keeps UUIDs and uses an exclusive DTEND", () => {
  const output = renderCalendar({
    calendar: {
      code: "DE-BE",
      shortName: "BE",
      name: [{ language: "DE", text: "Berlin" }],
    },
    country: { isoCode: "DE", officialLanguages: ["DE"] },
    events: [{
      id: "7e0a68b5-1cd3-4856-a598-a755e66b34fc",
      startDate: "2026-07-09",
      endDate: "2026-08-22",
      name: [{ language: "DE", text: "Sommerferien" }],
    }],
    language: "DE",
    generatedAt: "2026-09-02T00:00:00Z",
    sourceCommit: "abc123",
    siteOrigin: "https://kalenderabos.de/schulferien",
    feedPath: "feeds/de/de-be/de.ics",
  });

  assert.match(output, /UID:7e0a68b5-1cd3-4856-a598-a755e66b34fc/);
  assert.match(output, /DTSTART;VALUE=DATE:20260709/);
  assert.match(output, /DTEND;VALUE=DATE:20260823/);
  assert.match(output.replace(/\r\n /g, ""), /SUMMARY;LANGUAGE=DE:Sommerferien – Berlin/);
  assert.match(output, /PRODID:-\/\/kalenderabos\.de\/\/Schulferien Kalenderabo\/\/DE/);
  assert.match(output, /SOURCE;VALUE=URI:https:\/\/kalenderabos\.de\/schulferien\/feeds\/de\/de-be\/de\.ics/);
  assert.match(
    output.replace(/\r\n /g, ""),
    /DESCRIPTION:Bereitgestellt von kalenderabos\.de\\nDatenquelle: OpenHolidays/,
  );
  assert.equal(
    [...output.matchAll(/\r\nURL:https:\/\/kalenderabos\.de\/schulferien\r\n/g)].length,
    2,
  );
  assert.doesNotMatch(output, /URL:https:\/\/github\.com/);
});

test("iCalendar output identifies recommended supplemental data", () => {
  const output = renderCalendar({
    calendar: {
      code: "RU",
      shortName: "RU",
      name: [{ language: "DE", text: "Russland" }],
    },
    country: { isoCode: "RU", officialLanguages: ["RU"] },
    events: [{
      id: "10916079-e54e-43bc-8903-b5900d16b2dd",
      startDate: "2026-10-26",
      endDate: "2026-11-03",
      name: [{ language: "DE", text: "Herbstferien" }],
    }],
    language: "DE",
    generatedAt: "2026-09-02T00:00:00Z",
    sourceCommit: "abc123",
    siteOrigin: "https://kalenderabos.de/schulferien",
    feedPath: "feeds/ru/ru/de.ics",
    dataSource: {
      name: [{ language: "DE", text: "Russisches Bildungsministerium" }],
      url: "https://example.test/source",
      license: "ODbL 1.0",
      recommended: true,
      notice: [{ language: "DE", text: "Bundesweite Empfehlung; Schulen können abweichen." }],
    },
  });

  const unfolded = output.replace(/\r\n /g, "");
  assert.match(unfolded, /Datenquelle: Russisches Bildungsministerium/);
  assert.match(unfolded, /Hinweis: Bundesweite Empfehlung\\; Schulen können abweichen\./);
  assert.match(unfolded, /https:\/\/example\.test\/source/);
});

test("folded iCalendar lines never exceed 75 UTF-8 octets", () => {
  const folded = foldIcsLine(`SUMMARY:${"Sommerferien ä ".repeat(12)}`);
  for (const line of folded.split("\r\n")) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75);
  }
});

test("compact UI catalog omits the region map for a nationwide calendar", () => {
  const uiCatalog = buildUiCatalog({
    countries: [{
      isoCode: "AL",
      name: [
        { language: "DE", text: "Albanien" },
        { language: "EN", text: "Albania" },
      ],
      officialLanguages: ["SQ"],
      advisory: [],
      languages: ["EN", "SQ"],
      calendars: [{
        kind: "country",
        code: "AL",
        shortName: "AL",
        name: [{ language: "DE", text: "Albanien" }],
        languages: ["EN", "SQ"],
      }],
    }],
  });

  assert.deepEqual(uiCatalog, {
    v: 1,
    c: {
      al: {
        n: "Albanien",
        l: "sq,en",
      },
    },
  });
});

async function fixtureSource() {
  const root = await mkdtemp(join(tmpdir(), "school-calendars-"));
  const source = join(root, "source");
  const output = join(root, "output");
  await mkdir(join(source, "src", "de", "holidays"), { recursive: true });
  await mkdir(join(source, "src", "nl", "holidays"), { recursive: true });
  await mkdir(output, { recursive: true });
  await writeFile(join(source, "src", "countries.csv"), [
    "IsoCode;Name;OfficialLanguages",
    "DE;DE Deutschland,EN Germany;DE",
    "NL;NL Nederland,DE Niederlande,EN Netherlands;NL",
    "",
  ].join("\n"));
  await writeFile(join(source, "src", "languages.csv"), [
    "IsoCode;Name",
    "DE;DE Deutsch,EN German",
    "EN;DE Englisch,EN English",
    "NL;DE Niederländisch,EN Dutch,NL Nederlands",
    "",
  ].join("\n"));
  await writeFile(join(source, "src", "de", "subdivisions.csv"), [
    "Country;Code;IsoCode;ShortName;Category;Name;OfficialLanguages;Parent;Groups",
    "DE;DE-BY;DE-BY;BY;DE Bundesland;DE Bayern,EN Bavaria;DE;;",
    "DE;DE-BY-AU;;AU;DE Stadt;DE Augsburg,EN Augsburg;DE;BY;",
    "DE;DE-BE;DE-BE;BE;DE Bundesland;DE Berlin,EN Berlin;DE;;",
    "",
  ].join("\n"));
  await writeFile(join(source, "src", "de", "holidays", "holidays.school.csv"), [
    "Id;Country;StartDate;EndDate;Type;RegionalScope;Name;Subdivisions",
    "11111111-1111-4111-8111-111111111111;DE;2026-07-01;2026-07-10;School;Regional;DE Sommerferien,EN Summer Holidays;BY",
    "22222222-2222-4222-8222-222222222222;DE;2026-07-11;2026-07-20;School;Regional;DE Sommerferien,EN Summer Holidays;BE",
    "",
  ].join("\n"));
  await writeFile(join(source, "src", "nl", "subdivisions.csv"), [
    "Country;Code;IsoCode;ShortName;OfficialLanguages;Category;Name;Groups;Parent",
    "NL;NL-NH;NL-NH;NH;NL;NL provincie,DE Provinz;NL Noord-Holland,DE Nordholland;NO;",
    "NL;NL-NH-AM;;AM;NL;NL gemeente,DE Gemeinde;NL Amsterdam,DE Amsterdam;NO;NH",
    "NL;NL-NH-HL;;HL;NL;NL gemeente,DE Gemeinde;NL Haarlem,DE Haarlem;NO;NH",
    "",
  ].join("\n"));
  await writeFile(join(source, "src", "nl", "groups.csv"), [
    "Country;Code;ShortName;Category;Name;OfficialLanguages",
    "NL;NL-NO;NO;NL Regio,DE Region;NL Regio Noord,DE Region Nord;NL",
    "",
  ].join("\n"));
  await writeFile(join(source, "src", "nl", "holidays", "holidays.school.csv"), [
    "Id;Country;StartDate;EndDate;Type;RegionalScope;Name;Groups",
    "33333333-3333-4333-8333-333333333333;NL;2026-07-01;2026-07-10;School;Regional;NL Zomervakantie,DE Sommerferien,EN Summer Holidays;NO",
    "",
  ].join("\n"));
  return { source, output };
}

async function fixtureRussiaSupplement(root) {
  const supplements = join(root, "supplements");
  await mkdir(join(supplements, "ru", "holidays"), { recursive: true });
  await writeFile(join(supplements, "countries.csv"), [
    "IsoCode;Name;OfficialLanguages",
    "RU;RU Россия,DE Russland,EN Russia;RU",
    "",
  ].join("\n"));
  await writeFile(join(supplements, "sources.json"), JSON.stringify({
    RU: {
      name: [{ language: "DE", text: "Russisches Bildungsministerium" }],
      url: "https://example.test/russia",
      license: "ODbL 1.0",
      recommended: true,
      notice: [{
        language: "DE",
        text: "Bundesweite Empfehlung; einzelne Schulen können abweichen.",
      }],
    },
  }));
  await writeFile(join(supplements, "ru", "holidays", "holidays.school.csv"), [
    "Id;Country;StartDate;EndDate;Type;RegionalScope;Name;Subdivisions;Groups",
    "10916079-e54e-43bc-8903-b5900d16b2dd;RU;2026-10-26;2026-11-03;School;National;RU Осенние каникулы,DE Herbstferien,EN Autumn holidays;;",
    "",
  ].join("\n"));
  return supplements;
}

test("supplement supplies a missing country and is marked as advisory", async () => {
  const fixture = await fixtureSource();
  const supplements = await fixtureRussiaSupplement(join(fixture.source, ".."));
  const { catalog, uiCatalog, manifest } = await buildStaticData({
    sourceDirectory: fixture.source,
    supplementDirectory: supplements,
    outputDirectory: fixture.output,
    sourceCommit: "source-commit",
    sourceTreeSha: "source-tree",
    generatedAt: "2026-09-02T00:00:00Z",
  });

  const russia = catalog.countries.find((country) => country.isoCode === "RU");
  assert.equal(russia.calendars.length, 1);
  assert.equal(russia.calendars[0].recommended, true);
  assert.deepEqual(catalog.source.supplements, ["RU"]);
  assert.deepEqual(manifest.supplementCountries, ["RU"]);
  assert.equal(
    uiCatalog.c.ru.a,
    "Bundesweite Empfehlung; einzelne Schulen können abweichen.",
  );
  const feed = await readFile(join(fixture.output, "feeds", "ru", "ru", "de.ics"), "utf8");
  const unfolded = feed.replace(/\r\n /g, "");
  assert.match(unfolded, /Datenquelle: Russisches Bildungsministerium/);
  assert.match(unfolded, /SUMMARY;LANGUAGE=DE:Herbstferien – Russland/);
});

test("upstream school data automatically supersedes a country supplement", async () => {
  const fixture = await fixtureSource();
  const supplements = await fixtureRussiaSupplement(join(fixture.source, ".."));
  const upstreamHolidays = join(fixture.source, "src", "ru", "holidays");
  await mkdir(upstreamHolidays, { recursive: true });
  await writeFile(join(upstreamHolidays, "holidays.school.csv"), [
    "Id;Country;StartDate;EndDate;Type;RegionalScope;Name;Subdivisions;Groups",
    "232b6970-054f-472e-a3df-e08f6f541feb;RU;2026-12-31;2027-01-10;School;National;RU Зимние каникулы,DE Winterferien,EN Winter holidays;;",
    "",
  ].join("\n"));

  const { catalog, manifest } = await buildStaticData({
    sourceDirectory: fixture.source,
    supplementDirectory: supplements,
    outputDirectory: fixture.output,
    sourceCommit: "source-commit",
    sourceTreeSha: "source-tree",
    generatedAt: "2026-09-02T00:00:00Z",
  });

  const russia = catalog.countries.find((country) => country.isoCode === "RU");
  assert.equal(russia.calendars[0].recommended, false);
  assert.deepEqual(manifest.supplementCountries, []);
  const feed = await readFile(join(fixture.output, "feeds", "ru", "ru", "de.ics"), "utf8");
  assert.match(feed.replace(/\r\n /g, ""), /Datenquelle: OpenHolidays/);
  assert.doesNotMatch(feed, /Russisches Bildungsministerium/);
});

test("static build creates only real regions, direct GET paths, and a compact UI catalog", async () => {
  const { source, output } = await fixtureSource();
  const { catalog, manifest } = await buildStaticData({
    sourceDirectory: source,
    outputDirectory: output,
    sourceCommit: "source-commit",
    sourceTreeSha: "source-tree",
    generatedAt: "2026-09-02T00:00:00Z",
  });
  const germany = catalog.countries.find((country) => country.isoCode === "DE");
  const netherlands = catalog.countries.find((country) => country.isoCode === "NL");

  assert.deepEqual(germany.calendars.map((calendar) => calendar.code), ["DE-BE", "DE-BY"]);
  assert.ok(!germany.calendars.some((calendar) => calendar.code === "DE"));
  assert.ok(!germany.calendars.some((calendar) => calendar.code.endsWith("AU")));
  assert.deepEqual(netherlands.calendars.map((calendar) => calendar.code), ["NL-NO"]);
  assert.equal(netherlands.calendars[0].kind, "group");
  assert.equal(germany.calendars[0].feeds.DE, "/feeds/de/de-be/de.ics");
  assert.ok(!germany.calendars[0].feeds.DE.includes("?"));
  assert.equal(manifest.calendarCount, 3);
  assert.match(
    await readFile(join(output, "feeds", "de", "de-be", "de.ics"), "utf8"),
    /SUMMARY;LANGUAGE=DE:Sommerferien – Berlin/,
  );

  const uiCatalog = JSON.parse(await readFile(join(output, "catalog.json"), "utf8"));
  assert.deepEqual(uiCatalog, buildUiCatalog(catalog));
  assert.equal(uiCatalog.v, 1);
  assert.deepEqual(uiCatalog.c.de, {
    n: "Deutschland",
    l: "de,en",
    r: {
      be: "Berlin",
      by: "Bayern",
    },
  });
  assert.deepEqual(uiCatalog.c.nl, {
    n: "Niederlande",
    l: "nl,de,en",
    r: {
      no: "Region Nord",
    },
  });
  assert.ok(!JSON.stringify(uiCatalog).includes("/feeds/"));
  assert.ok(!Object.hasOwn(uiCatalog.c.de.r, "by-au"));
});

test("static build rejects mismatched countries and unknown regions", async () => {
  const wrongCountry = await fixtureSource();
  const wrongCountryFile = join(
    wrongCountry.source,
    "src",
    "de",
    "holidays",
    "holidays.school.csv",
  );
  await writeFile(
    wrongCountryFile,
    (await readFile(wrongCountryFile, "utf8")).replace(
      ";DE;2026-07-01",
      ";NL;2026-07-01",
    ),
  );
  await assert.rejects(
    buildStaticData({
      sourceDirectory: wrongCountry.source,
      outputDirectory: wrongCountry.output,
      sourceCommit: "source-commit",
      sourceTreeSha: "source-tree",
      generatedAt: "2026-09-02T00:00:00Z",
    }),
    /expected country DE, got NL/,
  );

  const unknownRegion = await fixtureSource();
  const unknownRegionFile = join(
    unknownRegion.source,
    "src",
    "de",
    "holidays",
    "holidays.school.csv",
  );
  await writeFile(
    unknownRegionFile,
    (await readFile(unknownRegionFile, "utf8")).replace(
      ";BY\n",
      ";DE-UNKNOWN\n",
    ),
  );
  await assert.rejects(
    buildStaticData({
      sourceDirectory: unknownRegion.source,
      outputDirectory: unknownRegion.output,
      sourceCommit: "source-commit",
      sourceTreeSha: "source-tree",
      generatedAt: "2026-09-02T00:00:00Z",
    }),
    /references unknown subdivision DE-UNKNOWN/,
  );
});
