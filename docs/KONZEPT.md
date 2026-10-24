# Menelgame – Konzept

Menelgame ist ein vollständig anpassbares Grundstücks-Handelsspiel (Monopoly-artig) als Webanwendung mit Online-Multiplayer für private Runden mit Freunden.

## Leitplanken

- **Eigene Marke.** Keine Hasbro-Marken, Namen, Straßen oder Designs von Monopoly. Alle mitgelieferten Inhalte sind erfunden.
- **Ohne Account.** Spieler treten per Einladungslink bei. Bots füllen freie Plätze.
- **Cloudflare Free Plan.** Frontend als statische Assets, ein Worker als Router, ein Durable Object pro Spielraum (autoritativer Zustand, WebSockets mit Hibernation, Bots per Alarm), D1 für Packs, Regelsets und Profile, R2 für Bilder.
- **Geräte.** Vor allem PC/Laptop, auf dem Handy soll es bedienbar bleiben.
- **Sprache.** Oberfläche auf Deutsch, alle Texte von Anfang an in Sprachdateien (i18next), damit Englisch leicht dazukommt.

## Board Packs

Alles, was ein Spiel ausmacht, steckt in einem **Board Pack** (JSON):

| Teil         | Inhalt                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `meta`       | ID, Name, Version, Autor, Beschreibung                                                                                                           |
| `rules`      | Startgeld, Los-Bonus, Auktionen, Frei-Parken-Topf, Gefängnisregeln, Baulimit, gleichmäßiges Bauen, Hypothekenzins, Siegbedingung, Bankrott-Regel |
| `dice`       | Anzahl und Seitenzahl der Würfel                                                                                                                 |
| `maxPlayers` | Höchstzahl an Spielern                                                                                                                           |
| `layout`     | Form des Bretts (Phase 1: Quadrat, Rechteck)                                                                                                     |
| `groups`     | Farbgruppen, Bahnhofs- und Werksgruppen                                                                                                          |
| `tiles`      | Felder; jedes Feld hat einen Feldtyp                                                                                                             |
| `decks`      | Kartenstapel mit Karten, deren Wirkung als feste Aktionen beschrieben ist                                                                        |

Die Engine kennt **keine fest eingebauten Felder**, nur Feldtypen und Effekte. Klassische Felder (Grundstück, Bahnhof, Werk, Steuer, Karte, Gefängnis, Los, Frei Parken, Ab ins Gefängnis) sind eingebaute Feldtypen, die dasselbe Effektsystem nutzen wie spätere eigene Typen.

Eigene Feldtypen und Karten beschreiben ihre Logik **deklarativ** als Auslöser → Bedingungen → Aktionen. Aus Packs wird niemals Code ausgeführt (kein `eval`; Workers erlauben das ohnehin nicht).

## Phasen

1. **Engine (lokal spielbar)** – Schema, deterministische Engine, Standard-Pack, Hot-Seat-Oberfläche.
2. **Multiplayer** – Worker + Durable Object, Lobby, Raumcode, Reconnect, Auktionen, einfacher Handel, Host-Rechte, Zugtimer.
3. **Bots** – Stufen Leicht und Mittel, Ausführung per Alarm, Vertretung abwesender Spieler.
4. **Anpassung I** – Profile, D1, „Meine Packs“, Regel-Panel, Regelsets, Inhalts-Editor, Teilen-Links, eigene Lobby-Karten.
5. **Anpassung II** – Brett-Editor, Effekt-Baukasten, Testmodus, Zufallsbrett-Generator.
6. **Feinschliff** – erweiterter Handel (Mietfreiheit, Ratenzahlung, Gewinnbeteiligung), Bot Schwer, Animationen, Sound, Replay-Ansicht, Statistiken, Variablen, weitere Packs.

Phase 1 ist so gebaut, dass diese Erweiterungen ohne Umbau möglich sind:

- **Auktionen:** Hook `startAuction` in der Engine, wird beim Ablehnen eines Kaufs und bei Bankrott mit Versteigerung aufgerufen.
- **Handel und Vereinbarungen:** `agreements` im Spielzustand ist bereits vorhanden (Objekte mit Laufzeit).
- **Live geänderte Regeln:** Der Spielzustand trägt eine eigene Kopie der Regeln (`state.rules`, `state.dice`), getrennt vom Pack.
- **Bots:** Bots schicken dieselben Aktionen wie Menschen; `getLegalActions` liefert alle erlaubten Aktionen.
- **Replay:** Startzustand + Aktionsliste ergibt exakt denselben Endzustand.
