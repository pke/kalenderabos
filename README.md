# kalenderabos.de

[Deutsch](README.de.md)

Monorepo for static calendar subscription services published under
`kalenderabos.de`.

## Applications

| Application | Package | Production host |
| --- | --- | --- |
| [Homepage](apps/home/README.md) | `@kalenderabos/home` | `kalenderabos.de` |
| [School holidays](apps/school-holidays/README.md) | `@kalenderabos/school-holidays` | `kalenderabos.de/schulferien/` |
| [AliExpress sales](apps/aliexpress-sales/README.md) | `@kalenderabos/aliexpress-sales` | `kalenderabos.de/aesales/` |

## Commands

Node.js 24 or newer, pnpm, and Git are required.

```bash
pnpm install
pnpm test
pnpm build
pnpm dev
```

`pnpm build` builds only the homepage. Each calendar has its own build command
and publication interval: `pnpm build:school-holidays` and
`pnpm build:aliexpress-sales`. `pnpm preview:build` assembles all applications
only for a complete local preview. `pnpm dev` serves that preview.

## Build output convention

Every deployable application writes its complete generated site to its own
`www/` directory, for example `apps/school-holidays/www/`. Source assets may
live in `public/`, but generated files must never be written there. All `www/`
directories are reproducible build artifacts and are excluded from Git.

## Deployment

The `master` branch contains source code only. GitHub Actions publishes the
generated site to the `gh-pages` branch and deploys that branch through GitHub
Pages. Homepage, school-holiday calendars, and AliExpress calendars are built
independently; each workflow replaces only its own path in the persistent
`gh-pages` site state.

The software is licensed under the [MIT License](LICENSE). Each application
documents the licenses and attribution requirements of its generated data.
