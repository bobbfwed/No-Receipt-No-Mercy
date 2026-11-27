// The Back's supplies (0.4) as the interface shows them: their names, colours and the words on the
// warnings, which tracks a building takes, what its stock is doing for it right now, what each
// track is called and its numbers look like, and a Returns Drop's rate. Pure: no DOM, so the tests
// and the README tool read it too. The numbers all come from the rules.
import {
  BUILD, BACK, TICK_HZ, SHOPPERS, STOCK_TRACKS, unitsIn, usesIn, stockLevel, dropTicks, dropUpCost,
} from '../sim/index.js';

/**
 * One entry per stock track: the supply's name, the word on its "OUT OF ..." warning, its colour
 * (the items', the gauges' and the pips'), and what it gives a building.
 */
export const SUPPLIES = {
  dmg: { type: 1, name: 'Bottled Spite', word: 'SPITE', color: '#e0402f', gives: 'damage' },
  spd: { type: 2, name: 'Rage Cola', word: 'COLA', color: '#3fae49', gives: 'speed' },
  rng: { type: 3, name: 'Extension Cord', word: 'CORD', color: '#ff8c1a', gives: 'range' },
  dur: { type: 4, name: 'Duct Tape', word: 'TAPE', color: '#c9ced4', gives: 'durability' },
  wire: { type: 5, name: 'Razor Wire', word: 'WIRE', color: '#a855f7', gives: 'dads' },
};

/** The brand tiers' names, by tier (index 0: nothing in stock). */
export const TIER_NAMES = ['', 'Store Brand', 'Name Brand', 'Premium', 'Platinum'];
/** The ring a tier wears, on an item and on a pip: none for Store Brand, then bronze, silver, gold. */
export const TIER_RINGS = [null, null, '#c98a4b', '#e8ecf0', '#ffc928'];

/** The words on a building's warning when a track has run dry: "OUT OF SPITE". */
export const outOfText = (track) => `OUT OF ${SUPPLIES[track] ? SUPPLIES[track].word : 'STOCK'}`;

const tracksCache = new Map();
/**
 * The tracks a building of kind k takes supplies for, in STOCK_TRACKS order: the tracks it has
 * (BUILD[k].up), and Razor Wire for every kind with Dumbwaiters (`lift`). Empty for anything else. The same
 * list every time for a kind (the renderer asks every frame).
 */
export function stockTracks(k) {
  let out = tracksCache.get(k);
  if (!out) {
    const def = Object.hasOwn(BUILD, k) ? BUILD[k] : null;
    out = def && def.lift ? STOCK_TRACKS.filter((t) => t === 'wire' || (def.up && def.up[t])) : [];
    tracksCache.set(k, out);
  }
  return out;
}

/** The tier of the stock a building is using in one track now (its oldest run), 0 for none. */
export function tierIn(b, track) {
  const run = b && b.s && b.s[track];
  return run && run.length ? run[0] : 0;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * What one track of a building's stock is doing for it right now, in a few words: "+2 levels of
 * damage", "soaks up 3 gym bro hits", or "EMPTY".
 */
export function stockGives(b, track) {
  if (!usesIn(b, track)) return 'EMPTY';
  if (track === 'dur') return `soaks up ${plural(usesIn(b, track), 'gym bro hit')}`;
  if (track === 'wire') return `enough for ${plural(usesIn(b, track), 'dad')} (it does nothing yet)`;
  return `+${plural(stockLevel(b, track), 'level')} of ${SUPPLIES[track].gives}`;
}

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

/**
 * What the numbers of one track look like, as [label, value] pairs, for a building's stats (statsOf):
 * the building sheet's working numbers, and the handbook's and README's tables by tier.
 */
export function trackNumbers(k, track, st) {
  const def = BUILD[k];
  if (track === 'dmg') {
    if (def.tower) return [['hit', one(st.dmg)]];
    if (k === 'wetfloor') return [['walking speed', pct(st.slow)], ['dads slip', pct(st.slip)]];
    if (k === 'samples') return [['holds for', `${one(st.secs)} s`]];
    if (k === 'salesman') return [['they watch', `${one(st.secs)} s`], ['dads stop', pct(dadStops(st))], ['dads hurry', pct(dadRushes(st))]];
  }
  if (track === 'spd') return [['fires every', `${sec(st.cd)} s`]];
  if (track === 'rng') return [[k === 'railgun' ? 'beam' : 'reach', `${one(st.range)} tiles`]];
  return [['survives', `${st.hits} gym bro hit${st.hits === 1 ? '' : 's'} a sales event`]];
}

/**
 * One row per track a building takes, for its sheet: { track, name, color, tier, tierName, units,
 * cap, gives }. `units` counts a unit partly used as a whole one (unitsIn), against BACK.stockUnits.
 */
export function stockRows(b) {
  if (!b) return [];
  return stockTracks(b.k).map((track) => {
    const tier = tierIn(b, track);
    return {
      track, name: SUPPLIES[track].name, color: SUPPLIES[track].color, tier, tierName: TIER_NAMES[tier] || '',
      units: unitsIn(b, track), cap: BACK.stockUnits, gives: stockGives(b, track),
    };
  });
}

/**
 * Pieces of junk a minute from a Returns Drop with `lv` cash levels, to one decimal place. With
 * `state`, the game's cards count (offatruck: dropTicks).
 */
export const junkPerMinute = (lv, state = null) => Math.round((600 * TICK_HZ) / dropTicks(lv, state)) / 10;

/**
 * What a Returns Drop's sheet says: { perMin, lv, max, cost (0 at the top), next (junk a minute
 * after one more level, or 0), why ('' when the MORE JUNK button works, else why it does not) }.
 */
export function dropInfo(p, cash, state = null) {
  const lv = (p && p.lv) | 0, max = BACK.dropUpMax;
  const cost = dropUpCost(lv);
  let why = '';
  if (lv >= max) why = 'Top level';
  else if (cash < cost) why = `$${Math.ceil(cost - cash).toLocaleString('en-US')} short`;
  return { perMin: junkPerMinute(lv, state), lv, max, cost, next: lv < max ? junkPerMinute(lv + 1, state) : 0, why };
}
