// Upgrades. A building's upgrades come in separate tracks, bought one level at a time:
//   dmg  damage, or its main effect   spd  speed   rng  range   dur  durability (gym bro hits)
// Which tracks a kind has, what a level does and what it costs is data in BUILD[k].up
// (constants.js). Each level of a track costs more than the last, so a full floor still leaves
// something to spend money on.
import { BUILD, TUNE } from './constants.js';
// (cards.js imports from this file too. That is safe: neither uses the other while loading.)
import { cardStats } from './cards.js';

/** Every track, in the order they are listed everywhere. */
export const TRACKS = ['dmg', 'spd', 'rng', 'dur'];

/** The tracks a kind of building has, in the order dmg, spd, rng, dur (empty if none). */
export function tracksOf(k) {
  const up = BUILD[k] && BUILD[k].up;
  return up ? TRACKS.filter((t) => up[t]) : [];
}

/** The track a plain "upgrade" means for a kind: damage if it has it, otherwise its first track. */
export function defaultTrack(k) {
  const ts = tracksOf(k);
  return ts.includes('dmg') ? 'dmg' : ts[0] || null;
}

/** The levels bought in one track (0 if none). */
export const levelIn = (b, track) => (b && b.u && b.u[track]) | 0;

/** The most levels a kind can have in a track (0 if it lacks the track). */
export function maxIn(k, track) {
  const tr = BUILD[k] && BUILD[k].up && BUILD[k].up[track];
  return tr ? tr.max ?? TUNE.maxLevel : 0;
}

/** A building's overall level, for the badge: 1 plus every level bought in every track. */
export function levelOf(b) {
  let n = 1;
  if (b && b.u) for (const t of TRACKS) n += b.u[t] | 0;
  return n;
}

/** What level `lv + 1` of a track costs, for a kind that has `lv` levels in it. */
export function levelCost(k, track, lv) {
  const def = BUILD[k], tr = def.up[track];
  const base = tr.base ?? def.cost * tr.cost;
  const grow = tr.grow ?? TUNE.upGrowth;
  // A track with `gentleFrom` grows more slowly past that level (see MACHINE_SPD in constants.js).
  // `lv` levels are already bought, so this prices level lv + 1: past level n it is level n's
  // price (base * grow^(n-1)) times gentleGrow for each level beyond n.
  const n = tr.gentleFrom;
  if (n !== undefined && lv >= n) return Math.round(base * grow ** (n - 1) * tr.gentleGrow ** (lv - n + 1));
  return Math.round(base * grow ** lv);
}

/**
 * What the next level of a track costs, or 0 if the kind lacks that track or it is maxed out.
 * Without a track it means the kind's default track (see defaultTrack).
 */
export function upgradeCost(b, track = b && defaultTrack(b.k)) {
  const def = b && BUILD[b.k];
  if (!def || !def.up || !def.up[track]) return 0;
  const lv = levelIn(b, track);
  return lv >= maxIn(b.k, track) ? 0 : levelCost(b.k, track, lv);
}

/** What one track's levels so far have cost in all. */
export function spentOnTrack(b, track) {
  let sum = 0;
  for (let lv = 0; lv < levelIn(b, track); lv++) sum += levelCost(b.k, track, lv);
  return sum;
}

/** What a building's free upgrade levels (the offatruck and mallcop cards, `f`) would have cost. */
export function freeWorth(b) {
  if (!b.f) return 0;
  let sum = 0;
  for (let lv = 0; lv < Math.min(b.fn ?? 1, levelIn(b, b.f)); lv++) sum += levelCost(b.k, b.f, lv);
  return sum;
}

/**
 * Everything spent on a building so far: its price (what was paid for it, `c`, where a card made
 * that differ) and every upgrade level, but not free ones.
 */
export function spentOn(b) {
  let sum = b.c ?? BUILD[b.k].cost;
  for (const t of tracksOf(b.k)) sum += spentOnTrack(b, t);
  return b.f ? sum - freeWorth(b) : sum;
}

/**
 * A building's working numbers with its upgrades applied. `b` may be a building from the grid or
 * any `{ k, u }`, so tables can be worked out for any mix of levels. Only the numbers its kind
 * uses are meaningful:
 *   dmg, range, cd       towers (cd in seconds between shots; the Barcode Laser's range is its beam)
 *   width                Barcode Laser: how far either side of the beam's centre line it hits
 *   range, secs          free samples (how long a sample stops a shopper)
 *   range, secs, stopLeft, rushMul   salesman: reach, how long a shopper watches, what is left
 *                        of each shopper's chance not to stop (it stops with 1 - (1 - stop) *
 *                        stopLeft), and what each chance to hurry past is multiplied by
 *   slow, slip, slipDmg  wet floor sign (speed multiplier, chance a dad slips, patience he loses)
 *   period               unpacker: seconds between boxes
 *   time                 press and packer: seconds per item
 *   hits                 every building: gym bro hits it survives in one wave
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
    period: (def.period || 0) / mul('spd'),
    time: (def.time || 0) / mul('spd'),
    hits: (def.hits || 1) + add('dur'),
  };
  return state ? cardStats(state, b, st) : st;
}

/**
 * What it costs to put back a building from the rubble (see state.rubble), for a player with
 * `cash`. The full deal is TUNE.rebuildShare of everything that had been spent on it, with all its
 * upgrades. Short of that, he gets the building at that share of its base price plus as many of
 * its upgrade levels as he can afford at that share each, cheapest first (the rest are lost).
 * @returns {{pay: number, u: Object, lost: number}|null} null if he cannot afford even the building
 */
export function rebuildDeal(r, cash) {
  const share = TUNE.rebuildShare;
  const had = {};
  let levels = 0;
  for (const t of tracksOf(r.k)) { had[t] = (r.u && r.u[t]) | 0; levels += had[t]; }
  const full = Math.floor((r.spent ?? spentOn({ k: r.k, u: r.u })) * share);
  if (cash >= full) {
    const u = {};
    for (const t of Object.keys(had)) if (had[t]) u[t] = had[t];
    return { pay: full, u, lost: 0 };
  }
  let pay = Math.floor(BUILD[r.k].cost * share);
  if (cash < pay) return null;
  const u = {};
  let got = 0;
  // Free levels (a card's: see freeWorth) come back free.
  const free = r.f ? Math.min(r.fn ?? 1, had[r.f] | 0) : 0;
  if (free) { u[r.f] = free; got += free; }
  for (;;) {
    let best = null, price = Infinity;
    for (const t of Object.keys(had)) {
      const have = u[t] | 0;
      if (have >= had[t]) continue;
      const p = Math.floor(levelCost(r.k, t, have) * share);
      if (p < price) { price = p; best = t; }
    }
    if (!best || pay + price > cash) break;
    pay += price;
    u[best] = (u[best] | 0) + 1;
    got++;
  }
  return { pay, u, lost: levels - got };
}
