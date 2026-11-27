// Sounds for 0.4 (stage 6): The Back and what it does for the shop floor. A part going down in The
// Back, a machine finishing a unit, a unit going up a Dumbwaiter, a building running dry, a dad
// snagging on Razor Wire, laying wire, reinforcing a crate, the event pay with its speed bonus,
// and MORE JUNK. Each is a play function shaped like the entries in effects.js (ctx, dest, t, opts)
// and returns the time it ends; opts.seed picks the version and nudges pitch and timing.
//
// They are meant to be lived with for an hour: the frequent ones (a unit made, a delivery) are
// short and quiet and only play while The Back is on screen (sound.js), and crowd.js spaces them.
import { voice, tone, noise, bell, mtof, vary } from './synth.js';
import { clang } from './newfx.js';

/**
 * A part bolted down in The Back: a short steel clunk on concrete and a ratchet tick, lower and
 * duller than the shop floor's place sound, so the two floors sound different.
 */
export function placeBack(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const p = x.j(0.06);
  tone(v, { t, f: 140 * p, f1: 70, glide: 0.08, peak: 0.22, a: 0.002, d: 0.12 });
  noise(v, { t, type: 'lowpass', f: 900 * p, q: 0.8, peak: 0.16, a: 0.002, d: 0.06 });
  clang(v, t + 0.005, [520, 610, 450][x.shape] * p, 0.05, 0.16, 3);
  // The ratchet: two or three ticks of a spanner.
  const ticks = 2 + (x.shape === 1 ? 1 : 0);
  for (let i = 0; i < ticks; i++) noise(v, { t: t + 0.07 + i * 0.045 * x.j(0.15), type: 'bandpass', f: 3200 * x.j(0.1), q: 6, peak: 0.07, a: 0.001, d: 0.012 });
  return v.end;
}

/**
 * A machine or Rebrander finishing a unit (only heard looking at The Back): a soft pneumatic "pff"
 * and a small high "tink" whose pitch says the brand that came out (Store Brand lowest, Platinum
 * highest, with a second shimmer).
 */
export function madeSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const tier = Math.max(1, Math.min(4, o.tier | 0 || 1));
  noise(v, { t, type: 'bandpass', f: 1800 * x.j(0.15), f1: 700, glide: 0.08, q: 1.2, peak: 0.035, a: 0.004, d: 0.07 });
  const f = mtof(84 + (tier - 1) * 3) * x.j(0.03);
  bell(v, { t: t + 0.03, f, ratio: 2.76, index: 0.5, peak: 0.045, d: 0.18 });
  if (tier >= 4) bell(v, { t: t + 0.09, f: f * 1.5, ratio: 2, index: 0.4, peak: 0.035, d: 0.3 });
  return v.end;
}

/**
 * A unit going up a Dumbwaiter (only heard looking at The Back): a very soft rope-and-pulley
 * "whoop" rising, and the hatch's tiny click.
 */
export function stockedSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 2);
  const p = x.j(0.08);
  tone(v, { t, f: 260 * p, f1: 640 * p, glide: 0.14, type: 'triangle', peak: 0.03, a: 0.01, h: 0.04, d: 0.08 });
  noise(v, { t, type: 'bandpass', f: 600, f1: 2000, glide: 0.14, q: 3, peak: 0.018, a: 0.01, h: 0.04, d: 0.06 });
  noise(v, { t: t + 0.16, type: 'bandpass', f: 4200 * p, q: 5, peak: 0.04, a: 0.001, d: 0.012 });
  return v.end;
}

/**
 * A building's supply has run out (heard from either floor): a warning that cannot be mistaken
 * for anything else in the store, a falling two-note "bom-bowm" on a hollow square wave (an empty
 * can knocked), then a dry rattle. Razor Wire running out (t 'wire') adds a low buzzer, because
 * the dads are free.
 */
export function stockOutSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 2);
  const p = x.j(0.03);
  const hi = mtof(69) * p, lo = mtof(62) * p;
  tone(v, { t, f: hi, type: 'square', lp: 1600, peak: 0.07, a: 0.004, h: 0.08, d: 0.06 });
  tone(v, { t: t + 0.16, f: lo, f1: lo * 0.94, glide: 0.25, type: 'square', lp: 1300, peak: 0.08, a: 0.004, h: 0.14, d: 0.16 });
  tone(v, { t, f: hi / 2, type: 'triangle', peak: 0.05, a: 0.004, h: 0.08, d: 0.06 });
  tone(v, { t: t + 0.16, f: lo / 2, type: 'triangle', peak: 0.06, a: 0.004, h: 0.14, d: 0.16 });
  // The empty can rattling.
  for (let i = 0; i < 3; i++) noise(v, { t: t + 0.45 + i * 0.05 * x.j(0.2), type: 'bandpass', f: 2400 * x.j(0.15), q: 3, peak: 0.035, a: 0.002, d: 0.025 });
  if (o.t === 'wire') tone(v, { t: t + 0.32, f: 92 * p, type: 'sawtooth', lp: 700, peak: 0.06, a: 0.01, h: 0.2, d: 0.08 });
  return v.end;
}

/**
 * A dad snagging on Razor Wire: a taut steel wire plucked (a bright twang that bends down and
 * buzzes as it rattles against its barbs) and a scrape of cloth. A dad bumping a wire that has
 * charged him already (free) twangs quieter.
 */
export function wireSnag(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, (o.level ?? 1) * (o.free ? 0.6 : 1));
  const x = vary(o.seed, 3);
  const f = [330, 294, 370][x.shape] * x.j(0.04);
  tone(v, { t, f, f1: f * 0.9, glide: 0.25, type: 'sawtooth', lp: 3200, peak: 0.1, a: 0.002, d: 0.45 });
  tone(v, { t, f: f * 2.01, f1: f * 1.8, glide: 0.25, type: 'triangle', peak: 0.05, a: 0.002, d: 0.3 });
  // The buzz against the barbs.
  tone(v, { t: t + 0.02, f: f * 0.5, type: 'square', lp: 1800, peak: 0.03, a: 0.004, h: 0.06, d: 0.18, vib: { rate: 34, depth: 18 } });
  noise(v, { t, type: 'highpass', f: 3800, q: 0.7, peak: 0.05, a: 0.002, d: 0.05 });
  // Cloth catching on a barb.
  noise(v, { t: t + 0.05, type: 'bandpass', f: 1400 * x.j(0.2), f1: 700, glide: 0.12, q: 1.4, peak: 0.05, a: 0.01, d: 0.1 });
  return v.end;
}

/** Laying a wire: a coil unspooling with a zip and two clicks of the barbs catching. */
export function wireLay(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 2);
  const p = x.j(0.05);
  noise(v, { t, type: 'bandpass', f: 1800 * p, f1: 5200 * p, glide: 0.18, q: 4, peak: 0.07, a: 0.01, h: 0.12, d: 0.05 });
  tone(v, { t, f: 500 * p, f1: 1300 * p, glide: 0.18, type: 'sawtooth', lp: 2500, peak: 0.025, a: 0.01, h: 0.12, d: 0.05 });
  for (const dt of [0.21, 0.27]) noise(v, { t: t + dt, type: 'bandpass', f: 4500 * x.j(0.1), q: 7, peak: 0.07, a: 0.001, d: 0.012 });
  tone(v, { t: t + 0.22, f: 1100 * p, f1: 990 * p, glide: 0.2, type: 'triangle', peak: 0.03, a: 0.002, d: 0.22 });
  return v.end;
}

/**
 * Reinforcing a Crate Stack: a steel strap slapped on and two rivets hammered home ("clank,
 * tok-tok"), a little heavier for each level (r).
 */
export function reinforceSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const r = Math.max(1, Math.min(8, o.r | 0 || 1));
  const p = x.j(0.05) * (1 - (r - 1) * 0.03);
  noise(v, { t, type: 'lowpass', f: 1400 * p, q: 0.8, peak: 0.16, a: 0.002, d: 0.05 }); // the wood
  clang(v, t, 300 * p, 0.08, 0.25, 4); // the strap
  tone(v, { t, f: 120 * p, f1: 60, glide: 0.1, peak: 0.16, a: 0.002, d: 0.12 });
  for (const dt of [0.13, 0.22]) {
    clang(v, t + dt * x.j(0.1), 1100 * p, 0.05, 0.08, 2);
    noise(v, { t: t + dt, type: 'bandpass', f: 2600, q: 3, peak: 0.06, a: 0.001, d: 0.02 });
  }
  return v.end;
}

/**
 * The sales event's pay (with its speed bonus, `share` 0 to 1 of the most there is): a till drawer
 * and a coin for the pay, then for a bonus a run of coins, longer the bigger it is; three quarters
 * of it or more and the run ends on a bright little jackpot bell.
 */
export function payout(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 2);
  const share = Math.max(0, Math.min(1, Number(o.share) || 0));
  // The drawer.
  noise(v, { t, type: 'bandpass', f: 900, f1: 500, glide: 0.1, q: 1.5, peak: 0.09, a: 0.004, d: 0.1 });
  tone(v, { t: t + 0.1, f: 180, f1: 140, glide: 0.04, peak: 0.1, a: 0.002, d: 0.06 });
  bell(v, { t: t + 0.12, f: 2350 * x.j(0.03), ratio: 2.3, index: 0.8, peak: 0.08, d: 0.25 });
  const coins = Math.round(share * 7);
  for (let i = 0; i < coins; i++) bell(v, { t: t + 0.22 + i * 0.06 * x.j(0.15), f: x.between(2600, 4200), ratio: 2.7, index: 0.7, peak: 0.05, d: 0.16 });
  if (share >= 0.75) {
    const end = t + 0.26 + coins * 0.06;
    [72, 76, 79, 84].forEach((m, i) => bell(v, { t: end + i * 0.07, f: mtof(m + 12), ratio: 2, index: 0.5, peak: 0.07, d: 0.4 }));
  }
  return v.end;
}

/** MORE JUNK bought: a coin into a slot, then a hatch thrown open and a rumble of junk down a chute. */
export function moreJunkSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 2);
  bell(v, { t, f: 3100 * x.j(0.04), ratio: 2.7, index: 0.6, peak: 0.07, d: 0.12 }); // the coin
  noise(v, { t: t + 0.06, type: 'bandpass', f: 2400, q: 4, peak: 0.05, a: 0.002, d: 0.03 });
  clang(v, t + 0.15, 210 * x.j(0.06), 0.07, 0.25, 3); // the hatch
  noise(v, { t: t + 0.18, type: 'lowpass', f: 700, f1: 300, glide: 0.5, q: 0.7, peak: 0.12, a: 0.03, h: 0.25, d: 0.25 }); // junk tumbling
  for (let i = 0; i < 5; i++) noise(v, { t: t + 0.2 + i * 0.09 * x.j(0.25), type: 'bandpass', f: x.between(400, 1300), q: 2, peak: 0.07, a: 0.002, d: 0.05 });
  return v.end;
}
