// Sounds for the Card Trader (0.3.01) and the Midnight Release that brings him. Same shape as the
// entries in effects.js: each is a play function (ctx, dest, t, opts) that returns the time it
// ends, and uses opts.seed the way the older sounds do (seed % shapes picks the version; pitch,
// length and timbre are nudged each play).
//
//   releaseSound  the mob piles in through one door: a stampede of trainers, a crowd of nasal men
//                 babbling over each other, and a cheap eight-bit "level up" fanfare
//   ripSound      a Card Trader rips the best stock out of a building: a long crinkly foil tear, then an
//                 awed "ooooh", a gasp or a breathy "yesss" (opts.n: how many others stopped to
//                 look; with any, a second voice joins in)
// His own voice, storming out and at the tills, is in shoppers.js with everyone else's.
import { voice, tone, noise, mtof, vary, say, babble } from './synth.js';

/** His voice: a man's formants pushed up a little and pinched (a blocked nose). */
const NASAL = 1.12;

/** A foil wrapper torn open: a burst of crackles, bright and uneven. Returns when it stops. */
function foilTear(v, t, x, len = 0.32, peak = 0.16) {
  const n = Math.round(len / 0.018);
  for (let i = 0; i < n; i++) {
    const at = t + i * 0.018 * x.j(0.35);
    noise(v, { t: at, type: 'bandpass', f: x.between(2500, 6500), q: 2.5, peak: peak * x.between(0.4, 1), a: 0.001, d: 0.012 });
  }
  // The long rip under the crackle.
  noise(v, { t, type: 'bandpass', f: 1800 * x.j(0.1), f1: 4200, glide: len, q: 1.1, peak: peak * 0.55, a: 0.01, h: len * 0.6, d: 0.05 });
  return t + len + 0.05;
}

/**
 * A Card Trader rips a pack: the foil, then his reaction. Version 0: a long awed "ooooh"; 1: a
 * sharp gasp and "whoa"; 2: a breathy "yesss". With onlookers (opts.n), one of them answers.
 */
export function ripSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const p = x.j(0.07) * (o.sup ? 0.85 : 1);
  const e = foilTear(v, t, x, x.between(0.24, 0.34));
  if (x.shape === 0) {
    say(v, { t: e, vowel: 'oo', scale: NASAL, f: 170 * p, f1: 230 * p, glide: 0.3, peak: 0.42, a: 0.03, h: 0.18, d: 0.1, vib: { rate: 6, depth: 12, delay: 0.1 } });
  } else if (x.shape === 1) {
    noise(v, { t: e, type: 'bandpass', f: 1400, f1: 2600, glide: 0.08, q: 1.5, peak: 0.14, a: 0.01, d: 0.05 }); // the gasp
    babble(v, { scale: NASAL, sylls: [{ t: e + 0.1, len: 0.16, f: 200 * p, f1: 160 * p, vowel: 'oh', peak: 0.42 }] });
  } else {
    babble(v, { scale: NASAL, sylls: [{ t: e, len: 0.12, f: 190 * p, f1: 215 * p, vowel: 'eh', peak: 0.4 }] });
    noise(v, { t: e + 0.11, type: 'highpass', f: 5000, q: 0.7, peak: 0.1, a: 0.01, h: 0.12, d: 0.08 }); // "...sss"
  }
  if (o.n > 0) {
    // One of the onlookers, a little higher, a beat behind.
    say(v, { t: e + 0.14, vowel: 'oh', scale: NASAL * 1.05, f: 225 * x.j(0.06), f1: 260, glide: 0.2, peak: 0.28, a: 0.03, h: 0.1, d: 0.1 });
  }
  return v.end;
}

/**
 * A Midnight Release: the mob comes through the door. Trainers squeaking and thumping on the tiles,
 * four nasal men babbling excitedly over each other, and a cheap square-wave fanfare. Bigger mobs
 * (opts.n) are a little louder and longer.
 */
export function releaseSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const big = Math.min(1, Math.max(0, ((o.n | 0) - 12) / 24));
  // The fanfare first: the doors are open.
  const tunes = [[60, 64, 67, 72], [67, 71, 74, 79], [62, 65, 69, 74]];
  tunes[x.shape].forEach((m, i) => {
    const last = i === 3;
    tone(v, { t: t + i * 0.075, f: mtof(m), type: 'square', lp: 3000, peak: 0.08, a: 0.004, h: last ? 0.16 : 0.03, d: last ? 0.2 : 0.03 });
  });
  // The stampede: thumps and rubber squeaks, spread out.
  const steps = 14 + Math.round(big * 8);
  for (let i = 0; i < steps; i++) {
    const at = t + 0.2 + (i / steps) * 0.85 * x.j(0.08);
    noise(v, { t: at, type: 'lowpass', f: 380, q: 0.8, peak: 0.16 * x.between(0.6, 1), a: 0.002, d: 0.04 });
    if (x.r() < 0.35) tone(v, { t: at, f: x.between(1700, 2600), f1: x.between(2400, 3300), glide: 0.04, type: 'triangle', peak: 0.04, a: 0.004, d: 0.035 });
  }
  // Four of them talking at once, excited, a bit too loud.
  [150, 175, 205, 240].forEach((f0, k) => {
    const sylls = [];
    let s = t + 0.25 + k * 0.05 + x.r() * 0.05;
    const n = 4 + Math.floor(x.r() * 3);
    for (let i = 0; i < n; i++) {
      const len = x.between(0.05, 0.1);
      sylls.push({ t: s, len, f: f0 * x.j(0.12), f1: f0 * x.j(0.15), vowel: x.pick(['uh', 'ah', 'eh', 'oh', 'ee']), peak: 0.22 + big * 0.06 });
      s += len + x.between(0.01, 0.04);
    }
    babble(v, { sylls, scale: NASAL });
  });
  return v.end;
}
