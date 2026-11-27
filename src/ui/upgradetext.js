// Words for upgrades: what each track is called on each kind of building, and what the next level
// of it would change. Used by the building sheet, the build bar's info card and the handbook.
import { BUILD, SHOPPERS, statsOf, boughtIn, maxIn, upgradeCost, tracksOf } from '../sim/index.js';

const one = (n) => (Math.round(n * 10) / 10).toString();
const pct = (n) => `${Math.round(n * 100)}%`;
/** Seconds: short times need two decimals, or a 10% faster sprinkler reads "0.5 → 0.5". */
const sec = (n) => (n < 2 ? (Math.round(n * 100) / 100).toString() : one(n));

/** What a track is called on a kind of building ("Damage" on a tower, "Pitch" on the salesman). */
export function trackName(k, track) {
  if (track === 'dmg') {
    if (k === 'wetfloor') return 'Slipperiness';
    if (k === 'samples') return 'Hold time';
    if (k === 'salesman') return 'Pitch';
    return 'Damage';
  }
  if (track === 'spd') return 'Speed';
  if (track === 'rng') return k === 'railgun' ? 'Beam length' : 'Range';
  return 'Durability';
}

/** A dad's chances at a salesman with these numbers: the owner's yardstick for the pitch. */
const dadStops = (st) => 1 - (1 - SHOPPERS.dad.pitch[0]) * st.stopLeft;
const dadRushes = (st) => SHOPPERS.dad.pitch[1] * st.rushMul;

/** What the numbers of one track look like, as [label, value] pairs, for a building's stats. */
export function trackNumbers(k, track, st) {
  const def = BUILD[k];
  if (track === 'dmg') {
    if (def.tower) return [['hit', one(st.dmg)]];
    if (k === 'wetfloor') return [['walking speed', pct(st.slow)], ['dads slip', pct(st.slip)]];
    if (k === 'samples') return [['holds for', `${one(st.secs)} s`]];
    if (k === 'salesman') return [['they watch', `${one(st.secs)} s`], ['dads stop', pct(dadStops(st))], ['dads hurry', pct(dadRushes(st))]];
  }
  if (track === 'spd') {
    if (def.tower) return [['fires every', `${sec(st.cd)} s`]];
    if (k === 'unpacker') return [['a box every', `${sec(st.period)} s`]];
    return [['an item takes', `${sec(st.time)} s`]];
  }
  if (track === 'rng') return [[k === 'railgun' ? 'beam' : 'reach', `${one(st.range)} tiles`]];
  return [['survives', `${st.hits} gym bro hit${st.hits === 1 ? '' : 's'} a sales event`]];
}

/**
 * Everything the interface shows about one track of one building.
 * @returns {{track, name, lv, max, cost, now: string, gain: string}} `lv` is the levels bought
 *   (0.4: stock is not bought, so buying reads only these, boughtIn); `cost` is 0 at the top level;
 *   `now` and `gain` are the numbers it works at, its stock included: "hit 6 → 7.5".
 */
export function trackInfo(b, track) {
  const lv = boughtIn(b, track), max = maxIn(b.k, track);
  const now = trackNumbers(b.k, track, statsOf(b));
  const next = lv < max ? trackNumbers(b.k, track, statsOf({ k: b.k, u: { ...(b.u || {}), [track]: lv + 1 }, s: b.s })) : null;
  return {
    track, name: trackName(b.k, track), lv, max, cost: upgradeCost(b, track),
    now: now.map(([label, v]) => `${label} ${v}`).join(', '),
    gain: next ? now.map(([label, v], n) => `${label} ${v.replace(/ (s|tiles|gym bro hits? a sales event)$/, '')} → ${next[n][1]}`).join(', ') : 'as far as it goes',
  };
}

/** One entry per track the building has, in the usual order. */
export const tracksInfo = (b) => tracksOf(b.k).map((t) => trackInfo(b, t));
