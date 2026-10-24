# AGENTS.md

Kontext für alle Agenten-Sitzungen an Menelgame. Erst lesen, dann arbeiten. Das Konzept steht in [docs/KONZEPT.md](docs/KONZEPT.md), getroffene Regel- und Technikentscheidungen in [docs/ENTSCHEIDUNGEN.md](docs/ENTSCHEIDUNGEN.md).

## Stack

- TypeScript (strict) überall, pnpm-Workspaces als Monorepo, Node ≥ 22
- `packages/schema`: Zod-Schemas und Typen für Board Packs
- `packages/engine`: reine, deterministische Spiellogik ohne DOM- oder Netzwerkzugriff
- `packages/packs`: mitgelieferte Board Packs (JSON) inkl. Validierung
- `packages/protocol`: Nachrichten zwischen Browser und Spielraum (Zod-geprüft)
- `apps/web`: React + Vite, i18next für alle Texte
- `apps/server`: Cloudflare Worker + ein Durable Object pro Spielraum (Wrangler)
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
pnpm deploy           # Web bauen und Worker samt Assets zu Cloudflare hochladen
pnpm --filter @menelgame/server check   # Worker probehalber bündeln (ohne Upload)
```

Im Dev-Modus leitet Vite `/api/*` und `/r/<code>/ws` an `wrangler dev` weiter. Online-Räume testet man am besten mit zwei Browsern (oder einem privaten Fenster): Das Reconnect-Token liegt im `localStorage`, zwei Tabs desselben Browsers wären derselbe Spieler.

## Deployment auf Cloudflare (Free Plan)

1. Kostenloses Cloudflare-Konto anlegen.
2. Einmalig anmelden: `pnpm --filter @menelgame/server exec wrangler login`
3. Hochladen: `pnpm deploy`. Wrangler legt den Worker `menelgame` an, lädt `apps/web/dist` als statische Assets hoch und führt die Durable-Object-Migration `v1` (SQLite) aus.
4. Die App ist dann unter `https://menelgame.<dein-subdomain>.workers.dev` erreichbar. Einladungslinks haben die Form `/r/<CODE>`.
5. Logs live ansehen: `pnpm --filter @menelgame/server exec wrangler tail`.

Konfiguration: [apps/server/wrangler.jsonc](apps/server/wrangler.jsonc). Der Free Plan erlaubt nur SQLite-gestützte Durable Objects (`new_sqlite_classes`); Tageslimits (Requests, geschriebene Zeilen) stehen in der Cloudflare-Doku. Pro Spielaktion schreibt ein Raum etwa vier Zeilen.

## Ordnerstruktur

```text
apps/
  web/src/
    board/            Brett-Geometrie und SVG-Rendering
    components/       UI-Bausteine (GameScreen, ActionBar, AuctionPanel, TradePanel, …)
    game/             Hooks: useHotSeatGame, useOnlineRoom; Formatierung
    pages/            Home, HotSeatPage, RoomPage (Lobby, Spiel, Host-Panel)
    locales/          Sprachdateien (de.json)
  server/
    src/index.ts      Worker: /api/rooms, /api/rooms/<code>[/log], /r/<code>/ws, Assets
    src/gameRoom.ts   Durable Object: WebSocket-Hibernation, Speicher, Alarm
    src/room.ts       Raum-Logik ohne Cloudflare-APIs (Lobby, Host, Uhren) + Tests
    wrangler.jsonc
packages/
  schema/src/         Zod-Schemas: pack.ts, rules.ts, tiles.ts, effects.ts
  protocol/src/       ClientMessage, ServerMessage, RoomView, ActionInput
  engine/src/
    apply.ts          apply, getLegalActions, getDefaultAction
    actions.ts        Validierung + Ausführung pro Aktionstyp
    handler.ts        Handler-Typ, Akteure (acting/anyPlayer/system), Fehlertexte
    effects.ts        Effekt-Interpreter, Bewegung, Karten, Miete fällig
    tileTypes.ts      Feldtyp-Registry (onLand/onPass → Effekte)
    turn.ts           Phasenwechsel, Zugende, Siegbedingungen
    auction.ts        Versteigerungen
    trade.ts          Handel (Angebot, Gegenangebot, Annahme)
    host.ts           Systemaktionen UPDATE_RULES, REMOVE_PLAYER
    bankruptcy.ts     Ausscheiden (Bankrott, entfernt)
    create.ts         Startzustand
    replay.ts         Replay aus Log
    test/             Testhilfen (rigDice, landOn, …) und Test-Strategie
  packs/src/          standard.json („Neustadt“, 40 Felder) + Export
docs/                 KONZEPT.md, ENTSCHEIDUNGEN.md
```

## Architekturregeln für die Engine

- Kernfunktion `apply(state, action) → { ok, state, events, error? }`. Keine Seiteneffekte, keine Mutation des Eingabezustands (intern wird eine Kopie bearbeitet).
- Jede Aktion wird zuerst von `validateAction` geprüft (darf dieser Akteur? Phase erlaubt? Geld reicht?). Ungültige Aktionen liefern einen typisierten `EngineError`; der Zustand bleibt unverändert.
- Akteure: `acting` (Spieler am Zug bzw. Schuldner), `anyPlayer` (Auktion, Handel), `system` (Uhr und Host: `AUCTION_CLOSE`, `UPDATE_RULES`, `REMOVE_PLAYER`).
- Zufall nur über den gesetzten PRNG (mulberry32) in `state.rng`. Kein `Math.random`, kein `Date` in der Engine (ESLint verbietet beides).
- Die Engine kennt keine Zeit. Uhren (Zugtimer, Auktionsende) laufen im Server bzw. in der Hot-Seat-Oberfläche und lösen Aktionen aus.
- Ereignis-Log: `replay({ initial, actions })` muss exakt denselben Endzustand ergeben – auch mit System- und Host-Aktionen.
- Zugphasen als expliziter Zustandsautomat in `state.phase`: `awaitingRoll`, `awaitingPurchase`, `freePhase`, `awaitingDebt`, `auction`, `gameOver`. Feldauflösung passiert synchron innerhalb von `apply`.
- Feldverhalten läuft über die Feldtyp-Registry (`tileTypes.ts`), die deklarative Effekte liefert. Kein `switch` auf Feldnamen. Karten nutzen dieselben Effekte.
- Geldbeträge sind ganze Zahlen.
- Erweiterungspunkte: `state.agreements` (Vereinbarungen mit Laufzeit, Phase 6), `TradeOffer` (später um Vereinbarungen erweiterbar), `getLegalActions(state, playerId)` und `getDefaultAction` (Bots).

## Architekturregeln für den Server

- Der Raum ist autoritativ. Clients schicken nur Wünsche (`ClientMessage`); der Spieler einer Aktion kommt immer aus der Verbindung, nie aus der Nachricht.
- `Room` (room.ts) ist frei von Cloudflare-APIs und wird mit einer Attrappe getestet; `GameRoom` ist nur Adapter.
- Identität ohne Account: geheimes Token pro Platz, im Browser unter `menelgame.room.<CODE>`.

## Stand

- **Phase 1 abgeschlossen:** Schema, Engine, Standard-Pack, Hot-Seat, Tests inkl. kompletter Spiele mit Replay.
- **Phase 2 umgesetzt:** Worker + Durable Object, Lobby mit Raumcode und Einladungslink, Reconnect, Auktionen, einfacher Handel, Host-Rechte (entfernen, pausieren, Regeln live), Zugtimer. Lokal mit mehreren Clients getestet; das Deployment braucht ein Cloudflare-Konto.
- Nächste Phase: Bots (Phase 3), siehe docs/KONZEPT.md.

## Arbeitsweise

- Kleine, nachvollziehbare Commits mit aussagekräftigen Nachrichten.
- Unklare Regel → klassische Variante wählen, als Regeloption anlegen, in `docs/ENTSCHEIDUNGEN.md` notieren.
- Abweichungen vom Stack oder von diesen Regeln vorher mit Sebastian absprechen.
- Vor jedem Commit: `pnpm test`, `pnpm lint`, `pnpm build`.
