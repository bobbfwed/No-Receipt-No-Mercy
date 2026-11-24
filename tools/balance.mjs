// Plays whole solo games with scripted players and prints how each went, to judge difficulty
// without a human.
// Usage: node tools/balance.mjs [seed] [size] [design] [-v] [--endless] [--difficulty=easy]
//   size       a key of MAP_SIZES (default: s, the size recommended for one player), or "all"
//   design     a key of MAP_DESIGNS (default: warehouse; the bots' layout suits an open floor)
//   -v         also print every wave (a boss wave says how the boss did: "boss out", or "boss
//              through" with the share of his patience he had left)
//   --endless  play endless games (no last sales event) and print the sales event each lost in
//   --difficulty=  a key of SETTINGS.difficulty (default: normal). On easy the bots last longer,
//              which is the only way they get to see the late sales events
//
// Bots:
//   nothing   builds nothing (the game should be lost quickly)
//   honest    builds a fixed plan as money allows (production lines that wall the floor into a
//             zigzag, with security at every gap and on the dads' short cut), patches what gym
//             bros wreck, and then stops spending
//   keen      the same, then keeps buying forklifts on a loose grid, and when the floor is full
//             spends everything on upgrades (damage, speed and range of its towers), cheapest first
//   focus     like keen, but pours its upgrade money into the sprinklers nearest the entrance,
//             one at a time, as far as each will go, cheapest track first (how the owner plays)
// None of them builds the Barcode Laser or the TV Salesman, or buys durability.
import {
  createGame, addPlayer, applyCommand, step, canPlace, canUpgrade, upgradeCost, BUILD, TICK_HZ, MAP_SIZES,
} from '../src/sim/index.js';

/** The upgrade tracks the bots buy for their towers. */
const BOT_TRACKS = ['dmg', 'spd', 'rng'];

const S = 1, N = 3;

/**
 * The honest bot's plan for a map: `list` is what it buys in order, as [kind, x, y, facing];
 * `machines` are the Presses and Packers to swap in later, as [kind, x, y, facing, how far down
 * the list its line is finished].
 */
function plan(s) {
  const { w, h } = s, mid = h >> 1;
  const list = [], machines = [];
  // One production line per section of marked floor, down the third column of its patches.
  let k = 0;
  for (let x0 = 9; x0 + 3 <= w - 4; x0 += 10) {
    const x = x0 + 2;
    const rowsOf = (ch) => { const out = []; for (let y = 1; y < h - 1; y++) if (s.zones[y * w + x] === ch) out.push(y); return out; };
    const u = rowsOf('u'), p = rowsOf('p'), pk = rowsOf('k'), c = rowsOf('c');
    if (!u.length || !p.length || !pk.length || !c.length) continue; // a wall cut this section up
    // Loading Bay above Shipping: the line runs down and its gap is at the bottom; otherwise up.
    const down = u[0] < c[0];
    const d = down ? S : N, step = down ? 1 : -1;
    const from = down ? u[0] : u[u.length - 1], to = down ? c[c.length - 1] : c[0];
    const press = down ? p[0] : p[p.length - 1], packer = down ? pk[0] : pk[pk.length - 1];
    // The line is laid with belts all the way first, so it earns at once. The Press and the
    // Packer are expensive, so they are swapped in for a belt later.
    const swaps = [];
    for (let y = from; y !== to + step; y += step) {
      list.push([y === from ? 'unpacker' : y === to ? 'chute' : 'belt', x, y, d]);
      if (y === press) swaps.push(['press', x, y, d]);
      if (y === packer && k > 0) swaps.push(['packer', x, y, d]);
    }
    // Crates carry the wall on to the far side, leaving one gap; and close anything behind
    // the unpacker.
    const gy = down ? h - 2 : 1;
    for (let y = to + step; y !== gy; y += step) list.push(['crate', x, y, 0]);
    for (let y = from - step; y >= 1 && y <= h - 2; y -= step) list.push(['crate', x, y, 0]);
    // Where in the list this line is all laid: its machines can be bought from then on.
    const laid = list.length;
    // Security at the gap.
    const inY = down ? gy - 1 : gy + 1;
    list.push(['sprinkler', x - 1, inY, 0], ['sprinkler', x + 1, inY, 0], ['wetfloor', x, gy, 0]);
    // Dads step over the belts and walk straight across from the entrance: guard that lane too.
    list.push(['wetfloor', x - 1, mid - 1, 0], ['wetfloor', x - 1, mid, 0],
      ['sprinkler', x - 1, mid - 2, 0], ['sprinkler', x - 1, mid + 1, 0], ['forklift', x + 2, mid - 2, 0]);
    if (k > 0) list.push(['samples', x - 2, inY, 0], ['forklift', x + 2, mid + 1, 0]);
    for (const m of swaps) machines.push([m[0], m[1], m[2], m[3], laid]);
    k++;
  }
  // Presses before Packers: a Packer does nothing without a Press upstream.
  machines.sort((a, b) => (a[0] === 'press' ? 0 : 1) - (b[0] === 'press' ? 0 : 1) || a[4] - b[4]);
  return { list, machines };
}

/** The keen bot's extra shopping: forklifts on a loose grid over the whole floor. */
function extras(s) {
  const out = [];
  for (let y = 2; y <= s.h - 3; y += 3) for (let x = 2; x <= s.w - 3; x += 3) out.push(['forklift', x, y, 0]);
  return out;
}

function play(bot, seed, map, endless = false, difficulty = null) {
  const settings = { ...(endless ? { waves: 0 } : null), ...(difficulty ? { difficulty } : null) };
  const s = createGame({ seed, map, settings: Object.keys(settings).length ? settings : null });
  addPlayer(s, 'Bot');
  const me = s.players[0];
  const buyer = bot !== 'nothing';
  const made = buyer ? plan(s) : { list: [], machines: [] };
  const list = made.list.concat(bot === 'keen' || bot === 'focus' ? extras(s) : []);
  const machines = made.machines;
  const total = list.length + machines.length;
  let fund = 0, lastCash = me.cash;
  let next = 0; // how far down the list it has got
  let bought = 0, upgrades = 0, rebuilt = 0, wrecked = 0, stolen = 0;
  // Mystery Boxes Card Traders took off the belts and ripped open (0.3.01), in all and this wave.
  let ripped = 0, rippedNow = 0;
  const rows = [];
  let byKind = {};
  // An hour and a half of game time; an endless game gets six hours.
  const limit = (endless ? 6 * 60 : 90) * 60 * TICK_HZ;
  let boss = null, bossLeft = 0; // the boss in the store, and the share of his patience he has left

  function shop() {
    // Patch holes first: put back whatever gym bros have wrecked.
    if (s.rubble.length) {
      const r = applyCommand(s, 0, { c: 'rebuild' });
      if (r.ok) rebuilt += r.n;
    }
    // Half of everything it earns goes into a fund for the expensive machines; the rest pays
    // for the plan in order. So it neither starves its factory nor leaves the doors unguarded.
    if (me.cash > lastCash) fund += (me.cash - lastCash) * 0.5;
    // It saves only for a machine it could place now, and no more than that machine costs.
    const want = machines.length && machines[0][4] <= next ? BUILD[machines[0][0]].cost : 0;
    fund = Math.min(fund, want, me.cash);
    for (let j = 0; j < machines.length; j++) {
      const [k, x, y, d, line] = machines[j];
      if (line > next || fund < BUILD[k].cost) break; // its line is not laid yet, or not enough saved
      const there = s.grid[y * s.w + x];
      if (there && there.k === 'belt') applyCommand(s, 0, { c: 'remove', x, y });
      if (applyCommand(s, 0, { c: 'place', k, x, y, d }).ok) { bought++; fund -= BUILD[k].cost; }
      machines.splice(j--, 1);
    }
    while (next < list.length) {
      const [k, x, y, d] = list[next];
      if (me.cash - (machines.length ? fund : 0) < BUILD[k].cost) break;
      const why = canPlace(s, k, x, y, 0);
      if (why === 'shopper') break; // try again shortly
      if (!why && applyCommand(s, 0, { c: 'place', k, x, y, d }).ok) bought++;
      next++;
    }
    lastCash = me.cash;
    if (next < list.length) return;
    if (bot === 'focus') {
      // The first sprinklers in the plan are the ones nearest the entrance.
      for (const [k, x, y] of list) {
        if (k !== 'sprinkler') continue;
        for (;;) {
          const b = s.grid[y * s.w + x];
          if (!b || b.k !== 'sprinkler') break;
          // Its cheapest track next.
          let t = null, cost = Infinity;
          for (const tr of BOT_TRACKS) { const c = upgradeCost(b, tr); if (c && c < cost) { cost = c; t = tr; } }
          if (!t) break; // every track is at the top: on to the next sprinkler
          if (canUpgrade(s, x, y, 0, t) !== null || !applyCommand(s, 0, { c: 'upgrade', x, y, t }).ok) return; // save up for it
          upgrades++;
        }
      }
      return;
    }
    if (bot !== 'keen') return;
    // Nothing left to build: upgrade, cheapest first. Sprinklers sit at the gaps everyone must
    // pass, so it will pay up to three times as much for one of those as for a forklift.
    for (;;) {
      let best = -1, track = null, cost = Infinity, score = Infinity;
      for (let i = 0; i < s.grid.length; i++) {
        const b = s.grid[i];
        if (!b || b.part !== undefined || !BUILD[b.k].tower) continue;
        for (const t of BOT_TRACKS) {
          const c = upgradeCost(b, t);
          const sc = b.k === 'sprinkler' ? c / 3 : c;
          if (c && sc < score) { score = sc; cost = c; best = i; track = t; }
        }
      }
      if (best < 0 || me.cash < cost) return;
      const x = best % s.w, y = (best / s.w) | 0;
      if (canUpgrade(s, x, y, 0, track) !== null || !applyCommand(s, 0, { c: 'upgrade', x, y, t: track }).ok) return;
      upgrades++;
    }
  }

  while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < limit) {
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
      if (e.e === 'rip') { ripped++; rippedNow++; }
      if (e.e === 'waveEnd' || e.e === 'lost') {
        stolen += s.ws.stolen;
        rows.push({
          wave: s.wave, escaped: s.ws.escaped, stopped: s.ws.stopped, wrecked: s.ws.wrecked, stolen: s.ws.stolen,
          earned: s.ws.earned, cash: Math.round(me.cash), refunds: s.refunds, built: bought, up: upgrades, ripped: rippedNow,
          who: Object.entries(byKind).map(([k, n]) => k + ' ' + n).join(', '),
        });
        rippedNow = 0;
      }
    }
  }
  return {
    bot, result: s.phase, wave: s.wave, refunds: s.refunds, limit: s.refundLimit, cash: Math.round(me.cash),
    bought, of: total, upgrades, rebuilt, wrecked, stolen, ripped, minutes: (s.tick / TICK_HZ / 60).toFixed(1), rows,
  };
}

const args = process.argv.slice(2);
const verbose = args.includes('-v');
const endless = args.includes('--endless');
const difficulty = (args.find((a) => a.startsWith('--difficulty=')) || '').slice(13) || null;
const [seedArg, sizeArg, designArg] = args.filter((a) => !a.startsWith('-'));
const seed = Number(seedArg) || 11;
const sizes = sizeArg === 'all' ? Object.keys(MAP_SIZES) : [sizeArg || 's'];
const design = designArg || 'warehouse';

for (const size of sizes) {
  const z = MAP_SIZES[size];
  console.log(`\n#### ${design}, ${z.name} (${z.w} x ${z.h}), seed ${seed}, one player${endless ? ', ENDLESS' : ''}${difficulty ? ', ' + difficulty : ''}`);
  for (const bot of ['nothing', 'honest', 'keen', 'focus']) {
    const r = play(bot, seed, { design, size }, endless, difficulty);
    // (An endless game is never won: it is lost, or still going when the time limit ran out.)
    const result = r.result === 'lost' ? 'LOST' : endless ? 'ALIVE' : r.result.toUpperCase();
    console.log(`== ${bot.padEnd(7)} ${result.padEnd(5)} wave ${String(r.wave).padStart(2)}, `
      + `${r.refunds}/${r.limit} refunds, cash left $${r.cash}, built ${r.bought}/${r.of}, `
      + `${r.upgrades} upgrades, ${r.wrecked} wrecked (${r.rebuilt} rebuilt), ${r.stolen} stolen (${r.ripped} boxes ripped), ${r.minutes} min`);
    if (!verbose) continue;
    console.log('wave  escaped  stopped  wrecked  stolen  ripped  earned    cash  refunds   built  upgr  who got through');
    for (const w of r.rows) {
      console.log([w.wave, w.escaped, w.stopped, w.wrecked, w.stolen, w.ripped, w.earned, w.cash, w.refunds, w.built, w.up]
        .map((v, i) => String(v).padStart([4, 8, 8, 8, 7, 7, 7, 7, 8, 7, 5][i])).join(' ') + '  ' + w.who);
    }
  }
}
