// Sounds for the deal of the game's cards (0.3.01). Same shape as the entries in effects.js: each is
// a play function (ctx, dest, t, opts) that returns the time it ends; opts.seed picks the version
// (seed % shapes) and nudges pitch, length and timbre; opts.i (the card's place in the hand, 0 to 4)
// moves the pitch, so five cards in a row do not sound alike. The deal screen (src/ui/deal.js)
// plays them from the state, so a player who joins mid-deal does not hear cards he did not see land.
//
//   cardDealSound  the deal starts: a dealer's riffle shuffle, the bridge, and the deck knocked square
//   cardInSound    a card flies in spinning (a fluttering whoosh) and lands (opts.side):
//                    bad   a thud, glass cracking and a sour low brass "bwom-bwommm"
//                    good  a till "ka-ching", coins pouring out and a bright run of bells up
//                    odd   a slide whistle that cannot make its mind up and a boing
//   cardSlotSound  a card snaps into its slot: a little "shff" and a click
//   cardHandSound  the hand is complete: the cards fanned out, then a cheap game-show "ta-da" with
//                  one note wrong
import { voice, tone, noise, bell, brass, mtof, vary } from './synth.js';

/** A card spinning through the air: a fluttering whoosh that rises and falls. Returns its end. */
function whoosh(v, t, x, len, f) {
  const n = 9;
  for (let k = 0; k < n; k++) {
    const at = t + (k / n) * len * 0.92 * x.j(0.03);
    const pk = 0.03 + 0.07 * Math.sin((Math.PI * (k + 0.5)) / n);
    noise(v, { t: at, type: 'bandpass', f: f * (0.75 + k * 0.09) * x.j(0.06), q: 2.4, peak: pk, a: 0.008, d: 0.045 });
  }
  noise(v, { t, type: 'bandpass', f: f * 0.6, f1: f * 2.1, glide: len * 0.75, q: 0.8, peak: 0.1, a: len * 0.55, d: len * 0.4 });
  return t + len;
}

/** A few quick crackles: glass (or a card's laminate) cracking. */
function crack(v, t, x, n = 6) {
  for (let k = 0; k < n; k++) {
    noise(v, { t: t + k * 0.018 * x.j(0.4), type: 'highpass', f: x.between(3500, 7000), q: 1.2, peak: x.between(0.08, 0.16), a: 0.002, d: 0.02 });
  }
}

/** One coin landing: a short two-tone clink. */
function clink(v, t, x, peak = 0.08) {
  const f = x.between(2600, 3800);
  tone(v, { t, f, type: 'triangle', peak, a: 0.002, d: 0.07 });
  tone(v, { t, f: f * 1.48, type: 'triangle', peak: peak * 0.5, a: 0.002, d: 0.05 });
}

/** A riffle: many tiny card clicks, quicker in the middle. */
function riffle(v, t, x, len = 0.42, n = 22, peak = 0.07) {
  for (let k = 0; k < n; k++) {
    const u = k / n;
    const at = t + len * (u + 0.08 * Math.sin(u * Math.PI)) * x.j(0.02);
    noise(v, { t: at, type: 'bandpass', f: x.between(2200, 4200), q: 3, peak: peak * x.between(0.6, 1), a: 0.002, d: 0.014 });
  }
  return t + len;
}

/** The deal starts: riffle, bridge (a soft purr), riffle again, and the deck knocked on the table. */
export function cardDealSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 2);
  let e = riffle(v, t, x, 0.34, 18);
  noise(v, { t: e, type: 'bandpass', f: 1800, f1: 900, glide: 0.18, q: 1.2, peak: 0.06, a: 0.03, d: 0.15 });
  e = riffle(v, e + 0.2, x, 0.3, 16);
  if (x.shape === 1) e = riffle(v, e + 0.06, x, 0.2, 10, 0.05);
  // Knocked square: two dull taps.
  for (const dt of [0.08, 0.17]) {
    tone(v, { t: e + dt, f: 170 * x.j(0.05), f1: 110, glide: 0.06, peak: 0.28, a: 0.002, d: 0.08 });
    noise(v, { t: e + dt, type: 'lowpass', f: 900, q: 0.7, peak: 0.12, a: 0.002, d: 0.04 });
  }
  return v.end;
}

/**
 * A card flies in and lands. opts.side ('bad', 'good', 'odd') picks the landing; opts.i (0 to 4)
 * moves its pitch; the version (seed) changes the detail.
 */
export function cardInSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const i = Math.max(0, Math.min(4, o.i | 0));
  const land = whoosh(v, t, x, 0.62, 800 + i * 90) + 0.04;
  if (o.side === 'bad') {
    // Thud, crack, then the sour brass, a little lower for each bad card.
    const m = 40 - i - x.shape;
    tone(v, { t: land, f: 110, f1: 45, glide: 0.18, peak: 0.42, a: 0.003, d: 0.25 });
    noise(v, { t: land, type: 'lowpass', f: 500, q: 0.8, peak: 0.2, a: 0.002, d: 0.08 });
    crack(v, land + 0.02, x, 5 + x.shape);
    brass(v, { t: land + 0.1, f: mtof(m), peak: 0.16, a: 0.02, h: 0.12, d: 0.08, bright: 3 });
    brass(v, { t: land + 0.34, f: mtof(m - 1), f1: mtof(m - 2.5), glide: 0.6, peak: 0.18, a: 0.03, h: 0.35, d: 0.25, bright: 3, wah: { rate: 5, depth: 120, delay: 0.1 } });
  } else if (o.side === 'good') {
    // Ka-ching, a spill of coins, and a run of bells up from a note that rises card by card.
    const m = 72 + i * 2 + [0, 2, 4][x.shape];
    noise(v, { t: land, type: 'bandpass', f: 1500, q: 1, peak: 0.16, a: 0.003, d: 0.05 });
    bell(v, { t: land + 0.02, f: 2093, peak: 0.12, d: 0.35, ratio: 2, index: 0.7 });
    for (let k = 0; k < 7; k++) clink(v, land + 0.08 + k * 0.045 * x.j(0.3), x, 0.07 - k * 0.006);
    [0, 4, 7, 12].forEach((st, k) => bell(v, { t: land + 0.12 + k * 0.07, f: mtof(m + st), peak: 0.1 + k * 0.015, d: k === 3 ? 0.6 : 0.25, ratio: 2, index: 0.6 }));
  } else {
    // A slide whistle that goes up, thinks better of it, goes down, and a boing.
    const f = mtof(76 + i + x.shape * 2);
    tone(v, { t: land, f, f1: f * 1.9, glide: 0.18, type: 'sine', peak: 0.16, a: 0.01, h: 0.12, d: 0.05, vib: { rate: 9, depth: 40 } });
    tone(v, { t: land + 0.36, f: f * 1.7, f1: f * 0.7, glide: 0.3, type: 'sine', peak: 0.15, a: 0.01, h: 0.2, d: 0.08, vib: { rate: 7, depth: 60 } });
    tone(v, { t: land + 0.75, f: 330 * x.j(0.08), f1: 150, glide: 0.25, type: 'triangle', peak: 0.3, a: 0.003, d: 0.3, vib: { rate: 22, depth: 90 } });
  }
  return v.end;
}

/** A card snaps into its slot: "shff", a click, a little thud; higher for each slot along. */
export function cardSlotSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 3);
  const i = Math.max(0, Math.min(4, o.i | 0));
  noise(v, { t, type: 'bandpass', f: 2600 + i * 250, f1: 4200, glide: 0.06, q: 1.4, peak: 0.12, a: 0.01, d: 0.05 });
  const at = t + 0.06;
  noise(v, { t: at, type: 'highpass', f: 3500 * x.j(0.1), q: 0.7, peak: 0.16, a: 0.002, d: 0.012 });
  tone(v, { t: at, f: (220 + i * 25) * x.j(0.05), f1: 140, glide: 0.05, peak: 0.24, a: 0.002, d: 0.07 });
  return v.end;
}

/** The hand is complete: the cards fanned out, then a game-show "ta-da" with one note wrong. */
export function cardHandSound(ctx, dest, t, o = {}) {
  const v = voice(ctx, dest, o.level);
  const x = vary(o.seed, 2);
  // The last card goes in, then the fan.
  cardSlotClick(v, t, x);
  const e = riffle(v, t + 0.12, x, 0.28, 12, 0.06) + 0.05;
  const b = { peak: 0.12, a: 0.015, bright: 5 };
  brass(v, { ...b, t: e, f: mtof(67), h: 0.06, d: 0.05 });
  // "Ta-DAAA", with the major third flattened: the store is not pleased for you.
  for (const m of [72, x.shape ? 75 : 76, 79, 84]) brass(v, { ...b, peak: 0.09, t: e + 0.14, f: mtof(m), h: 0.45, d: 0.35, vib: { rate: 5.5, depth: 14, delay: 0.2 } });
  bell(v, { t: e + 0.14, f: mtof(96), peak: 0.06, d: 0.8, ratio: 3.5, index: 0.8 });
  noise(v, { t: e + 0.14, type: 'highpass', f: 7000, peak: 0.05, a: 0.003, d: 0.6 });
  return v.end;
}

/** The click of a card going in (shared with cardHandSound). */
function cardSlotClick(v, t, x) {
  noise(v, { t, type: 'highpass', f: 3500 * x.j(0.1), q: 0.7, peak: 0.14, a: 0.002, d: 0.012 });
  tone(v, { t, f: 330, f1: 160, glide: 0.05, peak: 0.2, a: 0.002, d: 0.07 });
}
