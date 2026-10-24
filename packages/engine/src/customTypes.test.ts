import { standardPack } from '@menelgame/packs';
import {
  BoardPackSchema,
  parseBoardPack,
  type BoardPack,
  type CustomTileType,
  type Variable,
} from '@menelgame/schema';
import { describe, expect, it } from 'vitest';
import { getDefaultAction, getLegalActions } from './apply';
import {
  act,
  cash,
  expectError,
  landOn,
  newGame,
  patchPlayer,
  player,
  position,
  rigDice,
} from './test/helpers';
import type { GameState } from './types';

/** Standard-Pack, in dem einzelne Felder durch eigene Feldtypen ersetzt sind. */
function packWith(
  types: CustomTileType[],
  replace: Record<string, string>,
  variables: Variable[] = [],
): BoardPack {
  const pack = structuredClone(standardPack);
  pack.tileTypes = types;
  pack.variables = variables;
  pack.tiles = pack.tiles.map((t) =>
    replace[t.id]
      ? {
          id: t.id,
          name: types.find((x) => x.id === replace[t.id])!.name,
          type: 'custom',
          tileType: replace[t.id]!,
        }
      : t,
  );
  return BoardPackSchema.parse(pack);
}

const teleporter: CustomTileType = {
  id: 'teleporter',
  name: 'Teleporter',
  color: '#7c3aed',
  rules: [
    {
      trigger: 'land',
      conditions: [],
      effects: [
        { kind: 'moveToNextOfType', tileType: 'teleporter', passTiles: false, land: false },
      ],
    },
  ],
};

function game(pack: BoardPack, players = 2): GameState {
  return newGame({ pack, players });
}

describe('Eigene Feldtypen', () => {
  it('Teleporter bringen zum nächsten Teleporter, ohne dort erneut auszulösen', () => {
    const pack = packWith([teleporter], { grundsteuer: 'teleporter', luxusabgabe: 'teleporter' });
    const { state, events } = landOn(game(pack), 'p1', 'grundsteuer', [1, 3]);
    expect(player(state, 'p1').position).toBe(position(state, 'luxusabgabe'));
    expect(events).toContainEqual({
      type: 'tileEffect',
      playerId: 'p1',
      tileId: 'grundsteuer',
      trigger: 'land',
    });
    expect(events).toContainEqual({ type: 'teleported', playerId: 'p1', from: 4, to: 38 });
    expect(cash(state, 'p1')).toBe(1500);
    expect(state.phase).toEqual({ name: 'freePhase', extraRoll: false });

    // Vom letzten Teleporter geht es über das Brettende zurück zum ersten.
    const back = landOn({ ...state, phase: { name: 'awaitingRoll' } }, 'p1', 'luxusabgabe').state;
    expect(player(back, 'p1').position).toBe(4);
  });

  it('löst beim Überqueren aus', () => {
    const maut: CustomTileType = {
      id: 'maut',
      name: 'Maut',
      color: '#888888',
      rules: [{ trigger: 'pass', conditions: [], effects: [{ kind: 'pay', amount: 10 }] }],
    };
    const pack = packWith([maut], { grundsteuer: 'maut' });
    const { state } = landOn(game(pack), 'p1', 'busbahnhof', [2, 3]);
    // Start bei 0, über Feld 4 hinweg auf 5: Maut 10, Busbahnhof wird angeboten.
    expect(cash(state, 'p1')).toBe(1490);
  });

  it('prüft Bedingungen: Bargeld und Pasch', () => {
    const steuer: CustomTileType = {
      id: 'reichensteuer',
      name: 'Reichensteuer',
      color: '#aa0000',
      rules: [
        {
          trigger: 'land',
          conditions: [{ kind: 'cash', op: 'gte', amount: 1000 }],
          effects: [{ kind: 'payPercent', percent: 10 }],
        },
        {
          trigger: 'land',
          conditions: [{ kind: 'double', value: true }],
          effects: [{ kind: 'collect', amount: 77 }],
        },
      ],
    };
    const pack = packWith([steuer], { grundsteuer: 'reichensteuer' });
    expect(cash(landOn(game(pack), 'p1', 'grundsteuer', [1, 3]).state, 'p1')).toBe(1350);
    const poor = patchPlayer(game(pack), 'p1', { cash: 500 });
    expect(cash(landOn(poor, 'p1', 'grundsteuer', [2, 2]).state, 'p1')).toBe(577);
  });

  it('bietet eine Auswahl an und führt die gewählte Möglichkeit aus', () => {
    const kreuzung: CustomTileType = {
      id: 'kreuzung',
      name: 'Kreuzung',
      color: '#0088aa',
      rules: [
        {
          trigger: 'land',
          conditions: [],
          effects: [
            {
              kind: 'choice',
              options: [
                { label: 'Geld nehmen', effects: [{ kind: 'collect', amount: 100 }] },
                { label: 'Weiterlaufen', effects: [{ kind: 'moveBy', steps: 2 }] },
              ],
            },
          ],
        },
      ],
    };
    const pack = packWith([kreuzung], { grundsteuer: 'kreuzung' });
    const { state, events } = landOn(game(pack), 'p1', 'grundsteuer', [1, 3]);
    expect(events).toContainEqual({
      type: 'choiceOffered',
      playerId: 'p1',
      options: ['Geld nehmen', 'Weiterlaufen'],
    });
    expect(state.phase).toMatchObject({ name: 'awaitingChoice', playerId: 'p1' });
    expect(getLegalActions(state).map((a) => a.type)).toEqual(['CHOOSE', 'CHOOSE']);
    expect(getDefaultAction(state)).toEqual({ type: 'CHOOSE', playerId: 'p1', option: 0 });
    expectError(state, { type: 'CHOOSE', playerId: 'p1', option: 5 }, 'unknownOption');
    expectError(state, { type: 'CHOOSE', playerId: 'p2', option: 0 }, 'notYourTurn');

    const money = act(state, { type: 'CHOOSE', playerId: 'p1', option: 0 }).state;
    expect(cash(money, 'p1')).toBe(1600);
    expect(money.phase).toEqual({ name: 'freePhase', extraRoll: false });

    const walk = act(state, { type: 'CHOOSE', playerId: 'p1', option: 1 }).state;
    expect(player(walk, 'p1').position).toBe(6);
    expect(walk.phase).toMatchObject({ name: 'awaitingPurchase', tileId: 'schilfweg' });
  });

  it('wirkt bei Zugbeginn, Zugende (einmal) und Rundenende', () => {
    const insel: CustomTileType = {
      id: 'insel',
      name: 'Schatzinsel',
      color: '#ddaa00',
      rules: [
        { trigger: 'turnStart', conditions: [], effects: [{ kind: 'collect', amount: 100 }] },
        { trigger: 'turnEnd', conditions: [], effects: [{ kind: 'pay', amount: 30 }] },
        { trigger: 'roundEnd', conditions: [], effects: [{ kind: 'collect', amount: 5 }] },
      ],
    };
    const pack = packWith([insel], { stadtpark: 'insel' });
    // p1 steht auf der Insel und beendet den Zug: Zugende-Regel, Wechsel zu p2.
    let state = patchPlayer(game(pack), 'p1', { position: 20 });
    state = { ...state, phase: { name: 'freePhase', extraRoll: false } };
    state = act(state, { type: 'END_TURN', playerId: 'p1' }).state;
    expect(cash(state, 'p1')).toBe(1470);
    expect(state.currentPlayer).toBe(1);

    // p2 beendet den Zug → neue Runde: Rundenende für p1 (+5), dann Zugbeginn p1 (+100).
    state = { ...state, phase: { name: 'freePhase', extraRoll: false } };
    const { state: next, events } = act(state, { type: 'END_TURN', playerId: 'p2' });
    expect(cash(next, 'p1')).toBe(1470 + 5 + 100);
    expect(
      events
        .filter((e) => e.type === 'tileEffect')
        .map((e) => e.type === 'tileEffect' && e.trigger),
    ).toEqual(['roundEnd', 'turnStart']);
    expect(next.phase).toEqual({ name: 'awaitingRoll' });
  });

  it('sperrt Felder für einige Runden', () => {
    const baustelle: CustomTileType = {
      id: 'baustelle',
      name: 'Baustelle',
      color: '#ff8800',
      rules: [
        {
          trigger: 'land',
          conditions: [],
          effects: [
            { kind: 'pay', amount: 50 },
            { kind: 'blockTile', rounds: 1 },
          ],
        },
      ],
    };
    const pack = packWith([baustelle], { grundsteuer: 'baustelle' });
    let state = landOn(game(pack), 'p1', 'grundsteuer', [1, 3]).state;
    expect(state.blockedTiles).toEqual({ grundsteuer: 1 });
    // p2 landet in derselben Runde: gesperrt, nichts passiert.
    state = { ...state, currentPlayer: 1, phase: { name: 'awaitingRoll' } };
    const blocked = landOn(state, 'p2', 'grundsteuer', [1, 3]);
    expect(blocked.events).toContainEqual({
      type: 'blockedTileLanded',
      playerId: 'p2',
      tileId: 'grundsteuer',
    });
    expect(cash(blocked.state, 'p2')).toBe(1500);
    // Nach dem Rundenende ist das Feld wieder frei.
    const ended = act(
      { ...blocked.state, phase: { name: 'freePhase', extraRoll: false } },
      { type: 'END_TURN', playerId: 'p2' },
    );
    expect(ended.state.blockedTiles).toEqual({});
    expect(ended.events).toContainEqual({ type: 'tileUnblocked', tileId: 'grundsteuer' });
  });

  it('lässt Spieler aussetzen', () => {
    const falle: CustomTileType = {
      id: 'falle',
      name: 'Falle',
      color: '#444444',
      rules: [{ trigger: 'land', conditions: [], effects: [{ kind: 'skipTurns', turns: 1 }] }],
    };
    const pack = packWith([falle], { grundsteuer: 'falle' });
    let state = landOn(game(pack, 3), 'p1', 'grundsteuer', [1, 3]).state;
    expect(player(state, 'p1').skipTurns).toBe(1);
    state = act(
      { ...state, phase: { name: 'freePhase', extraRoll: false } },
      { type: 'END_TURN', playerId: 'p1' },
    ).state;
    state = act(
      { ...state, phase: { name: 'freePhase', extraRoll: false } },
      { type: 'END_TURN', playerId: 'p2' },
    ).state;
    const { state: next, events } = act(
      { ...state, phase: { name: 'freePhase', extraRoll: false } },
      { type: 'END_TURN', playerId: 'p3' },
    );
    expect(events).toContainEqual({ type: 'turnSkipped', playerId: 'p1', remaining: 0 });
    expect(next.currentPlayer).toBe(1);
  });

  it('zieht Karten und nutzt den Zufall reproduzierbar', () => {
    const glueckstopf: CustomTileType = {
      id: 'topf',
      name: 'Glückstopf',
      color: '#22aa44',
      rules: [
        {
          trigger: 'land',
          conditions: [{ kind: 'chance', percent: 50 }],
          effects: [{ kind: 'drawCard', deck: 'glueck' }],
        },
      ],
    };
    const pack = packWith([glueckstopf], { grundsteuer: 'topf' });
    const a = landOn(game(pack), 'p1', 'grundsteuer', [1, 3]);
    const b = landOn(game(pack), 'p1', 'grundsteuer', [1, 3]);
    expect(a.events).toEqual(b.events);
  });
});

describe('Variablen', () => {
  const sammelstelle: CustomTileType = {
    id: 'sammelstelle',
    name: 'Sammelstelle',
    color: '#eab308',
    rules: [
      {
        trigger: 'land',
        conditions: [],
        effects: [{ kind: 'setVariable', variable: 'sterne', op: 'add', value: 1 }],
      },
      {
        trigger: 'land',
        conditions: [{ kind: 'variable', variable: 'sterne', op: 'gte', value: 3 }],
        effects: [
          { kind: 'collect', amount: 300 },
          { kind: 'setVariable', variable: 'sterne', op: 'set', value: 0 },
        ],
      },
    ],
  };
  const kasse: CustomTileType = {
    id: 'kasse',
    name: 'Kasse',
    color: '#16a34a',
    rules: [
      {
        trigger: 'pass',
        conditions: [],
        effects: [{ kind: 'setVariable', variable: 'topf', op: 'add', value: 50 }],
      },
      {
        trigger: 'land',
        conditions: [],
        effects: [
          { kind: 'collectVariable', variable: 'topf', percent: 100 },
          { kind: 'setVariable', variable: 'topf', op: 'set', value: 0 },
        ],
      },
    ],
  };
  const pack = packWith(
    [sammelstelle, kasse],
    { grundsteuer: 'sammelstelle', luxusabgabe: 'kasse' },
    [
      { id: 'sterne', name: 'Sterne', scope: 'player', initial: 0 },
      { id: 'topf', name: 'Topf', scope: 'game', initial: 0 },
    ],
  );

  it('zählt pro Spieler und reagiert auf den Wert', () => {
    let state = game(pack);
    expect(state.variables).toEqual({
      game: { topf: 0 },
      players: { p1: { sterne: 0 }, p2: { sterne: 0 } },
    });
    for (let i = 1; i <= 3; i++) {
      const before = cash(state, 'p1');
      const result = landOn(state, 'p1', 'grundsteuer', [1, 3]);
      state = { ...result.state, phase: { name: 'awaitingRoll' } };
      expect(cash(state, 'p1')).toBe(before + (i === 3 ? 300 : 0));
    }
    expect(state.variables.players.p1).toEqual({ sterne: 0 });
    expect(state.variables.players.p2).toEqual({ sterne: 0 });
  });

  it('teilt Spiel-Variablen zwischen allen Spielern', () => {
    // p1 zieht über die Kasse (Feld 38) und füllt den Topf.
    let state = patchPlayer(game(pack), 'p1', { position: 36 });
    state = act(rigDice(state, [[2, 3]]), { type: 'ROLL_DICE', playerId: 'p1' }).state;
    expect(state.variables.game.topf).toBe(50);
    state = act(
      { ...state, phase: { name: 'freePhase', extraRoll: false } },
      { type: 'END_TURN', playerId: 'p1' },
    ).state;
    const before = cash(state, 'p2');
    const { state: after, events } = landOn(state, 'p2', 'luxusabgabe', [1, 3]);
    expect(cash(after, 'p2')).toBe(before + 50);
    expect(after.variables.game.topf).toBe(0);
    expect(events).toContainEqual({
      type: 'variableChanged',
      variable: 'topf',
      playerId: null,
      from: 50,
      to: 0,
    });
  });

  it('meldet unbekannte Variablen im Schema', () => {
    const broken = parseBoardPack({ ...pack, variables: [] });
    expect(broken.ok).toBe(false);
    if (!broken.ok)
      expect(broken.issues.map((i) => i.message)).toContain('Unbekannte Variable sterne');
  });
});

describe('Schema für eigene Feldtypen', () => {
  it('prüft Verweise und reservierte Namen', () => {
    const pack = structuredClone(standardPack) as unknown as Record<string, unknown> & BoardPack;
    pack.tileTypes = [{ ...teleporter, id: 'property' }];
    pack.tiles = pack.tiles.map((t) =>
      t.id === 'grundsteuer' ? { id: t.id, name: 'X', type: 'custom', tileType: 'fehlt' } : t,
    );
    const result = parseBoardPack(pack);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const messages = result.issues.map((i) => i.message);
    expect(messages).toContain('Feldtyp-ID property ist reserviert');
    expect(messages).toContain('Unbekannter Feldtyp fehlt');
    expect(messages).toContain('Kein Feld vom Typ teleporter vorhanden');
  });

  it('erlaubt Ringe und freie Pfade mit passender Punktzahl', () => {
    const pack = structuredClone(standardPack);
    expect(parseBoardPack({ ...pack, layout: { shape: 'ring' } }).ok).toBe(true);
    const points = pack.tiles.map((_, i) => ({ x: i * 2, y: 50 }));
    expect(parseBoardPack({ ...pack, layout: { shape: 'path', points } }).ok).toBe(true);
    const short = parseBoardPack({ ...pack, layout: { shape: 'path', points: points.slice(1) } });
    expect(short.ok).toBe(false);
  });
});
