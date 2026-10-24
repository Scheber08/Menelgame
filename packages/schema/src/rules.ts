import { z } from 'zod';
import { MoneySchema } from './common';

export const VictorySchema = z.discriminatedUnion('type', [
  /** Gewonnen hat, wer als Letzter nicht bankrott ist. */
  z.object({ type: z.literal('lastStanding') }),
  /** Nach so vielen Runden gewinnt das höchste Vermögen. */
  z.object({ type: z.literal('maxRounds'), rounds: z.int().min(1).max(1000) }),
  /** Wer zuerst dieses Vermögen erreicht, gewinnt. */
  z.object({ type: z.literal('targetNetWorth'), amount: MoneySchema }),
]);

export const JailRulesSchema = z.object({
  /** Kaution, um das Gefängnis zu verlassen. */
  bail: MoneySchema.default(50),
  /** Nach so vielen erfolglosen Pasch-Versuchen muss gezahlt werden. */
  maxTurns: z.int().min(1).max(10).default(3),
  /** Darf ein Spieler im Gefängnis Miete kassieren? */
  collectRentInJail: z.boolean().default(true),
});

export const BankruptcySchema = z.object({
  /**
   * toCreditor: Besitz geht an den Gläubiger (bei der Bank: zurück an die Bank).
   * auction: Besitz geht an die Bank und wird sofort versteigert.
   */
  mode: z.enum(['toCreditor', 'auction']).default('toCreditor'),
});

export const TimersSchema = z.object({
  /** Zeit pro Entscheidung in Sekunden; null = kein Zugtimer. */
  turnSeconds: z.int().min(10).max(600).nullable().default(null),
  /** Dauer einer Auktion ohne neue Gebote. */
  auctionSeconds: z.int().min(5).max(120).default(15),
  /** Nach einem Gebot bleiben mindestens so viele Sekunden. */
  auctionExtendSeconds: z.int().min(2).max(60).default(8),
});

export const RulesSchema = z.object({
  startingCash: MoneySchema.default(1500),
  /** Bonus beim Überqueren oder Betreten des Startfelds. */
  passStartBonus: MoneySchema.default(200),
  /** Zusätzlicher Bonus, wenn man genau auf dem Startfeld landet (Hausregel, klassisch 0). */
  landOnStartExtra: MoneySchema.default(0),
  /** Abgelehnte Grundstücke werden versteigert. */
  auctions: z.boolean().default(true),
  /** Steuern und Kartenstrafen landen im Topf, Frei Parken kassiert ihn (Hausregel). */
  freeParkingPot: z.boolean().default(false),
  jail: JailRulesSchema.prefault({}),
  /** Dreimal Pasch hintereinander → Gefängnis. */
  tripleDoublesToJail: z.boolean().default(true),
  /** Vorrat der Bank; null = unbegrenzt. */
  buildingLimit: z
    .object({
      houses: z.int().nonnegative().nullable().default(32),
      hotels: z.int().nonnegative().nullable().default(12),
    })
    .prefault({}),
  /** Häuser einer Gruppe dürfen sich höchstens um eins unterscheiden. */
  evenBuilding: z.boolean().default(true),
  /** Miete unbebauter Grundstücke bei vollständiger Gruppe × Faktor. */
  monopolyRentMultiplier: z.int().min(1).max(10).default(2),
  /** Erlös beim Verkauf von Gebäuden in Prozent der Baukosten. */
  buildingSellPercent: z.int().min(0).max(100).default(50),
  /** Zinsaufschlag beim Ablösen einer Hypothek in Prozent. */
  mortgageInterestPercent: z.int().min(0).max(100).default(10),
  victory: VictorySchema.default({ type: 'lastStanding' }),
  /**
   * Uhren für Online-Spiele. Die Engine kennt keine Zeit; Server bzw. Oberfläche lösen bei
   * Ablauf AUCTION_CLOSE bzw. die Standardaktion aus.
   */
  timers: TimersSchema.prefault({}),
  bankruptcy: BankruptcySchema.prefault({}),
});

export const DiceSchema = z.object({
  count: z.int().min(1).max(4).default(2),
  sides: z.int().min(2).max(20).default(6),
});

export type Rules = z.infer<typeof RulesSchema>;
export type Victory = z.infer<typeof VictorySchema>;
export type Timers = z.infer<typeof TimersSchema>;
export type DiceConfig = z.infer<typeof DiceSchema>;
