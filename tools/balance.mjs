// Plays whole solo games with scripted players and prints how each went, to judge difficulty
// without a human.
// Usage: node tools/balance.mjs [seed] [size] [design] [-v] [--endless] [--difficulty=easy] [--cards=...]
//   size       a key of MAP_SIZES (default: s, the size recommended for one player), or "all"
//   design     a key of MAP_DESIGNS (default: warehouse; the bots' layout suits an open floor)
//   -v         also print every wave (a boss wave says how the boss did: "boss out", or "boss
//              through" with the share of his patience he had left)
//   --endless  play endless games (no last sales event) and print the sales event each lost in
//   --difficulty=  a key of SETTINGS.difficulty (default: normal). On easy the bots last longer,
//              which is the only way they get to see the late sales events
//   --cards=   the game's cards (0.3.01): a list of card ids forces that hand, any number of them
//              (--cards=litter,hardy:karen; a per-kind card names its kind), with no deal; "deal"
//              deals a hand from the seed as a real game does, through the deal (the bots skip it).
//              Left out: no cards. Each result line names the hand.
//
// Bots (0.4.00: the shop floor's maze is Crate Stacks and security only, and none of the bots
// builds anything in The Back yet, so their security never holds stock; a later stage gives them
// supply lines):
//   nothing   builds nothing (the game should be lost quickly)
//   honest    builds a fixed plan as money allows (walls of Crate Stacks across the store, each with
//             a one-tile gap at alternate ends, so shoppers zigzag; security packed round every gap,
//             where every shopper has to pass), patches what gym bros wreck, and then stops spending
//   keen      the same, then keeps buying forklifts on a loose grid over the whole floor
//   focus     the same as keen, but its forklifts go in the channels nearest the entrance first
//             (until 0.4 it poured its upgrade money into the sprinklers nearest the entrance, which
//             is how the owner plays; bought upgrades are gone, so it now concentrates buildings
//             there instead)
//   stalls    like keen, but before its forklifts it also puts a TV Salesman, two Free Sample
//             tables and four Wet Floor Signs in each channel of the maze (to measure the cards
//             about those buildings; tools/cardtest.mjs stalls)
// None of the others builds the Barcode Laser or the TV Salesman. The
// honest plan already has a Free Sample table at each gap but the first, and Wet Floor Signs.
// Any bot may be given the steady opening by adding "+steady" to its name (keen+steady): it never
// sits on cash while the next thing in its plan is out of reach and a later, cheaper one is not: it
// buys the cheaper one meanwhile and comes back for the other. Without it a bot waits for each
// purchase in turn, as a person following a plan does.
// --bots=keen,focus+steady chooses the bots (default: nothing, honest, keen, focus).
import { pathToFileURL } from 'node:url';
import {
  createGame, addPlayer, applyCommand, step, canPlace, buildPrice, TICK_HZ, MAP_SIZES, mapSize,
} from '../src/sim/index.js';

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

/**
 * The honest bot's plan for a map: what it buys in order, as [kind, x, y, facing]. Per wall: the
 * wall itself (cheap), then the security round its gap, nearest the gap first. Every shopper walks
 * through every gap, so that is where security earns its keep. Anything the game refuses (a pillar,
 * a Returns Drop under a security building, a wall that would cut the route) is skipped.
 */
function plan(s) {
  const list = [];
  for (const [k, { x, gy, s: d }] of wallColumns(s).entries()) {
    // The wall: the whole column but the gap, from the far end towards the gap.
    for (let y = gy + d * (s.h - 3); y !== gy; y -= d) list.push(['crate', x, y, 0]);
    // The gap: a sprinkler either side of it and a Wet Floor Sign in it. Shoppers come along the
    // outer wall to reach it, so the buildings beside the gap turn that into a short corridor.
    list.push(['sprinkler', x - 1, gy + d, 0], ['sprinkler', x + 1, gy + d, 0], ['wetfloor', x, gy, 0]);
    list.push(['wetfloor', x - 1, gy, 0], ['wetfloor', x + 1, gy, 0]);
    list.push([k > 0 ? 'samples' : 'sprinkler', x - 2, gy + d, 0], ['sprinkler', x + 2, gy + d, 0]);
    // A forklift either side, a little way in, covers the gap and the channels on both sides of it.
    list.push(['forklift', x + 2, gy + 3 * d, 0]);
    if (k > 0) list.push(['forklift', x - 2, gy + 3 * d, 0]);
  }
  return list;
}

/** The keen bot's extra shopping: forklifts on a loose grid over the whole floor, row by row. */
function extras(s) {
  const out = [];
  for (let y = 2; y <= s.h - 3; y += 3) for (let x = 2; x <= s.w - 3; x += 3) out.push(['forklift', x, y, 0]);
  return out;
}

/**
 * The focus bot's extra shopping: the same forklifts, but column by column from the entrance's side
 * of the store, so the channels shoppers reach first fill up before any further on.
 */
function front(s) {
  return extras(s).sort((a, b) => a[1] - b[1] || a[2] - b[2]);
}

/**
 * The stalls bot's extra shopping, before the keen bot's forklifts: a TV Salesman in the middle of
 * each channel between two walls, a Free Sample table near each end of the channel and a few Wet
 * Floor Signs in it, all where every shopper walks. It exists to measure the cards about those
 * buildings (eightyproof, warranty, mopmike, sensibleshoes), which the other bots barely use.
 * Anything that would wall off the route is refused by the game and skipped.
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

export function play(bot, seed, map, endless = false, difficulty = null, cards = null, keep = false) {
  // "keen+steady": that bot with the steady opening (see the top of this file).
  const steady = bot.endsWith('+steady');
  if (steady) bot = bot.slice(0, -7);
  const settings = { ...(endless ? { waves: 0 } : null), ...(difficulty ? { difficulty } : null) };
  const s = createGame({ seed, map, settings: Object.keys(settings).length ? settings : null, cards });
  addPlayer(s, 'Bot');
  const me = s.players[0];
  const buyer = bot !== 'nothing';
  const more = bot === 'stalls' ? stalls(s).concat(extras(s)) : bot === 'keen' ? extras(s) : bot === 'focus' ? front(s) : [];
  const list = buyer ? plan(s).concat(more) : [];
  const total = list.length;
  const done = new Set(); // what the steady opening bought out of turn
  let next = 0; // how far down the list it has got
  let bought = 0, rebuilt = 0, wrecked = 0, stolen = 0;
  // Units of stock Card Traders ripped out of security, in all and this wave. (The bots never stock
  // their security yet, so this stays at nought until they build in The Back.)
  let ripped = 0, rippedNow = 0;
  const rows = [];
  let byKind = {};
  // An hour and a half of game time; an endless game gets six hours.
  const limit = (endless ? 6 * 60 : 90) * 60 * TICK_HZ;
  let boss = null, bossLeft = 0; // the boss in the store, and the share of his patience he has left

  function shop() {
    // Patch holes first: pay to put back whatever gym bros have wrecked (since 0.3.04 the money
    // goes at once and a wreck that cannot go back yet follows by itself: counted below).
    if (s.rubble.some((r) => r.by === undefined)) {
      const r = applyCommand(s, 0, { c: 'rebuild' });
      if (r.ok) rebuilt += r.n;
    }
    // Prices are the game's: its cards may change them.
    const price = (k) => buildPrice(s, k);
    /** Buys list item j if it can: true when it is dealt with (bought or refused for good). */
    const tryBuy = (j) => {
      const [k, x, y, d] = list[j];
      const why = canPlace(s, k, x, y, 0);
      if (why === 'shopper' || why === 'cash') return false; // try again shortly
      // A wall that would shut a shopper in during a sales event can go up once he has moved on
      // (the plan always leaves each wall its gap, so this never waits for good).
      if (why === 'blocked' && k === 'crate' && s.phase === 'wave') return false;
      if (!why && applyCommand(s, 0, { c: 'place', k, x, y, d }).ok) bought++;
      return true;
    };
    while (next < list.length) {
      if (done.has(next)) { next++; continue; }
      if (me.cash < price(list[next][0])) break;
      if (!tryBuy(next)) break;
      next++;
    }
    // The steady opening: while the next purchase is out of reach, anything later in the plan that
    // it can afford is bought now rather than left for later.
    if (steady && next < list.length && me.cash < price(list[next][0])) {
      for (let j = next + 1; j < list.length; j++) {
        if (done.has(j) || me.cash < price(list[j][0])) continue;
        if (tryBuy(j)) done.add(j);
      }
    }
  }

  while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < limit) {
    // The deal: nothing can be bought until the cards are out. The bots ask to skip the rest.
    if (s.phase === 'cards') {
      if (!me.skip) applyCommand(s, 0, { c: 'skipCards', on: true });
      step(s);
      continue;
    }
    if (buyer && s.tick % 15 === 0) shop();
    if (s.phase === 'build' && s.phaseT === -1) {
      // The buying bots use the whole build pause, like a person would; "nothing" just starts.
      if (buyer && bought === 0) { shop(); if (bought === 0) { step(s); continue; } }
      if (!buyer) applyCommand(s, 0, { c: 'start' });
    }
    const evs = step(s);
    if (boss) bossLeft = boss.hp / boss.mhp;
    for (const e of evs) {
      if (e.e === 'waveStart') byKind = {};
      if (e.e === 'bossIn') boss = s.shoppers.find((m) => m.k === 'boss');
      if (e.e === 'bossOut') { byKind['boss out'] = 1; boss = null; }
      if (e.e === 'escape' && e.k === 'boss') { byKind[`boss through (${Math.round(bossLeft * 100)}% left)`] = 1; boss = null; continue; }
      if (e.e === 'escape') { const k = (e.sup ? 'SUPER ' : '') + e.k; byKind[k] = (byKind[k] || 0) + 1; }
      if (e.e === 'smash') wrecked++;
      if (e.e === 'rebuilt' && e.late) rebuilt += e.n;
      if (e.e === 'rip') { ripped++; rippedNow++; }
      if (e.e === 'waveEnd' || e.e === 'lost') {
        stolen += s.ws.stolen;
        rows.push({
          wave: s.wave, escaped: s.ws.escaped, stopped: s.ws.stopped, wrecked: s.ws.wrecked, stolen: s.ws.stolen,
          // (Since 0.4 most of the money is the event's pay and speed bonus, paid as it ends.)
          earned: s.ws.earned + (s.ws.pay | 0) + (s.ws.speed | 0), cash: Math.round(me.cash), refunds: s.refunds, built: bought, ripped: rippedNow,
          who: Object.entries(byKind).map(([k, n]) => k + ' ' + n).join(', '),
        });
        rippedNow = 0;
      }
    }
  }
  return {
    hand: s.cards || [],
    bot, result: s.phase, wave: s.wave, refunds: s.refunds, limit: s.refundLimit, cash: Math.round(me.cash),
    bought, of: total, rebuilt, wrecked, stolen, ripped, minutes: (s.tick / TICK_HZ / 60).toFixed(1), rows,
    ...(keep ? { state: s } : null),
  };
}

// (tools/cardtest.mjs imports play() from here; only run as a script does this file play games itself.)
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('-v');
  const endless = args.includes('--endless');
  const difficulty = (args.find((a) => a.startsWith('--difficulty=')) || '').slice(13) || null;
  const [seedArg, sizeArg, designArg] = args.filter((a) => !a.startsWith('-'));
  const cardsArg = (args.find((a) => a.startsWith('--cards=')) || '').slice(8);
  const cards = !cardsArg ? null : cardsArg === 'deal' ? true : cardsArg.split(',').map((c) => c.trim()).filter(Boolean);
  const seed = Number(seedArg) || 11;
  const sizes = sizeArg === 'all' ? Object.keys(MAP_SIZES) : [sizeArg || 's'];
  const design = designArg || 'warehouse';
  const bots = ((args.find((a) => a.startsWith('--bots=')) || '').slice(7) || 'nothing,honest,keen,focus').split(',');

  for (const size of sizes) {
    const z = { ...MAP_SIZES[size], ...mapSize(design, size) };
    console.log(`\n#### ${design}, ${z.name} (${z.w} x ${z.h}), seed ${seed}, one player${endless ? ', ENDLESS' : ''}${difficulty ? ', ' + difficulty : ''}${cards ? `, cards: ${cardsArg}` : ''}`);
    for (const bot of bots) {
      const r = play(bot, seed, { design, size }, endless, difficulty, cards);
      // (An endless game is never won: it is lost, or still going when the time limit ran out.)
      const result = r.result === 'lost' ? 'LOST' : endless ? 'ALIVE' : r.result.toUpperCase();
      console.log(`== ${bot.padEnd(7)} ${result.padEnd(5)} wave ${String(r.wave).padStart(2)}, `
        + `${r.refunds}/${r.limit} refunds, cash left $${r.cash}, built ${r.bought}/${r.of}, `
        + `${r.wrecked} wrecked (${r.rebuilt} rebuilt), ${r.stolen} units stolen (${r.ripped} ripped), ${r.minutes} min`
        + (cards ? `, cards ${r.hand.join(' ') || 'none'}` : ''));
      if (!verbose) continue;
      console.log('wave  escaped  stopped  wrecked  stolen  ripped  earned    cash  refunds   built  who got through');
      for (const w of r.rows) {
        console.log([w.wave, w.escaped, w.stopped, w.wrecked, w.stolen, w.ripped, w.earned, w.cash, w.refunds, w.built]
          .map((v, i) => String(v).padStart([4, 8, 8, 8, 7, 7, 7, 7, 8, 7][i])).join(' ') + '  ' + w.who);
      }
    }
  }
}
