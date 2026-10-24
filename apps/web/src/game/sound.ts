import type { GameEvent } from '@menelgame/engine';

/**
 * Kleine Geräusche, direkt mit der Web-Audio-API erzeugt – keine Audiodateien nötig.
 * Browser erlauben Ton erst nach einer Nutzeraktion; bis dahin bleibt es still.
 */
export type Sound = 'dice' | 'buy' | 'rent';

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  context ??= new AudioContext();
  if (context.state === 'suspended') void context.resume();
  return context;
}

function tone(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  volume = 0.12,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Kurzes Rauschen wie ein Würfel, der auf den Tisch klackert. */
function click(ctx: AudioContext, start: number) {
  const length = Math.floor(ctx.sampleRate * 0.03);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Fester Pseudozufall, damit das Geräusch immer gleich klingt.
  let seed = 7;
  for (let i = 0; i < length; i++) {
    seed = (seed * 16807) % 2147483647;
    data[i] = ((seed / 2147483647) * 2 - 1) * (1 - i / length);
  }
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2200;
  gain.gain.value = 0.35;
  source.buffer = buffer;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start);
}

export function playSound(sound: Sound): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  switch (sound) {
    case 'dice':
      [0, 0.07, 0.15, 0.21].forEach((offset) => click(ctx, now + offset));
      return;
    case 'buy':
      tone(ctx, 523.25, now, 0.18);
      tone(ctx, 783.99, now + 0.1, 0.3);
      return;
    case 'rent':
      tone(ctx, 659.25, now, 0.18, 0.1);
      tone(ctx, 440, now + 0.12, 0.3, 0.1);
      return;
  }
}

/** Welches Geräusch passt zu einem Ereignis? */
export function soundFor(event: GameEvent): Sound | null {
  switch (event.type) {
    case 'diceRolled':
      return 'dice';
    case 'purchased':
    case 'auctionWon':
      return 'buy';
    case 'rentDue':
      return 'rent';
    default:
      return null;
  }
}
