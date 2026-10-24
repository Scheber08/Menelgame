# Menelgame

Ein vollständig anpassbares Grundstücks-Handelsspiel für private Runden mit Freunden. Alles, was ein Spiel ausmacht – Brett, Felder, Karten, Regeln –, steckt in einem JSON-„Board Pack“.

**Stand: Phase 6.** Online-Räume mit Einladungslink, Auktionen, Handel mit Vereinbarungen (Mietfreiheit, Raten, Gewinnbeteiligung), Host-Rechten und Bots (Leicht, Mittel, Schwer) laufen auf einem Cloudflare Worker mit Durable Objects. Bots füllen freie Plätze und vertreten abwesende Spieler. Eigene Bretter baust du im Editor – Felder per Ziehen & Ablegen, eigene Feldtypen wie Teleporter aus Bausteinen, eigene Farben und Bilder –, testest sie gegen Bots und teilst sie per Link; Mitspieler können geheime Lobby-Karten schreiben. Lokal geht es auch als Hot-Seat an einem Gerät. Nach dem Spiel gibt es ein Replay; Statistik, Erfolge und Titel sammelst du in Online-Spielen. Mitgeliefert: Neustadt, Wien-Edition und Fantasy-Welt.

## Schnellstart

Voraussetzungen: Node.js ≥ 22 und pnpm 10 (`npm i -g pnpm@10` oder `corepack enable`).

```bash
pnpm install
pnpm dev
```

Dann <http://localhost:5173> öffnen. `pnpm dev` startet Web-Oberfläche und Worker (`wrangler dev`) zusammen.

Online spielen: „Raum erstellen“, Link an Freunde schicken, als Host starten. Zum Ausprobieren auf einem Rechner ein zweites Browserprofil oder ein privates Fenster nutzen.

## Weitere Befehle

```bash
pnpm test    # alle Tests
pnpm lint    # ESLint + Prettier-Check
pnpm build   # Typprüfung + Produktions-Build (apps/web/dist)
pnpm run deploy  # zu Cloudflare hochladen (vorher einmal wrangler login, siehe AGENTS.md)
```

## Mehr

- [docs/KONZEPT.md](docs/KONZEPT.md) – Idee, Leitplanken und Phasen
- [docs/ENTSCHEIDUNGEN.md](docs/ENTSCHEIDUNGEN.md) – Regel- und Technikentscheidungen
- [AGENTS.md](AGENTS.md) – Stack, Ordnerstruktur und Architekturregeln
