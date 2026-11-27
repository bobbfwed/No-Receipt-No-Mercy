// Plays whole games with scripted players and prints how each went, to judge difficulty without a
// human. Since 0.4 (stage 7) the scripted players build The Back too: see "Bots" below.
// Usage: node tools/balance.mjs [seed] [size] [design] [-v] [--endless] [--difficulty=easy] [--cards=...]
//                               [--bots=...] [--table] [--seeds=11,5,...] [--players=2] [--set=...]
//   size       a key of MAP_SIZES (default: the size recommended for the number of players), or "all"
//   design     a key of MAP_DESIGNS (default: warehouse; the bots' layout suits an open floor)
//   -v         also print every wave (a boss wave says how the boss did: "boss out", or "boss
//              through" with the share of his patience he had left), and what the bot built
//   --endless  play endless games (no last sales event) and print the sales event each lost in
//   --difficulty=  a key of SETTINGS.difficulty (default: normal)
//   --cards=   the game's cards (0.3.01): a list of card ids forces that hand, any number of them
//              (--cards=litter,hardy:karen; a per-kind card names its kind), with no deal; "deal"
//              deals a hand from the seed as a real game does, through the deal (the bots skip it).
//              Left out: no cards. Each result line names the hand.
//   --table    (0.4) the yardstick: plays every bot on the eight seeds 11, 5, 23, 7, 42, 3, 99, 1234
//              (or --seeds=) and prints one line per seed and an average per bot: the event lost in
//              (a win counts as 21), cash at the loss, refunds by dads, the first event a dad got a
//              refund, and how much of the time the supplied buildings were stocked. The table in
//              PLAN.md ("Version 0.4", stage 7) is `node tools/balance.mjs --table`.
//   --seeds=   the seeds for --table (a list, or a range like 1-20)
//   --players= (0.4) players in the game (default 1). With 2 or more, one bot runs the shop floor
//              and the second The Back (handing his spare cash to the first); any others hand all
//              theirs to the first. The size defaults to the one recommended for that many players
//   --set=     try another number without editing constants.js, for quick trials while tuning:
//              "--set=BACK.dropSecs=2;TUNE.payStep=40;SHOPPERS.dad.sup.from=6" (any of BACK, TUNE,
//              BUILD, SHOPPERS, a path of keys, a JSON value; several separated by semicolons)
//   --jobs=N   games at once for --table (worker threads; default: one fewer than the processor's)
//   --bots=    which bots (default: nothing, floor, honest, keen). A bot name followed by
//              :{json} is that bot with some settings changed, to try a plan another way:
//              '--bots=keen,keen:{"fences":[0,2]}' (the settings are those of BOTS below)
//   BACKDEBUG=1 (environment) prints each building no supply line could reach, and why
//
// Bots (0.4, stage 7). All build walls of Crate Stacks ten tiles apart, each with a one-tile gap at
// alternate ends so shoppers zigzag, and security packed round each gap where every shopper passes
// (the same walls and security as the bots of 0.2 to 0.3, so earlier results compare). Since 0.4
// dads walk through every building; only walls and live Razor Wire stop them.
//   nothing   builds nothing (the game should be lost quickly)
//   floor     the shop floor only, as the bots played until 0.4: the maze, its security, then Forklift
//             Turrets on a loose grid over the whole floor, and it reinforces Crate Stacks that gym
//             bros keep wrecking. Nothing in The Back, so its security is never stocked and it lays
//             no wire: the yardstick for ignoring the factory
//   honest    the maze, plus simple supply lines: Bottled Spite and Rage Cola (Store Brand) from the
//             nearest Returns Drop to every Pepper Sprinkler and Forklift Turret, leftovers into a
//             Clearance Bin; four "fence posts" (Pepper Sprinklers standing in the first wall in
//             place of crates, the one on the dads' straight line first, each wired 3 tiles toward
//             the gap) fed Razor Wire by a Barb Bender, so the dads are herded to that wall's gap
//             like everyone else. Then forklifts on the grid as cash allows, each added to the
//             lines. No Rebranders, no Returns Drop upgrades, no reinforcing
//   keen      everything honest does, plus Rebranders put into each machine's stretch over time
//             (Spite and Cola to Name Brand as soon as the first gap is guarded, Razor Wire after the
//             second wall, all three to Premium after the third, then Platinum and Returns Drop
//             levels between its forklifts), and reinforced crates where gym bros keep wrecking.
//             Tried and dropped while tuning (each did worse): fence posts in every wall, Extension
//             Cord, Duct Tape (gone since 0.4.01), Returns Drop levels early (PLAN.md, 0.4 stage 7)
//   greedy    (to see whether Platinum is too easy) the maze and its gap security and nothing more on
//             the shop floor; each drop's Spite and Cola go through a comb of Rebranders side by side
//             (2, 4 and 8 for the three steps) so all of it arrives Platinum; honest's fence; then
//             Returns Drop levels
//   focus     keen, but its forklifts go column by column from the entrance side, so the supplies
//             concentrate on the channels shoppers reach first
//   stalls    keen that also puts a TV Salesman, two Free Sample tables and four Wet Floor Signs in
//             each channel of the maze (to measure the cards about those buildings; tools/cardtest.mjs)
// How a line is laid (a Splitter at each drop, a machine per supply, a belt with an Unpaid Intern at
// each building) is in tools/balance/back.mjs.
// Any bot may be given the steady opening by adding "+steady" to its name (keen+steady): it never
// sits on cash while the next thing in its plan is out of reach and a later, cheaper one is not: it
// buys the cheaper one meanwhile and comes back for the other. Without it a bot waits for each
// purchase in turn, as a person following a plan does.
// --bots=keen,focus+steady chooses the bots (default: nothing, floor, honest, keen).
import { pathToFileURL, fileURLToPath } from 'node:url';
import { availableParallelism } from 'node:os';
import {
  createGame, addPlayer, applyCommand, step, canPlace, canWire, buildPrice, footprint, dadRoute, upgradeCost,
  usesIn, TICK_HZ, MAP_SIZES, mapSize, recommendedSize, BUILD, BACK, TUNE, SHOPPERS, reinforceCost,
} from '../src/sim/index.js';
import { Backroom, SUPPLIES } from './balance/back.mjs';

export const SEEDS = [11, 5, 23, 7, 42, 3, 99, 1234];

/**
 * The columns the maze's walls stand in, ten tiles apart, and which end each one's gap is at: the
 * first at the bottom, then alternating, so shoppers walk down one channel and up the next. (The
 * same columns and ends as the bots' walls before 0.4, so the earlier results still compare.)
 * @returns {{x: number, gy: number, s: number}[]} gy: the gap's row; s: +1 if the store lies below
 *   the gap (a gap at the top), -1 if above it.
 */
function wallColumns(s) {
  const out = [];
  let k = 0;
  for (let x0 = 9; x0 + 3 <= s.w - 4; x0 += 10, k++) {
    const gy = k % 2 ? 1 : s.h - 2;
    out.push({ x: x0 + 2, gy, s: gy === 1 ? 1 : -1 });
  }
  return out;
}

/** The row the dads' straight walk (no wire) crosses column x on, from the first entrance. */
function dadRow(s, x) {
  const route = dadRoute(s, s.doors[0][0], false);
  const t = route.find((i) => i % s.w === x);
  return t === undefined ? s.h >> 1 : (t / s.w) | 0;
}

/**
 * Fence posts for one wall (0.4): Pepper Sprinklers standing in the wall's column in place of
 * crates, each with Razor Wire running 3 tiles toward the gap, so that between them they cover the
 * whole wall but the tile next to the gap. With all of them live a dad cannot walk through that
 * wall anywhere but at its gap, where the security is. The post on the dads' straight line comes
 * first; the rest nearest it first. @returns {{x, y, wd}[]}
 */
function fencePosts(s, { x, gy, s: d }) {
  const reach = BACK.wireReach + 1;
  const far = gy + d * (s.h - 3); // the wall's far end (next to the outer wall)
  const wd = d === -1 ? 1 : 3; // wire runs toward the gap: south for a gap at the bottom
  const out = [];
  for (let y = far; d === -1 ? y < gy - 1 : y > gy + 1; y -= d * reach) out.push({ x, y, wd });
  const row = dadRow(s, x);
  // (A post covers its own row and the next `reach - 1` toward the gap.)
  const mid = (p) => p.y + (wd === 1 ? 1 : -1) * (reach - 1) / 2;
  return out.sort((a, b) => Math.abs(mid(a) - row) - Math.abs(mid(b) - row));
}

/**
 * The plan for a map: what the bot buys in order. Items are [kind, x, y, facing, extra] for a
 * building (extra: { wd: wire direction, sup: the supplies it should get }), or markers:
 * ['line', supply] (from here on, buildings that want this supply get it), ['tier', supply] (one
 * more Rebrander on every line of that supply), ['dropUp', n] (the n-th Returns Drop, one level).
 * Per wall: the wall itself (cheap), the first fence post (wired bots), the security round its gap,
 * nearest the gap first, then the other posts. Every shopper walks through every gap, so that is
 * where security earns its keep. Anything the game refuses is skipped.
 */
function plan(s, cfg) {
  const list = [];
  const tower = cfg.sup.tower || [];
  const walls = wallColumns(s);
  for (const [k, wall] of walls.entries()) {
    const { x, gy, s: d } = wall;
    const posts = cfg.fences === 'all' || (cfg.fences || []).includes(k) ? fencePosts(s, wall) : [];
    // The wall: the whole column but the gap, from the far end toward the gap.
    for (let y = gy + d * (s.h - 3); y !== gy; y -= d) list.push(['crate', x, y, 0]);
    // A post takes a crate's place later (the crate is sold and the sprinkler put down at once), so
    // the wall is never open meanwhile.
    const post = (p) => ['sprinkler', p.x, p.y, 0, { wd: p.wd, sup: ['wire'], post: 1 }];
    if (posts.length) list.push(post(posts[0]));
    if (k === 0 && posts.length) list.push(['line', 'wire']);
    // The gap: a sprinkler either side of it and a Wet Floor Sign in it. Shoppers come along the
    // outer wall to reach it, so the buildings beside the gap turn that into a short corridor.
    const sec = (kind, bx, by) => [kind, bx, by, 0, kind === 'sprinkler' || kind === 'forklift' ? { sup: tower } : {}];
    list.push(sec('sprinkler', x - 1, gy + d), sec('sprinkler', x + 1, gy + d));
    if (k === 0) for (const t of cfg.lines || []) list.push(['line', t]);
    list.push(sec('wetfloor', x, gy), sec('wetfloor', x - 1, gy), sec('wetfloor', x + 1, gy));
    list.push(sec(k > 0 ? 'samples' : 'sprinkler', x - 2, gy + d), sec('sprinkler', x + 2, gy + d));
    // A forklift either side, a little way in, covers the gap and the channels on both sides of it.
    list.push(sec('forklift', x + 2, gy + 3 * d));
    if (k > 0) list.push(sec('forklift', x - 2, gy + 3 * d));
    for (const p of posts.slice(1)) list.push(post(p));
    for (const m of (cfg.afterWall || [])[k] || []) list.push(m);
  }
  return list;
}

/** Forklifts on a loose grid over the whole floor, row by row (keen's extra shopping since 0.2). */
function extras(s, sup) {
  const out = [];
  for (let y = 2; y <= s.h - 3; y += 3) for (let x = 2; x <= s.w - 3; x += 3) out.push(['forklift', x, y, 0, { sup }]);
  return out;
}

/** The same forklifts, column by column from the entrance's side (the focus bot). */
function front(s, sup) {
  return extras(s, sup).sort((a, b) => a[1] - b[1] || a[2] - b[2]);
}

/**
 * The stalls bot's extra shopping, before its forklifts: a TV Salesman in the middle of each channel
 * between two walls, a Free Sample table near each end of the channel and a few Wet Floor Signs in
 * it, all where every shopper walks. It exists to measure the cards about those buildings
 * (eightyproof, warranty, mopmike, sensibleshoes), which the other bots barely use.
 */
function stalls(s) {
  const out = [], mid = s.h >> 1;
  for (const { x } of wallColumns(s)) {
    if (x + 6 >= s.w - 1) break;
    out.push(['salesman', x + 4, mid - 1, 0], ['samples', x + 4, 3, 0], ['samples', x + 4, s.h - 4, 0],
      ['wetfloor', x + 5, 5, 0], ['wetfloor', x + 5, s.h - 6, 0], ['wetfloor', x + 3, mid + 2, 0], ['wetfloor', x + 6, mid - 3, 0]);
  }
  return out;
}

/**
 * Interleaves markers into the extra shopping: after every `every` forklifts, the next marker.
 * (keen: Returns Drop levels and Rebranders between its forklifts, so money keeps going into both.)
 */
function interleave(list, markers, every) {
  const out = [];
  let m = 0;
  list.forEach((it, n) => {
    out.push(it);
    if ((n + 1) % every === 0 && m < markers.length) out.push(markers[m++]);
  });
  while (m < markers.length) out.push(markers[m++]);
  return out;
}

/**
 * The bots: what each builds (see the top of the file). Settings:
 *   back       builds in The Back at all            fences   walls (0 = nearest the entrance, or
 *   reinforce  reinforces crates gym bros wreck                'all') that get fence posts
 *   signUp     (0.4.01) upgrades every Wet Floor Sign with cash to this level once its plan is built
 *              ('all', 0.4.01: any building gym bros wreck, now that security can be reinforced)
 *   prefix     room for this many Rebranders per machine (they come with 'tier' markers)
 *   sup.tower  supplies for its Pepper Sprinklers and Forklift Turrets
 *   lines      supplies started once the first gap is guarded ('line' markers)
 *   main       the two machines on each drop's main bus (default Spite and Cola; the third is a
 *              Barb Bender with a bus of its own)
 *   afterWall  markers after each wall's security; markers, every: markers between the extras,
 *              one after every `every` forklifts; extras 'grid' or 'front'; stalls (see stalls())
 */
const TIER = (t) => ['tier', t];
const DROP = (n) => ['dropUp', n];
// keen: Name Brand Spite and Cola as soon as the first gap is guarded, Razor Wire to Name Brand after
// the second wall, Premium all three after the third, then Platinum and Returns Drop levels between
// its forklifts. (Measured while tuning, 0.4 stage 7: fence posts in every wall, Extension Cord and
// Duct Tape all did worse than this; see PLAN.md.)
const KEEN = {
  back: true, fences: [0], reinforce: true, prefix: 3,
  sup: { tower: ['dmg', 'spd'] }, lines: ['dmg', 'spd'],
  afterWall: [[TIER('dmg'), TIER('spd')], [TIER('wire')], [TIER('dmg'), TIER('spd'), TIER('wire')]],
  markers: [TIER('dmg'), TIER('spd'), TIER('wire'), DROP(0), DROP(1), DROP(2)],
  every: 4, extras: 'grid',
};
// greedy (0.4 stage 7, to see whether Platinum is too easy for a player who goes all out on it):
// the maze and its gap security and nothing more on the shop floor; at every drop a Spite Still and
// a Cola Cannery (and the Barb Bender for honest's fence) whose bus runs through a comb of Rebranders
// in parallel (2, 4 and 8 for the three steps: enough for the 30 junk a minute the two machines get
// from a drop at level 0) so all of it arrives Platinum; then Returns Drop levels.
const GREEDY = {
  back: true, fences: [0], sup: { tower: ['dmg', 'spd'] }, lines: ['dmg', 'spd'], comb: [2, 4, 8], reinforce: true,
  markers: [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2].map((n) => DROP(n)), every: 1, extras: '',
};
export const BOTS = {
  nothing: null,
  floor: { back: false, fences: [], reinforce: true, sup: {}, extras: 'grid' },
  honest: {
    back: true, fences: [0], sup: { tower: ['dmg', 'spd'] }, lines: ['dmg', 'spd'], extras: 'grid',
  },
  keen: KEEN,
  greedy: GREEDY,
  focus: { ...KEEN, extras: 'front' },
  stalls: { ...KEEN, stalls: true },
};

/**
 * Plays one game. bot: a key of BOTS, with "+steady" if wanted. Returns the result and what happened.
 * @param {object} [o] players: how many (2: one runs the shop floor, one The Back)
 */
export function play(bot, seed, map, endless = false, difficulty = null, cards = null, keep = false, o = {}) {
  const steady = bot.endsWith('+steady');
  if (steady) bot = bot.slice(0, -7);
  if (!Object.hasOwn(BOTS, bot)) throw new Error(`no bot "${bot}" (${Object.keys(BOTS).join(', ')})`);
  const cfg = BOTS[bot];
  const players = o.players || 1;
  const settings = { ...(endless ? { waves: 0 } : null), ...(difficulty ? { difficulty } : null) };
  const s = createGame({ seed, map, settings: Object.keys(settings).length ? settings : null, cards });
  for (let p = 0; p < players; p++) addPlayer(s, 'Bot' + p);
  const me = s.players[0];
  const backPid = players > 1 ? 1 : 0;
  const buyer = !!cfg;

  // ---- The plan
  let list = [];
  let back = null;
  if (buyer) {
    list = plan(s, cfg);
    const sup = cfg.sup.tower || [];
    let more = cfg.extras === 'front' ? front(s, sup) : cfg.extras === 'grid' ? extras(s, sup) : [];
    if (cfg.markers) more = interleave(more, cfg.markers, cfg.every);
    if (cfg.stalls) more = stalls(s).concat(more);
    list = list.concat(more);
    if (cfg.back) {
      // Tiles under the maze's planned security must stay clear in The Back (a security building
      // cannot go over a part there). Later purchases are not kept clear: one whose tiles The Back has
      // used by then is refused and skipped, as a person would build elsewhere.
      const lifted = (it) => typeof it[1] === 'number' && BUILD[it[0]] && BUILD[it[0]].lift;
      const reserved = new Set();
      const mazeLen = list.length - more.length;
      for (const it of list.slice(0, mazeLen)) if (lifted(it)) for (const t of footprint(s, it[0], it[1], it[2], it[3]) || []) reserved.add(t);
      // The walls of fence posts, for their wire lanes.
      const postsAt = new Map();
      for (const it of list) if (it[4] && it[4].post) postsAt.set(it[1], (postsAt.get(it[1]) || []).concat(it[2]));
      const fences = [...postsAt].map(([x, ys]) => ({ x, ys }));
      back = new Backroom(s, backPid, { reserved, prefix: cfg.prefix || 0, main: cfg.main, fences, comb: cfg.comb });
      list = list.filter((it) => !lifted(it) || !(footprint(s, it[0], it[1], it[2], it[3]) || []).some((t) => back.keepClear.has(t)));
    }
  }
  const total = list.length;
  const done = new Set(); // what the steady opening bought out of turn
  let next = 0; // how far down the list it has got
  let bought = 0, rebuilt = 0, wrecked = 0, stolen = 0, reinforced = 0, dropUps = 0;
  let ripped = 0, rippedNow = 0;
  const enabled = new Set(); // supplies whose lines have been started
  const tierWanted = {}; // Rebranders wanted on every line of a supply
  const wants = new Map(); // anchor -> supplies it should get (from its plan item)
  const crateHits = new Map(); // tile -> times a crate there was wrecked
  const built = {}; // shop floor buildings by kind
  const rows = [];
  let byKind = {};
  // Measures (0.4): junk out of the drops, units delivered and binned, wire used, stocked shares.
  const m = { junk: 0, delivered: {}, binned: 0, binnedCash: 0, wireUses: 0, dadRefunds: 0, firstDad: 0, stock: {}, mid: {} };
  for (const t of SUPPLIES) { m.delivered[t] = 0; m.stock[t] = [0, 0]; m.mid[t] = [0, 0]; }
  const limit = (endless ? 6 * 60 : 90) * 60 * TICK_HZ;
  let boss = null, bossLeft = 0;

  const want = (ai, sups) => {
    if (!back) return;
    for (const t of sups) if (enabled.has(t)) back.want(ai, t);
  };

  function shop() {
    // Patch holes first: pay to put back whatever gym bros have wrecked.
    if (s.rubble.some((r) => r.by === undefined)) {
      const r = applyCommand(s, 0, { c: 'rebuild' });
      if (r.ok) rebuilt += r.n;
    }
    // Crates that keep getting wrecked are reinforced, a level per wreck, up to three (with
    // reinforce 'all', any building).
    if (cfg.reinforce) {
      for (const [i, n] of crateHits) {
        const b = s.grid[i];
        if (!b || (b.k !== 'crate' && cfg.reinforce !== 'all') || (b.r | 0) >= Math.min(3, n)) continue;
        if (me.cash < reinforceCost(b, s)) break;
        if (applyCommand(s, 0, { c: 'reinforce', x: i % s.w, y: (i / s.w) | 0 }).ok) reinforced++;
      }
    }
    if (back) {
      back.work();
      // Rebranders wanted (keen): one more in the stretch of every machine making that supply.
      raising: for (const c of back.cells) {
        for (const sl of c.slots) {
          if (!sl.built || sl.raised >= (tierWanted[sl.supply] | 0)) continue;
          if (back.raise(c, sl.supply) === 'cash') break raising;
        }
      }
    }
    // Two players: the one in The Back (or, for a bot with no Back, the second player) hands what he
    // does not need to the one on the floor.
    // (With three or more, the others are extra hands on the shop floor's one plan: they give it all.)
    for (let pid = 1; pid < players; pid++) {
      const bp = s.players[pid], keep = back && pid === backPid ? 150 : 0;
      if (bp.cash > keep + 150) applyCommand(s, pid, { c: 'give', to: 0, n: Math.floor(bp.cash - keep) });
    }
    const price = (k) => buildPrice(s, k);
    /** The cash the next item needs (0 for one that costs nothing now). */
    const need = (it) => {
      if (it[0] === 'line' || it[0] === 'tier') return 0;
      if (it[0] === 'dropUp') return 0;
      return price(it[0]);
    };
    /** Buys list item j if it can: true when it is dealt with (bought or refused for good). */
    const tryBuy = (j) => {
      const it = list[j];
      if (it[0] === 'line') {
        enabled.add(it[1]);
        for (const [ai, sups] of wants) want(ai, sups.filter((t) => t === it[1]));
        return true;
      }
      if (it[0] === 'tier') { tierWanted[it[1]] = (tierWanted[it[1]] | 0) + 1; return true; }
      if (it[0] === 'dropUp') {
        const di = back && back.drops[it[1]];
        if (di === undefined) return true;
        const r = applyCommand(s, 0, { c: 'dropUp', x: di % s.w, y: (di / s.w) | 0 });
        if (r.ok) { dropUps++; return true; }
        return r.why !== 'cash';
      }
      const [k, x, y, d, extra = {}] = it;
      const here = s.grid[y * s.w + x];
      if (extra.post && here && here.k === 'crate' && here.part === undefined) {
        // A fence post where a crate stands: sell the crate, put the post down in the same moment.
        if (me.cash + Math.floor(buildPrice(s, 'crate') * TUNE.sellBack) < price(k)) return false;
        if (s.back[y * s.w + x]) return true; // (something of The Back's under it: no post here)
        applyCommand(s, 0, { c: 'remove', x, y });
      }
      const why = canPlace(s, k, x, y, 0);
      if (why === 'shopper' || why === 'cash') return false; // try again shortly
      // A wall that would shut a shopper in during a sales event can go up once he has moved on.
      if (why === 'blocked' && k === 'crate' && s.phase === 'wave') return false;
      if (!why && applyCommand(s, 0, { c: 'place', k, x, y, d }).ok) {
        bought++;
        built[k] = (built[k] || 0) + 1;
        const ai = y * s.w + x;
        if (extra.wd !== undefined && !canWire(s, 0, x, y, extra.wd)) applyCommand(s, 0, { c: 'wire', x, y, d: extra.wd });
        if (extra.sup && extra.sup.length) { wants.set(ai, extra.sup); want(ai, extra.sup); }
      }
      return true;
    };
    while (next < list.length) {
      if (done.has(next)) { next++; continue; }
      if (me.cash < need(list[next])) break;
      if (!tryBuy(next)) break;
      next++;
    }
    if (steady && next < list.length && me.cash < need(list[next])) {
      for (let j = next + 1; j < list.length; j++) {
        if (done.has(j) || me.cash < need(list[j]) || typeof list[j][1] !== 'number') continue;
        if (tryBuy(j)) done.add(j);
      }
    }
    // (0.4.01) Wet Floor Signs upgraded with cash, up to signUp levels, once the whole plan is bought.
    if (cfg.signUp && next >= list.length) {
      for (let i = 0; i < s.grid.length; i++) {
        const b = s.grid[i];
        if (!b || b.k !== 'wetfloor' || (b.u | 0) >= cfg.signUp) continue;
        if (me.cash < upgradeCost(b, s)) break;
        applyCommand(s, 0, { c: 'upgrade', x: i % s.w, y: (i / s.w) | 0 });
      }
    }
  }

  // Per-tick measuring of The Back.
  const dropT = new Map();
  let lastUses = new Map();
  function measure(inWave) {
    if (!back) return;
    for (const di of back.drops) {
      const t = s.back[di].t;
      if (dropT.has(di) && t > dropT.get(di)) m.junk++;
      dropT.set(di, t);
    }
    const served = back.servedMap();
    const now = new Map();
    for (const [ai, sups] of served) {
      const b = s.grid[ai];
      if (!b || b.part !== undefined) continue;
      for (const t of sups) {
        const u = usesIn(b, t), key = ai * 8 + SUPPLIES.indexOf(t);
        now.set(key, u);
        const was = lastUses.get(key);
        if (was !== undefined && u > was) m.delivered[t]++;
        if (inWave && s.tick % 15 === 0) {
          m.stock[t][0] += u > 0 ? 1 : 0; m.stock[t][1]++;
          if (s.wave >= 6 && s.wave <= 12) { m.mid[t][0] += u > 0 ? 1 : 0; m.mid[t][1]++; }
        }
      }
    }
    lastUses = now;
  }

  while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < limit && !(o.until && s.wave >= o.until && s.phase === 'wave' && s.tick - s.waveAt > (o.at || 0) * TICK_HZ)) {
    if (s.phase === 'cards') {
      for (const p of s.players) if (!p.skip) applyCommand(s, p.id, { c: 'skipCards', on: true });
      step(s);
      continue;
    }
    if (buyer && s.tick % 15 === 0) shop();
    if (s.phase === 'build' && s.phaseT === -1) {
      if (buyer && bought === 0) { shop(); if (bought === 0) { step(s); continue; } }
      if (!buyer) applyCommand(s, 0, { c: 'start' });
    }
    const evs = step(s);
    measure(s.phase === 'wave');
    if (boss) bossLeft = boss.hp / boss.mhp;
    for (const e of evs) {
      if (e.e === 'waveStart') byKind = {};
      if (e.e === 'bossIn') boss = s.shoppers.find((x) => x.k === 'boss');
      if (e.e === 'bossOut') { byKind['boss out'] = 1; boss = null; }
      if (e.e === 'escape' && e.k === 'boss') { byKind[`boss through (${Math.round(bossLeft * 100)}% left)`] = 1; boss = null; continue; }
      if (e.e === 'escape') {
        const k = (e.sup ? 'SUPER ' : '') + e.k; byKind[k] = (byKind[k] || 0) + 1;
        if (e.k === 'dad') { m.dadRefunds += e.n; if (!m.firstDad) m.firstDad = s.wave; }
      }
      if (e.e === 'smash') {
        wrecked += e.left === 0 ? 1 : 0;
        if ((e.k === 'crate' || (cfg && cfg.reinforce === 'all')) && e.left === 0) crateHits.set(e.i, (crateHits.get(e.i) || 0) + 1);
      }
      if (e.e === 'rebuilt' && e.late) rebuilt += e.n;
      if (e.e === 'rip') { ripped++; rippedNow++; }
      if (e.e === 'binned') { m.binned++; m.binnedCash += e.v; }
      if (e.e === 'turned' && !e.free) m.wireUses++;
      if (e.e === 'waveEnd' || e.e === 'lost') {
        stolen += s.ws.stolen;
        rows.push({
          wave: s.wave, escaped: s.ws.escaped, stopped: s.ws.stopped, wrecked: s.ws.wrecked, stolen: s.ws.stolen,
          earned: Math.round(s.ws.earned + (e.pay | 0) + (e.speed | 0)), cash: Math.round(s.players.reduce((n, p) => n + p.cash, 0)),
          refunds: s.refunds, built: bought, ripped: rippedNow,
          who: Object.entries(byKind).map(([k, n]) => k + ' ' + n).join(', '),
        });
        rippedNow = 0;
      }
    }
  }
  const parts = { ...built, ...(back ? back.log.parts : {}) };
  const share = (a) => (a[1] ? a[0] / a[1] : null);
  return {
    hand: s.cards || [],
    bot: (steady ? bot + '+steady' : bot), result: s.phase, wave: s.wave, refunds: s.refunds, limit: s.refundLimit,
    cash: Math.round(s.players.reduce((n, p) => n + p.cash, 0)),
    bought, of: total, rebuilt, wrecked, stolen, ripped, reinforced, dropUps, minutes: (s.tick / TICK_HZ / 60).toFixed(1), rows,
    parts, failed: back ? back.log.failed : 0, why: back ? back.log.why : {}, crossings: back ? back.log.crossings : 0, branches: back ? back.log.branches : 0,
    junkPerMin: s.tick ? (m.junk / (s.tick / TICK_HZ / 60)) : 0,
    delivered: m.delivered, binned: m.binned, binnedCash: Math.round(m.binnedCash), wireUses: m.wireUses,
    dadRefunds: m.dadRefunds, firstDad: m.firstDad,
    stocked: Object.fromEntries(SUPPLIES.map((t) => [t, share(m.stock[t])])),
    stockedMid: Object.fromEntries(SUPPLIES.map((t) => [t, share(m.mid[t])])),
    ...(keep ? { state: s } : null),
  };
}

// ------------------------------------------------------------------ trying other numbers

/** Applies --set=BACK.dropSecs=2,TUNE.payStep=40 to the game's tables (in this process only). */
export function applySets(text) {
  if (!text) return;
  const tables = { BACK, TUNE, BUILD, SHOPPERS };
  for (const one of text.split(';')) {
    const [path, value] = one.split('=');
    const keys = path.split('.');
    let obj = tables[keys.shift()];
    while (keys.length > 1) obj = obj[keys.shift()];
    obj[keys[0]] = JSON.parse(value);
  }
}

/**
 * --bot=name:{json} (for trying a bot's plan another way while tuning): a new bot, a copy of the
 * named one with those settings changed, called name:... in the results.
 */
export function botFrom(name) {
  const at = name.indexOf(':');
  if (at < 0 || Object.hasOwn(BOTS, name)) return;
  BOTS[name] = { ...BOTS[name.slice(0, at)], ...JSON.parse(name.slice(at + 1)) };
}

// ------------------------------------------------------------------ the command line

const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
let workerMode = false;
try {
  const wt = await import('node:worker_threads');
  if (!wt.isMainThread && wt.workerData && wt.workerData.balance) {
    workerMode = true;
    applySets(wt.workerData.sets);
    wt.parentPort.on('message', (j) => {
      botFrom(j.bot.replace(/[+]steady$/, ''));
      const r = play(j.bot, j.seed, j.map, false, j.difficulty, null, false, { players: j.players });
      delete r.rows;
      wt.parentPort.postMessage({ id: j.id, r });
    });
  }
} catch { /* no worker threads: run as a script only */ }

function opt(args, name) { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : ''; }

function seedList(text) {
  if (!text) return SEEDS;
  const r = text.match(/^(\d+)-(\d+)$/);
  if (r) return Array.from({ length: +r[2] - +r[1] + 1 }, (_, n) => +r[1] + n);
  return text.split(',').map(Number);
}

const pct = (v) => (v === null || v === undefined ? '  -' : String(Math.round(v * 100)).padStart(3) + '%');

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('-v');
  const endless = args.includes('--endless');
  const difficulty = opt(args, 'difficulty') || null;
  const players = Number(opt(args, 'players')) || 1;
  const sets = opt(args, 'set');
  applySets(sets);
  const [seedArg, sizeArg, designArg] = args.filter((a) => !a.startsWith('-'));
  const cardsArg = opt(args, 'cards');
  const cards = !cardsArg ? null : cardsArg === 'deal' ? true : cardsArg.split(',').map((c) => c.trim()).filter(Boolean);
  const design = designArg || 'warehouse';
  const bots = (opt(args, 'bots') || 'nothing,floor,honest,keen').split('').reduce((out, ch) => {
    // (Split at commas outside a bot's {json}.)
    if (ch === ',' && out.depth === 0) out.list.push('');
    else { out.list[out.list.length - 1] += ch; out.depth += ch === '{' || ch === '[' ? 1 : ch === '}' || ch === ']' ? -1 : 0; }
    return out;
  }, { list: [''], depth: 0 }).list;
  for (const b of bots) botFrom(b.replace(/[+]steady$/, ''));
  const sizeKey = sizeArg || recommendedSize(players);

  if (args.includes('--table')) {
    await table({ bots, seeds: seedList(opt(args, 'seeds')), map: { design, size: sizeKey }, difficulty, players, sets, jobs: Number(opt(args, 'jobs')) || Math.max(1, availableParallelism() - 1) });
    return;
  }
  const seed = Number(seedArg) || 11;
  const sizes = sizeArg === 'all' ? Object.keys(MAP_SIZES) : [sizeKey];
  for (const size of sizes) {
    const z = { ...MAP_SIZES[size], ...mapSize(design, size) };
    console.log(`\n#### ${design}, ${z.name} (${z.w} x ${z.h}), seed ${seed}, ${players} player${players > 1 ? 's' : ''}${endless ? ', ENDLESS' : ''}${difficulty ? ', ' + difficulty : ''}${cards ? `, cards: ${cardsArg}` : ''}`);
    for (const bot of bots) {
      const r = play(bot, seed, { design, size }, endless, difficulty, cards, false, { players });
      const result = r.result === 'lost' ? 'LOST' : endless ? 'ALIVE' : r.result.toUpperCase();
      console.log(`== ${bot.padEnd(7)} ${result.padEnd(5)} wave ${String(r.wave).padStart(2)}, `
        + `${r.refunds}/${r.limit} refunds (dads ${r.dadRefunds}, first in ${r.firstDad || '-'}), cash left $${r.cash}, built ${r.bought}/${r.of}, `
        + `${r.wrecked} wrecked (${r.rebuilt} rebuilt), ${r.stolen} units stolen (${r.ripped} ripped), ${r.minutes} min`
        + (cards ? `, cards ${r.hand.join(' ') || 'none'}` : ''));
      if (r.parts.still || r.parts.bender) {
        console.log(`   The Back: junk ${r.junkPerMin.toFixed(0)}/min, delivered ${SUPPLIES.map((t) => `${t} ${r.delivered[t]}`).join(' ')}, `
          + `binned ${r.binned} ($${r.binnedCash}), wire uses ${r.wireUses}, stocked ${SUPPLIES.map((t) => `${t}${pct(r.stocked[t])}`).join(' ')}`
          + ` (events 6-12: ${SUPPLIES.map((t) => `${t}${pct(r.stockedMid[t])}`).join(' ')}), drop levels ${r.dropUps}, reinforced ${r.reinforced}`);
      }
      if (!verbose) continue;
      console.log('   built: ' + Object.entries(r.parts).map(([k, n]) => `${k} ${n}`).join(', ') + `; buildings no line could reach: ${r.failed} ${JSON.stringify(r.why)}, Overpasses ${r.crossings}, branches ${r.branches}`);
      console.log('wave  escaped  stopped  wrecked  stolen  ripped  earned    cash  refunds   built  who got through');
      for (const w of r.rows) {
        console.log([w.wave, w.escaped, w.stopped, w.wrecked, w.stolen, w.ripped, w.earned, w.cash, w.refunds, w.built]
          .map((v, i) => String(v).padStart([4, 8, 8, 8, 7, 7, 7, 7, 8, 7][i])).join(' ') + '  ' + w.who);
      }
    }
  }
}

/** Plays every bot on every seed (on worker threads) and prints the yardstick table. */
async function table({ bots, seeds, map, difficulty, players, sets, jobs }) {
  const { Worker } = await import('node:worker_threads');
  const list = [];
  for (const bot of bots) for (const seed of seeds) list.push({ bot, seed, map, difficulty, players });
  const out = new Array(list.length);
  const started = Date.now();
  await new Promise((resolve) => {
    let next = 0, done = 0;
    const file = fileURLToPath(import.meta.url);
    const feed = (w) => {
      if (next >= list.length) { w.terminate(); return; }
      const id = next++;
      w.postMessage({ ...list[id], id });
    };
    for (let n = 0; n < Math.min(jobs, list.length); n++) {
      const w = new Worker(file, { workerData: { balance: 1, sets } });
      w.on('message', ({ id, r }) => {
        out[id] = r;
        if (++done === list.length) resolve();
        feed(w);
      });
      w.on('error', (e) => { console.error(e); process.exit(1); });
      feed(w);
    }
  });
  const z = { ...MAP_SIZES[map.size], ...mapSize(map.design, map.size) };
  console.log(`\n#### ${map.design}, ${z.name} (${z.w} x ${z.h}), ${players} player${players > 1 ? 's' : ''}, ${difficulty || 'normal'}, seeds ${seeds.join(' ')}${sets ? ', set ' + sets : ''}`);
  console.log('event lost in (a win is 21) per seed; then averages: event, cash at the end, dad refunds, first event a dad got through, stocked share (all events / events 6-12) for dmg spd rng wire');
  for (const bot of bots) {
    const rs = out.filter((r, n) => list[n].bot === bot);
    const ev = rs.map((r) => (r.result === 'won' ? 21 : r.wave));
    const avg = (f) => rs.reduce((n, r) => n + f(r), 0) / rs.length;
    const st = (t, k) => { const v = rs.map((r) => r[k][t]).filter((x) => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    console.log(`${bot.padEnd(13)} ${ev.map((v) => String(v).padStart(2)).join(' ')}  | ${avg((r) => (r.result === 'won' ? 21 : r.wave)).toFixed(1).padStart(4)}`
      + `  $${String(Math.round(avg((r) => r.cash))).padStart(5)}  dads ${avg((r) => r.dadRefunds).toFixed(1).padStart(4)}`
      + `  first ${avg((r) => r.firstDad || 21).toFixed(1).padStart(4)}`
      + (rs.some((r) => r.parts.still) ? `  stocked ${SUPPLIES.map((t) => pct(st(t, 'stocked')) + '/' + pct(st(t, 'stockedMid')).trim()).join(' ')}`
        + `  junk ${avg((r) => r.junkPerMin).toFixed(0)}/min  wire ${avg((r) => r.wireUses).toFixed(0)}  drops+${avg((r) => r.dropUps).toFixed(1)}` : ''));
  }
  console.log(`(${list.length} games in ${((Date.now() - started) / 1000).toFixed(0)} s)`);
}

// (Last, so everything above is defined when it runs.)
if (isMain && !workerMode) main();
