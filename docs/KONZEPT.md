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

Stand: Phase 1 bis 3 sind umgesetzt. Für die nächsten Phasen gibt es diese Anknüpfungspunkte:

- **Bot Schwer (Phase 6):** `@menelgame/bots` hat eine Strategie-Schnittstelle; eine weitere Stufe kann Landewahrscheinlichkeiten per Engine simulieren.
- **Testmodus gegen Bots (Phase 5):** Die Bots sind reine Funktionen und laufen auch im Browser.
- **Packs in D1 (Phase 4):** Der Spielraum speichert das Pack als Schnappschuss im Spielzustand.
- **Eigene Feldtypen (Phase 5):** Feldtyp-Registry mit `onLand`/`onPass`, die nur deklarative Effekte liefert.
- **Vereinbarungen mit Laufzeit (Phase 6):** `state.agreements` und `TradeOffer` sind dafür vorgesehen.
- **Replay-Ansicht (Phase 6):** Startzustand + Aktionsliste ergibt exakt denselben Endzustand; der Server liefert das Log.
