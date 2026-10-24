import type { BoardPack, DiceConfig, Rules } from '@menelgame/schema';
import { DiceSchema, RulesSchema } from '@menelgame/schema';
import { z } from 'zod';

/**
 * HTTP-API für Profile, eigene Packs und Regelsets (D1). Authentifizierung ohne Account:
 * `Authorization: Bearer <profilId>:<geheimnis>`. Der Wiederherstellungscode ist genau
 * diese Kombination.
 */

export const MAX_PACK_BYTES = 256 * 1024;
export const MAX_PACKS_PER_PROFILE = 50;
export const MAX_RULESETS_PER_PROFILE = 50;

export interface ProfileCredentials {
  id: string;
  secret: string;
}

export function recoveryCode(credentials: ProfileCredentials): string {
  return `${credentials.id}:${credentials.secret}`;
}

export function parseRecoveryCode(code: string): ProfileCredentials | null {
  const match = code.trim().match(/^([a-z0-9]{16}):([a-f0-9]{64})$/);
  return match ? { id: match[1]!, secret: match[2]! } : null;
}

export interface PackSummary {
  id: string;
  name: string;
  version: string;
  tiles: number;
  updatedAt: number;
}

export interface PackResponse {
  id: string;
  pack: BoardPack;
  /** Nur für den Besitzer: darf bearbeiten, sieht den Teilen-Schlüssel. */
  mine: boolean;
  shareKey: string | null;
  updatedAt: number;
}

export const RuleSetInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  rules: RulesSchema,
  dice: DiceSchema,
});

export type RuleSetInput = z.input<typeof RuleSetInputSchema>;

export interface RuleSet {
  id: string;
  name: string;
  rules: Rules;
  dice: DiceConfig;
  updatedAt: number;
}

export type ApiError =
  | 'unauthorized'
  | 'notFound'
  | 'invalidPack'
  | 'invalidRuleSet'
  | 'tooLarge'
  | 'tooMany'
  | 'badRequest';

export interface ApiErrorResponse {
  error: ApiError;
  issues?: { path: string; message: string }[];
}
