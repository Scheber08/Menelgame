import { BoardPackSchema, type BoardPack } from '@menelgame/schema';
import fantasyJson from './fantasy.json';
import standardJson from './standard.json';
import wienJson from './wien.json';

/** Das neutrale Standard-Pack „Neustadt“ (40 Felder), beim Import validiert. */
export const standardPack: BoardPack = BoardPackSchema.parse(standardJson);

/** Wien-Edition: 40 Felder quer durch Wien, gleiche Wirtschaft wie Neustadt. */
export const wienPack: BoardPack = BoardPackSchema.parse(wienJson);

/** Fantasy-Welt: 32 Felder mit eigenen Feldtypen und Variablen. */
export const fantasyPack: BoardPack = BoardPackSchema.parse(fantasyJson);

export const builtInPacks: readonly BoardPack[] = [standardPack, wienPack, fantasyPack];
export { randomizeBoard } from './generator';
