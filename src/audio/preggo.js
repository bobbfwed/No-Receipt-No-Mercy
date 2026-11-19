// Sounds for the Pregnant Lady and her babies. Same shape as the entries in effects.js: each is a
// play function (ctx, dest, t, opts) that returns the time it ends, and uses opts.seed the way the
// older sounds do (seed % shapes picks the version; pitch, length and timbre are nudged each play).
//
//   popSound   she ran out of patience and popped: a balloon bang, then a burst of babies (Octomom:
//              a double bang and more of them)
//   noPop      a Barcode Laser finished her, so nothing came out: the scanner's "nuh-uh" and a
//              balloon let go of, deflating. Smaller than the pop
//   waah       one baby gives up: a tiny wail. Short and quiet, because two dozen can come at once
//   babyTill   one baby reaches a till: one coin and a giggle (or a raspberry). Just as small
//   nursery    many babies at once (played over the single ones when they pile up, see crowd.js):
//              a few of them crying over each other and a rattle
// Her own voice, storming out and at the tills, is in shoppers.js with everyone else's.
import { voice, tone, noise, vary, say, babble } from './synth.js';

/** A baby's voice: formants shifted well above a child's (1.4). */
const BABY = 1.65;

/** One baby crying or giggling from `t`: a few syllables of babble. Returns when it stops. */
function bawl(v, t, x, f0, cry, n) {
  const sylls = [];
  let s = t;
  for (let i = 0; i < n; i++) {
    const len = cry ? x.between(0.13, 0.2) : x.between(0.05, 0.075);
    sylls.push(cry
      ? { t: s, len, f: f0 * x.j(0.05), f1: f0 * 0.78, vowel: i % 2 ? 'eh' : 'ah', peak: 0.24 }
      : { t: s, len, f: f0 * 1.3, f1: f0 * 1.5, vowel: 'ee', peak: 0.2 });
    s += len + (cry ? x.between(0.04, 0.07) : x.between(0.025, 0.045));
  }
  return babble(v, { sylls, scale: BABY });
}

/**
 * She popped. A balloon bang (a sharp crack and a low "fwump") and a party blower unrolling, then
 * the babies: three of them at once (Octomom: a double bang and four), crying (version 0),
 * giggling (1) or both (2).
 */
export function popSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const big = !!o.sup;
  const p = x.j(0.06) * (big ? 0.8 : 1);
  const bang = (at, k) => {
    noise(v, { t: at, type: 'bandpass', f: 1700 * p, q: 0.8, peak: 0.42 * k, a: 0.002, d: 0.045 });
    noise(v, { t: at, type: 'highpass', f: 4200, q: 0.7, peak: 0.14 * k, a: 0.002, d: 0.03 });
    tone(v, { t: at, f: 210 * p, f1: 52, glide: 0.09, peak: 0.34 * k, a: 0.002, d: 0.13 });
  };
  bang(t, 1);
  if (big) bang(t + 0.09 * x.j(0.15), 0.85);
  // The party blower: a reedy squawk that bends up as it unrolls.
  const pb = t + (big ? 0.12 : 0.05);
  if (x.shape !== 1) tone(v, { t: pb, f: 520 * p, f1: 760 * p, glide: 0.12, type: 'sawtooth', lp: 2600, peak: 0.07, a: 0.01, h: 0.08, d: 0.05, vib: { rate: 30, depth: 40 } });
  else tone(v, { t: pb, f: 1500 * p, f1: 500 * p, glide: 0.18, type: 'sine', peak: 0.1, a: 0.01, h: 0.12, d: 0.05 }); // slide whistle down
  // The babies.
  const b = t + (big ? 0.22 : 0.16);
  const voices = big ? 4 : 3;
  for (let k = 0; k < voices; k++) {
    const cry = x.shape === 0 || (x.shape === 2 && k % 2 === 0);
    bawl(v, b + k * 0.05 + x.r() * 0.04, x, (400 + k * 75) * x.j(0.06) * (big ? 0.95 : 1), cry, cry ? 2 + (x.r() < 0.5 ? 1 : 0) : 4 + (x.r() < 0.5 ? 1 : 0));
  }
  return v.end;
}

/**
 * A Barcode Laser took her last patience: no babies. The checkout scanner refusing an item ("bip-
 * bop", lower on the second; or an error buzz), then a balloon let go of, squealing as it deflates.
 * Small, so it is not mistaken for a pop.
 */
export function noPop(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const p = x.j(0.05);
  const beep = (at, hz, len) => tone(v, { t: at, f: hz, type: 'square', lp: 3000, peak: 0.09, a: 0.003, h: len, d: 0.03 });
  if (x.shape === 0) { beep(t, 1300 * p, 0.07); beep(t + 0.12, 820 * p, 0.13); }
  else if (x.shape === 1) { beep(t, 980 * p, 0.05); beep(t + 0.08, 980 * p, 0.05); beep(t + 0.16, 620 * p, 0.11); }
  else tone(v, { t, f: 150 * p, type: 'square', lp: 900, peak: 0.13, a: 0.004, h: 0.17, d: 0.03 });
  const s = t + 0.3;
  const len = (o.sup ? 0.34 : 0.24) * x.j(0.15);
  tone(v, { t: s, f: 640 * p, f1: 230 * p, glide: len + 0.05, type: 'sawtooth', lp: 1500, peak: 0.08, a: 0.01, h: len, d: 0.06, vib: { rate: 24, depth: 90 } });
  noise(v, { t: s, type: 'bandpass', f: 1000, f1: 600, glide: len, q: 1.5, peak: 0.05, a: 0.02, h: len, d: 0.06 });
  return v.end;
}

/** One baby gives up: a short "waah", an "eh-eh" or a hiccuping sob. Tiny and quiet. */
export function waah(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const p = x.j(0.1);
  if (x.shape === 0) {
    say(v, { t, vowel: 'ah', scale: BABY, f: 470 * p, f1: 360 * p, glide: 0.2, peak: 0.32, a: 0.02, h: 0.08, d: 0.08, vib: { rate: 9, depth: 60 } });
  } else if (x.shape === 1) {
    babble(v, { scale: BABY, sylls: [
      { t, len: 0.07, f: 520 * p, vowel: 'eh', peak: 0.28 },
      { t: t + 0.1, len: 0.11, f: 560 * p, f1: 440 * p, vowel: 'eh', peak: 0.3 },
    ] });
  } else {
    babble(v, { scale: BABY, sylls: [0, 1, 2].map((i) => ({ t: t + i * 0.075, len: 0.05, f: (430 - i * 25) * p, vowel: 'uh', peak: 0.28 })) });
  }
  return v.end;
}

/** One baby reaches a till: a single coin and a giggle ("hee", "hee-hee"), or a raspberry. */
export function babyTill(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const p = x.j(0.08);
  tone(v, { t, f: x.between(2500, 3300), type: 'triangle', peak: 0.11, a: 0.002, d: 0.07 });
  const s = t + 0.06;
  if (x.shape === 2) {
    tone(v, { t: s, f: 95 * p, f1: 80 * p, glide: 0.12, type: 'sawtooth', lp: 1100, peak: 0.12, a: 0.008, h: 0.07, d: 0.04, vib: { rate: 26, depth: 200 } });
  } else {
    for (let i = 0; i <= x.shape; i++) {
      tone(v, { t: s + i * 0.075, f: 1050 * p, f1: 1300 * p, glide: 0.04, type: 'triangle', peak: 0.1, a: 0.004, h: 0.02, d: 0.03, vib: { rate: 22, depth: 60 } });
    }
  }
  return v.end;
}

/** Many babies at once: three crying over each other, a giggle, and a rattle being shaken. */
export function nursery(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed);
  [[420, 0, true], [505, 0.06, true], [590, 0.13, false]].forEach(([f0, dt, cry]) => {
    bawl(v, t + dt + x.r() * 0.04, x, f0 * x.j(0.06), cry, cry ? 3 : 5);
  });
  for (let i = 0; i < 5; i++) noise(v, { t: t + 0.04 + i * 0.065 * x.j(0.2), type: 'bandpass', f: 3400 * x.j(0.1), q: 2, peak: 0.05, a: 0.002, d: 0.025 });
  return v.end;
}
