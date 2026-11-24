// Sounds for the cards that change how shoppers behave (0.3.01). Same shape as the entries in
// effects.js: each is a play function (ctx, dest, t, opts) that returns the time it ends, and uses
// opts.seed the way the older sounds do (seed % shapes picks the version; pitch, length and timbre
// are nudged each play).
//
//   litterSound  a pregnant Stray Dog bursts (spayed): a balloon bang, a startled yelp, then a few
//                puppies yipping at once (a Great Dane: lower, and more of them)
//   whimper      one puppy gives up: a tiny whine. Short and quiet: a litter can go at once
//   pupTill      one puppy reaches a till: one coin and a yap
//   kennel       many puppies at once (played over the single ones when they pile up)
//   drunkSound   a booze table turned a shopper into a Day Drinker (eightyproof): a glug, a
//                hiccup and a slurred "woo"
//   boughtSound  a shopper actually bought something (warranty): a till drawer, a bell and coins;
//                bigger for the TV Salesman's hundreds
//   trailSound   a dad falls in behind an Exhibitionist (eyesup): a low wolf whistle, or a "phwoar"
//   wrongway     a runaway child heads back for the entrance (wrongway): a lorry's reversing beeps
//                and a little "wheee"
//   petSound     shoppers stop to pet a support dog (supportdog): an "awww" and a happy pant
import { voice, tone, noise, bell, vary, say, babble } from './synth.js';
import { bark } from './shoppers.js';

/** A puppy's yip: a bark pitched right up and cut short. */
function yip(v, t, x, peak = 0.22, p = 1) {
  bark(v, t, peak, 2.3 * p * x.j(0.08));
}

/** A balloon bang: a sharp crack and a low "fwump". */
function bang(v, t, p, k = 1) {
  noise(v, { t, type: 'bandpass', f: 1600 * p, q: 0.8, peak: 0.38 * k, a: 0.002, d: 0.045 });
  tone(v, { t, f: 200 * p, f1: 50, glide: 0.09, peak: 0.3 * k, a: 0.002, d: 0.13 });
}

/**
 * A pregnant dog bursts. The bang, her startled yelp (version 0), a howl (1) or a whine (2), then
 * three puppies yipping over each other (a Great Dane, opts.sup: lower, and four).
 */
export function litterSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const big = !!o.sup;
  const p = x.j(0.05) * (big ? 0.8 : 1);
  bang(v, t, p);
  const s = t + 0.08;
  if (x.shape === 0) bark(v, s, 0.32, 1.35 * p);
  else if (x.shape === 1) tone(v, { t: s, f: 520 * p, f1: 780 * p, glide: 0.18, type: 'sawtooth', lp: 1800, peak: 0.1, a: 0.02, h: 0.1, d: 0.08, vib: { rate: 7, depth: 18 } });
  else tone(v, { t: s, f: 900 * p, f1: 620 * p, glide: 0.2, type: 'triangle', peak: 0.14, a: 0.01, h: 0.08, d: 0.06 });
  const pups = big ? 4 : 3;
  for (let k = 0; k < pups; k++) {
    for (let i = 0; i < 2; i++) yip(v, s + 0.2 + k * 0.06 + i * 0.13 + x.r() * 0.03, x, 0.2, (big ? 0.9 : 1) * (1 + k * 0.06));
  }
  return v.end;
}

/** One puppy gives up: a tiny falling whine, or two little whimpers. */
export function whimper(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const p = x.j(0.1);
  if (x.shape === 2) {
    for (let i = 0; i < 2; i++) tone(v, { t: t + i * 0.12, f: 1300 * p, f1: 1050 * p, glide: 0.07, type: 'triangle', peak: 0.2, a: 0.01, h: 0.02, d: 0.04 });
  } else {
    tone(v, { t, f: (x.shape ? 1500 : 1250) * p, f1: 800 * p, glide: 0.22, type: 'triangle', peak: 0.22, a: 0.015, h: 0.1, d: 0.06, vib: { rate: 11, depth: 40 } });
  }
  return v.end;
}

/** One puppy reaches a till: a coin and a yap (or two). */
export function pupTill(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  tone(v, { t, f: x.between(2500, 3300), type: 'triangle', peak: 0.1, a: 0.002, d: 0.07 });
  for (let i = 0; i <= (x.shape === 1 ? 1 : 0); i++) yip(v, t + 0.06 + i * 0.1, x, 0.16);
  return v.end;
}

/** Many puppies at once: yapping over each other, and claws skittering on the floor. */
export function kennel(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed);
  for (let k = 0; k < 7; k++) yip(v, t + k * 0.09 + x.r() * 0.05, x, 0.16, 1 + (k % 3) * 0.08);
  for (let i = 0; i < 8; i++) noise(v, { t: t + 0.02 + i * 0.07 * x.j(0.25), type: 'bandpass', f: 4200 * x.j(0.15), q: 3, peak: 0.04, a: 0.001, d: 0.015 });
  return v.end;
}

/** A shopper turned Day Drinker: a glug from the cup, a hiccup, and a slurred "woo" (or "heyyy"). */
export function drunkSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const p = x.j(0.06) * (o.sup ? 0.88 : 1);
  // Glug glug: low bubbly pops.
  for (let i = 0; i < 3; i++) tone(v, { t: t + i * 0.09, f: 180 * x.j(0.1), f1: 320, glide: 0.04, peak: 0.16, a: 0.004, d: 0.05 });
  const h = t + 0.32;
  // The hiccup: a quick gulp of air with a squeak.
  noise(v, { t: h, type: 'bandpass', f: 1200, q: 2, peak: 0.12, a: 0.003, d: 0.03 });
  tone(v, { t: h, f: 420 * p, f1: 640 * p, glide: 0.04, type: 'triangle', peak: 0.14, a: 0.003, d: 0.05 });
  const w = h + 0.14;
  if (x.shape === 0) say(v, { t: w, vowel: 'oo', f: 150 * p, f1: 230 * p, glide: 0.28, peak: 0.36, a: 0.03, h: 0.18, d: 0.12, vib: { rate: 5, depth: 14 } });
  else if (x.shape === 1) babble(v, { sylls: [{ t: w, len: 0.08, f: 150 * p, vowel: 'eh', peak: 0.34 }, { t: w + 0.12, len: 0.28, f: 170 * p, f1: 125 * p, vowel: 'ee', peak: 0.34 }] });
  else say(v, { t: w, vowel: 'ah', f: 125 * p, f1: 105 * p, glide: 0.3, peak: 0.34, a: 0.03, h: 0.2, d: 0.12, vib: { rate: 3, depth: 10 } });
  return v.end;
}

/**
 * A real sale at a stand: the till drawer sliding out, the bell, and coins (opts.v the dollars: the
 * TV Salesman's hundreds get a second bell and more coins).
 */
export function boughtSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const big = (o.v | 0) >= 100;
  noise(v, { t, type: 'bandpass', f: 900, f1: 1500, glide: 0.08, q: 1.2, peak: 0.12, a: 0.005, d: 0.06 });
  tone(v, { t: t + 0.08, f: 140, f1: 90, glide: 0.04, peak: 0.16, a: 0.002, d: 0.06 });
  const b = t + 0.12;
  bell(v, { t: b, f: [2093, 2349, 1976][x.shape], peak: 0.2, d: 0.45, ratio: 2.76, index: 1.2 });
  if (big) bell(v, { t: b + 0.11, f: 2637, peak: 0.16, d: 0.4, ratio: 2.76, index: 1.2 });
  const coins = big ? 6 : 3;
  for (let i = 0; i < coins; i++) {
    const f = x.between(2600, 3800);
    tone(v, { t: b + 0.05 + i * 0.045 * x.j(0.3), f, type: 'triangle', peak: 0.08, a: 0.002, d: 0.05 });
  }
  return v.end;
}

/** A dad falls in behind her: a low two-note wolf whistle (versions 0, 1) or a gravelly "phwoar". */
export function trailSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const p = x.j(0.05);
  if (x.shape < 2) {
    tone(v, { t, f: 900 * p, f1: 1900 * p, glide: 0.16, type: 'sine', peak: 0.16, a: 0.01, h: 0.02, d: 0.04 });
    const s = t + 0.24;
    tone(v, { t: s, f: 1500 * p, f1: (x.shape ? 1300 : 700) * p, glide: 0.32, type: 'sine', peak: 0.16, a: 0.01, h: 0.24, d: 0.06 });
    noise(v, { t, type: 'highpass', f: 5000, q: 0.7, peak: 0.02, a: 0.01, h: 0.5, d: 0.05 }); // breath
  } else {
    noise(v, { t, type: 'bandpass', f: 700, q: 1, peak: 0.08, a: 0.01, d: 0.05 }); // "ph"
    say(v, { t: t + 0.05, vowel: 'oh', f: 105 * p, f1: 85 * p, glide: 0.4, peak: 0.38, a: 0.03, h: 0.3, d: 0.12, vib: { rate: 4, depth: 6 } });
  }
  return v.end;
}

/** A runaway child heading back for the doors: three reversing beeps, then a high "wheee". */
export function wrongway(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const f = [1040, 1180, 960][x.shape];
  for (let i = 0; i < 3; i++) tone(v, { t: t + i * 0.2, f, type: 'square', lp: 2500, peak: 0.09, a: 0.004, h: 0.09, d: 0.02 });
  say(v, { t: t + 0.62, vowel: 'ee', scale: 1.4, f: 340 * x.j(0.06), f1: 460, glide: 0.25, peak: 0.26, a: 0.02, h: 0.15, d: 0.08 });
  return v.end;
}

/** Shoppers pet a support dog: a soft "awww" (two voices for opts.n of 2 or more) and a happy pant. */
export function petSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const p = x.j(0.06);
  say(v, { t, vowel: 'ah', f: (x.shape === 1 ? 230 : 180) * p, f1: 150 * p, glide: 0.4, peak: 0.3, a: 0.04, h: 0.25, d: 0.12 });
  if ((o.n | 0) >= 2) say(v, { t: t + 0.07, vowel: 'oh', f: 260 * p, f1: 200 * p, glide: 0.35, peak: 0.2, a: 0.04, h: 0.2, d: 0.1 });
  // The dog pants, happy: quick breaths.
  for (let i = 0; i < 4; i++) noise(v, { t: t + 0.3 + i * 0.1, type: 'bandpass', f: 1800 * x.j(0.1), q: 1.2, peak: 0.07, a: 0.01, d: 0.05 });
  return v.end;
}
