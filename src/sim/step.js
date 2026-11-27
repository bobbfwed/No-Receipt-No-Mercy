// One tick of the simulation. Deterministic: the same state always produces the same next state,
// which lets every player's browser predict the game between updates from the host.
import { DIRS, BUILD, ITEMS, SHOPPERS, BOSS, BABY, PUP, CARDS, shopperDef, defOf, perHead, ST, TUNE, TICK_HZ, DT } from './constants.js';
import { rand, bump, resetWaveStats, earn, lose, shareCount, difficultyOf, expireAway, anchorOf, tilesOf, centreOf, isEndless, releaseOrder, releaseAllOrders, footprint } from './state.js';
import { getField, getFieldTo, getBackField, modeOf, routeOf, smashReady, walkable, NORMAL, HOP, SMASH, GHOST, UNREACHABLE } from './path.js';
import { statsOf, spentOn } from './upgrades.js';
import { takeOfficeWave, refreshBudget } from './office.js';
// (commands.js imports from this file too. That is safe: neither uses the other while loading.)
import { stepRebuilds } from './commands.js';
import { stepBack, useWork, useStock, usesIn, syncLifts } from './back.js';
import { stepDeal, cardPatience, cardBoss, cardSpeed, cardCrowd, cardPops, cardRefund, cardSell, cardBonus, cardTargets, cardPee, cardSlip, cardFall, cardPep, cardShield, cardLiftChance, cardLiftHeal, cardFee,
  hasCard, cardKidRuns, kidBack, kidAlong, pupsOf, trailsFlasher, supportDog, stopsToPet, drinks, boozeChance, wideMess } from './cards.js';

const secs = (s) => Math.max(1, Math.round(s * TICK_HZ));

/** A shopper kind's own number if it has one (supers do), otherwise the general one from TUNE. */
const tv = (def, key) => def[key] ?? TUNE[key];

/** How much more patient shoppers are in wave n than in wave 1: gentle early, steep late. */
export const patienceGrowth = (n) => 1 + TUNE.hpGrowth * (n - 1) + TUNE.hpGrowth2 * (n - 1) ** 2;

/** The boss's tier in wave n: 1 in wave 5, 2 in wave 10 and so on; 0 in a wave without him. */
export const bossTier = (n) => (n >= TUNE.bossEvery && n % TUNE.bossEvery === 0 ? n / TUNE.bossEvery : 0);

/** What the boss is called at a tier (tier 4 and above are all the last title). */
export const bossTitle = (tier) => BOSS.titles[Math.max(0, Math.min(BOSS.titles.length, tier | 0) - 1)];

/** The boss's group in a wave's list (he walks in through any open entrance). */
const bossGroup = (tier) => ({ k: 'boss', n: 1, gap: 1, at: TUNE.bossAt, sup: 0, tr: tier });

/**
 * Which Midnight Release wave n is (1 for the first, 2 for the second ...), or 0 if it is not one:
 * sales events TUNE.releaseFrom, releaseFrom + releaseEvery and so on, never a boss event, in a
 * game of any length (an endless one too). A fixed schedule, so players can plan for it.
 */
export function releaseNo(n) {
  const from = TUNE.releaseFrom, every = TUNE.releaseEvery;
  if (!(n >= from) || (n - from) % every !== 0 || bossTier(n)) return 0;
  return (n - from) / every + 1;
}

/**
 * How many Card Traders the Midnight Release in wave n brings (0 if wave n is not one):
 * TUNE.releaseFirst at the first, TUNE.releaseStep more at each one after, for one player; each
 * player after the first adds TUNE.crowdPerPlayer of that, like any crowd. Not scaled by
 * crowdScale or crowdCurves: these are the numbers that arrive.
 */
export function releaseSize(n, players = 1) {
  const k = releaseNo(n);
  if (!k) return 0;
  const crowd = 1 + TUNE.crowdPerPlayer * (Math.max(1, players) - 1);
  return Math.max(1, Math.round((TUNE.releaseFirst + TUNE.releaseStep * (k - 1)) * crowd));
}

/**
 * The entrance the mob of wave n comes through (an index into state.doors): a different one each
 * release, going round the open ones.
 */
export function releaseDoor(n, open = 1) {
  return (Math.max(1, releaseNo(n)) - 1) % Math.max(1, open);
}

/**
 * The mob's group in a wave's list: all of them TUNE.releaseAt seconds after the doors open,
 * within TUNE.releaseSecs. From the Scalper's first event (the second release) a growing share
 * are Scalpers, as in any group. `mob` marks it (spawn sends the 'release' event for its first).
 */
function releaseGroup(n, players) {
  const many = releaseSize(n, players);
  const from = SHOPPERS.trader.sup.from;
  const sup = n < from ? 0 : Math.min(many, Math.max(1, Math.floor(many * (TUNE.superShare + TUNE.superShareStep * (n - from)))));
  return { k: 'trader', n: many, gap: TUNE.releaseSecs / many, at: TUNE.releaseAt, sup, mob: 1 };
}

/**
 * The boss's patience when he walks in during wave n (at his tier for that wave; tier 1 if the
 * wave has none). `hpMul` is the difficulty's multiplier.
 */
export function bossPatience(n, hpMul = 1) {
  const tier = bossTier(n) || 1;
  return BOSS.hp * patienceGrowth(n) * hpMul * (1 + TUNE.bossTierHp * (tier - 1)) * surgeHpAt(n);
}

/** The late surge's patience multiplier for wave n: 1 up to TUNE.surgeFrom, then compounding. */
export const surgeHpAt = (n) => TUNE.surgeHp ** Math.max(0, n - TUNE.surgeFrom);
/** The late surge's head-count multiplier for wave n: 1 up to TUNE.surgeFrom, then compounding. */
export const surgeCrowdAt = (n) => TUNE.surgeCrowd ** Math.max(0, n - TUNE.surgeFrom);

/**
 * The patience multiplier for wave n (see TUNE.crowdScale): 1 up to and including wave
 * TUNE.patienceFrom, then rising in a straight line to TUNE.patienceScale at wave
 * TUNE.patienceFull, and that from then on; past TUNE.surgeFrom the late surge multiplies it
 * again (surgeHpAt). It also multiplies a dad's drain.
 */
export function patienceScaleAt(n) {
  const from = TUNE.patienceFrom, full = TUNE.patienceFull;
  const t = full > from ? (n - from) / (full - from) : n > from ? 1 : 0;
  return (1 + (TUNE.patienceScale - 1) * Math.min(1, Math.max(0, t))) * surgeHpAt(n);
}

/** The height at wave n of a curve of [wave, share] points joined by straight lines. */
function curveAt(pts, n) {
  if (n <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [n0, s0] = pts[i - 1], [n1, s1] = pts[i];
    if (n <= n1) return s0 + (s1 - s0) * ((n - n0) / (n1 - n0));
  }
  return pts[pts.length - 1][1];
}

/**
 * The share of its shoppers wave n sends: every curve of TUNE.crowdCurves read at n (the first
 * share before a curve's first point, the last after its last) and multiplied together, times
 * TUNE.crowdTrim[n] if that wave has one.
 */
export function crowdShiftAt(n) {
  let share = TUNE.crowdTrim[n] ?? 1;
  for (const pts of TUNE.crowdCurves) share *= curveAt(pts, n);
  return share;
}

/**
 * The patience a shopper (anyone but the boss: see bossPatience) walks in with in the game's
 * current wave: its base patience, grown by wave, times the difficulty's multiplier and the
 * wave's patience multiplier (patienceScaleAt). A training game uses neither multiplier, so the
 * lessons play as written.
 * `k`, the shopper's kind ('baby' for a Pregnant Lady's babies), lets the game's cards change it
 * too (cardPatience in cards.js); left out, no card does.
 */
export function patienceFor(state, def, k = null) {
  // (A lesson's shopper: see TUNE.trainingPatienceDivisor.)
  if (state.training) return (def.hp / TUNE.trainingPatienceDivisor) * patienceGrowth(state.wave);
  return def.hp * patienceGrowth(state.wave) * (difficultyOf(state).hp * patienceScaleAt(state.wave)) * (k ? cardPatience(state, k) : 1);
}

/**
 * Who turns up in wave n (1-based). Each group is { k: shopper kind, n: how many, gap: seconds
 * between arrivals, at: seconds after the doors open, sup: how many of them are super }.
 * Dads arrive as a "dad line": a tight single file of men who want to be done.
 * Every fifth wave ends the list with the boss: { k: 'boss', n: 1, gap: 1, at, sup: 0, tr: tier },
 * and every other group is TUNE.bossCrowd of its usual size, so he stands out.
 * A Midnight Release (releaseNo) ends it with the mob of Card Traders: { k: 'trader', n, gap, at,
 * sup, mob: 1 } (releaseGroup), and every other group is TUNE.releaseCrowd of its usual size.
 * Every group is TUNE.crowdScale of the size it would be (to the nearest whole number, a half
 * rounded down, never below one, so every kind is still there), arriving over the same length of
 * time: half as many, twice as far apart.
 * Before that, every group is multiplied by crowdShiftAt(n): more shoppers in the early waves,
 * fewer in the late ones.
 * However late the wave, the crowd is at most TUNE.maxCrowd times TUNE.crowdScale times
 * crowdShiftAt(n) times surgeCrowdAt(n) shoppers per player's worth (the boss aside); beyond that
 * only patience and the late surge keep growing.
 * (Training games do not come through here: their waves are queued by the lessons.)
 * @param {number} [players] how many players share the store; more players, more shoppers
 */
export function waveSpec(n, players = 1) {
  const g = [{ k: 'hunter', n: 6 + 2 * n, gap: 0.9, at: 0 }];
  if (n >= 2) g.push({ k: 'dad', n: 1 + n, gap: 0.3, at: 10 });
  if (n >= 3) g.push({ k: 'clipper', n: 3 * (n - 1), gap: 0.35, at: 5 });
  if (n >= 5) g.push({ k: 'karen', n: Math.floor(n / 3), gap: 4, at: 8 });
  if (n >= 7) g.push({ k: 'scooter', n: Math.floor((n - 5) / 2) + 1, gap: 3, at: 15 });
  if (n >= 10) g.push({ k: 'dad', n: n - 4, gap: 0.3, at: 26 });
  if (n >= 13) g.push({ k: 'hunter', n: 2 * n, gap: 0.5, at: 20 });
  // The shoppers with a trick, introduced one kind at a time.
  if (n >= 3) g.push({ k: 'mom', n: 1 + Math.floor(n / 3), gap: 3, at: 6 });
  if (n >= 4) g.push({ k: 'teen', n: Math.floor(n / 2), gap: 2.5, at: 3 });
  if (n >= 6) g.push({ k: 'blind', n: Math.floor(n / 4), gap: 5, at: 12 });
  if (n >= 6) g.push({ k: 'gymbro', n: 1 + Math.floor((n - 6) / 3), gap: 6, at: 18 });
  if (n >= 5) g.push({ k: 'drinker', n: 1 + Math.floor((n - 5) / 3), gap: 4, at: 9 });
  if (n >= 7) g.push({ k: 'dog', n: 2 + Math.floor((n - 7) / 2), gap: 1.2, at: 14 });
  if (n >= 8) g.push({ k: 'flasher', n: 1 + Math.floor((n - 8) / 4), gap: 6, at: 16 });
  if (n >= 8) g.push({ k: 'preggo', n: 1 + Math.floor((n - 8) / 3), gap: 6, at: 13 });
  if (n >= 9) g.push({ k: 'cosplay', n: 1 + Math.floor((n - 9) / 3), gap: 5, at: 11 });

  // Later waves bring bigger crowds, and so do more players. A bigger group arrives over the
  // same length of time, just closer together.
  const crowd = 1 + TUNE.crowdPerPlayer * (Math.max(1, players) - 1);
  const tier = bossTier(n);
  // (The late surge, past TUNE.surgeFrom, multiplies both the crowd and its cap below.)
  const surge = surgeCrowdAt(n);
  let grow = (1 + TUNE.lateGrowth * Math.max(0, n - TUNE.lateFrom + 1)) * crowd * (tier ? TUNE.bossCrowd : 1) * crowdShiftAt(n) * surge;
  // A Midnight Release: the usual crowd is a little smaller, to make room for the mob.
  const release = releaseNo(n);
  if (release) grow *= TUNE.releaseCrowd;
  // Fewer, tougher shoppers: each group is TUNE.crowdScale of what it would be, to the nearest
  // whole number, never below one, so a kind that is in the event is still in it. A half is
  // rounded DOWN: always rounding up left the crowd at 53 to 62% of its old size in the early
  // events against a refund limit cut to 50%, and with so few shoppers that alone cost the
  // scripted players up to six sales events on an unlucky seed.
  const scaled = (full) => Math.max(1, Math.floor(full * TUNE.crowdScale + 0.5 - 1e-9));
  // An endless game goes on for ever and the crowd would grow without limit (wave 100 would send
  // over 10,000 shoppers to a solo player). Past the cap, every group shrinks by the same share.
  // (The cap takes the wave's crowd share too, since 0.2.12: otherwise an endless game would grow
  // back to the full cap and undo the owner's "25% fewer from event 30 on".)
  const most = Math.round(TUNE.maxCrowd * crowd * TUNE.crowdScale * crowdShiftAt(n) * surge);
  let total = 0;
  for (const grp of g) total += scaled(Math.max(1, Math.round(grp.n * grow)));
  const capped = total > most;
  if (capped) grow *= most / total;
  total = 0;
  for (const grp of g) {
    const many = scaled(Math.max(1, capped ? Math.floor(grp.n * grow) : Math.round(grp.n * grow)));
    grp.gap = (grp.gap * grp.n) / many;
    grp.n = many;
    total += many;
    // Once a kind's super version has arrived, a growing share of every group is super.
    const from = SHOPPERS[grp.k].sup.from;
    // (The share passes all of them in about wave 83 of an endless game: from then on, all are.)
    grp.sup = n < from ? 0
      : Math.min(grp.n, Math.max(1, Math.floor(grp.n * (TUNE.superShare + TUNE.superShareStep * (n - from)))));
  }
  // (Very small groups never go below one, which can leave the cap a few over: take them off the
  // biggest groups.)
  while (total > most) {
    let big = g[0];
    for (const grp of g) if (grp.n > big.n) big = grp;
    big.gap = (big.gap * big.n) / (big.n - 1);
    big.n--;
    big.sup = Math.min(big.sup, big.n);
    total--;
  }
  if (tier) g.push(bossGroup(tier));
  // (The mob comes after the cap and the rounding above: its size is exactly releaseSize.)
  if (release) g.push(releaseGroup(n, players));
  return g;
}

/**
 * Training mode: lines up the shoppers for the next wave. The wave starts when a player opens
 * the doors. Groups have the same shape as waveSpec() returns.
 */
export function queueTrainingWave(state, groups) {
  if (state.training) state.nextWave = groups;
}

/** Training mode: sets every player's cash, so a lesson can hand out what it needs. */
export function setTrainingCash(state, cash) {
  if (state.training) for (const p of state.players) p.cash = Math.max(0, Math.floor(cash));
}

/**
 * The doors are being opened before the build timer ran out. Without this, opening early threw
 * away whatever the factory would have sold in the time that was left, so it was always the
 * wrong thing to do (the owner's complaint). So the time that was left is played through in one
 * go, exactly as it would have gone: belts move, machines work, chutes sell and pay, puddles dry.
 * Nothing else happens in a build phase (there are no shoppers), so the store ends up precisely
 * as if the players had waited. One 'early' event reports it instead of a sale event per item.
 * Call it just before beginWave().
 */
export function skipBuild(state, ev) {
  // (The tick on which the timer runs out is already the wave's first, so one fewer than is left.)
  const left = state.phase === 'build' && state.phaseT > 1 ? state.phaseT - 1 : 0;
  if (!left) return;
  const only = [];
  for (let i = 0; i < state.grid.length; i++) if (state.grid[i] && state.grid[i].part === undefined) only.push(i);
  const fields = [getField(state, NORMAL), getField(state, HOP), getField(state, SMASH)];
  const quiet = [];
  let cash = 0, sold = 0;
  // These sales are paid in one tick, not over the time they stand for, so they stay out of the
  // running total of goods sold (state.sales), which the interface reads as income per minute.
  const sales = state.sales;
  for (let n = 0; n < left; n++) {
    for (let k = state.messes.length - 1; k >= 0; k--) {
      if (--state.messes[k][1] <= 0) state.messes.splice(k, 1);
    }
    // The Back (0.4) runs through the skipped time too, as it would have tick by tick. (A later stage
    // of 0.4 stops running anything ahead here; until then the two floors stay in step.)
    stepBack(state, quiet);
    stepBuildings(state, fields, quiet, only);
    for (const e of quiet) {
      if (e.e === 'sale') { cash += e.v; sold++; } else if (e.e === 'binned') cash += e.v;
    }
    quiet.length = 0;
  }
  if (sales === undefined) delete state.sales; else state.sales = sales;
  ev.push({ e: 'early', secs: Math.round(left / TICK_HZ), cash, sold });
}

/** Opens the doors for the next wave. */
export function beginWave(state, ev) {
  // Training waves do not count up: shoppers keep their starting patience.
  if (state.training) state.wave = 1; else state.wave++;
  state.phase = 'wave';
  state.phaseT = 0;
  state.waveAt = state.tick;
  resetWaveStats(state);
  const q = [];
  let dads = 0;
  // A Head Office player's plan replaces the automatic wave, if he made one.
  const bought = state.training ? null : takeOfficeWave(state);
  state.storeReady = false;
  const groups = state.training ? state.nextWave || [] : bought || waveSpec(state.wave, shareCount(state));
  // The game's cards may bring more or fewer of the ordinary crowd (cardCrowd): every group but the
  // boss and a Midnight Release mob, arriving over the same length of time, with the same share of
  // supers. Not a Head Office plan: he paid for each shopper in it.
  if (!state.training && !bought) {
    for (const g of groups) {
      if (g.k === 'boss' || g.mob) continue;
      const m = cardCrowd(state, g.k);
      if (m === 1) continue;
      const many = Math.max(1, Math.round(g.n * m));
      if (g.sup) g.sup = Math.min(many, Math.max(1, Math.round((g.sup * many) / g.n)));
      g.gap = (g.gap * g.n) / many;
      g.n = many;
    }
  }
  // Head Office cannot buy the boss, and cannot keep him out either: he comes whatever was planned.
  const tier = state.training ? 0 : bossTier(state.wave);
  if (bought && tier) groups.push(bossGroup(tier));
  // Nor the Midnight Release: the mob comes on top of whatever he bought.
  const release = state.training ? 0 : releaseSize(state.wave, shareCount(state));
  if (bought && release) groups.push(releaseGroup(state.wave, shareCount(state)));
  state.nextWave = null;
  const supers = new Set();
  for (const g of groups) {
    if (g.k === 'dad') dads += g.n;
    // The mob all comes through one entrance, a different one each release.
    if (g.mob && !state.training) g.door = releaseDoor(state.wave, state.open);
    const sup = Math.min(g.n, g.sup || 0);
    if (sup) supers.add(g.k);
    for (let j = 0; j < g.n; j++) {
      // Spread the supers evenly through the group.
      const isSup = sup > 0 && ((j + 1) * sup) % g.n < sup ? 1 : 0;
      const at = [state.tick + secs(g.at + j * g.gap), g.k, isSup, g.door ?? -1];
      // (The first of a mob carries its size, so spawn() can announce it: see the 'release' event.)
      if (g.mob && j === 0) at.push(g.n);
      q.push(at);
    }
  }
  q.sort((a, b) => a[0] - b[0]);
  state.spawnQ = q;
  ev.push({
    e: 'waveStart', wave: state.wave, total: q.length, dads,
    kinds: [...new Set(groups.map((g) => g.k))], supers: [...supers], office: bought ? 1 : 0,
    boss: groups.some((g) => g.k === 'boss') ? tier || 1 : 0,
    release: groups.reduce((n, g) => n + (g.mob ? g.n : 0), 0),
  });
}

function endWave(state, ev) {
  // Gym bro damage only counts within a wave: every building is whole again for the next.
  for (const b of state.grid) if (b && b.hit) delete b.hit;
  state.carts = [];
  if (state.training) {
    // Back to an untimed build phase; the lesson decides what happens next.
    state.phase = 'build';
    state.phaseT = -1;
    ev.push({ e: 'waveEnd', wave: state.wave, bonus: 0, training: true });
    return;
  }
  // Every player gets the whole bonus. (The overtime card makes it bigger: cardBonus.)
  const bonus = Math.round((TUNE.waveBonus + TUNE.waveBonusStep * state.wave) * difficultyOf(state).pay * cardBonus(state));
  earn(state, bonus * shareCount(state));
  ev.push({ e: 'waveEnd', wave: state.wave, bonus });
  if (!isEndless(state) && state.wave >= state.waves) {
    state.phase = 'won';
    // (Money held for rebuilds that will now never happen goes back: the end screen counts cash.)
    releaseAllOrders(state);
    ev.push({ e: 'won' });
  } else {
    state.phase = 'build';
    state.phaseT = secs(TUNE.buildSecs);
    refreshBudget(state);
  }
}

function spawn(state, ev) {
  const q = state.spawnQ;
  if (!q.length || q[0][0] > state.tick) return;
  const W = state.w;
  const anyDoor = state.doors.slice(0, state.open).flat();
  while (q.length && q[0][0] <= state.tick) {
    const [, k, sup, at, mob] = q.shift();
    const def = shopperDef(k, sup);
    // Head Office picks the entrance for his groups; otherwise any open one.
    const doors = at >= 0 && at < state.open ? state.doors[at] : anyDoor;
    const door = doors[(rand(state) * doors.length) | 0];
    // Dads walk in a strict single file. In training everyone does, so a lesson plays out the
    // same way every time.
    const single = k === 'dad' || state.training;
    // (The boss is not one of the flood: the patience multiplier, patienceScaleAt, is not for him.
    // The game's cards may change either: cardBoss, cardPatience.)
    const hp = def.boss ? bossPatience(state.wave, state.training ? 1 / TUNE.trainingPatienceDivisor : difficultyOf(state).hp) * cardBoss(state) : patienceFor(state, def, k);
    const s = {
      id: state.nextId++, k,
      x: (door % W) + 0.5, y: ((door / W) | 0) + 0.5, vx: 0, vy: 0,
      hp, mhp: hp, st: ST.WALK, t: 0, cd: 0,
      ox: single ? 0 : (rand(state) - 0.5) * 0.5,
      oy: single ? 0 : (rand(state) - 0.5) * 0.5,
      lt: -1,
    };
    if (sup) s.sup = 1;
    // Extra fields for the shoppers with a trick (documented in state.js).
    if (def.messy) s.m = secs(tv(def, 'messEvery') * (0.4 + 0.6 * rand(state)));
    // (A kid's first escape: his own time, see kidFirst. In training the old short fixed wait, so the
    // Mom and Kid lesson plays out the same every time in its small store.)
    if (def.kid) { s.kd = 0; s.kx = s.x; s.ky = s.y; s.kvx = 0; s.kvy = 0; s.kr = 0; s.kc = secs(state.training ? tv(def, 'kidRest') * 0.5 : kidFirst(def, s.id)); s.kn = 0; }
    if (def.bolts) s.bt = 0;
    if (def.smashes) { s.sm = 0; s.hn = 0; s.hw = 0; }
    if (def.flashes) { s.m = secs(tv(def, 'flashEvery') * (0.4 + 0.6 * rand(state))); s.fl = 0; }
    if (def.sways) s.sv = 1;
    if (def.boss) {
      s.tr = bossTier(state.wave) || 1;
      // His first pep talk comes sooner than the rest, so it is seen before he is in the thick of it.
      s.pp = secs(def.pepEvery * 0.5);
    }
    state.shoppers.push(s);
    if (def.boss) ev.push({ e: 'bossIn', tier: s.tr, x: s.x, y: s.y });
    // The first of a Midnight Release's mob: the rest are right behind him.
    if (mob) ev.push({ e: 'release', n: mob, door: at, x: s.x, y: s.y, wave: state.wave });
  }
}

/** Index of the tile next to tile i in direction d, or -1 if off the map. */
function neighbour(state, i, d) {
  const W = state.w;
  const x = (i % W) + DIRS[d][0], y = ((i / W) | 0) + DIRS[d][1];
  return x < 0 || y < 0 || x >= W || y >= state.h ? -1 : y * W + x;
}

/** The tile a shopper on tile i steps to next on a distance map (i itself if none is closer). */
function nextTile(state, field, i, id) {
  let best = i, bd = field[i];
  for (let k = 0; k < 4; k++) {
    const ni = neighbour(state, i, (k + id) & 3); // vary the tie-break so crowds spread out
    if (ni >= 0 && field[ni] < bd) { bd = field[ni]; best = ni; }
  }
  return best;
}

/** Tries to hand an item travelling in direction d to the building on tile ti. */
function offer(state, ti, kind, d, ev) {
  if (ti < 0) return false;
  const b = state.grid[ti];
  if (!b) return false;
  if (b.k === 'belt') {
    if (b.d === ((d + 2) & 3)) return false; // two belts facing each other
    const it = b.it;
    if (it.length >= 2 || (it.length && it[it.length - 1][1] < 0.5)) return false;
    it.push([kind, 0]);
    return true;
  }
  if (b.k === 'press' || b.k === 'packer') {
    // A machine takes its input from any side except the side it outputs to.
    if (kind !== BUILD[b.k].takes || b.n >= 2 || d === ((b.d + 2) & 3)) return false;
    b.n++;
    return true;
  }
  if (b.k === 'chute') {
    // Whole dollars, and never nothing, whatever the difficulty (or a card: cardSell) does to the price.
    const v = Math.max(1, Math.round(ITEMS[kind].value * difficultyOf(state).pay * cardSell(state, kind)));
    bump(state, b.o, 'shipped');
    takings(state, v, b.o);
    // The running total behind the income-per-minute panel (state.sales, 0.3.03).
    state.sales = (state.sales || 0) + v;
    ev.push({ e: 'sale', i: ti, v, kind });
    return true;
  }
  return false;
}

/**
 * The store has sold something for v dollars (already rounded): split between the players like
 * any income, counted in the sales event's takings, and credited to the player whose building
 * made the sale. A chute's sale and a shopper actually buying something (the warranty card) both
 * come through here.
 */
function takings(state, v, owner) {
  earn(state, v);
  state.ws.earned += v;
  bump(state, owner, 'earned', v);
}

/**
 * The warranty card: a shopper stopped at a stand (a Free Sample table or a TV Salesman, anchor
 * tile ai) actually buys something, now and then (CARDS.warranty.chance, rolled once per stop).
 * Paid like any sale, times the difficulty's income multiplier, in whole dollars. Sends `bought`.
 */
function maybeBuy(state, s, ai, ev) {
  if (!hasCard(state, 'warranty')) return;
  const c = CARDS.warranty, b = state.grid[ai];
  if (!b || rand(state) >= c.chance) return;
  const base = b.k === 'salesman' ? c.salesMin + rand(state) * (c.salesMax - c.salesMin) : c.sample;
  const v = Math.max(1, Math.round(base * difficultyOf(state).pay));
  takings(state, v, b.o);
  const [cx, cy] = centreOf(state, ai, b);
  ev.push({ e: 'bought', i: ai, k: b.k, v, x: cx, y: cy, by: s.k });
}

function giveUp(state, s, by, why, ev) {
  s.st = ST.LEAVE;
  s.t = secs(TUNE.leaveSecs);
  s.hp = 0;
  // A baby who gives up is not a shopper stopped: a dozen of them would swamp the review's count
  // and its ranking of who did the most. Nor is a puppy.
  if (s.k !== 'baby' && s.k !== 'pup') {
    state.ws.stopped++;
    if (by >= 0) bump(state, by, 'stopped');
  }
  const e = { e: 'left', k: s.k, sup: s.sup | 0, x: s.x, y: s.y, by, why };
  // The restocking card: he pays the store on his way out (`fee`, before it is split).
  const fee = cardFee(state, s);
  if (fee > 0) {
    earn(state, fee);
    state.ws.earned += fee;
    e.fee = fee;
  }
  ev.push(e);
  // Driving the boss out pays a bounty, shared like any other income.
  if (s.k === 'boss') {
    const tier = s.tr || 1;
    const bounty = Math.max(1, Math.round(TUNE.bossBounty * tier * difficultyOf(state).pay));
    earn(state, bounty);
    ev.push({ e: 'bossOut', tier, x: s.x, y: s.y, bounty });
  }
}

/** Most abandoned carts remembered in one wave; beyond this the oldest is forgotten. */
const CARTS_MAX = 200;

/** A mom has gone down for the last time and left her cart where she fell (see state.carts). */
function dropCart(state, s) {
  const r = (v) => Math.round(v * 1000) / 1000;
  const carts = (state.carts ||= []);
  carts.push([r(s.x), r(s.y), s.sup ? 1 : 0, s.vx < 0 ? -1 : 1]);
  if (carts.length > CARTS_MAX) carts.shift();
}

/** True while a mom's child is out of her hands: running away, or waiting to be fetched. */
const kidLoose = (s) => s.kd === 1 || s.kd === 2;

/**
 * A baby's share of BABY.speed, between BABY.paceMin and BABY.paceMax, from its id alone, so the
 * host and every client agree without anything stored or drawn at random. A litter has
 * consecutive ids; stepping through by the golden ratio spreads any run of them evenly over the
 * range.
 */
export function babyPace(id) {
  const f = (id * 0.6180339887498949) % 1;
  return BABY.paceMin + (BABY.paceMax - BABY.paceMin) * f;
}

/**
 * A shopper's own share of his kind's walking speed: between 1 - TUNE.paceSpread and
 * 1 + TUNE.paceSpread, from his id alone (like babyPace: nothing stored, nothing drawn at random,
 * so the host, every client and an old save agree). Stepping through by the silver ratio rather
 * than the golden one spreads a run of ids evenly as well, but keeps a mom's pace from lining up
 * with her kid's first wait (kidFirst), which steps by the golden ratio. 1 for the boss, for
 * babies (babyPace is theirs) and in a training game, whose lessons expect exact speeds.
 */
export function walkPace(state, s) {
  if (state.training || s.k === 'boss' || s.k === 'baby' || s.k === 'pup') return 1;
  const f = (s.id * 0.4142135623730951) % 1;
  return 1 + TUNE.paceSpread * (2 * f - 1);
}

/**
 * How many seconds a child stays in the cart before he can first escape: between kidFirstMin and
 * kidFirstMax, from his mom's id alone (like babyPace: nothing stored, nothing drawn at random, and
 * the golden ratio spreads moms who walk in together evenly over the range). Without it every kid
 * got out within a few seconds of the door and they all waited in the same few spots.
 */
export function kidFirst(def, id) {
  const f = (id * 0.6180339887498949) % 1;
  const lo = tv(def, 'kidFirstMin'), hi = tv(def, 'kidFirstMax');
  return lo + (hi - lo) * f;
}

/**
 * A Pregnant Lady has run out of patience. If a Barcode Laser took the last of it, she just storms
 * off like anyone ('left', then 'nopop'). Otherwise she pops: she is gone at once ('left' with why
 * 'pop', then 'pop'), and def.pops babies appear round where she stood and run for the tills.
 * `pups` (the spayed card): she is a pregnant Stray Dog, and bursts into that many puppies (PUP)
 * instead, the same way; her 'nopop' and 'pop' events then have `pup: 1`.
 */
function popOut(state, s, def, by, laser, ev, pups = 0) {
  const sup = s.sup | 0;
  if (laser) {
    giveUp(state, s, by, 'annoyed', ev);
    const e = { e: 'nopop', x: s.x, y: s.y, sup };
    if (pups) e.pup = 1;
    ev.push(e);
    return;
  }
  giveUp(state, s, by, 'pop', ev);
  // No storming off: she is taken away the next time the shoppers move (later this tick if a
  // building did it, as it always is today).
  s.t = 1;
  // (The game's cards may change how many babies: cardPops. Not puppies: those cards are about her.)
  const many = pups ? 1 : cardPops(state);
  const k = pups ? 'pup' : 'baby';
  const n = pups || (many === 1 ? def.pops : Math.max(1, Math.round(def.pops * many))), hp = patienceFor(state, pups ? PUP : BABY, k), r = TUNE.popSpread;
  // Spread round her, but kept on her own tile: it is floor, and the next one may be a belt or a wall.
  const tx = Math.floor(s.x), ty = Math.floor(s.y);
  const near = (v, t) => Math.min(t + 0.95, Math.max(t + 0.05, v + (rand(state) * 2 - 1) * r));
  for (let j = 0; j < n; j++) {
    const x = near(s.x, tx), y = near(s.y, ty);
    state.shoppers.push({
      id: state.nextId++, k, x, y, vx: 0, vy: 0, hp, mhp: hp, st: ST.WALK, t: 0, cd: 0,
      ox: (rand(state) - 0.5) * 0.5, oy: (rand(state) - 0.5) * 0.5, lt: -1,
    });
  }
  const e = { e: 'pop', x: s.x, y: s.y, n, sup };
  if (pups) e.pup = 1;
  ev.push(e);
}

/**
 * How much more (or less) a kind of security does to a shopper with definition `def`:
 * TUNE.weakMul if it is what he is weak to, TUNE.toughMul if it is what he is tough against,
 * otherwise 1. `from` is a building kind, or '' for anything that is not a building's (a dad's
 * drain, a slip on a mess, a pep talk), which is never changed.
 */
export function edgeMul(def, from) {
  if (!from) return 1;
  return def.weak === from ? TUNE.weakMul : def.tough === from ? TUNE.toughMul : 1;
}

/**
 * Takes patience off a shopper. `from` is the kind of building that did it ('' for anything else,
 * such as slipping on a mess). A shopper weak to that kind loses more, one tough against it less
 * (edgeMul). A Pregnant Lady does not pop if the hit that finishes her is a Barcode Laser's.
 */
function hurt(state, s, dmg, by, ev, from = '') {
  if (s.st === ST.LEAVE) return;
  // A mom crawling to her child soaks up everything thrown at her.
  if (s.cr === 1) return;
  const def = defOf(s);
  dmg *= edgeMul(def, from);
  s.hp -= dmg;
  if (by >= 0) bump(state, by, 'annoy', dmg);
  if (s.hp > 0) return;
  // Out of patience with her child loose: she is not going anywhere without him (once; a Soccer
  // Mom twice). The last time she may, she leaves the cart behind and will carry him after.
  if (kidLoose(s) && (s.crn | 0) < tv(def, 'crawlTimes')) {
    s.cr = 1;
    s.hp = 0;
    s.st = ST.WALK;
    s.t = 0;
    if ((s.crn | 0) + 1 >= tv(def, 'crawlTimes')) { s.nc = 1; dropCart(state, s); }
    ev.push({ e: 'crawl', x: s.x, y: s.y });
    return;
  }
  // (A pregnant Stray Dog, the spayed card, goes the same way: pupsOf says how many puppies.)
  const pups = def.pops ? 0 : pupsOf(state, s);
  if (def.pops || pups) {
    // Finished while standing on a till (buildings act before shoppers move, so this can happen
    // the tick after she steps onto one): once she has reached a till nothing pops. She storms
    // off without her refund, as any other shopper finished on a till does.
    if (state.tiles[(s.y | 0) * state.w + (s.x | 0)] === 'T') { giveUp(state, s, by, 'annoyed', ev); return; }
    popOut(state, s, def, by, from === 'railgun', ev, pups);
    return;
  }
  giveUp(state, s, by, 'annoyed', ev);
}

/** A hit that panics a guide dog: it bolts, dragging its owner along. */
function bolt(s, def, ev) {
  if (s.st === ST.LEAVE) return;
  if (s.bt <= 0) ev.push({ e: 'bolt', x: s.x, y: s.y });
  s.bt = secs(tv(def, 'boltSecs'));
}

/**
 * Who really takes a shot aimed at shopper s: a cosplayer close enough to him gets in the way
 * (the nearest one, if several). Returns the shopper hit and the share of the damage he takes.
 */
function takerOf(state, s, cosplayers) {
  if (!cosplayers.length || defOf(s).shields) return [s, 1];
  let best = null, bd = Infinity;
  for (const c of cosplayers) {
    if (c.st === ST.LEAVE) continue;
    const cdef = defOf(c), r = tv(cdef, 'shield') + cardShield(state, cdef), d2 = (c.x - s.x) ** 2 + (c.y - s.y) ** 2;
    if (d2 <= r * r && d2 < bd) { bd = d2; best = c; }
  }
  return best ? [best, tv(defOf(best), 'soak')] : [s, 1];
}

/**
 * A tower's shot at shopper s, soaked up by a nearby cosplayer if there is one. `from` is the
 * tower's kind (see hurt).
 * @returns {Object} the shopper who was hit
 */
function strike(state, s, dmg, by, cosplayers, ev, from) {
  const [who, share] = takerOf(state, s, cosplayers);
  if (who !== s && state.tick - (who.sh ?? -1e9) >= secs(TUNE.shieldEvery)) {
    who.sh = state.tick;
    ev.push({ e: 'shield', x: who.x, y: who.y });
  }
  hurt(state, who, dmg * share, by, ev, from);
  return who;
}

/**
 * Runs every building for one tick. Returns what the shoppers need to know about the security:
 * stands (free samples), salesmen (TV Salesmen) and posts (what a dog may pee on), all working.
 */
/**
 * One tick of every building. `only`, if given, is the list of tile indexes to visit, in rising
 * order (skipBuild uses it so that a big, mostly empty map costs nothing to run forward).
 */
function stepBuildings(state, fields, ev, only = null) {
  const grid = state.grid, S = state.shoppers, W = state.w;
  const stands = [], salesmen = [], posts = [];
  const karens = [], cosplayers = [];
  for (const s of S) {
    if (s.st === ST.LEAVE) continue;
    const d = defOf(s);
    if (d.nag) karens.push(s);
    if (d.shields) cosplayers.push(s);
  }
  const beltAdv = TUNE.beltSpeed * DT;
  const way = (s) => fields[routeOf(s, state)][((s.y | 0) * W) + (s.x | 0)];

  const count = only ? only.length : grid.length;
  for (let q = 0; q < count; q++) {
    const i = only ? only[q] : q;
    const b = grid[i];
    // The other tiles of a big building only point at it; it works from its anchor tile.
    if (!b || b.part !== undefined) continue;
    const def = BUILD[b.k];
    // A dog peed on it: it does nothing until it dries off.
    if (b.off > 0) {
      if (--b.off > 0) continue;
      delete b.off;
    }
    switch (b.k) {
      case 'belt': {
        const it = b.it;
        for (let j = 0; j < it.length; j++) {
          const cap = j === 0 ? 1 : it[j - 1][1] - 0.5;
          if (it[j][1] < cap) it[j][1] = Math.min(cap, it[j][1] + beltAdv);
        }
        if (it.length && it[0][1] >= 1 && offer(state, neighbour(state, i, b.d), it[0][0], b.d, ev)) it.shift();
        break;
      }
      case 'unpacker':
        if (b.t > 0) b.t--;
        if (b.t <= 0 && offer(state, neighbour(state, i, b.d), def.makes, b.d, ev)) b.t = secs(statsOf(b, state).period);
        break;
      case 'press':
      case 'packer':
        // Finishing, handing over and starting the next item all happen in the same tick, so an
        // item takes exactly its time, like the Unpacker's. (Until 0.2.13 each step took a tick of
        // its own: two extra ticks an item, which at the top speed level made a Press or Packer a
        // fifth slower than an Unpacker.)
        if (b.t > 0 && --b.t === 0) b.out = def.makes;
        if (b.out && offer(state, neighbour(state, i, b.d), b.out, b.d, ev)) b.out = 0;
        if (!b.out && b.t <= 0 && b.n > 0) {
          b.n--;
          b.t = secs(statsOf(b, state).time);
        }
        break;
      case 'samples': {
        const st = statsOf(b, state);
        const [cx, cy] = centreOf(state, i, b);
        // (Its tile, for the warranty card; and whether it hands out booze, the eightyproof card.)
        stands.push([cx, cy, st.range * st.range, secs(st.secs), i, b.bz ? 1 : 0]);
        posts.push(i);
        break;
      }
      case 'salesman': {
        const st = statsOf(b, state);
        const [cx, cy] = centreOf(state, i, b);
        salesmen.push([cx, cy, st.range * st.range, st, i]);
        posts.push(i);
        break;
      }
      case 'sprinkler':
      case 'forklift':
      case 'railgun': {
        posts.push(i);
        const [cx, cy] = centreOf(state, i, b);
        // A Karen in earshot slows the tower down; the worst one counts.
        let rate = 1;
        for (const kn of karens) {
          const kdef = defOf(kn), r = tv(kdef, 'nagRange');
          if ((kn.x - cx) ** 2 + (kn.y - cy) ** 2 <= r * r) rate = Math.min(rate, tv(kdef, 'nagRate'));
        }
        b.cd -= rate;
        if (b.cd > 0) break;
        const st = statsOf(b, state);
        if (def.beam) {
          // Straight out of the front end, through everything, as far as its range.
          const [dx, dy] = DIRS[b.d | 0];
          const mx = cx + dx * (def.size[0] / 2), my = cy + dy * (def.size[0] / 2);
          const hit = [];
          for (const s of S) {
            if (s.st === ST.LEAVE) continue;
            const along = (s.x - mx) * dx + (s.y - my) * dy;
            const off = Math.abs((s.x - mx) * dy - (s.y - my) * dx);
            if (along >= 0 && along <= st.range && off <= st.width) hit.push(s);
          }
          if (!hit.length) break;
          b.cd = secs(st.cd);
          // (A shot uses one use of its stock, however many it hits: see useWork in back.js.)
          useWork(b, i, ev);
          ev.push({ e: 'rail', i, d: b.d | 0, len: st.range, n: hit.length });
          for (const s of hit) {
            const who = strike(state, s, st.dmg, b.o, cosplayers, ev, b.k);
            const wdef = defOf(who);
            if (wdef.boltsOnAny) bolt(who, wdef, ev);
          }
          break;
        }
        const r2 = st.range * st.range;
        if (def.aoe) {
          // It reaches only so many at once: the ones nearest the tills get it.
          const near = [];
          for (const s of S) {
            if (s.st === ST.LEAVE || (s.x - cx) ** 2 + (s.y - cy) ** 2 > r2) continue;
            near.push(s);
          }
          const most = cardTargets(state, b.k, def.targets);
          if (near.length > most) {
            near.sort((p, q) => way(p) - way(q) || p.id - q.id);
            near.length = most;
          }
          for (const s of near) {
            const who = strike(state, s, st.dmg, b.o, cosplayers, ev, b.k);
            // Pepper spray panics a guide dog.
            const wdef = defOf(who);
            if (wdef.bolts) bolt(who, wdef, ev);
          }
          if (near.length) { b.cd = secs(st.cd); useWork(b, i, ev); ev.push({ e: 'spray', i }); }
        } else {
          let best = null, bd = UNREACHABLE + 1;
          for (const s of S) {
            if (s.st === ST.LEAVE || (s.x - cx) ** 2 + (s.y - cy) ** 2 > r2) continue;
            const d = way(s);
            if (d < bd) { bd = d; best = s; }
          }
          if (best) {
            b.cd = secs(st.cd);
            useWork(b, i, ev);
            b.a = Math.atan2(best.y - cy, best.x - cx);
            ev.push({ e: 'shot', i, x: best.x, y: best.y });
            const who = strike(state, best, st.dmg, b.o, cosplayers, ev, b.k);
            const wdef = defOf(who);
            if (wdef.boltsOnAny) bolt(who, wdef, ev);
          }
        }
        break;
      }
      default:
    }
  }
  return { stands, salesmen, posts };
}

/**
 * A shopper reached a till and takes his refund. A shopper's refund is per head, so it is
 * multiplied by perHead() (not in a training game). The boss takes his refund times his tier and
 * counts as TUNE.bossRefunds refunds toward the limit. A baby takes BABY.refund and counts as none
 * (the owner's choice: babies are cash only), so it is not one of the wave's `escaped` either.
 */
function escape(state, s, ev) {
  const def = defOf(s), boss = def.boss ? 1 : 0;
  const n = def.baby ? 0 : boss ? TUNE.bossRefunds : 1;
  const cash = boss ? def.refund * (s.tr || 1) : def.baby || state.training ? def.refund : def.refund * perHead();
  // The game's cards may change it (cardRefund), to whole dollars.
  const m = cardRefund(state, s, def);
  const paid = lose(state, m === 1 ? cash : Math.round(cash * m));
  state.refunds += n;
  if (n) state.ws.escaped++;
  state.ws.refunded += paid;
  const e = { e: 'escape', k: s.k, sup: s.sup | 0, x: s.x, y: s.y, refund: paid, n };
  if (boss) e.tier = s.tr || 1;
  ev.push(e);
  if (n && state.refunds >= state.refundLimit && state.phase !== 'lost' && !state.training) {
    state.phase = 'lost';
    releaseAllOrders(state);
    ev.push({ e: 'lost' });
  }
}

/** Scratch result of moveAlong() and moveTo(), reused to avoid allocating on every step. */
const MV = { vx: 0, vy: 0 };

/** One tick of walking straight toward a point. Returns false if already there. */
function moveTo(x, y, tx, ty, speed) {
  const dx = tx - x, dy = ty - y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return false;
  const m = Math.min(1, (speed * DT) / len);
  MV.vx = dx * m;
  MV.vy = dy * m;
  return true;
}

/**
 * Works out one tick of walking downhill on a distance map (toward the tills, usually).
 * @returns {boolean} false if there is nowhere to go; otherwise the move is in MV
 */
function moveAlong(state, field, x, y, ox, oy, speed, id) {
  const W = state.w;
  const i = (y | 0) * W + (x | 0);
  const best = nextTile(state, field, i, id);
  if (best === i) return false; // arrived, or walled in (which cannot normally happen)
  return moveTo(x, y, (best % W) + 0.5 + ox, ((best / W) | 0) + 0.5 + oy, speed);
}

const clearStand = (s) => { delete s.sa; delete s.sw; delete s.sl; };

/**
 * A shopper the salesman has talked into stopping walks up to the stand before he stops, so it is
 * plain what stopped him (the owner's request). He heads straight for it: each step is to the
 * neighbouring tile he can walk on that is nearer the stand, so he ends up beside it, or, if
 * belts, crates or walls are in the way, as near as he can get. There he stands and watches for
 * the time the pitch earned. He gives up if the stand is wrecked, sold or switched off on the way,
 * or if getting there takes too long.
 * @returns {boolean} true if this tick was spent on it (walking, or starting to watch)
 */
function walkToStand(state, s, def, i, ev) {
  const b = state.grid[s.sa];
  if (!b || b.k !== 'salesman' || b.part !== undefined || b.off > 0) { clearStand(s); return false; }
  const W = state.w;
  const [cx, cy] = centreOf(state, s.sa, b);
  const far = (ti) => ((ti % W) + 0.5 - cx) ** 2 + (((ti / W) | 0) + 0.5 - cy) ** 2;
  // (A gym bro does not smash his way to the television: crates stop him like anyone else.)
  const mode = modeOf(s.k) === SMASH ? NORMAL : modeOf(s.k);
  let to = i, best = far(i) - 1e-9;
  if (--s.sl > 0) {
    for (let d = 0; d < 4; d++) {
      const ni = neighbour(state, i, d);
      if (ni < 0 || !walkable(state, ni, mode) || state.tiles[ni] === 'T') continue;
      const f = far(ni);
      if (f < best) { best = f; to = ni; }
    }
  }
  // Nowhere nearer to go: he finishes the step to the middle of this tile, then watches.
  if (moveTo(s.x, s.y, (to % W) + 0.5 + (s.ox || 0), ((to / W) | 0) + 0.5 + (s.oy || 0), def.speed * walkPace(state, s) * cardSpeed(state, s, def))) {
    s.vx = MV.vx; s.vy = MV.vy;
    s.x += MV.vx; s.y += MV.vy;
    if (to !== i || s.sl > 0) return true;
  }
  s.st = ST.WATCH;
  s.t = s.sw;
  ev.push({ e: 'watching', x: s.x, y: s.y, k: s.k, i: s.sa });
  // (Now and then he buys the thing: the warranty card.)
  maybeBuy(state, s, s.sa, ev);
  clearStand(s);
  return true;
}

const clearLift = (s) => { delete s.lf; delete s.lw; };

/**
 * True if a shopper with definition `def` would steal this item (a kind of ITEMS): a Card Trader
 * (`rips`) only a Mystery Box, anyone else anything but one.
 */
const wants = (def, item) => (def && def.rips ? item === 'box' : item !== 'box');

/** True if building b is a belt carrying something a shopper with definition `def` may steal. */
const stealable = (b, def) => b && b.k === 'belt' && b.it.some((item) => wants(def, item[0]));

/** True if a belt next to tile t carries something worth stealing (to a shopper with definition `def`). */
function goodsBeside(state, t, def) {
  for (let d = 0; d < 4; d++) {
    const ni = neighbour(state, t, d);
    if (ni >= 0 && stealable(state.grid[ni], def)) return true;
  }
  return false;
}

/** True if there is a belt next to tile t at all (goods keep coming along a working line). */
function beltBeside(state, t) {
  for (let d = 0; d < 4; d++) {
    const ni = neighbour(state, t, d);
    const b = ni < 0 ? 0 : state.grid[ni];
    if (b && b.k === 'belt') return true;
  }
  return false;
}

/**
 * A browsing shopper on tile i takes something off a belt beside him: on a roll of
 * TUNE.grabChance a second as he passes, or for certain (`sure`) once he has gone out of his way
 * to get there. Never a Mystery Box. He stands there for TUNE.grabSecs, and cannot be distracted
 * again for TUNE.grabCooldown.
 * @returns {boolean} true if he took something
 */
function grabBeside(state, s, i, sure, ev, def = defOf(s)) {
  for (let d = 0; d < 4; d++) {
    const ni = neighbour(state, i, d);
    const b = ni < 0 ? 0 : state.grid[ni];
    if (!b || b.k !== 'belt') continue;
    const j = b.it.findIndex((item) => wants(def, item[0]));
    if (j < 0 || (!sure && rand(state) >= TUNE.grabChance * DT)) continue;
    const kind = b.it.splice(j, 1)[0][0];
    state.ws.stolen++;
    if (def.rips) { ripPack(state, s, sure, ev); return true; }
    s.st = ST.BROWSE;
    s.t = secs(TUNE.grabSecs);
    s.cd = secs(TUNE.grabCooldown);
    const e = { e: 'grab', x: s.x, y: s.y, kind };
    if (sure) e.far = 1;
    // The klepto card: the thrill of it gives him back a share of his full patience, never above it
    // (`heal` on the event is how much, rounded, when he had any to get back).
    const heal = cardLiftHeal(state, def);
    if (heal > 0 && s.cr !== 1 && s.hp < s.mhp) {
      const back = Math.min(s.mhp - s.hp, s.mhp * heal);
      s.hp += back;
      e.heal = Math.round(back * 10) / 10;
    }
    ev.push(e);
    return true;
  }
  return false;
}

/**
 * A Card Trader has taken a Mystery Box off a belt and rips it open where he stands (ST.BROWSE for
 * TUNE.ripSecs; not tempted again for ripSecs + TUNE.grabCooldown). Every other Card Trader within
 * TUNE.ripLook tiles who is walking, and has not stopped to watch one lately, stops for
 * TUNE.ripWatch seconds to see what he pulled (ST.WATCH; `ro` is the ticks before he will stop for
 * another, TUNE.ripCool). The 'rip' event says how many stopped.
 */
function ripPack(state, s, far, ev) {
  s.st = ST.BROWSE;
  s.t = secs(TUNE.ripSecs);
  s.cd = secs(TUNE.ripSecs + TUNE.grabCooldown);
  const r2 = TUNE.ripLook * TUNE.ripLook;
  let n = 0;
  for (const o of state.shoppers) {
    if (o === s || o.st !== ST.WALK || o.ro > 0 || o.cr === 1 || !defOf(o).rips) continue;
    if ((o.x - s.x) ** 2 + (o.y - s.y) ** 2 > r2) continue;
    o.st = ST.WATCH;
    o.t = secs(TUNE.ripWatch);
    o.ro = secs(TUNE.ripCool);
    n++;
  }
  const e = { e: 'rip', x: s.x, y: s.y, sup: s.sup | 0, n };
  if (far) e.far = 1;
  ev.push(e);
}

/** Scratch lists for liftLook's search (it runs for one shopper at a time). */
let FRONT = [], NEXT = [];

/**
 * A browsing shopper on tile i, not beside any goods, looks round for some (the owner's request,
 * 0.3.01): a floor tile next to a belt carrying something stealable, between TUNE.liftMin and
 * TUNE.liftMax tiles of walking away (counted over tiles he can walk on, so a belt between him and
 * it means the long way round). The nearest is the one he considers; with chance TUNE.liftChance
 * he goes for it (`lf` is that tile, `lw` the ticks he will give it).
 */
function liftLook(state, s, i, def = defOf(s)) {
  if (goodsBeside(state, i, def)) return; // right beside some already: he grabs as he passes, or not
  // (A Card Trader will go further, and is likelier to, for a Mystery Box: TUNE.ripMax, ripChance.)
  // (The klepto card: ordinary shoplifters go for it more often, cardLiftChance.)
  const reach = def.rips ? TUNE.ripMax : TUNE.liftMax;
  const chance = def.rips ? TUNE.ripChance : TUNE.liftChance * cardLiftChance(state, def);
  const seen = new Set([i]);
  FRONT.length = 0;
  FRONT.push(i);
  for (let d = 1; d <= reach && FRONT.length; d++) {
    NEXT.length = 0;
    for (const t of FRONT) {
      for (let k = 0; k < 4; k++) {
        const n = neighbour(state, t, (k + s.id) & 3);
        // (Never by way of a till: stepping on one is taking his refund.)
        if (n < 0 || seen.has(n) || state.tiles[n] === 'T' || !walkable(state, n, NORMAL)) continue;
        seen.add(n);
        NEXT.push(n);
      }
    }
    if (d >= TUNE.liftMin) {
      for (const n of NEXT) {
        if (!goodsBeside(state, n, def)) continue;
        if (rand(state) < chance) {
          s.lf = n;
          s.lw = secs(TUNE.liftSecs);
        }
        return;
      }
    }
    [FRONT, NEXT] = [NEXT, FRONT];
  }
}

/**
 * One tick of a shopper going out of his way to steal (see liftLook). He walks to the tile `lf` by
 * the shortest way there; once on it he takes the first stealable thing that comes along a belt
 * beside him. He gives up, and is not tempted again for TUNE.grabCooldown, if it takes more than
 * TUNE.liftSecs, if the tile is built on or walled off, or if there is no belt beside it any more.
 * Then the ordinary path takes him on from wherever he is, as it does anyone. He is an ordinary
 * shopper all the while: security hits him, wet floors slow him.
 * @returns {boolean} true if this tick was spent on it
 */
function liftWalk(state, s, i, speed, ev) {
  const t = s.lf, W = state.w;
  const field = walkable(state, t, NORMAL) && state.tiles[t] !== 'T' ? getFieldTo(state, t) : null;
  if (!field || field[i] === UNREACHABLE || !beltBeside(state, t) || --s.lw <= 0) {
    clearLift(s);
    s.cd = secs(TUNE.grabCooldown);
    return false;
  }
  if (i === t && grabBeside(state, s, i, true, ev, defOf(s))) { clearLift(s); return true; }
  // On his way; or there, and waiting for something worth taking to come along.
  const going = i === t ? moveTo(s.x, s.y, (t % W) + 0.5 + s.ox, ((t / W) | 0) + 0.5 + s.oy, speed)
    : moveAlong(state, field, s.x, s.y, s.ox, s.oy, speed, s.id);
  if (going) {
    s.vx = MV.vx; s.vy = MV.vy;
    s.x += MV.vx; s.y += MV.vy;
  }
  return true;
}

/**
 * The chance a salesman stops a shopper: `stop0` is the shopper's base chance, `stopLeft` what
 * the salesman's upgrades leave of the chance to resist, `seen` how many times this same salesman
 * has pitched to him before (each repeat works TUNE.pitchRepeat times as well as the last).
 * Upgrades work on anyone who could be tempted at all (a blind man never sees the screen).
 */
export function pitchStop(stop0, stopLeft, seen) {
  if (!(stop0 > 0)) return 0;
  return (1 - (1 - stop0) * stopLeft) * TUNE.pitchRepeat ** seen;
}

/** True if a salesman (from stepBuildings) reaches the point (x, y) and is still switched on. */
function salesmanAt(state, salesmen, x, y) {
  for (const m of salesmen) {
    if (state.grid[m[4]].off > 0) continue;
    if ((x - m[0]) ** 2 + (y - m[1]) ** 2 <= m[2]) return m;
  }
  return null;
}

/**
 * The mom has her child back: he goes into the cart, or into her arms if she has left the cart
 * behind (and then he never runs again). If she was crawling to him, she gets up.
 */
function reunite(state, s, def, ev) {
  const carry = s.nc ? 1 : 0;
  s.kd = carry ? 3 : 0;
  s.kc = secs(tv(def, 'kidRest'));
  // Reaching him on her hands and knees puts her back on her feet, with some patience restored.
  if (s.cr === 1) { s.cr = 0; s.crn = (s.crn | 0) + 1; s.hp = s.mhp * TUNE.crawlBack; }
  ev.push({ e: 'caught', x: s.x, y: s.y, carry });
}

/** True if a loose child may wait on tile t: floor his mother can walk to, not too close to a till. */
function kidSpot(state, dist, t) {
  return state.tiles[t] !== 'T' && walkable(state, t, NORMAL) && dist[t] !== UNREACHABLE && dist[t] >= TUNE.kidTill;
}

/**
 * The freerange card: how far along his mother's route (in tiles of her walking distance) the
 * spot a child who has just run off from tile mi would usually stop at is. That run is straight
 * through everything toward the tills for `s.kr` tiles, then on to the first spot he may wait at
 * that is nearer the tills than she is (as stepKid does it, leaving out a salesman's television).
 * If there is no such spot, his usual run length.
 */
function routeAhead(state, s, dist, mi) {
  const ghost = getField(state, GHOST);
  let t = mi, best = -1;
  for (let n = 1; n < state.w * state.h; n++) {
    const next = nextTile(state, ghost, t, s.id);
    if (next === t || state.tiles[next] === 'T') break;
    t = next;
    if (dist[t] !== UNREACHABLE && dist[t] < TUNE.kidTill) break;
    if (kidSpot(state, dist, t) && dist[t] < dist[mi]) {
      best = t;
      if (n >= s.kr) break;
    }
  }
  return best >= 0 ? dist[mi] - dist[best] : s.kr;
}

/**
 * A mom's child. In the cart he may escape (once; a Soccer Mom's twice). Loose, he runs for the
 * tills straight through everything in the way (only the store's walls stop a child), for a random
 * distance, and then waits at the first spot that is on his mother's route and further along it
 * than she is, but never closer than TUNE.kidTill tiles of walking to a till. A salesman's
 * television may stop him sooner. She has to sprint round the maze to get there.
 */
function stepKid(state, s, def, dist, salesmen, ev) {
  s.kvx = 0; s.kvy = 0;
  const W = state.w;
  const mi = (s.y | 0) * W + (s.x | 0);
  if (s.kd === 3) return; // in her arms for good
  if (s.kd === 0) {
    if (s.kc > 0) { s.kc--; return; }
    // (The offleash card lets some kids run off more times: cardKidRuns.)
    if ((s.kn | 0) >= tv(def, 'kidRuns') * cardKidRuns(state, s)) return;
    // Not right by the tills: there would be nowhere left for him to run to.
    if (s.st === ST.WALK && dist[mi] !== UNREACHABLE && dist[mi] > TUNE.kidTill + 1 && rand(state) < tv(def, 'kidChance') * DT) {
      s.kd = 1;
      s.kn = (s.kn | 0) + 1;
      s.kt = 0;
      s.kl = mi;
      s.kx = s.x; s.ky = s.y;
      s.kr = tv(def, 'kidMin') + rand(state) * (tv(def, 'kidMax') - tv(def, 'kidMin'));
      const e = { e: 'kid', x: s.x, y: s.y };
      // The wrongway card: this run goes back toward the entrance. The freerange card: he runs on
      // along the shoppers' own route instead of straight through everything, and CARDS.freerange.ahead
      // times as far along it as his usual spot would have been.
      if (kidBack(state, s)) e.back = 1;
      else if (kidAlong(state)) s.kr = CARDS.freerange.ahead * routeAhead(state, s, dist, mi);
      ev.push(e);
    }
    return;
  }
  // Where he may wait: floor his mother can walk to, not too close to a till.
  const ok = (t) => kidSpot(state, dist, t);
  // Which way he runs: toward the tills straight through everything (only the store's walls stop
  // him), along the shoppers' own route (freerange), or back toward the entrances (wrongway). Where
  // he waits must be ahead of his mother that way: nearer the tills than she is, or (running back)
  // further from them.
  const back = kidBack(state, s);
  const along = !back && kidAlong(state);
  const ahead = (t) => (back ? dist[t] > dist[mi] : dist[t] < dist[mi]);
  let ki = (s.ky | 0) * W + (s.kx | 0);
  if (s.kd === 1) {
    const ghost = back ? getBackField(state) : along ? dist : getField(state, GHOST);
    // Is there anywhere further along his run where he may wait, before he gets too close?
    const onward = (from) => {
      for (let t = from, n = 0; n < W * state.h; n++) {
        const next = nextTile(state, ghost, t, s.id);
        if (next === t || state.tiles[next] === 'T') return false;
        if (ok(next)) return true;
        if (dist[next] !== UNREACHABLE && dist[next] < TUNE.kidTill) return false;
        t = next;
      }
      return false;
    };
    const moved = state.tiles[ki] !== 'T' && moveAlong(state, ghost, s.kx, s.ky, s.ox, s.oy, tv(def, 'kidSpeed'), s.id);
    if (moved) {
      s.kvx = MV.vx; s.kvy = MV.vy;
      s.kx += MV.vx; s.ky += MV.vy;
      s.kr -= Math.hypot(MV.vx, MV.vy);
      ki = (s.ky | 0) * W + (s.kx | 0);
    }
    if (ok(ki)) {
      s.kl = ki;
      // The salesman's television: he may stop to watch it (one chance per escape).
      if (!s.kt && salesmen.length && salesmanAt(state, salesmen, s.kx, s.ky)) {
        s.kt = 1;
        if (rand(state) < TUNE.kidTv) {
          s.kd = 2;
          ev.push({ e: 'kidtv', x: s.kx, y: s.ky });
          return;
        }
      }
      if ((s.kr <= 0 && ahead(ki)) || !moved || !onward(ki)) s.kd = 2;
      return; // cannot be caught on the tick it runs
    }
    if (moved && onward(ki)) return;
    // Nowhere ahead to wait (something was built in the way): back to the last good spot, or
    // failing that, back to his mother.
    if (s.kl !== undefined && ok(s.kl) && getFieldTo(state, s.kl)[mi] !== UNREACHABLE) {
      s.kx = (s.kl % W) + 0.5; s.ky = ((s.kl / W) | 0) + 0.5;
      s.kd = 2;
    } else {
      reunite(state, s, def, ev);
    }
    return;
  }
  // Waiting. If somebody has built on him or walled him off, he runs on.
  if (!walkable(state, ki, NORMAL) || getFieldTo(state, ki)[mi] === UNREACHABLE) {
    s.kd = 1;
    s.kr = 0;
    return;
  }
  if ((s.x - s.kx) ** 2 + (s.y - s.ky) ** 2 < TUNE.kidCatch ** 2) reunite(state, s, def, ev);
}

/** Most rubble remembered; beyond this the oldest is forgotten. */
const RUBBLE_MAX = 400;

/**
 * A gym bro hits the building on a tile (any tile of it). Each building survives statsOf().hits
 * hits in one wave; the last one destroys it, and it is remembered as rubble so it can be rebuilt.
 * @param {boolean} [flatten] destroy it outright (he is standing on it)
 * @returns {boolean} false if there was nothing on the tile to hit
 */
function wreck(state, ti, s, ev, flatten = false) {
  const ai = anchorOf(state, ti);
  const b = state.grid[ai];
  if (!b) return false;
  state.ws.wrecked++;
  const hits = statsOf(b).hits;
  // Duct Tape from The Back (0.4) soaks up the hit: it takes one use of the tape instead of
  // counting toward wrecking it. (`left` counts the tape still on it as hits it can take.)
  const tape = flatten ? 0 : usesIn(b, 'dur');
  if (tape > 0) {
    ev.push({ e: 'smash', i: ai, x: s.x, y: s.y, k: b.k, owner: b.o, left: tape - 1 + Math.max(0, hits - (b.hit | 0)), tape: 1 });
    useStock(b, 'dur', ai, ev);
    return true;
  }
  b.hit = flatten ? hits : (b.hit | 0) + 1;
  const left = Math.max(0, hits - b.hit);
  ev.push({ e: 'smash', i: ai, x: s.x, y: s.y, k: b.k, owner: b.o, left });
  if (left > 0) return true;
  for (const t of tilesOf(state, ai)) state.grid[t] = 0;
  state.gridVer++;
  const r = { i: ai, k: b.k, d: b.d | 0, o: b.o, u: { ...(b.u || {}) }, spent: spentOn(b) };
  // What a card gave it comes back with it: the price it was bought at, its free levels.
  if (b.c !== undefined) r.c = b.c;
  if (b.f) { r.f = b.f; if (b.fn !== undefined) r.fn = b.fn; }
  // (A Free Sample table that hands out booze, the eightyproof card, is rebuilt as one.)
  if (b.bz) r.bz = 1;
  state.rubble.push(r);
  // (Its stock went with it. Its Dumbwaiters stay under the rubble, wanting nothing: syncLifts
  // leaves them where they are, so nothing changes in The Back.)
  // (The oldest falls off the end. If someone had paid to rebuild it, he gets his money back; its
  // Dumbwaiters go, as nothing can be rebuilt from it now.)
  if (state.rubble.length > RUBBLE_MAX) {
    const old = state.rubble.shift();
    releaseOrder(state, old);
    const was = footprint(state, old.k, old.i % state.w, (old.i / state.w) | 0, old.d | 0);
    if (was) syncLifts(state, was);
  }
  return true;
}

/**
 * One of a gym bro's own hits. Every hit he lands uses one up (TUNE.smashMax), even one a
 * Durability level shrugs off, and he rests after it (TUNE.smashWait). The owner's rule (0.2.12).
 */
function landHit(state, ti, s, def, ev) {
  if (!wreck(state, ti, s, ev)) return;
  s.hn = (s.hn | 0) + 1;
  s.hw = secs(tv(def, 'smashWait'));
}

/**
 * A gym bro wrecks things. Any crate stack beside him takes a hit; failing that, now and then, so
 * does whatever else is beside him. Of several, he picks the one most directly between him and
 * the tills.
 */
function smashAround(state, s, def, i, ev) {
  const grid = state.grid, ghost = getField(state, GHOST);
  let crate = -1, other = -1;
  for (let d = -1; d < 4; d++) {
    const ti = d < 0 ? i : neighbour(state, i, d);
    const b = ti < 0 ? 0 : grid[ti];
    if (!b) continue;
    if (b.k === 'crate') {
      if (crate < 0 || ghost[ti] < ghost[crate]) crate = ti;
    } else if (other < 0 || ghost[ti] < ghost[other]) other = ti;
  }
  if (crate < 0 && other < 0) return; // nothing in reach: look again next tick
  s.sm = secs(tv(def, 'smashEvery'));
  const ti = crate >= 0 ? crate : rand(state) < tv(def, 'smashOther') ? other : -1;
  if (ti >= 0) landHit(state, ti, s, def, ev);
}

/** The direction from tile a to the tile next to it, b (0-3), or -1 if they are not neighbours. */
function dirTo(state, a, b) {
  const W = state.w, dx = (b % W) - (a % W), dy = ((b / W) | 0) - ((a / W) | 0);
  if (Math.abs(dx) + Math.abs(dy) !== 1) return -1;
  return dx === 1 ? 0 : dy === 1 ? 1 : dx === -1 ? 2 : 3;
}

/** A working piece of security (not a sign) within a dog's reach, nearest first, or -1. */
function postNear(state, posts, s, range) {
  const W = state.w;
  let best = -1, bd = range * range;
  for (const ai of posts) {
    const b = state.grid[ai];
    if (!b || b.off > 0) continue;
    for (const t of tilesOf(state, ai)) {
      const d2 = ((t % W) + 0.5 - s.x) ** 2 + (((t / W) | 0) + 0.5 - s.y) ** 2;
      if (d2 <= bd) { bd = d2; best = ai; }
    }
  }
  return best;
}

/**
 * The boss's pep talk: every other shopper within his reach gets a share of his own full patience
 * back, never above full. A mom crawling to her child is not listening (and her patience is set
 * when she gets up). The 'pep' event is sent even when nobody needed it, so his shouting is seen
 * every time; n says how many it helped.
 */
function pepTalk(state, s, def, ev) {
  const r2 = def.pepRange * def.pepRange;
  let n = 0;
  for (const o of state.shoppers) {
    if (o === s || o.st === ST.LEAVE || o.cr === 1 || o.hp >= o.mhp) continue;
    if ((o.x - s.x) ** 2 + (o.y - s.y) ** 2 > r2) continue;
    o.hp = Math.min(o.mhp, o.hp + o.mhp * def.pepHeal * cardPep(state));
    n++;
  }
  ev.push({ e: 'pep', x: s.x, y: s.y, n });
}

/** No free-sample stands: what a Card Trader looks at (see stepShoppers). */
const NO_STANDS = [];

/**
 * The slushie card: a Teenager's mess on tile i spills onto the four tiles beside it too, where
 * those are bare floor ('.' with nothing built on it: never a wall, a till, an entrance or a
 * building). A spilt tile is a mess like any other, with a third element 1 in state.messes (no cup
 * is drawn on it). A tile that already has a mess keeps the longer of the two times.
 * @returns {number} how many tiles it spilt onto
 */
function spillAround(state, i, ticks) {
  let n = 0;
  for (let d = 0; d < 4; d++) {
    const t = neighbour(state, i, d);
    if (t < 0 || state.tiles[t] !== '.' || state.grid[t]) continue;
    const old = state.messes.find((m) => m[0] === t);
    if (old) old[1] = Math.max(old[1], ticks); else state.messes.push([t, ticks, 1]);
    n++;
  }
  return n;
}

/**
 * The eightyproof card: a shopper who drinks (see drinks in cards.js) has stopped at a Free Sample
 * table (owned by player `by`) that hands out booze. With boozeChance of the booze tables he has
 * stopped at before (`bq`) he turns into a Day Drinker where he stands: the same shopper (id,
 * place, super or not, what salesmen have pitched him), swaying from now on. What only a browsing
 * shopper uses goes: a detour to steal (`lf`, `lw`), a walk over to a salesman (`sa`, `sw`, `sl`)
 * and the booze count. Sends `drunk` {x,y,k,sup} (k: what he was).
 * Reworked on the owner's decision (2026-11-24), because the card is meant to help the players and
 * did not: he used to take a Day Drinker's patience at the share he had, which handed most kinds
 * patience. Now he never gains any (his patience and its maximum stay as they were, or drop to a
 * Day Drinker's if that is less), and the booze hits at once: he goes down on the spot exactly as a
 * Day Drinker falls (ST.STUN for his kind's fallSecs, slowing whoever walks over him; a `fall`
 * event), and loses CARDS.eightyproof.hit of the patience he has left, credited to the table's
 * owner like any building's hit, so if that finishes him he storms out as stopped by the store.
 */
function boozeUp(state, s, by, ev) {
  const n = s.bq | 0;
  s.bq = n + 1;
  if (rand(state) >= boozeChance(n)) return;
  const was = s.k;
  s.k = 'drinker';
  const def = defOf(s);
  s.mhp = Math.min(s.mhp, patienceFor(state, def, 'drinker'));
  s.hp = Math.min(s.hp, s.mhp);
  s.sv = 1;
  delete s.dr;
  delete s.bq;
  clearLift(s);
  clearStand(s);
  ev.push({ e: 'drunk', x: s.x, y: s.y, k: was, sup: s.sup | 0 });
  s.st = ST.STUN;
  s.t = secs(tv(def, 'fallSecs'));
  ev.push({ e: 'fall', x: s.x, y: s.y });
  hurt(state, s, s.hp * CARDS.eightyproof.hit, by, ev);
}

/**
 * The supportdog card: every shopper who may (stopsToPet in cards.js), walking, not chasing a child
 * or crawling to one, and not on his way over to a salesman, who comes within CARDS.supportdog.range
 * of an emotional support dog's owner stops for CARDS.supportdog.secs to pet it (ST.WATCH). Once
 * per dog: `pd` remembers the owner of the last dog he petted, so he will not stop for that one
 * again (only the last: a second dog in between would let him pet the first again, which is rare
 * and keeps it to one field). A dog bolting from pepper spray cannot be petted. Sends `pet`
 * {x,y,n,k} for each dog that stopped anyone: n how many, k the kind of the first.
 */
function petDogs(state, ev) {
  const c = CARDS.supportdog, r2 = c.range * c.range, S = state.shoppers;
  for (const dog of S) {
    if (dog.st === ST.LEAVE || dog.bt > 0 || !supportDog(state, dog)) continue;
    let n = 0, k = null;
    for (const o of S) {
      if (o === dog || o.st !== ST.WALK || o.pd === dog.id || o.cr === 1 || o.sa !== undefined || kidLoose(o)) continue;
      if ((o.x - dog.x) ** 2 + (o.y - dog.y) ** 2 > r2 || !stopsToPet(defOf(o))) continue;
      o.st = ST.WATCH;
      o.t = secs(c.secs);
      o.pd = dog.id;
      if (!n) k = o.k;
      n++;
    }
    if (n) ev.push({ e: 'pet', x: dog.x, y: dog.y, n, k });
  }
}

/**
 * The eyesup card: one tick of a dad who falls in behind an Exhibitionist (`ex` is her id while he
 * does). She must be ahead of him: nearer the tills by her own map (she walks the ordinary one)
 * than he is by his (he steps over belts), and within CARDS.eyesup.range tiles. Of several, he
 * falls in behind the nearest ahead of him, the one with the furthest still to walk. He will not
 * step onto a tile that leaves him less than CARDS.eyesup.gap tiles of walking (by his map) behind
 * her (by hers), so he can never reach a till before she does. It ends when she leaves the store,
 * either way, or is out of range; he may then fall in behind another. Sends `trail` {x,y} when he
 * falls in.
 * @returns {boolean} true if he must not step this tick
 */
function trailing(state, s, i, fields, ev) {
  const c = CARDS.eyesup, r2 = c.range * c.range, S = state.shoppers, W = state.w;
  const hop = fields[HOP], dist = fields[NORMAL];
  const near = (o) => o.st !== ST.LEAVE && (o.x - s.x) ** 2 + (o.y - s.y) ** 2 <= r2;
  const left = (o) => dist[(o.y | 0) * W + (o.x | 0)];
  let her = null;
  if (s.ex !== undefined) {
    her = S.find((o) => o.id === s.ex) || null;
    if (!her || !near(her)) { delete s.ex; her = null; }
  }
  if (!her) {
    for (const o of S) {
      if (!near(o) || !defOf(o).flashes || left(o) >= hop[i]) continue;
      if (!her || left(o) > left(her)) her = o;
    }
    if (!her) return false;
    s.ex = her.id;
    ev.push({ e: 'trail', x: s.x, y: s.y });
  }
  const next = nextTile(state, hop, i, s.id);
  return next !== i && hop[next] < left(her) + c.gap;
}

function stepShoppers(state, fields, sec, ev) {
  const { stands, salesmen, posts } = sec;
  const S = state.shoppers, grid = state.grid, W = state.w;
  const dist = fields[NORMAL];
  // A dad's patience drains by itself. It is a fixed amount a second, so it grows with the wave's
  // patience multiplier: wasting his time works as well against his bigger patience as it did.
  const drainMul = state.training ? 1 : patienceScaleAt(state.wave);
  // Which tiles have a mess on them right now, and which a day drinker lying where he fell.
  let messAt = null, downAt = null;
  if (state.messes.length) { messAt = new Set(); for (const m of state.messes) messAt.add(m[0]); }
  for (const s of S) {
    if (s.st === ST.STUN && defOf(s).sways) (downAt ||= new Set()).add((s.y | 0) * W + (s.x | 0));
  }
  // Emotional support dogs (the supportdog card) stop the shoppers round them to be petted.
  if (hasCard(state, 'supportdog')) petDogs(state, ev);
  // Dads who fall in behind an Exhibitionist (the eyesup card).
  const eyes = hasCard(state, 'eyesup');

  for (let n = 0; n < S.length; n++) {
    const s = S[n];
    const def = defOf(s);
    s.vx = 0; s.vy = 0;
    if (s.st === ST.LEAVE) {
      if (--s.t <= 0) S.splice(n--, 1);
      continue;
    }
    if (def.drain) {
      s.hp -= def.drain * drainMul * DT;
      if (s.hp <= 0) { giveUp(state, s, -1, 'bored', ev); continue; }
    }
    if (def.kid) stepKid(state, s, def, dist, salesmen, ev);
    if (def.boss && --s.pp <= 0) {
      s.pp = secs(def.pepEvery);
      pepTalk(state, s, def, ev);
    }
    if (s.cd > 0) s.cd--;
    if (s.pc > 0) s.pc--;
    if (s.ru > 0) s.ru--;
    if (s.gz > 0) s.gz--;
    if (s.fl > 0) s.fl--;
    if (s.ro > 0) s.ro--; // a Card Trader: before he will stop to watch another pack ripped
    // A gym bro's rest after a hit runs on whatever he is doing (watching a television included).
    if (s.hw > 0) s.hw--;
    if (s.st !== ST.WALK) {
      if (--s.t <= 0) s.st = ST.WALK;
      continue;
    }
    const i = (s.y | 0) * W + (s.x | 0);
    // A mom does not take her refund without her child: she has to have him first.
    const chasing = def.kid && kidLoose(s);
    if (state.tiles[i] === 'T' && !chasing) {
      escape(state, s, ev);
      S.splice(n--, 1);
      continue;
    }

    // Taken in by a salesman: on his way over to the stand, and nothing else gets his attention.
    if (s.sa !== undefined) {
      if (chasing || s.cr === 1) clearStand(s); // her child has run off: the television can wait
      else if (walkToStand(state, s, def, i, ev)) continue;
    }
    // Her child has run off (or she is crawling to him): the goods she was after can wait too.
    if (s.lf !== undefined && (chasing || s.cr === 1)) clearLift(s);

    // Each at his own pace (babies at theirs), so everything worked out from it below (a mom's
    // chase, a rush past a salesman, a bolting guide dog) keeps the same spread.
    // The game's cards may speed a kind up or slow it down on top (cardSpeed).
    let speed = def.speed * (def.baby ? babyPace(s.id) : walkPace(state, s)) * cardSpeed(state, s, def);
    let here = grid[i];

    if (def.smashes) {
      // Standing on a crate stack (he must never be stuck inside one): it goes, at once. This is
      // not one of his hits, and he does not rest after it.
      if (here && here.k === 'crate') { wreck(state, i, s, ev, true); here = 0; }
      if (s.sm > 0) s.sm--;
      // A gym bro who can still hit things does not go around a crate stack. He goes through it:
      // if one is in his way, he stands there and hits it. Each hit he lands makes him rest, and
      // resting (or spent) he walks round crates like anyone else (routeOf, below).
      if (smashReady(s, def, state)) {
        const ahead = nextTile(state, fields[SMASH], i, s.id);
        if (ahead !== i && grid[ahead] && grid[ahead].k === 'crate') {
          if (s.sm <= 0) { s.sm = secs(tv(def, 'smashEvery')); landHit(state, ahead, s, def, ev); }
          // Still standing, and he can still swing (his last attempt missed): he waits for his next.
          if (grid[ahead] && smashReady(s, def, state)) continue;
        } else if (s.sm <= 0) {
          smashAround(state, s, def, i, ev);
          here = grid[i];
        }
      }
    }
    // A day drinker: his pace changes all the time, and a corner may be too much for him.
    if (def.sways) {
      if ((state.tick + s.id * 7) % secs(TUNE.swayEvery) === 0) {
        s.sv = tv(def, 'swayMin') + rand(state) * (tv(def, 'swayMax') - tv(def, 'swayMin'));
      }
      speed *= s.sv;
      if (s.lt >= 0 && s.lt !== i) {
        const dir = dirTo(state, s.lt, i);
        const turned = dir >= 0 && s.dr !== undefined && dir !== s.dr;
        if (dir >= 0) s.dr = dir;
        if (turned && rand(state) < tv(def, 'fallChance') * cardFall(state)) {
          s.lt = i;
          s.st = ST.STUN;
          s.t = secs(tv(def, 'fallSecs'));
          ev.push({ e: 'fall', x: s.x, y: s.y });
          continue;
        }
      }
    }
    // A panicked guide dog drags its owner along.
    if (def.bolts && s.bt > 0) { s.bt--; speed *= tv(def, 'boltSpeed'); }
    // A mom whose child has run off sprints after him and has no time for anything else.
    if (s.cr === 1) speed *= TUNE.crawlSpeed; else if (chasing) speed *= tv(def, 'chaseSpeed');
    // Hurrying away from a salesman.
    if (s.ru > 0) speed *= TUNE.rushSpeed;
    // Stepping round a drunk lying on the floor.
    if (downAt && downAt.has(i) && !def.steady) speed *= TUNE.fallSlow;

    // A teenager leaves a mess behind every few seconds.
    if (def.messy && --s.m <= 0) {
      s.m = secs(tv(def, 'messEvery'));
      if (state.tiles[i] === '.' && !here) {
        const ticks = secs(tv(def, 'messSecs'));
        const old = state.messes.find((m) => m[0] === i);
        if (old) { old[1] = Math.max(old[1], ticks); if (old.length > 2) old.length = 2; } else state.messes.push([i, ticks]);
        const e = { e: 'mess', i };
        // The slushie card: it also covers the four tiles beside it, where those are bare floor (not
        // a wall, a till, an entrance or a building).
        if (wideMess(state)) e.wide = spillAround(state, i, ticks);
        ev.push(e);
      }
    }
    // An exhibitionist opens her bathrobe now and then. Dads and teenagers nearby stop and stare.
    if (def.flashes && --s.m <= 0) {
      s.m = secs(tv(def, 'flashEvery') * (0.5 + rand(state)));
      const r = tv(def, 'flashRange');
      let seen = 0;
      for (const o of S) {
        if (o === s || o.st !== ST.WALK || o.gz > 0 || !defOf(o).gawks) continue;
        if ((o.x - s.x) ** 2 + (o.y - s.y) ** 2 > r * r) continue;
        o.st = ST.WATCH;
        o.t = secs(tv(def, 'gawkSecs'));
        o.gz = secs(TUNE.gawkCool);
        seen++;
      }
      s.st = ST.WATCH;
      s.t = s.fl = secs(TUNE.flashSecs);
      ev.push({ e: 'flash', x: s.x, y: s.y, n: seen });
      continue;
    }

    // Slippery floor: a wet floor sign, or a teenager's mess. Teenagers are used to their own mess.
    const wet = here && here.k === 'wetfloor';
    const messy = !wet && messAt !== null && messAt.has(i) && !def.messy;
    if ((wet || messy) && !def.steady && s.cr !== 1) {
      const sign = wet ? statsOf(here) : null;
      if (!def.ignoresSigns) {
        // A sign takes no patience from someone who does not slip, so being weak to it (the day
        // drinker) means taking that much longer to get across it. (Never faster than walking.)
        speed *= sign ? Math.min(1, sign.slow / edgeMul(def, 'wetfloor')) : TUNE.wetSlow;
        // (A sign's stock, 0.4: one use for each shopper it slows, as he steps onto it.)
        if (sign && s.lt !== i) useWork(here, i, ev);
      } else if (s.lt !== i && rand(state) < (sign ? sign.slip : TUNE.slipChance) * cardSlip(state)) {
        s.lt = i;
        s.st = ST.STUN;
        s.t = secs(TUNE.slipSecs);
        ev.push({ e: 'slip', x: s.x, y: s.y });
        hurt(state, s, sign ? sign.slipDmg : TUNE.slipDmg, wet ? here.o : -1, ev, wet ? 'wetfloor' : '');
        // (...and one for each dad it trips.)
        if (sign) useWork(here, i, ev);
        continue;
      }
    }
    s.lt = i;

    // A stray dog stops to pee on the security it passes, which switches it off for a while.
    if (def.pees && !(s.cd > 0) && posts.length) {
      const ai = postNear(state, posts, s, tv(def, 'peeRange'));
      if (ai >= 0) {
        const b = grid[ai];
        b.off = secs(tv(def, 'peeSecs') * cardPee(state));
        s.st = ST.WATCH;
        s.t = secs(TUNE.peeStop);
        s.cd = secs(TUNE.peeStop + tv(def, 'peeCool'));
        ev.push({ e: 'pee', i: ai, x: s.x, y: s.y, k: b.k });
        continue;
      }
    }

    // The TV Salesman: in his reach, a shopper may stop to watch, or hurry past to get away.
    if (salesmen.length && !(s.pc > 0) && !chasing && s.cr !== 1) {
      const m = salesmanAt(state, salesmen, s.x, s.y);
      if (m) {
        const st = m[3], [stop0, rush0] = def.pitch || [0, 0];
        // A shopper he has already pitched to is harder to stop each time (counted per stand, so
        // a second salesman further on still gets his full first go).
        const pn = s.pn || (s.pn = {});
        const seen = pn[m[4]] | 0;
        pn[m[4]] = seen + 1;
        const stop = pitchStop(stop0, st.stopLeft, seen);
        const rush = rush0 * st.rushMul;
        const roll = rand(state);
        s.pc = secs(TUNE.pitchCool);
        // (His stock, 0.4: one use for each pitch that works, a shopper stopped or hurried past.)
        if (roll < stop + rush) useWork(grid[m[4]], m[4], ev);
        if (roll < stop) {
          // He does not freeze where he is: he walks over to the stand, and watches from there
          // (see walkToStand). `sa` is the stand, `sw` how long he will watch, `sl` how long he
          // may take getting there.
          s.sa = m[4];
          s.sw = secs(st.secs);
          s.sl = secs(TUNE.pitchWalkSecs);
          clearLift(s); // the television beats the goods he was off to steal
          ev.push({ e: 'pitch', x: s.x, y: s.y, k: s.k, r: 'stop', i: m[4] });
          continue;
        }
        if (roll < stop + rush) {
          s.ru = secs(TUNE.rushSecs);
          speed *= TUNE.rushSpeed;
          ev.push({ e: 'pitch', x: s.x, y: s.y, k: s.k, r: 'rush' });
        }
      }
    }

    // (A Card Trader steals too, only Mystery Boxes, and has no time for free samples.)
    if ((def.browses || def.rips) && s.cd === 0 && !chasing) {
      let stopped = false;
      for (const st of def.browses ? stands : NO_STANDS) {
        if ((s.x - st[0]) ** 2 + (s.y - st[1]) ** 2 <= st[2]) {
          s.st = ST.BROWSE;
          s.t = st[3];
          s.cd = secs(TUNE.browseCooldown);
          // (The table's stock, 0.4: one use for each shopper it stops.)
          useWork(grid[st[4]], st[4], ev);
          ev.push({ e: 'sample', x: s.x, y: s.y });
          // The game's cards: now and then he buys something (warranty); a table handing out booze
          // may turn him into a Day Drinker (eightyproof).
          maybeBuy(state, s, st[4], ev);
          if (st[5] && drinks(def) && hasCard(state, 'eightyproof')) boozeUp(state, s, grid[st[4]] ? grid[st[4]].o : -1, ev);
          stopped = true;
          break;
        }
      }
      // (On his way to goods he has his eye on, he does not stop for others on the way.)
      if (!stopped && s.lf === undefined) stopped = grabBeside(state, s, i, false, ev, def);
      if (stopped) { clearLift(s); continue; }
      // Out of his way to steal: already on his way to the goods, or (now and then, never in a
      // training game) looking round for some within a few tiles' walk.
      if (s.lf !== undefined) {
        if (liftWalk(state, s, i, speed, ev)) continue;
      } else if (!state.training && s.cr !== 1 && (state.tick + s.id) % secs(TUNE.liftLook) === 0) {
        liftLook(state, s, i, def);
        if (s.lf !== undefined && liftWalk(state, s, i, speed, ev)) continue;
      }
    }

    // Walk toward whichever neighbouring tile is closest to the tills, on this shopper's own
    // map. A mom whose child is waiting somewhere walks to the child instead.
    let going;
    if (chasing && s.kd === 2) {
      const ki = (s.ky | 0) * W + (s.kx | 0);
      going = ki === i ? moveTo(s.x, s.y, s.kx, s.ky, speed)
        : moveAlong(state, getFieldTo(state, ki), s.x, s.y, s.ox, s.oy, speed, s.id);
    } else if (chasing && s.kd === 1 && kidBack(state, s)) {
      // Her child is running back toward the entrance (the wrongway card): she stops dead and
      // watches him go, then walks back for him once he stops.
      going = false;
    } else if ((s.ex !== undefined || (eyes && trailsFlasher(state, s))) && trailing(state, s, i, fields, ev)) {
      // Trailing an Exhibitionist (the eyesup card), close enough behind her that his next step
      // would take him past her: he waits.
      going = false;
    } else {
      going = moveAlong(state, fields[routeOf(s, state)], s.x, s.y, s.ox, s.oy, speed, s.id);
    }
    if (going) {
      s.vx = MV.vx;
      s.vy = MV.vy;
      s.x += MV.vx;
      s.y += MV.vy;
    }
  }
}

/**
 * Advances the game by one tick.
 * @returns {Array<Object>} events that happened this tick, each with an `e` type:
 *   begun the lobby is over, everyone was ready (in a game with cards: the deal is over)
 *   map {design,size} the host changed the store
 *   deal {n} the deal of the game's n cards has begun (the first step of the 'cards' phase)
 *   card {i,id} card i of the hand (state.cards[i], id) has been revealed
 *   left also has fee when the restocking card made him pay the store on his way out
 *   waveStart {wave,total,dads,kinds,supers,office,boss,release} (boss: the boss's tier if he comes
 *     this wave, else 0; release: how many Card Traders a Midnight Release brings, else 0)
 *   waveEnd {wave,bonus} · won (never in an endless game) · lost
 *   release {n,door,x,y,wave} the first of a Midnight Release's mob of n Card Traders walked in
 *     through entrance `door` at (x, y); the rest follow within TUNE.releaseSecs
 *   rip {x,y,sup,n,far?} a Card Trader took a Mystery Box off a belt and is ripping it open; n
 *     other Card Traders stopped to watch (far 1: he went out of his way for it). No 'grab' with it
 *   escape {k,sup,x,y,refund,n,tier?} a shopper reached the tills; n is how many refunds it
 *     counted as (TUNE.bossRefunds for the boss, who also has tier; 0 for a baby, k 'baby')
 *   left {k,sup,x,y,by,why} one gave up; why is 'annoyed' (security wore him out), 'bored' (a dad
 *     whose patience drained away) or 'pop' (a Pregnant Lady who popped: a 'pop' event follows)
 *   pop {x,y,n,sup} a Pregnant Lady ran out of patience and popped: n babies (k 'baby') appeared
 *     round (x, y) and she is gone; sup 1 if she was an Octomom
 *   nopop {x,y,sup} a Barcode Laser finished a Pregnant Lady: she storms off (after her 'left'
 *     event) and no babies come out
 *   bossIn {tier,x,y} the boss walked in · bossOut {tier,x,y,bounty} he stormed off (after his
 *     'left' event) and the store was paid `bounty`, before it is split
 *   pep {x,y,n} the boss gave a pep talk; n shoppers near him got patience back (may be 0)
 *   sale {i,v,kind} · spray {i} · shot {i,x,y} · slip {x,y} · sample {x,y} · grab {x,y,kind,far?}
 *     (far 1: he went out of his way for it, see liftLook)
 *   rail {i,d,len,n} the Barcode Laser on anchor tile i fired facing d, a beam len tiles long, hitting n
 *   mess {i} a teenager dropped a mess on tile i · kid {x,y} a child escaped
 *   caught {x,y,carry} a mom has her child back (carry 1: in her arms, as she has no cart)
 *   kidtv {x,y} a running child stopped to watch a salesman's television
 *   bolt {x,y} a guide dog bolted · crawl {x,y} a mom ran out of patience with her child loose
 *     and is crawling to him, untouchable
 *   smash {i,x,y,k,owner,left} a gym bro hit the building of kind k on anchor tile i; left is how
 *     many more hits it takes this wave (0: destroyed, and now rubble)
 *   pitch {x,y,k,r,i?} a salesman got to a shopper of kind k: r 'stop' (he sets off for the stand
 *     on tile i to watch) or 'rush' (hurries past)
 *   watching {x,y,k,i} that shopper has reached the stand, or got as near as he can, and stopped
 *   pee {i,x,y,k} a dog peed on the building of kind k on anchor tile i: it is off for a while
 *   shield {x,y} a cosplayer soaked up a shot meant for someone near him (at most once a second each)
 *   flash {x,y,n} an exhibitionist opened her bathrobe; n dads and teenagers stopped to stare
 *   fall {x,y} a day drinker fell over going round a corner
 *   early {secs,cash,sold} the doors were opened that many seconds early; the factory sold `sold`
 *     items for `cash` (the whole store's takings, before it is split) in the time skipped
 *   The cards that change how shoppers behave (0.3.01) add:
 *   kid also has back 1 when the child runs back toward the entrance (wrongway)
 *   pop, nopop also have pup 1 for a pregnant Stray Dog (spayed): n puppies (k 'pup'), which
 *     reach a till ('escape', n 0) or give up ('left') exactly as babies do
 *   mess also has wide (how many tiles beside it it spilt onto) with the slushie card
 *   trail {x,y} a dad fell in behind an Exhibitionist (eyesup)
 *   drunk {x,y,k,sup} a booze table turned a shopper of kind k into a Day Drinker (eightyproof)
 *   bought {i,k,v,x,y,by} a shopper of kind `by` bought something for v dollars (before it is split)
 *     at the stand of kind k on anchor tile i, centred at (x, y) (warranty)
 *   pet {x,y,n,k} n shoppers (the first of kind k) stopped to pet the emotional support dog of the
 *     man at (x, y) (supportdog)
 * (Commands add: placed {k,x,y,d,by,rebuilt?,short?,free?} (free: the track a card's free upgrade
 *  went on), removed, upgraded {k,x,y,by,t,lv},
 *  gave {by,to,n}, rebuilt {by,n,short,late?} (late 1: wrecks already paid for, put back by
 *  step() once nothing was in the way), rebuildHeld {by,n,paid} a Rebuild press paid for n wrecks
 *  that must wait, endless {by} a won game carries on as an endless one,
 *  pause {on,by} player `by` paused (on true) or resumed (on false) the game.)
 *  The Back (0.4, back.js): binned {i,v,by} a Clearance Bin on tile i was paid v for a supply.
 *  stockOut {i,t} the building on anchor tile i has just used the last of its stock in track t
 *  ('dmg', 'spd', 'rng', 'dur'; 'wire' in a later stage). smash has tape 1 when Duct Tape soaked
 *  the hit up (its `left` then counts the tape still on it). dropUp {x,y,lv,by,paid} (a command)
 *  a player bought the Returns Drop at (x, y) its cash level lv.
 */
export function step(state) {
  const ev = [];
  if (state.phase === 'won' || state.phase === 'lost') return ev;
  // Paused (0.3.02, the 'pause' command): nothing moves at all, the clock included, exactly as in
  // the lobby. A game paused for any number of steps and then resumed carries on exactly as if it
  // had never stopped; the build pause's timer, the deal and a dropped player's grace period wait.
  if (state.pause) return ev;
  if (state.phase === 'lobby') {
    // Nothing runs in the lobby. The game starts when every connected player is ready.
    const here = state.players.filter((p) => p.on);
    if (here.length && here.every((p) => p.ready)) {
      // A game with cards still to deal goes to the deal first (its next step sends 'deal'); the
      // deal ends the way this does (see stepDeal).
      if (state.dealT !== undefined && state.cards && state.cards.length) {
        state.phase = 'cards';
        return ev;
      }
      state.phase = 'build';
      state.phaseT = -1;
      ev.push({ e: 'begun' });
    }
    return ev;
  }
  state.tick++;
  expireAway(state);
  // The deal: the cards are revealed one by one, and nothing else runs (cards.js).
  if (state.phase === 'cards') {
    stepDeal(state, ev);
    return ev;
  }
  // Nothing runs before the first build. (In training the factory always runs.)
  const waiting = !state.training && state.phase === 'build' && state.phaseT === -1;
  if (state.phase === 'build') {
    if (state.phaseT > 0 && --state.phaseT === 0) beginWave(state, ev);
  } else {
    spawn(state, ev);
  }
  if (waiting) return ev;
  for (let k = state.messes.length - 1; k >= 0; k--) {
    if (--state.messes[k][1] <= 0) state.messes.splice(k, 1);
  }
  // A gym bro can change the layout mid-tick; everyone else finishes this tick on the old maps.
  const fields = [getField(state, NORMAL), getField(state, HOP), getField(state, SMASH)];
  // The Back (0.4) first: in a later stage it stocks the security buildings, which fire below.
  stepBack(state, ev);
  const sec = stepBuildings(state, fields, ev);
  stepShoppers(state, fields, sec, ev);
  // After the shoppers have moved, so a rebuild sees where they stand now (it must not be put
  // down on one, or wall one in): wrecks a player has paid for go back once nothing is in the way.
  stepRebuilds(state, ev);
  if (state.phase === 'wave' && !state.spawnQ.length && !state.shoppers.length) endWave(state, ev);
  return ev;
}
