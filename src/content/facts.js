// The numbers behind the game, worked out from the rules for showing to people: the Employee
// Handbook in the game and the lists in README.md both read them from here, so neither can
// drift from what the simulation actually does. No DOM; runs in Node too.
import {
  SHOPPERS, SUPERS, BUILD, ITEMS, ZONES, TUNE, SETTINGS, waveSpec, statsOf, priceOf,
  tracksOf, defaultTrack, maxIn, levelCost,
} from '../sim/index.js';

/** The order shoppers are listed in: the order they first turn up. */
export const SHOPPER_ORDER = ['hunter', 'dad', 'clipper', 'mom', 'teen', 'karen', 'drinker', 'blind', 'gymbro', 'scooter', 'dog', 'flasher', 'cosplay'];
export const FACTORY_ORDER = ['belt', 'unpacker', 'press', 'packer', 'chute', 'crate'];
export const SECURITY_ORDER = ['sprinkler', 'forklift', 'railgun', 'wetfloor', 'samples', 'salesman'];

/** What each upgrade track is called, for tables. */
export const TRACK_NAMES = { dmg: 'Damage', spd: 'Speed', rng: 'Range', dur: 'Durability' };

/** How much more patient shoppers are in wave n than in wave 1. */
export const patienceGrowth = (n) => 1 + TUNE.hpGrowth * (n - 1) + TUNE.hpGrowth2 * (n - 1) ** 2;

/** A shopper's patience when it walks in during wave n. `hpMul` is the difficulty's multiplier. */
export function patienceAt(k, sup, n, hpMul = 1) {
  return (sup ? SUPERS[k] : SHOPPERS[k]).hp * patienceGrowth(n) * hpMul;
}

/** The first wave the automatic waves include this kind. */
export function firstWave(k) {
  for (let n = 1; n <= 40; n++) if (waveSpec(n, 1).some((g) => g.k === k)) return n;
  return 0;
}

/** How many of a kind (and how many of those are super) the automatic wave n sends. */
export function countIn(k, n, players = 1) {
  let all = 0, sup = 0;
  for (const g of waveSpec(n, players)) if (g.k === k) { all += g.n; sup += g.sup; }
  return { all, sup };
}

/** The waves worth showing in a table for a game of `waves` waves: 1, 5, 10 ... and the last. */
export function sampleWaves(waves = SETTINGS.defaults.waves) {
  const out = [1];
  for (let n = 5; n < waves; n += 5) out.push(n);
  out.push(waves);
  return out;
}

/** A number for a table: whole if it is big or whole, otherwise one decimal. */
export const fmt = (v) => (Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v)) : (Math.round(v * 10) / 10).toFixed(1));
const pct = (m) => `${Math.round(m * 100)}%`;

/**
 * What makes a shopper kind (or its super version) different, as short "label: value" facts
 * taken from its definition. Only what applies to that kind is listed.
 */
export function shopperTraits(k, sup = 0) {
  const d = sup ? SUPERS[k] : SHOPPERS[k];
  const v = (key) => d[key] ?? TUNE[key];
  const out = [];
  if (d.browses) out.push(['Free samples and goods on belts', 'stops for them']);
  else out.push(['Free samples and goods on belts', 'ignores them']);
  if (d.steady) out.push(['Wet floors and messes', 'not affected']);
  else if (d.ignoresSigns) out.push(['Wet floors and messes', `not slowed; ${pct(TUNE.slipChance)} chance to slip (stunned ${fmt(TUNE.slipSecs)} s)`]);
  else out.push(['Wet floors and messes', `slowed to ${pct(TUNE.wetSlow)} speed`]);
  if (d.hopsBelts) out.push(['Conveyor belts', 'steps over them']);
  if (d.drain) out.push(['Patience lost by itself', `${fmt(d.drain)} a second`]);
  if (d.nag) out.push(['Security near her', `within ${fmt(v('nagRange'))} tiles works at ${pct(v('nagRate'))} speed`]);
  if (d.messy) out.push(['Messes', `one every ${fmt(v('messEvery'))} s, each lasting ${fmt(v('messSecs'))} s`]);
  if (d.kid) {
    const runs = v('kidRuns'), times = v('crawlTimes');
    out.push(['Kid escapes', `${runs === 1 ? 'once' : `up to ${runs} times`} (a ${pct(v('kidChance'))} chance each second in the cart); runs ${fmt(v('kidMin'))} to ${fmt(v('kidMax'))} tiles, never closer than ${TUNE.kidTill} to a till`]);
    out.push(['Chasing speed', `${fmt(d.speed * v('chaseSpeed'))} tiles a second; no refund until she has him back`]);
    out.push(['Out of patience with the kid loose', `crawls to him at ${pct(TUNE.crawlSpeed)} speed, untouchable; gets up with ${pct(TUNE.crawlBack)} patience, ${times === 1 ? 'once' : `up to ${times} times`}; the last time she leaves the cart and carries him`]);
  }
  if (d.bolts) out.push(['Dog bolts when sprayed', `${fmt(v('boltSecs'))} s at ${fmt(d.speed * v('boltSpeed'))} tiles a second${d.boltsOnAny ? ' (forklift and rail gun hits too)' : ''}`]);
  if (d.smashes) out.push(['Wrecking', `stops to hit any crate stack in his way, and every crate stack beside him; every ${fmt(v('smashEvery'))} s a ${pct(v('smashOther'))} chance of hitting something else`]);
  if (d.sways) {
    out.push(['Walking speed', `changes every ${fmt(TUNE.swayEvery)} s, between ${fmt(d.speed * v('swayMin'))} and ${fmt(d.speed * v('swayMax'))} tiles a second`]);
    out.push(['Corners', `${pct(v('fallChance'))} chance to fall over for ${fmt(v('fallSecs'))} s; anyone crossing him goes at ${pct(TUNE.fallSlow)} speed`]);
  }
  if (d.pees) out.push(['Security he passes', `within ${fmt(v('peeRange'))} tiles (not wet floor signs): pees on it, switching it off for ${fmt(v('peeSecs'))} s; again after ${fmt(v('peeCool'))} s`]);
  if (d.flashes) out.push(['Bathrobe', `opens it about every ${fmt(v('flashEvery'))} s; dads and teenagers within ${fmt(v('flashRange'))} tiles stop and stare for ${fmt(v('gawkSecs'))} s`]);
  if (d.shields) out.push(['Costume', `shots at anyone within ${fmt(v('shield'))} tiles of him hit him instead${v('soak') < 1 ? `, for ${pct(v('soak'))} of the damage` : ''}`]);
  if (d.gawks) out.push(['Exhibitionists', 'stops and stares']);
  if (d.pitch) {
    const [stop, rush] = d.pitch;
    out.push(['TV Salesman', stop || rush ? `stops to watch ${pct(stop)}; hurries past ${pct(rush)}` : 'cannot see the television']);
  }
  return out;
}

/** The main numbers for a shopper kind, normal and super. */
export function shopperFacts(k) {
  const d = SHOPPERS[k], s = SUPERS[k];
  return {
    k, name: d.name, superName: s.name, first: firstWave(k), superFrom: d.sup.from,
    hp: d.hp, speed: d.speed, refund: d.refund,
    superHp: s.hp, superSpeed: s.speed, superRefund: s.refund,
    price: priceOf(k, 0), superPrice: priceOf(k, 1),
  };
}

/**
 * One row per level of one upgrade track of a building, from 0 (as built) to the most it can
 * have: { lv, cost (what that level costs; 0 for level 0), total (spent on this track so far),
 * ...the numbers that track changes }, with the other tracks at 0:
 *   dmg  towers: dmg, dps, most · wet floor sign: slow, slip, slipDmg · samples: secs ·
 *        salesman: secs, stopLeft, rushMul (see statsOf) · dps is damage a second to one shopper
 *        (a Rail Gun does it to everyone in line); most is that times how many it can hit at once
 *   spd  towers: cd, perSec (shots a second), dps, most · unpacker: period, perMin · press and
 *        packer: time, perMin
 *   rng  range
 *   dur  hits (gym bro hits it survives in one wave)
 * Empty if the kind lacks the track.
 */
export function trackRows(k, track) {
  const def = BUILD[k], rows = [];
  if (!tracksOf(k).includes(track)) return rows;
  let total = 0;
  for (let lv = 0; lv <= maxIn(k, track); lv++) {
    const cost = lv ? levelCost(k, track, lv - 1) : 0;
    total += cost;
    const st = statsOf({ k, u: { [track]: lv } });
    const row = { lv, cost, total };
    const dps = () => {
      row.dps = st.cd ? st.dmg / st.cd : 0;
      row.most = row.dps * (def.targets || 1);
    };
    if (track === 'dmg') {
      if (def.tower) { row.dmg = st.dmg; dps(); }
      else if (k === 'wetfloor') { row.slow = st.slow; row.slip = st.slip; row.slipDmg = st.slipDmg; }
      else if (k === 'samples') row.secs = st.secs;
      else if (k === 'salesman') { row.secs = st.secs; row.stopLeft = st.stopLeft; row.rushMul = st.rushMul; }
    } else if (track === 'spd') {
      if (def.tower) { row.cd = st.cd; row.perSec = 1 / st.cd; dps(); }
      else if (k === 'unpacker') { row.period = st.period; row.perMin = 60 / st.period; }
      else { row.time = st.time; row.perMin = 60 / st.time; }
    } else if (track === 'rng') row.range = st.range;
    else if (track === 'dur') row.hits = st.hits;
    rows.push(row);
  }
  return rows;
}

/**
 * The old one-table-per-building view, kept so older screens still load: the rows of the kind's
 * default track (damage where it has it), with `next` (the cost of the level after) as well.
 */
export function levelRows(k) {
  const rows = trackRows(k, defaultTrack(k));
  return rows.map((r, n) => ({ ...r, lv: r.lv + 1, next: n + 1 < rows.length ? rows[n + 1].cost : 0, total: BUILD[k].cost + r.total, range: r.range ?? statsOf({ k }).range }));
}

/** Plain facts about a factory building, as [label, value] pairs. `pay` is the difficulty's income multiplier. */
export function factoryFacts(k, pay = 1) {
  const def = BUILD[k], out = [];
  const worth = (item) => Math.max(1, Math.round(ITEMS[item].value * pay));
  out.push(['Price', `$${def.cost}`], ['Sold back for', `$${Math.floor(def.cost * TUNE.sellBack)}`]);
  if (def.zone) out.push(['Goes on', `${ZONES[def.zone].name} floor only`]);
  out.push(['Shoppers', k === 'belt' ? 'blocked, except dads (who step over) ' : 'blocked']);
  if (k === 'belt') out.push(['Speed', `${fmt(TUNE.beltSpeed)} tiles a second`], ['Holds', '2 items']);
  if (k === 'unpacker') {
    const perMin = 60 / def.period;
    out.push(['Makes', `1 ${ITEMS.box.name} every ${fmt(def.period)} s (${fmt(perMin)} a minute)`]);
    out.push(['Worth, sold as boxes', `$${fmt(perMin * worth('box'))} a minute`]);
  }
  if (k === 'press' || k === 'packer') {
    const gain = worth(def.makes) - worth(def.takes);
    out.push(['Turns', `${ITEMS[def.takes].name} ($${worth(def.takes)}) into ${ITEMS[def.makes].name} ($${worth(def.makes)})`]);
    out.push(['Takes', `${fmt(def.time)} s each (${fmt(60 / def.time)} a minute at most)`]);
    out.push(['Adds', `$${gain} an item; pays for itself after ${Math.ceil(def.cost / Math.max(1, gain))} items`]);
  }
  if (k === 'chute') out.push(['Sells', Object.keys(ITEMS).map((i) => `${ITEMS[i].name} $${worth(i)}`).join(', ')]);
  if (k === 'crate') out.push(['Gym bros', 'stop and smash it, then walk through; each Durability level makes him swing once more']);
  return out;
}
