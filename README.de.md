# Schulferien · kalenderabos.de

[English](README.md)

Eine vollständig statische Website mit abonnierbaren Schulferienkalendern aus
dem OpenHolidays-Datenrepository und klar gekennzeichneten amtlichen Ergänzungen.
Die Website und alle `.ics`-Dateien werden
vorab erzeugt und über GitHub Pages ausgeliefert. Im Betrieb gibt es keinen
API-Proxy und keine serverseitige Kalendererzeugung.

## Architektur

- Datenquelle: Branch `main` von
  [`openpotato/openholidaysapi.data`](https://github.com/openpotato/openholidaysapi.data)
- Fehlende Länder können unter `data/supplements/` aus amtlichen Quellen ergänzt
  werden. Sobald OpenHolidays für ein solches Land eigene Schuldaten bereitstellt,
  haben die Upstream-Daten automatisch Vorrang.
- Die `index.html` ist eine kleine statische Hülle und lädt einen kompakten
  `catalog.json` vor. Der Browser erzeugt daraus nur die aktuell sichtbaren
  Länder-, Regions- und Semantic-Zoom-Elemente; iCalendar-Dateien werden dabei
  weder geladen noch analysiert.
- Der UI-Katalog enthält kleingeschriebene Ländercodes, landesspezifische
  Sprachcodes, deutsche Anzeigenamen und Regionssuffixe. Feed-URL-Bestandteile,
  Generator-Metadaten, Ereigniszahlen und Zeiträume werden bewusst weggelassen.
- Jede Abonnement-URL ist ein statischer Pfad. Der deutschsprachige Kalender für
  Sachsen-Anhalt liegt beispielsweise unter `/feeds/de/de-st/de.ics`.
- Deutschland enthält genau die 16 Bundesland-Kalender. Eine Zusammenfassung
  aller Bundesländer wird nicht erzeugt.
- Regionen werden erzeugt, wenn die Schuldaten sie direkt referenzieren. Sind
  die Schulferien eines Landes ausschließlich über Gruppen definiert, werden
  diese Gruppen als Kalender angeboten; ihre administrativen Mitglieder werden
  nicht dupliziert. Dadurch bestehen die Niederlande aus ihren drei offiziellen
  Ferienregionen.
- Die Quelldaten verwenden inklusive Enddaten; der Generator wandelt sie in
  das von iCalendar vorgeschriebene exklusive `DTEND` um.
- Ereignis-UUIDs aus OpenHolidays bleiben unverändert; lokale Ergänzungen erhalten
  dauerhaft stabile UUIDs.
- Enthalten sind Ereignisse ab dem Vorjahr bis zum jeweils letzten für den
  Kalender in der Quelle vorhandenen Datum.

## Lokal bauen und starten

Voraussetzungen: Node.js 24 oder neuer, pnpm und Git.

```bash
pnpm build
pnpm test
pnpm dev
```

`pnpm build` aktualisiert den lokalen Snapshot von `main` und erzeugt `dist/`.
`pnpm dev` liefert dieses Verzeichnis unter Port 8791 aus und zeigt sowohl die
Loopback- als auch die verfügbaren LAN-Adressen an.

`pnpm verify` rekonstruiert sämtliche statischen Feedpfade aus dem kompakten
UI-Katalog und prüft alle Kalenderdateien. Dabei ist auch festgeschrieben, dass
Deutschland genau die 16 Bundesländer und keinen zusammengefassten
Deutschland-Kalender enthält.

## GitHub Pages

Der Workflow `.github/workflows/pages.yml` läuft bei Änderungen an diesem
Repository, manuell und monatlich. Bei monatlichen Läufen vergleicht er den
Git-Tree des Upstream-Verzeichnisses `src/` mit dem zuletzt erfolgreich
veröffentlichten Stand:

1. Sind sowohl der OpenHolidays-Tree als auch der SHA-256-Fingerabdruck der
   lokalen Ergänzungen unverändert, werden weder Kalender neu erzeugt noch
   deployed.
2. Bei Änderungen prüft der lokale Generator Kennungen, Datumswerte und regionale
   Referenzen beim Einlesen der Tabellen. Upstream-Code wird nicht ausgeführt.
3. Das Pages-Artefakt wird nur nach erfolgreicher Validierung, Tests,
   Generierung und projektspezifischer Prüfung veröffentlicht.
4. Erst nach erfolgreichem Deployment wird `.github/source-state.json`
   aktualisiert. Ein fehlgeschlagener Build lässt die bisherige Website intakt.

Das monatliche Aktualisieren der kleinen Statusdatei hält außerdem den Zeitplan
eines öffentlichen GitHub-Repositories aktiv.

In den Repository-Einstellungen muss unter **Pages → Build and deployment**
die Quelle **GitHub Actions** gewählt werden. Bei Porkbun zeigt ein CNAME für
`schulferien` auf `<github-benutzer>.github.io`.

## Daten, Attribution und Lizenz

Die Kalenderdaten stammen überwiegend von OpenHolidays und stehen unter der ODC
Open Database License (ODbL). Für Russland enthält das Projekt zusätzlich den
vom russischen Bildungsministerium empfohlenen Kalender 2026/27 für Schulen mit
Vierteljahressystem. Diese Termine sind Empfehlungen; einzelne Schulen dürfen
abweichen. Jeder erzeugte Kalender enthält seine konkrete Datenquelle,
Attribution und Lizenz in den Metadaten. `dist/build.json` dokumentiert zusätzlich
Commit und Hash des OpenHolidays-Datentrees, verwendete Ergänzungsländer und den
exakten SHA-256-Fingerabdruck der Ergänzungsdaten.

Die Software in diesem Repository steht unter der [MIT-Lizenz](LICENSE).
Die OpenHolidays-Daten, die lokal aufbereiteten Ergänzungen und daraus erzeugte
Datenbankinhalte werden unter ODbL bereitgestellt.
