// Sounds for the boss (a big slow man in a suit who walks in every fifth sales event) and for the
// game being carried on after a win ("endless"). Same shape as the entries in effects.js: each is a
// play function (ctx, dest, t, opts) that returns the time it ends, and uses opts.seed the way the
// older sounds do (seed % shapes picks the version; pitch, length and timbre are nudged each play).
//
//   bossWave   the start of a sales event that has a boss: a funeral toll instead of the cheery ding-dong
//   bossIn     his corporate fanfare, grander with his tier (the CEO's is absurd)
//   pep        his pep talk, every seven seconds: short, varied and not loud, because it repeats
//   bossOut    the players made him give up: splutter, door slam, cash flourish
//   bossEscape he reached the tills (counts as two refunds): a run of till drawers and a smug chuckle
//   endless    "here we go again"
// His walk-out voice when he is not driven out is in shoppers.js (LEFT.boss).
import { voice, tone, noise, bell, brass, mtof, vary, say, babble } from './synth.js';
import { thud, slam, coins } from './shoppers.js';

const tierOf = (o) => Math.max(1, Math.min(4, (o.tier | 0) || 1));

/** A timpani hit: a boom that falls a little, with a slap of low noise. */
function timpani(v, t, f = 80, peak = 0.28) {
  tone(v, { t, f: f * 1.5, f1: f, glide: 0.07, peak, a: 0.003, d: 0.4 });
  noise(v, { t, type: 'lowpass', f: 320, q: 0.7, peak: peak * 0.45, a: 0.002, d: 0.09 });
}

/** A cymbal crash. */
function crash(v, t, peak = 0.07, d = 0.7) {
  noise(v, { t, type: 'highpass', f: 6500, q: 0.7, peak, a: 0.003, d });
  bell(v, { t, f: 4300, peak: peak * 0.5, d: d * 0.6, ratio: 3.4, index: 0.8 });
}

/** A snare roll: `n` quick hits that get louder. */
function roll(v, t, n, gap, peak = 0.05) {
  for (let i = 0; i < n; i++) noise(v, { t: t + i * gap, type: 'bandpass', f: 2200, q: 0.8, peak: peak * (0.5 + i / n), a: 0.002, d: 0.035 });
}

/** A cash register's "ka-CHING": the drawer shooting out, then the bell. */
function kaching(v, t, peak = 0.14) {
  noise(v, { t, type: 'bandpass', f: 1500, q: 1, peak: peak * 1.5, a: 0.003, d: 0.06 });
  tone(v, { t, f: 2093, type: 'triangle', peak, a: 0.002, d: 0.3 });
  bell(v, { t: t + 0.05, f: mtof(96), peak: peak * 0.8, d: 0.55, ratio: 2, index: 0.5 });
}

// ------------------------------------------------------------------------- a boss event begins

/**
 * The start of an event with a boss in it: instead of the cheerful tannoy chimes, a low tolling
 * bell and a flat dissonant "corporate" chord that sinks. `tier` makes it a little heavier.
 */
export function bossWave(v, t, o = {}) {
  const tier = tierOf(o);
  const bong = (dt, m, peak) => {
    bell(v, { t: t + dt, f: mtof(m), peak, d: 1.5, ratio: 1.41, index: 0.7 });
    tone(v, { t: t + dt, f: mtof(m - 12), peak: peak * 0.4, a: 0.004, d: 1.2 });
  };
  bong(0, 52, 0.3);
  bong(0.65, 46, 0.3); // a tritone below: the "bad news" interval
  // A low, sour brass chord underneath.
  const s = t + 1.1;
  for (const m of [34, 40, 41]) brass(v, { t: s, f: mtof(m), peak: 0.1 + tier * 0.01, a: 0.06, h: 0.5, d: 0.6, bright: 3, vib: { rate: 4, depth: 14, delay: 0.2 } });
  timpani(v, s, 62, 0.28);
  timpani(v, s + 0.5, 56, 0.3);
  // A faint tannoy "ding" that does not sound right.
  bell(v, { t: s + 0.9, f: mtof(76) * 0.97, peak: 0.1, d: 0.8, ratio: 4, index: 0.5 });
  return v.end;
}

// ------------------------------------------------------------------------- he walks in

/**
 * His fanfare. Tier 1 (Regional Manager): a brisk brassy "ta-ta-ta-TAA" with a cymbal. Tier 2 (Area
 * Director) adds timpani and a bigger chord; tier 3 (Vice President) a choir and a harp run; tier 4
 * (the CEO) all of that plus an air horn, kazoos, a slide whistle, a till and a cheering crowd.
 */
export function bossIn(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const tier = tierOf(o);
  const x = vary(o.seed, 1);
  const p = x.j(0.02);
  const b = (m, dt, h, peak = 0.14, d = 0.08) => brass(v, { t: t + dt, f: mtof(m) * p, peak, a: 0.02, h, d, bright: 5 });
  const chord = (ms, dt, h, d, peak) => {
    for (const m of ms) brass(v, { t: t + dt, f: mtof(m) * p, peak, a: 0.03, h, d, bright: 5, vib: { rate: 5.5, depth: 16, delay: 0.2 } });
  };
  // "ta-ta-ta-TAA", then (from tier 2) a rising answer.
  [0, 0.12, 0.24].forEach((dt) => b(67, dt, 0.05, 0.15));
  b(72, 0.36, tier === 1 ? 0.3 : 0.2, 0.17, tier === 1 ? 0.15 : 0.08);
  crash(v, t + 0.36, 0.06, 0.6);
  bell(v, { t: t + 0.36, f: mtof(91), peak: 0.07, d: 0.5, ratio: 2, index: 0.5 }); // a shiny corporate ding
  if (tier === 1) return v.end;

  timpani(v, t, 75, 0.2);
  timpani(v, t + 0.36, 70, 0.26);
  b(74, 0.82, 0.1, 0.15);
  b(76, 0.98, 0.1, 0.15);
  chord([72, 76, 79, 84], 1.14, tier === 2 ? 0.45 : 0.55, 0.4, 0.1);
  crash(v, t + 1.14, 0.07, 0.9);
  if (tier === 2) return v.end;

  // Vice President: a choir "aaah" under the last chord, a harp run up two octaves and a snare roll.
  roll(v, t + 0.55, 6, 0.045, 0.06);
  [0, 1, 2].forEach((i) => say(v, { t: t + 1.14, vowel: i === 1 ? 'ah' : 'oh', scale: [1, 1.4, 1.15][i], f: [262, 330, 392][i] * 0.5 * p * 2, peak: 0.12, a: 0.12, h: 0.55, d: 0.5, breath: 0.15, vib: { rate: 5.5, depth: 20, delay: 0.25 } }));
  for (let i = 0; i < 12; i++) tone(v, { t: t + 0.55 + i * 0.045, f: mtof(72 + [0, 4, 7, 12, 16, 19][i % 6] + (i >= 6 ? 12 : 0)), type: 'triangle', peak: 0.06, a: 0.003, d: 0.25 });
  if (tier === 3) return v.end;

  // The CEO. Everything is too much: a second, higher chord, an air horn, kazoos, a slide whistle,
  // a till going off, a crowd cheering and then one more cymbal for luck.
  const s = t + 1.75;
  chord([79, 84, 88, 91], 1.75, 0.5, 0.45, 0.1);
  crash(v, s, 0.08, 1.0);
  for (const hz of [466, 587, 698]) tone(v, { t: t + 1.2, f: hz * p, type: 'sawtooth', lp: 2400, peak: 0.05, a: 0.01, h: 0.4, d: 0.12 }); // the air horn
  noise(v, { t: t + 1.2, type: 'bandpass', f: 1800, q: 0.8, peak: 0.05, a: 0.02, h: 0.35, d: 0.1 });
  tone(v, { t: t + 1.45, f: 500 * p, f1: 2800 * p, glide: 0.4, peak: 0.08, a: 0.01, h: 0.2, d: 0.06, vib: { rate: 7, depth: 30, delay: 0.1 } }); // slide whistle
  [0, 0.15, 0.3].forEach((dt, i) => say(v, { t: t + 1.75 + dt, vowel: 'eh', scale: 1.4, type: 'sawtooth', f: mtof([79, 84, 88][i]) * p, peak: 0.12, a: 0.01, h: 0.08, d: 0.06, breath: 0.3 })); // kazoos
  kaching(v, t + 2.2, 0.12);
  kaching(v, t + 2.42, 0.12);
  babble(v, { scale: 1.1, sylls: [{ t: t + 2.1, len: 0.5, f: 180 * x.j(0.1), f1: 230, vowel: 'ah', peak: 0.3 }] }); // "yaaay"
  babble(v, { scale: 0.95, sylls: [{ t: t + 2.15, len: 0.5, f: 120 * x.j(0.1), f1: 150, vowel: 'oh', peak: 0.3 }] });
  for (let i = 0; i < 7; i++) noise(v, { t: t + 2.1 + i * 0.07 * x.j(0.4), type: 'bandpass', f: 1900 * x.j(0.2), q: 0.8, peak: 0.07, a: 0.002, d: 0.03 }); // applause
  return v.end;
}

// ------------------------------------------------------------------------- his pep talk

/**
 * "Come ON, people, SYNERGY!": a blustering baritone in four or five quick syllables ending in a
 * bellow, with a referee's whistle, an air horn or a pair of motivational claps; and, if it
 * encouraged anyone (n > 0), the crowd's "yeah!" (more voices, and applause, for more of them).
 * Short and quiet, because he does it every seven seconds.
 */
export function pep(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const p = x.j(0.1);
  const n = o.n | 0;
  const count = 4 + (x.r() < 0.5 ? 1 : 0);
  const sylls = [];
  let s = t;
  for (let i = 0; i < count; i++) {
    const last = i === count - 1;
    const len = last ? 0.2 : x.between(0.05, 0.08);
    sylls.push({ t: s, len, f: (118 + i * 6) * p, f1: last ? 165 * p : undefined, vowel: last ? 'ah' : x.pick(['eh', 'uh', 'oh', 'ih']), peak: last ? 0.48 : 0.36 });
    s += len + x.between(0.015, 0.04);
  }
  babble(v, { sylls, scale: 0.95 });
  const e = s + 0.02;
  if (x.shape === 0) {
    tone(v, { t: e, f: 2900 * x.j(0.04), type: 'sine', peak: 0.07, a: 0.01, h: 0.13, d: 0.04, vib: { rate: 28, depth: 90 } });
    noise(v, { t: e, type: 'bandpass', f: 2900, q: 3, peak: 0.025, a: 0.01, h: 0.13, d: 0.04 });
  } else if (x.shape === 1) {
    tone(v, { t: e, f: 440 * x.j(0.03), type: 'sawtooth', lp: 2000, peak: 0.045, a: 0.01, h: 0.12, d: 0.06 });
    tone(v, { t: e, f: 554 * x.j(0.03), type: 'sawtooth', lp: 2000, peak: 0.035, a: 0.01, h: 0.12, d: 0.06 });
  } else {
    [0, 0.11].forEach((dt) => noise(v, { t: e + dt, type: 'bandpass', f: 1700 * x.j(0.15), q: 0.9, peak: 0.1, a: 0.002, d: 0.035 }));
  }
  if (n > 0) {
    const voices = Math.min(3, 1 + Math.floor((n - 1) / 3));
    const at = e + 0.12;
    for (let i = 0; i < voices; i++) {
      const f = [135, 190, 240][i] * x.j(0.08);
      say(v, { t: at + i * 0.03, vowel: 'eh', scale: [1, 1.15, 1.3][i], f, f1: f * 1.25, glide: 0.12, peak: 0.22, a: 0.01, h: 0.07, d: 0.1, breath: 0.2 }); // "yeah!"
    }
    if (n >= 5) for (let i = 0; i < 4; i++) noise(v, { t: at + 0.1 + i * 0.065 * x.j(0.3), type: 'bandpass', f: 1900 * x.j(0.2), q: 0.8, peak: 0.05, a: 0.002, d: 0.03 });
  }
  return v.end;
}

// ------------------------------------------------------------------------- the players beat him

/**
 * The payoff. His outraged splutter ("buh-buh-BUH-bwah!", ending in a squeak), a raspberry or
 * "I'll have your JOBS", the shop door slammed behind him, then the cash coming in: a rising run
 * of coins and a till (a second run and a cymbal for the higher tiers, because they pay more).
 */
export function bossOut(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const tier = tierOf(o);
  const x = vary(o.seed, 3);
  const p = x.j(0.07);
  if (x.shape === 0) {
    babble(v, { scale: 0.95, sylls: [
      { t, len: 0.06, f: 130 * p, vowel: 'uh', peak: 0.4 },
      { t: t + 0.09, len: 0.06, f: 135 * p, vowel: 'uh', peak: 0.4 },
      { t: t + 0.18, len: 0.11, f: 150 * p, vowel: 'ah', peak: 0.6 },
      { t: t + 0.33, len: 0.2, f: 190 * p, f1: 340 * p, vowel: 'eh', peak: 0.55 },
    ] });
  } else if (x.shape === 1) {
    // A wet raspberry, then "you'll hear from my LAWYERS".
    tone(v, { t, f: 90 * p, f1: 70 * p, glide: 0.25, type: 'sawtooth', lp: 700, peak: 0.25, a: 0.01, h: 0.15, d: 0.08, vib: { rate: 24, depth: 220 } });
    noise(v, { t, type: 'bandpass', f: 800, q: 0.8, peak: 0.12, a: 0.01, h: 0.15, d: 0.08 });
    babble(v, { scale: 0.95, sylls: [
      { t: t + 0.3, len: 0.07, f: 135 * p, vowel: 'ah', peak: 0.45 },
      { t: t + 0.4, len: 0.08, f: 150 * p, vowel: 'oh', peak: 0.5 },
      { t: t + 0.51, len: 0.14, f: 220 * p, f1: 160 * p, vowel: 'er', peak: 0.6 },
    ] });
  } else {
    // A long strangled "NNNNGH", rising, then a whimper.
    say(v, { t, vowel: 'uh', f: 100 * p, f1: 300 * p, glide: 0.4, peak: 0.55, a: 0.04, h: 0.1, d: 0.1, vib: { rate: 14, depth: 100 }, breath: 0.4 });
    say(v, { t: t + 0.55, vowel: 'oo', scale: 1.2, f: 340 * p, f1: 200 * p, glide: 0.2, peak: 0.3, a: 0.02, h: 0.05, d: 0.1, vib: { rate: 9, depth: 50 } });
  }
  const door = t + [0.62, 0.72, 0.8][x.shape];
  slam(v, door, 0.5);
  // The money: a run up the scale, then the till and its bell.
  const cash = door + 0.2;
  const notes = [72, 76, 79, 84, 88, 91, 96];
  const steps = 4 + tier;
  for (let i = 0; i < steps; i++) {
    const m = notes[Math.min(notes.length - 1, Math.floor(i * notes.length / steps))];
    tone(v, { t: cash + i * 0.05 * x.j(0.1), f: mtof(m), type: 'triangle', peak: 0.13, a: 0.003, d: 0.12 });
  }
  const k = cash + steps * 0.05 + 0.03;
  kaching(v, k, 0.17);
  if (tier >= 2) { coins(v, k + 0.12, x, 4 + tier); }
  if (tier >= 3) crash(v, k + 0.05, 0.07, 0.8);
  if (tier >= 4) kaching(v, k + 0.3, 0.14);
  return v.end;
}

// ------------------------------------------------------------------------- he reaches the tills

/**
 * A disaster (he counts as two refunds toward the limit, TUNE.bossRefunds): five till drawers
 * slam open one after another, each with its own "cha-ching" (a
 * rubber stamp thumps on the first), then the boss chuckles smugly. Three versions of the laugh:
 * "heh heh heh", a deep "hoo-hoo-hoo", and a long evil "ha-HAAA". Higher tiers rumble underneath.
 */
export function bossEscape(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const tier = tierOf(o);
  const x = vary(o.seed, 3);
  const p = x.j(0.06);
  thud(v, t, 0.3, 90); // the stamp: REFUNDED
  for (let i = 0; i < 5; i++) {
    const at = t + 0.04 + i * 0.12 * x.j(0.1);
    noise(v, { t: at, type: 'bandpass', f: 1400 * x.j(0.1), q: 1, peak: 0.2, a: 0.003, d: 0.05 }); // the drawer
    thud(v, at, 0.1, 140);
    bell(v, { t: at + 0.03, f: mtof(84 + [0, 4, 7, 4, 9][i]) * x.j(0.01), peak: 0.1, d: 0.35, ratio: 2, index: 0.5 }); // the bell
  }
  if (tier >= 3) tone(v, { t, f: 60, f1: 38, glide: 0.8, peak: 0.2, a: 0.01, h: 0.3, d: 0.4 });
  const c = t + 0.82;
  if (x.shape === 0) {
    const sylls = [0, 1, 2, 3].map((i) => ({ t: c + i * 0.16, len: 0.075, f: (150 - i * 8) * p, vowel: 'eh', peak: 0.45 - i * 0.04 }));
    babble(v, { scale: 0.95, sylls });
  } else if (x.shape === 1) {
    const sylls = [0, 1, 2].map((i) => ({ t: c + i * 0.2, len: 0.12, f: (105 - i * 4) * p, f1: (95 - i * 4) * p, vowel: 'oo', peak: 0.5 }));
    babble(v, { scale: 0.95, sylls });
    say(v, { t: c + 0.62, vowel: 'mm', f: 100 * p, f1: 85 * p, peak: 0.4, a: 0.02, h: 0.1, d: 0.12 });
  } else {
    babble(v, { scale: 0.95, sylls: [
      { t: c, len: 0.09, f: 160 * p, vowel: 'ah', peak: 0.4 },
      { t: c + 0.14, len: 0.5, f: 230 * p, f1: 140 * p, vowel: 'ah', peak: 0.55 },
    ] });
    tone(v, { t: c + 0.14, f: 460 * p, f1: 280 * p, glide: 0.5, type: 'sawtooth', lp: 1500, peak: 0.03, a: 0.04, h: 0.3, d: 0.15, vib: { rate: 12, depth: 80 } });
  }
  return v.end;
}

// ------------------------------------------------------------------------- the game goes on

/**
 * A won game carried on: a tape rewinding ("vvvwip"), then a weary "da-DUM, da-DUUM" on low brass
 * with a timpani and a tannoy ding: here we go again.
 */
export function endless(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 1);
  const p = x.j(0.03);
  tone(v, { t, f: 1500 * p, f1: 160 * p, glide: 0.28, type: 'sawtooth', lp: 3000, peak: 0.08, a: 0.01, h: 0.2, d: 0.05, vib: { rate: 30, depth: 100 } });
  noise(v, { t, type: 'bandpass', f: 4000, f1: 500, glide: 0.28, q: 3, peak: 0.1, a: 0.01, h: 0.2, d: 0.05 });
  const s = t + 0.38;
  brass(v, { t: s, f: mtof(55) * p, peak: 0.2, a: 0.02, h: 0.08, d: 0.06, bright: 4 });
  brass(v, { t: s + 0.2, f: mtof(55) * p, peak: 0.22, a: 0.02, h: 0.08, d: 0.06, bright: 4 });
  brass(v, { t: s + 0.4, f: mtof(60) * p, f1: mtof(58) * p, glide: 0.5, peak: 0.24, a: 0.03, h: 0.3, d: 0.25, bright: 4, vib: { rate: 5, depth: 18, delay: 0.15 } });
  timpani(v, s, 68, 0.22);
  timpani(v, s + 0.4, 62, 0.26);
  bell(v, { t: s + 0.4, f: mtof(76), peak: 0.14, d: 0.7, ratio: 4, index: 0.5 });
  return v.end;
}
