// Store muzak: a deliberately cheesy elevator bossa nova, synthesized on the fly.
//
// An 8-bar loop at 96 bpm in F major: Fmaj9 - Dm9 - Gm7 - C9, twice (the second time the C chord
// gets a cheesier flat-nine and a little vibraphone pickup leads back to the top). Instruments:
//   electric piano  soft FM tone, comping in a bossa rhythm
//   bass            round sine-ish root and fifth, the classic bossa "boom.. b-boom.."
//   shaker          very light filtered-noise 16ths
//   vibes           two tiny pickups at the ends of the phrases
//
// musicBar(ctx, dest, t, bar) schedules one bar into `dest` starting at time t. It is a pure
// function of a BaseAudioContext, like the effects, so the test page can render the loop offline.
// The live player in sound.js calls it a bar at a time from a look-ahead scheduler.
import { voice, tone, noise, bell, gain, mtof } from './synth.js';

export const BPM = 96;
const BEAT = 60 / BPM;
/** Length of one bar in seconds (4 beats). */
export const BAR = 4 * BEAT;
/** Bars before the loop repeats. */
export const LOOP_BARS = 8;
/** Overall music level. The loop should sit well under the effects. */
export const MUSIC_LEVEL = 0.27;

const STEP = BEAT / 2; // an eighth note

// [bass root, bass fifth, electric piano voicing] per bar.
const CHORDS = [
  [41, 48, [57, 60, 64, 67]], // Fmaj9  (A C E G over F)
  [38, 45, [57, 60, 64, 65]], // Dm9    (A C E F over D)
  [43, 50, [55, 58, 62, 65]], // Gm7    (G Bb D F)
  [36, 43, [52, 58, 62, 67]], // C9     (E Bb D G over C)
  [41, 48, [57, 60, 64, 67]],
  [38, 45, [57, 60, 64, 65]],
  [43, 50, [55, 58, 62, 65]],
  [36, 43, [52, 58, 61, 67]], // C7b9   (E Bb Db G): maximum cheese
];

// Electric piano hits: [eighth-note step, length in steps, velocity]. Two alternating bossa bars.
const COMP = [
  [[0, 2, 1], [3, 2, 0.7], [6, 2, 0.75]],
  [[0, 2, 0.9], [2, 2, 0.65], [5, 3, 0.8]],
];

// Bass: [step, length in steps, 0 = root / 1 = fifth / 2 = fifth an octave down].
const BASS = [[0, 2.6, 0], [3, 0.9, 0], [4, 2.6, 1], [7, 0.9, 2]];

// Vibraphone pickups: bar -> [[step, midi note], ...].
const VIBES = {
  3: [[6, 74], [7, 76]],
  7: [[5, 79], [6, 77], [7, 76]], // leads back to the top of the loop (E over Fmaj)
};

/**
 * Electric-piano-like note: a sine whose pitch is wobbled by a second sine at the same frequency.
 * The wobble fades within half a second, so each chord starts with a bell-ish "tine" and mellows.
 */
function epNote(v, t, f, vel, len) {
  const ctx = v.ctx;
  const car = ctx.createOscillator();
  car.frequency.value = f;
  const mod = ctx.createOscillator();
  mod.frequency.value = f;
  const mg = gain(v, 0);
  mg.gain.setValueAtTime(f * 1.1 * vel, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.12, t + 0.45);
  mod.connect(mg).connect(car.frequency);
  const g = gain(v, 0);
  const peak = 0.05 * vel;
  // Attack, a slow natural decay while the key is held, then a short release.
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.008);
  g.gain.exponentialRampToValueAtTime(peak * 0.35, t + len);
  g.gain.exponentialRampToValueAtTime(peak * 0.001, t + len + 0.35);
  g.gain.linearRampToValueAtTime(0, t + len + 0.36);
  car.connect(g).connect(v.out);
  v.run(car, t, t + len + 0.37);
  v.run(mod, t, t + len + 0.37);
}

/** Schedules bar number `bar` (0..LOOP_BARS-1) of the loop into `dest`, starting at time t. */
export function musicBar(ctx, dest, t, bar) {
  const b = ((bar % LOOP_BARS) + LOOP_BARS) % LOOP_BARS;
  const v = voice(ctx, dest, MUSIC_LEVEL);
  const [root, fifth, keys] = CHORDS[b];

  for (const [step, len, vel] of COMP[b % 2]) {
    keys.forEach((m, i) => epNote(v, t + step * STEP + i * 0.006, mtof(m), vel * (i === 3 ? 0.8 : 1), len * STEP));
  }

  for (const [step, len, which] of BASS) {
    const m = which === 0 ? root : which === 1 ? fifth : fifth - 12;
    const s = t + step * STEP;
    tone(v, { t: s, f: mtof(m), peak: 0.16, a: 0.012, h: len * STEP * 0.5, d: len * STEP * 0.5 + 0.12 });
    tone(v, { t: s, f: mtof(m + 12), type: 'triangle', peak: 0.025, a: 0.012, d: len * STEP * 0.6 });
  }

  // Shaker: sixteenths, accented on the off-beats, from different places in the noise buffer.
  for (let i = 0; i < 16; i++) {
    const vel = [0.45, 0.25, 0.8, 0.3][i % 4];
    noise(v, { t: t + i * STEP / 2, type: 'highpass', f: 6500, q: 0.7, peak: 0.06 * vel, a: 0.006, d: 0.05, offset: ((b * 16 + i) * 0.0613) % 0.9 });
  }

  for (const [step, m] of VIBES[b] || []) {
    bell(v, { t: t + step * STEP, f: mtof(m), peak: 0.05, d: 0.9, ratio: 4, index: 0.25 });
  }
  return v.end;
}
