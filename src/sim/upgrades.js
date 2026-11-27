// A building's levels. A security building's strength comes in separate tracks:
//   dmg  damage, or its main effect   spd  speed   rng  range
// (A fourth, dur, took Duct Tape until 0.4.01; reinforcing with cash does its job now.)
// Which tracks a kind has, and what a level does in each, is data in BUILD[k].up (constants.js).
//
// From 0.4 the levels come only from the building's stock of supplies from The Back (`b.s`, see
// back.js): a stocked track works at the level its supply's tier stands for (BACK.tierLevel). Bought
// upgrades are gone (0.4, the owner's decision: supplies replace them), so a building's worth in
// money is only the price paid for it, and an unstocked building works at its plain numbers.
// The Wet Floor Sign is the exception since 0.4.01 (the owner: it should not need feeding): it takes
// no supplies, and is upgraded with cash instead, a few levels that never run out (upgradeCost).
import { BUILD, TUNE, BACK } from './constants.js';
// (cards.js imports from this file too. That is safe: neither uses the other while loading.)
import { cardStats, priceMul } from './cards.js';

/** Every track, in the order they are listed everywhere. */
const TRACKS = ['dmg', 'spd', 'rng'];

/** The tracks a kind of building has, in the order dmg, spd, rng (empty if none). */
export function tracksOf(k) {
  const up = BUILD[k] && BUILD[k].up;
  return up ? TRACKS.filter((t) => up[t]) : [];
}

/**
 * The level a building's stock gives one track: BACK.tierLevel of the tier of its oldest run of
 * that supply, 0 with none. (Razor Wire has no level: it is used by dads, see wire.js.)
 */
export function stockLevel(b, track) {
  const run = track !== 'wire' && b && b.s && b.s[track];
  return run && run.length ? BACK.tierLevel[run[0]] | 0 : 0;
}

/**
 * The level one track works at, which is what statsOf reads: for a kind upgraded with cash (0.4.01:
 * BUILD[k].upgrade, the Wet Floor Sign) the level its upgrades give, `upgrade.level[b.u]`, on every
 * track it has; for everything else the level its stock gives (stockLevel).
 */
export function levelIn(b, track) {
  const up = b && BUILD[b.k] && BUILD[b.k].upgrade;
  if (!up) return stockLevel(b, track);
  return BUILD[b.k].up && BUILD[b.k].up[track] ? up.level[Math.min(up.max, b.u | 0)] | 0 : 0;
}

/**
 * What the next cash upgrade costs for building b (the `upgrade` command, 0.4.01; only the Wet Floor
 * Sign has BUILD[k].upgrade): round(cost * grow ** u), times the cards that change that kind's
 * price (priceMul), whole dollars and never under one; 0 at the top level, or for anything that
 * cannot be upgraded. Pass the game's state wherever there is one, so the cards count.
 */
export function upgradeCost(b, state = null) {
  const up = b && BUILD[b.k] && BUILD[b.k].upgrade;
  if (!up) return 0;
  const u = b.u | 0;
  if (u >= up.max) return 0;
  const m = state ? priceMul(state, b.k) : 1;
  return Math.max(1, Math.round(up.cost * up.grow ** u * m));
}

/** A building's overall level, for the badge: 1 plus the level every track works at. */
export function levelOf(b) {
  let n = 1;
  if (b) for (const t of tracksOf(b.k)) n += levelIn(b, t);
  return n;
}

/**
 * What was spent on a building: what was paid for it (`c`, where that differs from its kind's
 * price: a card changed the price, or the building was reinforced, 0.4, or upgraded, 0.4.01). Selling back and
 * rebuilding are shares of this. Stock is never money.
 */
export const spentOn = (b) => b.c ?? BUILD[b.k].cost;

/**
 * What the next level of reinforcement costs for building b (the `reinforce` command: Crate Stacks
 * since 0.4, every security building since 0.4.01): round(cost * grow ** r) from BUILD[k].reinforce,
 * times the cards that change that kind's price (priceMul), whole dollars and never under one; 0
 * once it has the top level, or for anything that cannot be reinforced. The one place this price is
 * worked out. Pass the game's state wherever there is one, so the cards count.
 */
export function reinforceCost(b, state = null) {
  const rf = b && BUILD[b.k] && BUILD[b.k].reinforce;
  if (!rf) return 0;
  const r = b.r | 0;
  if (r >= rf.max) return 0;
  const m = state ? priceMul(state, b.k) : 1;
  return Math.max(1, Math.round(rf.cost * rf.grow ** r * m));
}

/**
 * A building's working numbers with its stock applied (see levelIn). `b` may be a building from
 * the grid or any `{ k }` or `{ k, s }`, so tables can be worked out for any stock. Only the
 * numbers its kind uses are meaningful:
 *   dmg, range, cd       towers (cd in seconds between shots; the Barcode Laser's range is its beam)
 *   width                Barcode Laser: how far either side of the beam's centre line it hits
 *   range, secs          free samples (how long a sample stops a shopper)
 *   range, secs, stopLeft, rushMul   salesman: reach, how long a shopper watches, what is left
 *                        of each shopper's chance not to stop (it stops with 1 - (1 - stop) *
 *                        stopLeft), and what each chance to hurry past is multiplied by
 *   slow, slip, slipDmg  wet floor sign (speed multiplier, chance a dad slips, patience he loses)
 *   hits                 every building: gym bro hits it survives in one wave (a reinforced
 *                        building takes one more for each level `r`: see wreck in step.js)
 * With `state`, the game's cards are applied too (cardStats in cards.js: the premature and
 * artisanal cards); the simulation always passes it. Without, the plain numbers (the handbook).
 */
export function statsOf(b, state = null) {
  const def = BUILD[b.k], up = def.up || {};
  const lv = (t) => levelIn(b, t);
  const mul = (t) => (up[t] && up[t].mul ? up[t].mul ** lv(t) : 1);
  const add = (t) => (up[t] && up[t].add ? up[t].add * lv(t) : 0);
  const d = up.dmg || {};
  const st = {
    dmg: (def.dmg || 0) * mul('dmg'),
    range: (def.range || 0) + add('rng'),
    cd: (def.cd || 0) / mul('spd'),
    width: def.width || 0,
    secs: (b.k === 'salesman' ? TUNE.stopSecs : TUNE.sampleSecs) * mul('dmg'),
    stopLeft: (d.keep || 1) ** lv('dmg'),
    rushMul: (d.rush || 1) ** lv('dmg'),
    slow: TUNE.wetSlow * (d.slow || 1) ** lv('dmg'),
    slip: Math.min(0.95, TUNE.slipChance + (d.slip || 0) * lv('dmg')),
    slipDmg: TUNE.slipDmg * (b.k === 'wetfloor' ? mul('dmg') : 1),
    // (A reinforced building, 0.4: one more hit for each level, `r`.)
    hits: (def.hits || 1) + (b.r | 0),
  };
  return state ? cardStats(state, b, st) : st;
}

/**
 * What it costs to put back a building from the rubble (see state.rubble), for a player with
 * `cash`: TUNE.rebuildShare of what had been paid for it (spentOn), all or nothing (0.4: with
 * bought upgrades gone there is no cheaper rebuild with fewer levels).
 * @returns {{pay: number}|null} null if he cannot afford it
 */
export function rebuildDeal(r, cash) {
  const pay = Math.floor(spentOn(r) * TUNE.rebuildShare);
  return cash >= pay ? { pay } : null;
}
