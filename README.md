# School holidays · kalenderabos.de

[Deutsch](README.de.md)

A fully static website providing subscribable school holiday calendars generated
from the OpenHolidays data repository and clearly labelled official supplements.
The website and every `.ics` file are
created ahead of time and served through GitHub Pages. Production requires no API
proxy or server-side calendar generation.

## Architecture

- Data source: the `main` branch of
  [`openpotato/openholidaysapi.data`](https://github.com/openpotato/openholidaysapi.data)
- Missing countries can be supplied from official sources under
  `data/supplements/`. Upstream data automatically takes precedence as soon as
  OpenHolidays publishes school-holiday files for a supplemented country.
- `index.html` is a small static shell that preloads a compact `catalog.json`.
  The browser builds only the currently visible country, region, and
  semantic-zoom controls from that catalog; it never fetches or parses an
  iCalendar file.
- The UI catalog contains lowercase country codes, country-specific language
  codes, German display names, and region suffixes. Feed URL components,
  generator metadata, event counts, and date coverage are deliberately omitted.
- Every subscription URL is a static path. For example, the German calendar for
  Saxony-Anhalt is `/feeds/de/de-st/de.ics`.
- Germany contains exactly 16 state calendars. No combined calendar containing
  every German state is generated.
- Regions are generated when school holiday records reference them directly.
  Countries whose school holidays are scoped exclusively through groups expose
  those groups as calendars; administrative members are not duplicated. This
  reduces the Netherlands to its three official holiday regions.
- Source end dates are inclusive; the generator converts them into the exclusive
  `DTEND` required by iCalendar.
- OpenHolidays event UUIDs remain unchanged; local supplements use stable UUIDs.
- Calendars include events from the previous year through the latest date
  available for each calendar in the source data.

## Build and run locally

Requirements: Node.js 24 or newer, pnpm, and Git.

```bash
pnpm build
pnpm test
pnpm dev
```

`pnpm build` updates the local `main` snapshot and generates `dist/`. `pnpm dev`
serves that directory on port 8791 and prints both loopback and available LAN
addresses.

`pnpm verify` reconstructs every static feed path from the compact UI catalog and
checks every generated calendar. It also enforces that Germany contains exactly
the 16 states and no combined Germany calendar.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` runs for changes to this repository,
on demand, and monthly. For scheduled runs it compares the Git tree of the
upstream `src/` directory with the last successfully published revision:

1. If the tree is unchanged, calendar generation and deployment are skipped.
2. If it changed, the local generator validates identifiers, dates, and regional
   references while reading the upstream tables. Upstream code is never executed.
3. A Pages artifact is published only after validation, tests, generation, and
   project-specific verification succeed.
4. `.github/source-state.json` is updated only after a successful deployment. A
   failed build leaves the previous website untouched.

Updating the small source-state file on every monthly check also keeps scheduled
workflows active in a public GitHub repository.

In the repository settings, select **Pages → Build and deployment → GitHub
Actions**. At Porkbun, point the `schulferien` CNAME to
`<github-user>.github.io`.

## Data, attribution, and license

Most calendar data comes from OpenHolidays and is licensed under the ODC Open
Database License (ODbL). For Russia, the project additionally includes the
Russian Ministry of Education's recommended 2026/27 calendar for schools using a
four-term system. Those dates are recommendations and individual schools may
differ. Every generated calendar includes its concrete source, attribution, and
license in its metadata. `dist/build.json` also records the upstream commit,
data-tree hash, and any supplemented countries used by the build.

The software in this repository is licensed under the [MIT License](LICENSE).
The OpenHolidays data, locally structured supplements, and generated database
content are made available under the ODbL.
