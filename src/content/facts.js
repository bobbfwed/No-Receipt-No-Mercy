// The numbers behind the game, worked out from the rules for showing to people: the Employee
// Handbook in the game and the lists in README.md both read them from here, so neither can
// drift from what the simulation actually does. No DOM; runs in Node too.
import {
  SHOPPERS, SUPERS, BUILD, TUNE, SETTINGS, TICK_HZ, waveSpec, statsOf, priceOf,
  tracksOf, usesPer, BACK, BOSS, BABY, bossTier, bossTitle, bossPatience, perHead,
  patienceScaleAt, patienceGrowth, OFFICE, releaseNo, releaseSize, eventPay, speedPar,
  makeTicks, rebrandTicks, stockCap, dropUpCost, SUPPLY_TRACKS, reinforceCost, upgradeCost, takesSupply, itemCode,
} from '../sim/index.js';
import { EDGE_HELP } from './help.js';
import { TIER_NAMES, SUPPLIES, stockTracks, junkPerMinute } from './supplies.js';

/**
 * The order shoppers are listed in: the order they first turn up, worked out from the rules (the
 * event a kind first comes in is tuned: 0.4 moved the dads' first line), kinds that first come in
 * the same event in the order below.
 */
export const SHOPPER_ORDER = ['hunter', 'dad', 'clipper', 'mom', 'teen', 'karen', 'drinker', 'blind', 'gymbro', 'scooter', 'dog', 'trader', 'flasher', 'preggo', 'cosplay']
  .map((k, n) => [k, n]).sort((a, b) => (firstWave(a[0]) || 99) - (firstWave(b[0]) || 99) || a[1] - b[1]).map(([k]) => k);
/** The shop floor's buildings: the one plain wall, then the security (together, every SHOP_KINDS). */
export const WALL_ORDER = ['crate'];
export const SECURITY_ORDER = ['sprinkler', 'forklift', 'railgun', 'wetfloor', 'samples', 'salesman'];
/**
 * The Back's parts (0.4), in the order the junk meets them: the Returns Drop, what carries it, the
 * machines and the Rebrander, and the Dumbwaiter that takes the supplies up.
 */
export const BACK_ORDER = ['drop', 'conv', 'split', 'over', 'intern', 'bin', 'still', 'cannery', 'spooler', 'bender', 'rebrand', 'lift'];

/** How much more patient shoppers are in wave n than in wave 1, by growth alone (the simulation's own). */
export { patienceGrowth };

/**
 * How much more patient shoppers (not the boss) are in wave n of an ordinary game than in wave 1:
 * the growth times the wave's patience multiplier (patienceScaleAt, 1 in the first events).
 */
export const toughnessAt = (n) => patienceGrowth(n) * patienceScaleAt(n);

/**
 * A shopper's patience when it walks in during wave n of an ordinary game (the wave's patience
 * multiplier included). `hpMul` is the difficulty's multiplier. k may also be 'baby'.
 */
export function patienceAt(k, sup, n, hpMul = 1) {
  const def = k === 'baby' ? BABY : sup ? SUPERS[k] : SHOPPERS[k];
  return def.hp * toughnessAt(n) * hpMul;
}

/**
 * A Pregnant Lady's babies (not one of SHOPPERS: nobody picks them, Head Office cannot buy them).
 * hp is their patience as the first sales event's would be at that difficulty, before it grows.
 */
function babyFacts(hpMul = 1) {
  return { name: BABY.name, hp: BABY.hp * patienceScaleAt(1) * hpMul, speed: BABY.speed, refund: BABY.refund };
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

/** A game's length in words: "20 sales events", or "Endless" (waves 0). */
export const lengthText = (waves) => (waves > 0 ? `${waves} sales events` : 'Endless');

/** "7 / 20", or just "7" in an endless game, which has no last sales event to count towards. */
export const eventOf = (n, waves) => (waves > 0 ? `${n} / ${waves}` : `${n}`);

/**
 * The longest game the length drop-down offers (the biggest of SETTINGS.waves; 0 there means
 * endless). The handbook's tables go this far whatever the length of the game it is opened in,
 * so they follow if the list changes.
 */
export const LONGEST = Math.max(...SETTINGS.waves.filter((n) => n > 0));

/** The waves shown for an endless game (waves 0), which has no last one to stop at: 1, 5, then every tenth to past the longest game. */
const ENDLESS_SAMPLE = [1, 5];
for (let n = 10; n <= LONGEST + 10; n += 10) ENDLESS_SAMPLE.push(n);

/**
 * The waves worth showing in a table: 1, 5, 10 ... up to the longest game on offer (LONGEST), for
 * a game of any length; further for an endless game (waves 0).
 */
export function sampleWaves(waves = SETTINGS.defaults.waves) {
  if (!(waves > 0)) return [...ENDLESS_SAMPLE];
  const out = [1];
  for (let n = 5; n < LONGEST; n += 5) out.push(n);
  out.push(LONGEST);
  return out;
}

/**
 * The boss waves worth showing: every one up to the longest game on offer (LONGEST), for a game
 * of any length; for an endless game (waves 0), on past it.
 */
export function bossWaves(waves = SETTINGS.defaults.waves) {
  const out = [];
  const last = waves > 0 ? LONGEST : LONGEST + 20;
  for (let n = TUNE.bossEvery; n <= last; n += TUNE.bossEvery) {
    // An endless table would get too wide: past the longest game, every tenth.
    if (!(waves > 0) && n > LONGEST && n % 10) continue;
    out.push(n);
  }
  return out;
}

/** The bounty for driving out a boss of this tier, before it is split between the players. */
export const bossBounty = (tier, pay = 1) => Math.max(1, Math.round(TUNE.bossBounty * tier * pay));

/**
 * Everything the interface says about the boss, from the rules. `hpMul` and `pay` are the
 * difficulty's multipliers; `waves` is the game's length (0: endless) and picks the sample waves.
 *   titles: [{ tier, title, from }] the title he has at each tier and the first wave he has it
 *   waves: [{ n, tier, title, hp, bounty, refund }] his numbers in each sample boss wave
 */
export function bossFacts({ hpMul = 1, pay = 1, waves = SETTINGS.defaults.waves } = {}) {
  const titles = BOSS.titles.map((title, i) => ({ tier: i + 1, title, from: (i + 1) * TUNE.bossEvery }));
  return {
    name: BOSS.name, titles,
    every: TUNE.bossEvery, at: TUNE.bossAt, crowd: TUNE.bossCrowd,
    hp: BOSS.hp * hpMul, speed: BOSS.speed, refund: BOSS.refund, refunds: TUNE.bossRefunds,
    tierHp: TUNE.bossTierHp,
    pepEvery: BOSS.pepEvery, pepRange: BOSS.pepRange, pepHeal: BOSS.pepHeal,
    waves: bossWaves(waves).map((n) => {
      const tier = bossTier(n);
      return { n, tier, title: bossTitle(tier), hp: bossPatience(n, hpMul), bounty: bossBounty(tier, pay), refund: BOSS.refund * tier };
    }),
  };
}

/**
 * What beating sales events pays (0.4), from the rules: `difficulty` is a key of SETTINGS.difficulty.
 *   base, step: TUNE.payBase and payStep; pay(n): what event n pays each store player on that
 *   difficulty (eventPay, cards left out); share, best, par, bossPar: the speed bonus's numbers
 */
export function payFacts(difficulty = SETTINGS.defaults.difficulty) {
  // (eventPay reads only the difficulty and the cards from a game; a game without cards pays these.)
  const game = { difficulty };
  return {
    base: TUNE.payBase, step: TUNE.payStep, pay: (n) => eventPay(game, n),
    // What each of n store players gets, as a share of what one player alone would (0.4, stage 7).
    each: (n) => (1 + TUNE.crowdPerPlayer * (Math.max(1, n) - 1)) / Math.max(1, n),
    share: TUNE.speedShare, best: TUNE.speedBest, par: speedPar(1), bossPar: speedPar(TUNE.bossEvery),
  };
}

/**
 * How money is made (0.4), in two or three sentences for the handbook, the help screen and the
 * training shift's last words: the event pay with examples on that difficulty, and the speed bonus.
 */
export function payText(difficulty = SETTINGS.defaults.difficulty) {
  const p = payFacts(difficulty);
  // (0.4, stage 7: the store's pay grows with its crowd and is shared evenly; with ${p.each(n)} the
  // share each of n players gets.)
  return `Money comes from beating sales events (${money(p.pay(1))} for the first, ${money(p.pay(10))} for the tenth, ${money(p.pay(20))} for the twentieth, playing alone). With friends the store's pay grows with its bigger crowd and is shared evenly: each of two players gets ${pct(p.each(2))} of that, each of three ${pct(p.each(3))}. `
    + `On top comes a speed bonus of up to ${pct(p.share)} of the event pay: its clock starts when the event's last shopper has come in, and clearing the floor within ${p.best} seconds earns all of it, draining to nothing at ${p.par} seconds (${p.bossPar} in a boss event). `
    + `It is scaled by the share of that event's shoppers stopped rather than refunded. Opening the doors early just opens them: The Back does nothing in the time skipped.`;
}

/** Whole dollars as players read them: "$1,050". */
const money = (v) => `$${Math.round(v).toLocaleString('en-US')}`;

/**
 * The one sentence about every shopper walking at his own pace (TUNE.paceSpread), for wherever a
 * shopper's speed is shown: the speed shown is his kind's, and each one is a little off it.
 */
export function paceText() {
  const p = Math.round(TUNE.paceSpread * 100);
  return `The speed shown is the kind's: each shopper walks anywhere from ${p}% slower to ${p}% faster than that, so a crowd strings out instead of arriving in one lump (the boss and the babies keep their own).`;
}

/**
 * What a kind of shopper (its super version too) is weak to and tough against, from the rules:
 * [{ side: 'weak' | 'tough', kind (a key of BUILD), name (the building's), mul (TUNE.weakMul or
 * toughMul), effect (what it does, in words), why (EDGE_HELP's reason) }], weak first. Empty for a
 * kind with neither.
 */
export function edgeFacts(k) {
  const d = SHOPPERS[k], out = [];
  for (const side of ['weak', 'tough']) {
    const kind = d[side];
    if (!kind) continue;
    const mul = side === 'weak' ? TUNE.weakMul : TUNE.toughMul;
    const p = `${Math.round(Math.abs(mul - 1) * 100)}%`;
    // (A Wet Floor Sign takes no patience from anyone who does not slip: it is the time to cross it.)
    const effect = kind === 'wetfloor' ? `takes ${p} ${mul > 1 ? 'longer' : 'less time'} to get across one`
      : `loses ${p} ${mul > 1 ? 'more' : 'less'} patience to it`;
    out.push({ side, kind, name: BUILD[kind].name, mul, effect, why: EDGE_HELP[k]?.[side] || '' });
  }
  return out;
}

/** edgeFacts as one or two sentences for the help and the README ('' for a kind with neither). */
export function edgeText(k) {
  return edgeFacts(k).map((e) => `${e.side === 'weak' ? 'Weak to' : 'Tough against'} the ${e.name}: ${e.effect}. ${e.why}`).join(' ');
}

/**
 * The Midnight Release events worth showing in a table: every one up to the longest game on offer
 * (LONGEST), for a game of any length; for an endless game (waves 0), two more.
 */
export function releaseWaves(waves = SETTINGS.defaults.waves) {
  const out = [];
  const last = waves > 0 ? LONGEST : LONGEST + 10;
  for (let n = 1; n <= last; n++) if (releaseNo(n)) out.push(n);
  return out;
}

/**
 * Everything the interface says about the Midnight Release, from the rules. `players` is the
 * number sharing the store; `waves` the game's length (0: endless), which picks the sample events.
 *   waves: [{ n, no, size }] each sample release: its sales event, which release it is, the mob
 */
function releaseFacts({ players = 1, waves = SETTINGS.defaults.waves } = {}) {
  return {
    from: TUNE.releaseFrom, every: TUNE.releaseEvery, at: TUNE.releaseAt, secs: TUNE.releaseSecs,
    first: TUNE.releaseFirst, step: TUNE.releaseStep, crowd: TUNE.releaseCrowd,
    waves: releaseWaves(waves).map((n) => ({ n, no: releaseNo(n), size: releaseSize(n, players) })),
  };
}

/** The Midnight Release's schedule and mob in one sentence, for the handbook, the help and the README. */
export function releaseText() {
  const r = releaseFacts();
  const [a, b, c] = r.waves;
  return `Midnight Release events only: sales events ${a.n}, ${b.n}, ${c.n} and every ${r.every}th after (never a boss event). ${a.size}, then ${b.size}, then ${c.size} of them (${r.step} more each time; more with more players) all come through one entrance within ${fmt(r.secs)} seconds, about ${fmt(r.at)} seconds after the doors open, and the rest of that event's crowd is ${Math.round(r.crowd * 100)}% of its usual size`;
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
  // (Thieves, 0.4: stock from the security they walk past, never out of their way.)
  const roll = `about ${pct(1 - Math.exp(-TUNE.grabChance))} a second beside a stocked building`;
  if (d.rips) {
    out.push(['Free samples and stock', `ignores free samples; rips one unit of the best-branded stock out of any security building he walks past (${roll})`]);
    out.push(['Ripping', `stands and gloats over it for ${fmt(TUNE.ripSecs)} s; every other Card Trader within ${fmt(TUNE.ripLook)} tiles stops ${fmt(TUNE.ripWatch)} s to see what he pulled (and not again for ${fmt(TUNE.ripCool)} s)`]);
    out.push(['When', releaseText()]);
  } else if (d.browses) out.push(['Free samples and stock', `stops for them; steals one unit of stock from security he walks past (${roll}, from whichever supply it holds most of), then waits ${fmt(TUNE.grabCooldown)} s before he can be tempted again`]);
  else out.push(['Free samples and stock', 'ignores them']);
  if (d.steady) out.push(['Wet floors and messes', 'not affected']);
  else if (d.ignoresSigns) out.push(['Wet floors and messes', `not slowed; ${pct(TUNE.slipChance)} chance to slip (stunned ${fmt(TUNE.slipSecs)} s)`]);
  else out.push(['Wet floors and messes', `slowed to ${pct(TUNE.wetSlow)} speed`]);
  if (d.drain) {
    // It grows with the patience multiplier, so wasting his time works as well all game.
    const late = d.drain * TUNE.patienceScale;
    out.push(['Patience lost by itself', late === d.drain ? `${fmt(d.drain)} a second`
      : `${fmt(d.drain * patienceScaleAt(1))} a second, rising after sales event ${TUNE.patienceFrom} to ${fmt(late)} by event ${TUNE.patienceFull}`]);
  }
  if (d.nag) out.push(['Security near her', `within ${fmt(v('nagRange'))} tiles works at ${pct(v('nagRate'))} speed`]);
  if (d.messy) out.push(['Messes', `one every ${fmt(v('messEvery'))} s, each lasting ${fmt(v('messSecs'))} s`]);
  if (d.kid) {
    const runs = v('kidRuns'), times = v('crawlTimes');
    out.push(['Kid escapes', `${runs === 1 ? 'once' : `up to ${runs} times`} (first after ${fmt(v('kidFirstMin'))} to ${fmt(v('kidFirstMax'))} seconds in the store, a different time for every kid; then a ${pct(v('kidChance'))} chance each second in the cart); runs ${fmt(v('kidMin'))} to ${fmt(v('kidMax'))} tiles, never closer than ${TUNE.kidTill} to a till`]);
    out.push(['Chasing speed', `${fmt(d.speed * v('chaseSpeed'))} tiles a second; no refund until she has him back`]);
    out.push(['Out of patience with the kid loose', `crawls to him at ${pct(TUNE.crawlSpeed)} speed, untouchable; gets up with ${pct(TUNE.crawlBack)} patience, ${times === 1 ? 'once' : `up to ${times} times`}; the last time she leaves the cart and carries him`]);
  }
  if (d.bolts) out.push(['Dog bolts when sprayed', `${fmt(v('boltSecs'))} s at ${fmt(d.speed * v('boltSpeed'))} tiles a second${d.boltsOnAny ? ' (forklift and barcode laser hits too)' : ''}`]);
  if (d.smashes) {
    const max = v('smashMax');
    out.push(['Hits', `${max === 1 ? 'one' : `up to ${max}`} a visit, at least ${fmt(v('smashWait'))} s apart; one that a reinforced building shrugs off still counts`]);
    out.push(['Wrecking', `with a hit ready, stops to hit any crate stack in his way, and any crate stack beside him; every ${fmt(v('smashEvery'))} s a ${pct(v('smashOther'))} chance of hitting something else. Resting after a hit, or spent, walks round crates like anyone else`]);
  }
  if (d.sways) {
    out.push(['Walking speed', `changes every ${fmt(TUNE.swayEvery)} s, between ${fmt(d.speed * v('swayMin'))} and ${fmt(d.speed * v('swayMax'))} tiles a second`]);
    out.push(['Corners', `${pct(v('fallChance'))} chance to fall over for ${fmt(v('fallSecs'))} s; anyone crossing him goes at ${pct(TUNE.fallSlow)} speed`]);
  }
  if (d.pees) out.push(['Security he passes', `within ${fmt(v('peeRange'))} tiles (not wet floor signs): pees on it, switching it off for ${fmt(v('peeSecs'))} s; again after ${fmt(v('peeCool'))} s`]);
  if (d.flashes) out.push(['Bathrobe', `opens it about every ${fmt(v('flashEvery'))} s; dads and teenagers within ${fmt(v('flashRange'))} tiles stop and stare for ${fmt(v('gawkSecs'))} s`]);
  if (d.shields) out.push(['Costume', `shots at anyone within ${fmt(v('shield'))} tiles of him hit him instead${v('soak') < 1 ? `, for ${pct(v('soak'))} of the damage` : ''}`]);
  if (d.pops) {
    out.push(['Out of patience', `pops: ${d.pops} babies run for the tills from where she stood. None if a Barcode Laser finishes her`]);
    const b = babyFacts();
    out.push(['Her babies', `${fmt(b.hp)} patience each (growing like everyone's), ${fmt(b.speed)} tiles a second, and nothing distracts them; one at a till takes $${b.refund} but is not a refund toward the limit`]);
  }
  for (const e of edgeFacts(k)) out.push([e.side === 'weak' ? 'Weak to' : 'Tough against', `${e.name}: ${e.effect}. ${e.why}`]);
  if (d.gawks) out.push(['Exhibitionists', 'stops and stares']);
  if (d.pitch) {
    const [stop, rush] = d.pitch;
    out.push(['TV Salesman', stop || rush ? `stops to watch ${pct(stop)}; hurries past ${pct(rush)}` : 'cannot see the television']);
  }
  return out;
}

/**
 * The main numbers for a shopper kind, normal and super, as they are in an ordinary game: hp is
 * the patience in the first sales event at Normal difficulty (x1) (that event's patience multiplier
 * included; see patienceAt for any other event), refund the cash taken at a till (perHead included).
 */
export function shopperFacts(k) {
  const d = SHOPPERS[k], s = SUPERS[k];
  const hp = patienceScaleAt(1), cash = perHead();
  return {
    k, name: d.name, superName: s.name, first: firstWave(k), superFrom: d.sup.from,
    hp: d.hp * hp, speed: d.speed, refund: d.refund * cash,
    superHp: s.hp * hp, superSpeed: s.speed, superRefund: s.refund * cash,
    // (0 for a kind Head Office cannot buy: the Card Trader.)
    price: OFFICE.kinds[k] ? priceOf(k, 0) : 0, superPrice: OFFICE.kinds[k] ? priceOf(k, 1) : 0,
    // Only at a Midnight Release, never in an ordinary group: the Card Trader.
    releaseOnly: !!d.rips,
  };
}

/**
 * One row per brand tier of the supply one track of a security building takes, from 0 (unstocked:
 * as built) to 4 (Platinum), worked out from the rules (statsOf with that tier in stock):
 * { tier, name ('as built' or the tier's name), uses (what one unit of it lasts: shots or shoppers
 * acted on, usesPer; 0 as built), ...numbers }.
 * Numbers by track (with the other tracks unstocked):
 *   dmg  level (the levels the tier counts as) · towers: dmg, dps, most · wet floor sign: slow,
 *        slip, slipDmg · samples: secs · salesman: secs, stopLeft, rushMul (see statsOf) · dps is
 *        damage a second to one shopper (a Barcode Laser does it to everyone in line); most is that
 *        times how many it can hit at once
 *   spd  level · cd, perSec (shots a second), dps, most
 *   rng  level · range
 * Empty if the kind lacks the track, or the track is no supply (durability: 0.4.01, reinforced for
 * cash, Duct Tape gone).
 */
export function tierRows(k, track) {
  const def = BUILD[k], rows = [];
  // (0.4.01: a kind with no Dumbwaiter, the Wet Floor Sign, takes no supplies: see upgradeRows.)
  if (!def.lift || !tracksOf(k).includes(track) || !Object.hasOwn(SUPPLIES, track)) return rows;
  for (let tier = 0; tier < TIER_NAMES.length; tier++) {
    const st = statsOf(tier ? { k, s: { [track]: [tier, 1] } } : { k });
    const row = { tier, name: tier ? TIER_NAMES[tier] : 'as built', uses: tier ? usesPer(k, track, tier) : 0 };
    const dps = () => {
      row.dps = st.cd ? st.dmg / st.cd : 0;
      row.most = row.dps * (def.targets || 1);
    };
    row.level = BACK.tierLevel[tier];
    if (track === 'dmg') {
      if (def.tower) { row.dmg = st.dmg; dps(); }
      else if (k === 'wetfloor') { row.slow = st.slow; row.slip = st.slip; row.slipDmg = st.slipDmg; }
      else if (k === 'samples') row.secs = st.secs;
      else if (k === 'salesman') { row.secs = st.secs; row.stopLeft = st.stopLeft; row.rushMul = st.rushMul; }
    } else if (track === 'spd') { row.cd = st.cd; row.perSec = 1 / st.cd; dps(); }
    else if (track === 'rng') row.range = st.range;
    rows.push(row);
  }
  return rows;
}

/**
 * A kind upgraded with cash (0.4.01: the Wet Floor Sign), one row per level from 0 (as built) to the
 * top, from the rules: { u, cost (what that level cost to buy, 0 as built; a game without cards),
 * level (the stat level it works at), ...numbers (statsOf at that level: a sign's slow, slip and
 * slipDmg) }. Empty for any other kind.
 */
export function upgradeRows(k) {
  const up = BUILD[k].upgrade, rows = [];
  if (!up) return rows;
  for (let u = 0; u <= up.max; u++) {
    const st = statsOf({ k, u });
    const row = { u, cost: u ? upgradeCost({ k, u: u - 1 }) : 0, level: up.level[u] };
    if (k === 'wetfloor') { row.slow = st.slow; row.slip = st.slip; row.slipDmg = st.slipDmg; }
    rows.push(row);
  }
  return rows;
}

/** Upgrading a kind with cash (0.4.01), in words from the rules: what each level costs and does. */
export function upgradeText(k = 'wetfloor') {
  const up = BUILD[k].upgrade;
  if (!up) return '';
  const rows = upgradeRows(k).slice(1);
  const top = BACK.tierLevel.indexOf(up.level[up.max]);
  const like = top > 0 ? ` The top level works as well as ${TIER_NAMES[top]} supplies would.` : '';
  return `pay for up to ${up.max} levels, each for good (it never runs out): ${rows.map((r) => money(r.cost)).join(', ')}.${like} The money counts as paid for the sign: selling it gives back ${pct(TUNE.sellBack)} of it`;
}

/** Plain facts about the Crate Stack, the shop floor's one plain wall, as [label, value] pairs. */
export function crateFacts() {
  return [
    // (0.4: dads walk through every building; only walls and Razor Wire stop them.)
    ['Shoppers', 'blocked, all but dads: a dad walks straight through it'],
    ['Gym bros', `with a hit ready, stop, hit it and walk through once it is down: one hit, and one more for each level it is reinforced (a Gym Bro has ${TUNE.smashMax} hits a visit, a ${SUPERS.gymbro.name} ${SUPERS.gymbro.smashMax ?? TUNE.smashMax}); resting after a hit, they walk round`],
    ['Reinforce', reinforceText()],
    ['Supplies', 'none: no Dumbwaiter under it, so nothing to stock, nothing to steal, and no Razor Wire'],
  ];
}

/** The kinds that can be reinforced for cash (0.4: Crate Stacks; 0.4.01: every security building too). */
export const reinforceable = () => [...WALL_ORDER, ...SECURITY_ORDER].filter((k) => BUILD[k].reinforce);

/** What each level of reinforcing kind k costs, in a game without cards: [$10, $16, ...]. */
export function reinforcePrices(k = 'crate') {
  const rf = BUILD[k].reinforce, prices = [];
  if (rf) for (let r = 0; r < rf.max; r++) prices.push(reinforceCost({ k, r }));
  return prices;
}

/**
 * Reinforcing a building of kind k (0.4 for Crate Stacks; 0.4.01 for security too), in words from
 * the rules: what a level does, what each costs (BUILD[k].reinforce, for a game without cards) and
 * what happens to the money. '' for a kind that cannot be reinforced.
 */
export function reinforceText(k = 'crate') {
  const rf = BUILD[k].reinforce;
  if (!rf) return '';
  const what = k === 'crate' ? 'the crate' : 'the building';
  return `pay for up to ${rf.max} levels, each one more gym bro hit it takes in a sales event: ${reinforcePrices(k).map(money).join(', ')}. The money counts as paid for ${what}: selling it gives back ${pct(TUNE.sellBack)} of it, and a rebuild costs ${pct(TUNE.rebuildShare)} of it, levels and all`;
}

/**
 * The Reinforce tool's rule for the handbook (0.4.01): what a level does, and the first level's
 * price for each kind that can be reinforced, from the rules.
 */
export function reinforceToolText() {
  const kinds = reinforceable();
  const rf = BUILD.crate.reinforce;
  return `every level is one more gym bro hit the building takes in a sales event, up to ${rf.max} levels, each dearer than the last (x${fmt(rf.grow)}). The first level costs ${kinds.map((k) => `${money(reinforceCost({ k, r: 0 }))} on ${an(BUILD[k].name)}`).join(', ')}. The money counts as paid for the building: selling it gives back ${pct(TUNE.sellBack)} of it, and a rebuild costs ${pct(TUNE.rebuildShare)} of it, levels and all`;
}
const an = (name) => (/^[AEIOU]/.test(name) ? `an ${name}` : `a ${name}`);

/**
 * Razor Wire's rule (0.4) in words, from the rules: where a building's wire runs, when it works and
 * what a unit lasts. For the handbook's Supplies card and the help.
 */
export function wireText() {
  const turns = BACK.wireTurns.slice(1);
  return `Give a security building a wire direction and, while it holds Razor Wire, nobody can step on its tiles or the ${BACK.wireReach} tiles beyond it that way (a wall cuts the wire short), open floor included. Ordinary shoppers see it and walk round it like a wall, for free; a dad walks straight into it, is turned away and goes round, and each dad turned away uses one: a unit turns away ${turns.slice(0, -1).join(', ')} or ${turns[turns.length - 1]} dads, by brand. Empty, the wire is only planned and stops nobody. A wire that would cut an entrance off from the tills, for dads or anyone else, stocked or not, is refused, and so is a building that would do it with every planned wire counted as stocked`;
}

// ---- The Back (0.4) ---------------------------------------------------------------------------

/** A game with no cards, for the rules' functions that read cards from a game (the plain numbers). */
const PLAIN = {};
/** Ticks as seconds. */
const secs = (t) => t / TICK_HZ;
/** Dollars and cents: "$0.25", "$1.00". */
const cents = (v) => `$${v.toFixed(2)}`;
/** The security buildings with no Dumbwaiter (0.4.01: the Wet Floor Sign, upgraded with cash instead). */
export const unfed = () => SECURITY_ORDER.filter((k) => !BUILD[k].lift);
/** Every security building that takes this supply (its track, or Razor Wire), by name. */
const takers = (track) => SECURITY_ORDER.filter((k) => stockTracks(k).includes(track)).map((k) => BUILD[k].name);
/** The machine that makes a supply (BUILD[k].supply is its type). */
const makerOf = (track) => Object.keys(BUILD).find((k) => BUILD[k].supply === SUPPLIES[track].type);

/** The speed of a belt lane, in tiles a second (an Overpass's lanes are belts too). */
const laneSpeed = () => (BACK.step * TICK_HZ) / BACK.sub;

/**
 * Plain facts about one of The Back's parts, as [label, value] pairs, worked out from the rules
 * (BACK and the functions in back.js), for a game without cards. The price is not among them: the
 * handbook shows it in the part's heading.
 */
export function backFacts(k) {
  const def = BUILD[k], out = [];
  const lane = `${fmt(laneSpeed())} tiles a second, ${Math.floor(BACK.sub / BACK.gap)} items to a tile`;
  if (k === 'drop') {
    out.push(['Junk', `${fmt(junkPerMinute(0))} pieces a minute as the store built it`]);
    const ups = [];
    for (let lv = 0; lv < BACK.dropUpMax; lv++) ups.push(`${money(dropUpCost(lv))} (${fmt(junkPerMinute(lv + 1))} a minute)`);
    out.push(['MORE JUNK', `any player can pay to speed it up, ${BACK.dropUpMax} times at most: ${ups.join(', ')}. Nobody gives that money back`]);
    out.push(['Hands out', 'to every side something takes junk from: a belt leading away or running past, a machine. Shared out in turn, passing over a side that is backed up']);
    out.push(['Where', 'put down by the store; nobody buys, moves, turns or removes one']);
  } else if (k === 'conv') {
    out.push(['Carries', lane]);
    out.push(['Takes from', 'behind and both sides, never head-on']);
    out.push(['Laying', 'press on the first tile, drag to the last, let go: a line of belts the shortest way, with as few turns as it can. A plain belt it crosses becomes an Overpass, and the line stops where your money does']);
  } else if (k === 'split') {
    out.push(['Holds', 'one item at a time']);
    out.push(['Deals out', 'to the front, the left and the right in turn, skipping a way that will not take it']);
  } else if (k === 'over') {
    out.push(['Carries', `two lanes that never mix, east-west and north-south, each ${lane}`]);
    out.push(['Which way', 'each lane runs the way the belt feeding it runs']);
  } else if (k === 'intern') {
    out.push(['Holds', `one item for ${fmt(BACK.internSecs)} s, then hands it to the tile in front of him`]);
    out.push(['Picks', 'the front-most item on the belt behind him that the tile in front wants; belts only, not an Overpass']);
  } else if (k === 'bin') {
    out.push(['Pays', `${TIER_NAMES.slice(1).map((name, t) => `${name} ${cents(BACK.binPay[t + 1])}`).join(', ')} a supply; junk nothing. Shared between the players like any income`]);
    out.push(['Takes from', 'any side, and never fills up']);
  } else if (def.supply) {
    const track = SUPPLY_TRACKS[def.supply], s = SUPPLIES[track], t = secs(makeTicks(PLAIN));
    out.push(['Makes', `${s.name} (${TIER_NAMES[1]}) from one junk every ${fmt(t)} s (${fmt(60 / t)} a minute)`]);
    out.push(['Takes', 'junk only, at the back and both sides; the supply comes out of the front']);
    out.push(['Stocks', takers(track).join(', ')]);
  } else if (k === 'rebrand') {
    out.push(['Raises', [1, 2, 3].map((t) => `${TIER_NAMES[t]} to ${TIER_NAMES[t + 1]} in ${fmt(secs(rebrandTicks(PLAIN, t)))} s`).join(', ')]);
    out.push(['Takes', `any supply below ${TIER_NAMES[TIER_NAMES.length - 1]}, never junk, at the back and both sides; out of the front one tier up`]);
  } else if (k === 'lift') {
    out.push(['Where', `under every tile of every security building, put there and taken away with it; none under a Crate Stack${unfed().length ? ` or ${unfed().map((k) => an(BUILD[k].name)).join(' or ')}` : ''}`]);
    out.push(['Holds', `up to ${stockCap(null)} units of each supply its building takes; it takes the next only once a whole unit is used up`]);
    out.push(['Takes from', 'any side']);
    out.push(['Lost', 'everything in it when the building above is wrecked or removed']);
  }
  // (0.4.01, the owner) Put down on a plain belt, a part takes its place: no removing it first.
  if (!def.fixed && k !== 'conv') out.push(['On a belt', `put it straight on a plain belt and it replaces it, for its price less the belt's (${money(def.cost - BUILD.conv.cost)})`]);
  return out;
}

/**
 * The four supplies (0.4.01: Duct Tape is gone), from the rules: [{ track, name, color, gives, maker (the machine's name),
 * takers (the security buildings that take it, by name) }], in STOCK_TRACKS order. (Until 0.4's
 * dads stage it also had `works`, false for Razor Wire, which was only stored.)
 */
export function supplyFacts() {
  return Object.keys(SUPPLIES).map((track) => ({
    track, name: SUPPLIES[track].name, color: SUPPLIES[track].color, gives: SUPPLIES[track].gives,
    maker: BUILD[makerOf(track)].name, takers: takers(track),
  }));
}

/**
 * One row per brand tier, from Store Brand to Platinum: { tier, name, level (the levels it counts
 * as for Bottled Spite, Rage Cola and Extension Cord), wire (dads a unit of Razor Wire turns away),
 * bin (what a Clearance Bin pays for it),
 * secs (the Rebrander's time to make it from the tier below; 0 for Store Brand, which the machines
 * make) }.
 */
export function tierFacts() {
  const out = [];
  for (let tier = 1; tier < TIER_NAMES.length; tier++) {
    out.push({
      tier, name: TIER_NAMES[tier], level: BACK.tierLevel[tier],
      wire: usesPer(null, 'wire', tier), bin: BACK.binPay[tier],
      secs: tier > 1 ? secs(rebrandTicks(PLAIN, tier - 1)) : 0,
    });
  }
  return out;
}

/**
 * How long one unit of Bottled Spite, Rage Cola or Extension Cord lasts in each security building
 * ([{ k, name, uses, per ('shots' or 'shoppers') }]): a tower's shots, or the shoppers anything else
 * acts on. Whatever the tier; the tier sets how much it does.
 */
export function unitFacts() {
  // (Not the Wet Floor Sign from 0.4.01: it takes no supplies.)
  return SECURITY_ORDER.filter((k) => BUILD[k].lift).map((k) => ({ k, name: BUILD[k].name, uses: usesPer(k, 'dmg', 1), per: BUILD[k].tower ? 'shots' : 'shoppers' }));
}

/**
 * How the whole game works (0.4, stage 6), in short sections for the Employee Handbook's first
 * tab and the README: [{ id, title, text }], every number from the rules (a game without cards, on
 * that difficulty). Written once here so the handbook and the README cannot tell two stories.
 */
export function howItWorks(difficulty = SETTINGS.defaults.difficulty) {
  const p = payFacts(difficulty);
  const tiers = tierFacts();
  const units = unitFacts();
  const rf = BUILD.crate.reinforce;
  const turns = BACK.wireTurns.slice(1);
  const ups = [];
  for (let lv = 0; lv < 2; lv++) ups.push(money(dropUpCost(lv)));
  const sup = Math.min(...Object.values(SHOPPERS).map((d) => d.sup.from));
  return [
    {
      id: 'store', title: 'The store',
      text: `Shoppers come in through the entrances (one per player) and walk to the tills. Each one who gets there takes a refund out of your cash; ${TUNE.refundLimit} refunds (${TUNE.refundPerPlayer} more for each extra player) and the store closes. A game is ${SETTINGS.defaults.waves} sales events unless the host picks another length, with a ${TUNE.buildSecs}-second build break between them (OPEN THE DOORS starts the next one early). From sales event ${sup} every kind of shopper has a gold super version, and every ${TUNE.bossEvery}th event the boss walks in too.`,
    },
    {
      id: 'floor', title: 'The shop floor: the maze',
      text: `Crate Stacks (${money(BUILD.crate.cost)}) and security block shoppers, so whatever you build is the route they walk: make it long and make it hurt. You can never block it completely. Security wears down patience until shoppers storm out empty-handed; Wet Floor Signs, Free Samples and the TV Salesman hold them in reach for longer. Each security building but the Wet Floor Sign has a Dumbwaiter under it, which is how The Back stocks it; a new one starts empty. The sign takes no supplies: UPGRADE on its card makes it better with cash, for good (${upgradeRows('wetfloor').slice(1).map((r) => money(r.cost)).join(', ')}), and it can stand over anything in The Back.`,
    },
    {
      id: 'back', title: 'The Back: the factory under the shop',
      text: `Tab (or the floor switch) takes you down. Same grid, same walls, and nothing down there gets in a shopper's way. Returns Drops, put down by the store, cough up returned junk (${fmt(junkPerMinute(0))} pieces a minute each) and share it out between every belt or machine touching them. Belts carry anything, ${fmt(laneSpeed())} tiles a second, the way their arrows point: with Belt (press on the first tile, drag to the last, let go) you lay a whole line, a plain belt it crosses becomes an Overpass, and the line stops where your money does. A machine turns a piece of junk into a unit of supply every ${fmt(secs(makeTicks(PLAIN)))} seconds and puts it out of its front. A belt that runs into a Dumbwaiter sends what it carries up to the building above, which holds up to ${stockCap(null)} units of each supply it takes. An Unpaid Intern lifts what the tile in front of him wants off a passing belt, a Splitter shares one line between up to three, an Overpass lets two lines cross, and a Clearance Bin at the end of a line takes the leftovers for pennies so nothing jams. Any of them put down on a plain belt replaces it, for its price less the belt's. Q puts down whatever you are holding.`,
    },
    {
      id: 'supplies', title: 'Supplies and brands',
      text: `Bottled Spite (Spite Still) makes security hit harder, Rage Cola (Cola Cannery) fire faster, Extension Cord (Cord Spooler) reach further, and Razor Wire (Barb Bender) stops dads and walls off shoppers. The machines make ${tiers[0].name}. A Rebrander puts any supply up a brand, slower each time: ${tiers.slice(1).map((t) => `${t.name} in ${fmt(t.secs)} s`).join(', ')}. For Spite, Cola and Cord the brands count as ${tiers.map((t) => `+${t.level}`).join(', ')} levels; a ring round the pip shows the brand (bronze, silver, gold).`,
    },
    {
      id: 'stock', title: 'Stock, and running dry',
      text: `Stock is used up as a building works: a unit of Spite, Cola or Cord lasts ${units.map((u) => `${u.name} ${u.uses} ${u.per}`).join(', ')}, whatever its brand. A building that is not working keeps what it has, so a fed one refills between shoppers and between events. When a supply runs out a red OUT OF ... bubble pops up over it and it is back to as built. The pips over a building show what it holds; zoomed out, a green disc means everything it takes is stocked, amber some, a red ring none. A blinking red lamp on a Dumbwaiter (and on the mark, zoomed out) means its building has a wire direction and no Razor Wire: it is asking for some. A building wrecked or removed loses its stock.`,
    },
    {
      id: 'dads', title: 'Dads and Razor Wire',
      text: `Dads walk straight through every building; only the store's walls and live Razor Wire stop them. Pick up Wire (Z) and click a security building (any but a Wet Floor Sign, which has no Dumbwaiter) to give it a wire direction: it then covers its own tiles and the ${BACK.wireReach} beyond them that way. While it holds Razor Wire the wire is live: ordinary shoppers see it and walk round it like a wall, for nothing, but a dad walks into it, is turned away and goes round; each wire charges a dad once, and a unit turns away ${turns.slice(0, -1).join(', ')} or ${turns[turns.length - 1]} dads by brand. With no wire in stock it is only planned (dashed) and stops nobody${takesSupply({ k: 'forklift' }, itemCode(5, 1)) ? '' : '; a building takes Razor Wire only once it has a direction, and its Dumbwaiter blinks red until some comes'}. The floor shows two blue routes: DADS, where they walk now, and DADS, IF WIRED, where they would walk with every planned wire stocked. A wire that would wall anyone in is refused, and so is a building that would, counting every planned wire as stocked.`,
    },
    {
      id: 'gym', title: 'Gym bros, reinforcing and rebuilding',
      text: `A gym bro smashes through Crate Stacks and now and then something else he passes: ${TUNE.smashMax} hits a visit, with ${TUNE.smashWait} seconds' rest after each, while he walks round like anyone else. Reinforce (U, or REINFORCE on a building's card) a crate or a security building for one more hit a sales event per level, up to ${rf.max} levels, each dearer than the last: the first is ${reinforceable().map((k) => `${money(reinforceCost({ k, r: 0 }))} on ${an(BUILD[k].name)}`).join(', ')}. Rebuild (B) puts a wreck back for ${pct(TUNE.rebuildShare)} of what was paid for it; the money goes at once and the building as soon as nothing is in the way.`,
    },
    {
      id: 'thieves', title: 'Thieves',
      text: `Shoppers who stop for free samples help themselves to stock as they walk past a building: one unit at a time, from the supply it holds most of, and stand there gloating for ${fmt(TUNE.grabSecs)} s. Card Traders, at a Midnight Release, rip out the best brand there is. Crates hold nothing worth stealing.`,
    },
    {
      id: 'money', title: 'Money',
      text: `${payText(difficulty)} Boss bounties and a Clearance Bin's pennies come on top. Each player has his own cash; the event pay is shared evenly, and so is everything else, refunds included. Money buys buildings on both floors and MORE JUNK: a Returns Drop's card sells levels that make it faster for good (${ups.join(', then ')}, and so on).`,
    },
    {
      id: 'cards', title: 'The cards',
      text: 'A game from the menu is dealt five cards before the first build break: two that screw you, two that help, one just weird. Click the card on show to ask for the next one: it comes once every player has clicked (or when its time is up). They change the rules for the whole game (prices, pay, how shoppers behave, how The Back works); the HAND panel shows them. The numbers in this handbook are for a game without cards.',
    },
  ];
}
