# AGENTS.md

Kontext für alle Agenten-Sitzungen an Menelgame. Erst lesen, dann arbeiten. Das Konzept steht in [docs/KONZEPT.md](docs/KONZEPT.md), getroffene Regel- und Technikentscheidungen in [docs/ENTSCHEIDUNGEN.md](docs/ENTSCHEIDUNGEN.md).

## Stack

- TypeScript (strict) überall, pnpm-Workspaces als Monorepo, Node ≥ 22
- `packages/schema`: Zod-Schemas und Typen für Board Packs
- `packages/engine`: reine, deterministische Spiellogik ohne DOM- oder Netzwerkzugriff
- `packages/packs`: mitgelieferte Board Packs (JSON) inkl. Validierung
- `apps/web`: React + Vite, i18next für alle Texte
- `apps/server`: ab Phase 2 (Cloudflare Worker + Durable Object), jetzt Platzhalter
- Vitest, ESLint (Flat Config), Prettier

Die Pakete werden als TypeScript-Quellcode konsumiert (`exports` zeigt auf `src/index.ts`). Vite, Vitest und später Wrangler bündeln selbst; `build` in den Paketen ist daher eine reine Typprüfung.

## Befehle

```bash
pnpm install          # Abhängigkeiten
pnpm dev              # Web-Oberfläche lokal (http://localhost:5173)
pnpm test             # alle Tests (Vitest)
pnpm lint             # ESLint + Prettier-Check
pnpm format           # Prettier schreibt
pnpm build            # Typprüfung aller Pakete + Produktions-Build der Web-App
```

## Ordnerstruktur

```text
apps/
  web/                React-Oberfläche (Hot-Seat in Phase 1)
    src/board/        Brett-Geometrie und SVG-Rendering
    src/components/   UI-Bausteine
    src/locales/      Sprachdateien (de.json)
  server/             Platzhalter für Phase 2
packages/
  schema/src/         Zod-Schemas: pack.ts, rules.ts, tiles.ts, effects.ts
  engine/src/
    apply.ts          apply, getLegalActions
    actions.ts        Validierung + Ausführung pro Aktionstyp
    effects.ts        Effekt-Interpreter, Bewegung, Karten, Miete fällig
    tileTypes.ts      Feldtyp-Registry (onLand/onPass → Effekte)
    turn.ts           Phasenwechsel, Zugende, Siegbedingungen
    bankruptcy.ts     Bankrott
    auction.ts        Auktions-Hook (TODO Phase 2)
    create.ts         Startzustand
    replay.ts         Replay aus Log
    test/helpers.ts   Testhilfen (rigDice, landOn, …)
  packs/src/          standard.json („Neustadt“, 40 Felder) + Export
docs/                 KONZEPT.md, ENTSCHEIDUNGEN.md
```

## Architekturregeln für die Engine

- Kernfunktion `apply(state, action) → { ok, state, events, error? }`. Keine Seiteneffekte, keine Mutation des Eingabezustands (intern wird eine Kopie bearbeitet).
- Jede Aktion wird zuerst von `validateAction` geprüft (am Zug? Phase erlaubt? Geld reicht?). Ungültige Aktionen liefern einen typisierten `EngineError`; der Zustand bleibt unverändert.
- Zufall nur über den gesetzten PRNG (mulberry32) in `state.rng`. Kein `Math.random`, kein `Date` in der Engine (ESLint verbietet `Math.random`).
- Ereignis-Log: `replay({ initial, actions })` muss exakt denselben Endzustand ergeben.
- Zugphasen als expliziter Zustandsautomat in `state.phase`: `awaitingRoll`, `awaitingPurchase`, `freePhase`, `awaitingDebt`, `gameOver`. Feldauflösung passiert synchron innerhalb von `apply`.
- Feldverhalten läuft über die Feldtyp-Registry (`tileTypes.ts`), die deklarative Effekte liefert. Kein `switch` auf Feldnamen. Karten nutzen dieselben Effekte.
- Geldbeträge sind ganze Zahlen.
- Erweiterungspunkte: `startAuction`-Hook (Auktionen), `state.agreements` (Handel mit Laufzeit), `state.rules`/`state.dice` (live änderbar), `getLegalActions` (Bots).

## Stand

- **Phase 1 abgeschlossen:** Schema, Engine, Standard-Pack, Hot-Seat-Oberfläche, Tests inkl. kompletter Spiele mit Replay.
- Offen für Phase 2: Auktionen (Hook `startAuction`), Handel, Server. Siehe docs/KONZEPT.md.

## Arbeitsweise

- Kleine, nachvollziehbare Commits mit aussagekräftigen Nachrichten.
- Unklare Regel → klassische Variante wählen, als Regeloption anlegen, in `docs/ENTSCHEIDUNGEN.md` notieren.
- Abweichungen vom Stack oder von diesen Regeln vorher mit Sebastian absprechen.
- Vor jedem Commit: `pnpm test`, `pnpm lint`, `pnpm build`.
