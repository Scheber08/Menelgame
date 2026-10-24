# AGENTS.md

Kontext für alle Agenten-Sitzungen an Menelgame. Erst lesen, dann arbeiten. Das Konzept steht in [docs/KONZEPT.md](docs/KONZEPT.md), getroffene Regel- und Technikentscheidungen in [docs/ENTSCHEIDUNGEN.md](docs/ENTSCHEIDUNGEN.md).

## Stack

- TypeScript (strict) überall, pnpm-Workspaces als Monorepo, Node ≥ 22
- `packages/schema`: Zod-Schemas und Typen für Board Packs
- `packages/engine`: reine, deterministische Spiellogik ohne DOM- oder Netzwerkzugriff
- `packages/packs`: mitgelieferte Board Packs (JSON) inkl. Validierung
- `packages/protocol`: Nachrichten zwischen Browser und Spielraum (Zod-geprüft)
- `packages/bots`: Bots (Stufen Leicht, Mittel, Schwer), reine Funktionen über der Engine
- `apps/web`: React + Vite, i18next für alle Texte
- `apps/server`: Cloudflare Worker + ein Durable Object pro Spielraum (Wrangler), D1 für Profile, Packs und Regelsets, R2 für Bilder
- Vitest, ESLint (Flat Config), Prettier

Die Pakete werden als TypeScript-Quellcode konsumiert (`exports` zeigt auf `src/index.ts`). Vite, Vitest und Wrangler bündeln selbst; `build` in den Paketen ist daher eine reine Typprüfung.

## Befehle

```bash
pnpm install          # Abhängigkeiten
pnpm dev              # Web (http://localhost:5173) + Worker (wrangler dev, Port 8787)
pnpm dev:web          # nur die Web-Oberfläche (Hot-Seat ohne Server)
pnpm test             # alle Tests (Vitest)
pnpm lint             # ESLint + Prettier-Check
pnpm format           # Prettier schreibt
pnpm build            # Typprüfung aller Pakete + Produktions-Build der Web-App
pnpm run deploy       # Web bauen und Worker samt Assets zu Cloudflare hochladen
pnpm --filter @menelgame/server check   # Worker probehalber bündeln (ohne Upload)
```

Im Dev-Modus leitet Vite `/api/*` und `/r/<code>/ws` an `wrangler dev` weiter. Online-Räume testet man am besten mit zwei Browsern (oder einem privaten Fenster): Das Reconnect-Token liegt im `localStorage`, zwei Tabs desselben Browsers wären derselbe Spieler.

## Deployment auf Cloudflare (Free Plan)

1. Kostenloses Cloudflare-Konto anlegen. R2 (Bilder) muss im Dashboard einmal aktiviert sein; 10 GB sind frei.
2. Einmalig anmelden: `pnpm --filter @menelgame/server exec wrangler login`
3. Hochladen: `pnpm run deploy` (nicht `pnpm deploy` – das ist ein eingebauter pnpm-Befehl). Das baut die Web-App, legt beim ersten Mal D1-Datenbank `menelgame` und R2-Bucket `menelgame-images` automatisch an, lädt den Worker `menelgame` samt `apps/web/dist` hoch, führt die Durable-Object-Migration `v1` (SQLite) aus und wendet danach die D1-Migrationen (`apps/server/migrations`) remote an.
4. Die App ist dann unter `https://menelgame.<dein-subdomain>.workers.dev` erreichbar. Einladungslinks haben die Form `/r/<CODE>`.
5. Logs live ansehen: `pnpm --filter @menelgame/server exec wrangler tail`.

**Automatisch aus GitHub (Workers Builds).** Das Repo ist ein Monorepo; der Standard-Befehl `npx wrangler deploy` im Wurzelordner scheitert deshalb. In den Einstellungen des Workers unter _Build_:

- Root directory: leer lassen (`/`)
- Build command: `pnpm --filter @menelgame/web build`
- Deploy command: `pnpm --filter @menelgame/server run deploy`
- Nicht-Produktions-Branches (optional): `pnpm --filter @menelgame/server exec wrangler versions upload`

Der Worker im Dashboard muss `menelgame` heißen (wie `name` in `wrangler.jsonc`).

Konfiguration: [apps/server/wrangler.jsonc](apps/server/wrangler.jsonc). Der Free Plan erlaubt nur SQLite-gestützte Durable Objects (`new_sqlite_classes`); Tageslimits (Requests, geschriebene Zeilen) stehen in der Cloudflare-Doku. Pro Spielaktion schreibt ein Raum etwa vier Zeilen.

## Ordnerstruktur

```text
apps/
  web/src/
    board/            Brett-Geometrie (Quadrat, Rechteck, Ring, Pfad) und Rendering
    components/       UI-Bausteine (GameScreen, ActionBar, AuctionPanel, TradePanel, EffectEditor, …)
    editor/           Brett-Editor (Ziehen & Ablegen), Feldtypen-Baukasten, Aussehen, Bild-Upload
    game/             Hooks: useHotSeatGame, useOnlineRoom, useSettings; Formatierung; Töne (Web Audio)
    pages/            Home, HotSeatPage, RoomPage, Lobby, MyPacksPage, PackEditorPage, SharedPackPage, StatsPage
    locales/          Sprachdateien (de.json)
  server/
    src/index.ts      Worker: /api/rooms, /api/rooms/<code>[/log], /r/<code>/ws, Assets
    src/api.ts        /api/profile, /api/packs, /api/rulesets (D1), /api/images (R2) + Tests mit node:sqlite
    migrations/       D1-Schema (0001 Profile/Packs/Regelsets, 0002 Statistik/Erfolge)
    src/room.ts       Raum-Logik ohne Cloudflare-APIs (Lobby, Host, Bots, Uhren) + Tests
    wrangler.jsonc
packages/
  schema/src/         Zod-Schemas: pack.ts, rules.ts, tiles.ts, effects.ts, customTypes.ts
  protocol/src/       ClientMessage, ServerMessage, RoomView, ActionInput, Bot-Namen, Farben
  bots/src/
    index.ts          decideBot(state, playerId, level, memory)
    view.ts           botView (ohne Würfel-Zukunft und Kartenreihenfolge), Gedächtnis
    valuation.ts      Feldwerte, Reserve, Tauschbewertung
    easy.ts, medium.ts, hard.ts  Stufen
    landing.ts        Landewahrscheinlichkeiten per Engine-Simulation (pro Brett zwischengespeichert)
  engine/src/
    apply.ts          apply, getLegalActions, getDefaultAction
    actions.ts        Validierung + Ausführung pro Aktionstyp
    handler.ts        Handler-Typ, Akteure (acting/anyPlayer/system), Fehlertexte
    effects.ts        Effekt-Interpreter, Bewegung, Karten, Miete fällig
    tileTypes.ts      Feldtyp-Registry (onLand/onPass → Effekte), eigene Typen über Regeln
    turn.ts           Phasenwechsel, Zugende, Siegbedingungen
    auction.ts        Versteigerungen
    trade.ts          Handel (Angebot, Gegenangebot, Annahme)
    agreements.ts     Vereinbarungen mit Laufzeit (Mietfreiheit, Raten, Gewinnbeteiligung)
    stats.ts          Auswertung eines Spiels für Statistik und Erfolge
    host.ts           Systemaktionen UPDATE_RULES, REMOVE_PLAYER
    bankruptcy.ts     Ausscheiden (Bankrott, entfernt)
    create.ts         Startzustand
    replay.ts         Replay aus Log
    test/             Testhilfen (rigDice, landOn, …) und Test-Strategie
  packs/src/          standard.json („Neustadt“), wien.json, fantasy.json, generator.ts (Zufallsbrett) + Export
docs/                 KONZEPT.md, ENTSCHEIDUNGEN.md
```

## Architekturregeln für die Engine

- Kernfunktion `apply(state, action) → { ok, state, events, error? }`. Keine Seiteneffekte, keine Mutation des Eingabezustands (intern wird eine Kopie bearbeitet).
- Jede Aktion wird zuerst von `validateAction` geprüft (darf dieser Akteur? Phase erlaubt? Geld reicht?). Ungültige Aktionen liefern einen typisierten `EngineError`; der Zustand bleibt unverändert.
- Akteure: `acting` (Spieler am Zug bzw. Schuldner), `anyPlayer` (Auktion, Handel), `system` (Uhr und Host: `AUCTION_CLOSE`, `UPDATE_RULES`, `REMOVE_PLAYER`).
- Zufall nur über den gesetzten PRNG (mulberry32) in `state.rng`. Kein `Math.random`, kein `Date` in der Engine (ESLint verbietet beides).
- Die Engine kennt keine Zeit. Uhren (Zugtimer, Auktionsende) laufen im Server bzw. in der Hot-Seat-Oberfläche und lösen Aktionen aus.
- Ereignis-Log: `replay({ initial, actions })` muss exakt denselben Endzustand ergeben – auch mit System- und Host-Aktionen.
- Zugphasen als expliziter Zustandsautomat in `state.phase`: `awaitingRoll`, `awaitingPurchase`, `freePhase`, `awaitingDebt`, `auction`, `awaitingChoice`, `gameOver`. Feldauflösung passiert synchron innerhalb von `apply`.
- Feldverhalten läuft über die Feldtyp-Registry (`tileTypes.ts`), die deklarative Effekte liefert. Kein `switch` auf Feldnamen. Karten nutzen dieselben Effekte.
- Eigene Feldtypen (`pack.tileTypes`) sind reine Daten: Auslöser (`land`, `pass`, `turnStart`, `turnEnd`, `roundEnd`), Bedingungen, Effekte. Zufall in Bedingungen (`chance`) kommt aus `state.rng`. Neue Effekt- oder Bedingungsarten brauchen Schema, Engine, Bot-Schätzung (`estimateEffects`), Beschreibung (`format.ts`) und Editor (`EffectEditor`).
- Geldbeträge sind ganze Zahlen.
- Vereinbarungen (`state.agreements`) entstehen nur aus angenommenen Tauschangeboten (`TradeOffer.terms`), zählen am Rundenende herunter und enden bei Bankrott eines Beteiligten.
- Variablen (`pack.variables`, `state.variables`) sind ganze Zahlen pro Spieler oder fürs Spiel; nur Effekte (`setVariable`, `collectVariable`) ändern sie.
- Erweiterungspunkte: `getLegalActions(state, playerId)` und `getDefaultAction` (Bots, Zugtimer).

## Architekturregeln für den Server

- Der Raum ist autoritativ. Clients schicken nur Wünsche (`ClientMessage`); der Spieler einer Aktion kommt immer aus der Verbindung, nie aus der Nachricht.
- `Room` (room.ts) ist frei von Cloudflare-APIs und wird mit einer Attrappe getestet; `GameRoom` ist nur Adapter.
- Identität ohne Account: geheimes Token pro Platz, im Browser unter `menelgame.room.<CODE>`.
- Profile ohne Account: zufällige ID + Geheimnis (`Authorization: Bearer <id>:<geheimnis>`), in D1 nur als SHA-256-Hash. Packs sind privat; es gibt keinen Endpunkt, der fremde Packs listet.
- Clients bekommen nur `publicGameState`: ohne Zufallszustand, ohne Kartenreihenfolge, ohne Text geheimer Lobby-Karten. Das vollständige Log gibt es erst nach Spielende.
- Bots sind normale Aktionsquellen: `decideBot` liefert eine Spieleraktion, der Raum wendet sie wie die eines Menschen an. Ein Bot-Zug pro Alarm, mit `BOT_DELAY_MS` Abstand, damit Menschen mitlesen können.
- Ein einziger Alarm pro Raum: frühester Zeitpunkt aus Bot-Zug, Zug-/Auktionsuhr und Beginn einer Vertretung.

## Architekturregeln für Bots

- Bots sehen nur, was Menschen sehen (`botView`): kein Zufallszustand, keine Kartenreihenfolge. Ein Test prüft, dass Entscheidungen davon unabhängig sind.
- Bots sind deterministisch (Pseudozufall aus Spielstand und Spieler) und liefern nur gültige Aktionen; ist eine Idee ungültig, fällt der Bot auf eine sichere Aktion zurück.
- Leicht und Mittel rechnen billig ohne Simulation. Schwer simuliert einmal pro Brett rund 800 Würfe mit der Engine (etwa 0,1 s) und merkt sich das Ergebnis; jede Entscheidung bleibt danach billig (CPU-Limit im Worker).
- Änderungen an Bots mit einem Turnier prüfen (viele Seeds, Plätze abwechselnd); Schwer soll Mittel klar schlagen.

## Stand

- **Phase 1 abgeschlossen:** Schema, Engine, Standard-Pack, Hot-Seat, Tests inkl. kompletter Spiele mit Replay.
- **Phase 2 umgesetzt:** Worker + Durable Object, Lobby mit Raumcode und Einladungslink, Reconnect, Auktionen, einfacher Handel, Host-Rechte (entfernen, pausieren, Regeln live), Zugtimer. Lokal mit mehreren Clients getestet; das Deployment braucht ein Cloudflare-Konto.
- **Phase 3 umgesetzt:** Bots Leicht und Mittel, Bot-Plätze in der Lobby, Vertretung abwesender Spieler nach einstellbarer Zeit, Ausführung per Alarm. Spiele nur mit Bots laufen ohne Hänger bis zum Ende (Tests, Stresstest über 200 Seeds).
- **Phase 4 umgesetzt:** Profile mit Wiederherstellungscode, eigene Packs und Regelsets in D1, Teilen-Links (widerrufbar), Inhalts-Editor mit Import/Export, Regel-Panel, eigene Packs in Lobby und Hot-Seat, geheime Lobby-Karten.
- **Phase 5 umgesetzt:** Brett-Editor (Felder ziehen, einfügen, löschen; Formen Quadrat, Rechteck, Ring, Pfad), Effekt-Baukasten für eigene Feldtypen mit Vorlagen (Teleporter, Kreuzung, Baustelle), Aussehen und Bilder (R2), Testmodus gegen Bots im Browser, Zufallsbrett-Generator.
- **Phase 6 umgesetzt:** Vereinbarungen im Handel (Mietfreiheit, Ratenzahlung, Gewinnbeteiligung), Bot Schwer, Figuren laufen Feld für Feld, abschaltbare Töne, Replay-Ansicht, Statistik mit Erfolgen und Titeln in D1, Variablen für eigene Feldtypen, Packs Wien-Edition und Fantasy-Welt.

## Arbeitsweise

- Kleine, nachvollziehbare Commits mit aussagekräftigen Nachrichten.
- Unklare Regel → klassische Variante wählen, als Regeloption anlegen, in `docs/ENTSCHEIDUNGEN.md` notieren.
- Abweichungen vom Stack oder von diesen Regeln vorher mit Sebastian absprechen.
- Vor jedem Commit: `pnpm test`, `pnpm lint`, `pnpm build`.
