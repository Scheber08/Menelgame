# Menelgame

Ein vollständig anpassbares Grundstücks-Handelsspiel für private Runden mit Freunden. Alles, was ein Spiel ausmacht – Brett, Felder, Karten, Regeln –, steckt in einem JSON-„Board Pack“.

**Stand: Phase 1.** Die Engine ist fertig und lokal im Browser als Hot-Seat für 2–4 Spieler spielbar. Online-Multiplayer folgt in Phase 2.

## Schnellstart

Voraussetzungen: Node.js ≥ 22 und pnpm 10 (`npm i -g pnpm@10` oder `corepack enable`).

```bash
pnpm install
pnpm dev
```

Dann <http://localhost:5173> öffnen, Spieler eintragen und „Spiel starten“.

## Weitere Befehle

```bash
pnpm test    # alle Tests
pnpm lint    # ESLint + Prettier-Check
pnpm build   # Typprüfung + Produktions-Build (apps/web/dist)
```

## Mehr

- [docs/KONZEPT.md](docs/KONZEPT.md) – Idee, Leitplanken und Phasen
- [docs/ENTSCHEIDUNGEN.md](docs/ENTSCHEIDUNGEN.md) – Regel- und Technikentscheidungen
- [AGENTS.md](AGENTS.md) – Stack, Ordnerstruktur und Architekturregeln
