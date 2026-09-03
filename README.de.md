# kalenderabos.de

[English](README.md)

Monorepo für statische Kalender-Abodienste unter `kalenderabos.de`.

## Anwendungen

| Anwendung | Paket | Produktivadresse |
| --- | --- | --- |
| [Homepage](apps/home/README.md) | `@kalenderabos/home` | `kalenderabos.de` |
| [Schulferien](apps/school-holidays/README.de.md) | `@kalenderabos/school-holidays` | `kalenderabos.de/schulferien/` |
| [AliExpress Sales](apps/aliexpress-sales/README.md) | `@kalenderabos/aliexpress-sales` | `kalenderabos.de/aesales/` |

## Befehle

Benötigt werden Node.js 24 oder neuer, pnpm und Git.

```bash
pnpm install
pnpm test
pnpm build
pnpm dev
```

`pnpm build` baut nur die Homepage. Jeder Kalender besitzt einen eigenen
Build-Befehl und Veröffentlichungsrhythmus: `pnpm build:school-holidays` und
`pnpm build:aliexpress-sales`. Nur für eine vollständige lokale Vorschau setzt
`pnpm preview:build` alle Anwendungen zusammen. `pnpm dev` liefert diese
Vorschau aus.

## Konvention für Build-Ausgaben

Jede deploybare Anwendung schreibt ihre vollständig erzeugte Website in einen
eigenen `www/`-Ordner, beispielsweise `apps/school-holidays/www/`.
Quelldateien dürfen unter `public/` liegen, erzeugte Dateien jedoch nicht. Alle
`www/`-Ordner sind reproduzierbare Build-Artefakte und werden von Git ignoriert.

## Veröffentlichung

Der Branch `master` enthält ausschließlich den Quellcode. GitHub Actions
schreibt die erzeugte Website in den Branch `gh-pages` und veröffentlicht
diesen über GitHub Pages. Homepage, Schulferienkalender und AliExpress-Kalender
werden unabhängig voneinander gebaut; jeder Workflow ersetzt nur seinen
eigenen Pfad im dauerhaft gespeicherten Stand von `gh-pages`.

Die Software steht unter der [MIT-Lizenz](LICENSE). Die Lizenzen und
Attributionspflichten der erzeugten Daten sind bei der jeweiligen Anwendung
dokumentiert.
