import { BoardPackSchema, type BoardPack } from '@menelgame/schema';
import standardJson from './standard.json';

/** Das neutrale Standard-Pack „Neustadt“ (40 Felder), beim Import validiert. */
export const standardPack: BoardPack = BoardPackSchema.parse(standardJson);

export const builtInPacks: readonly BoardPack[] = [standardPack];
export { randomizeBoard } from './generator';
