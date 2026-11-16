// Plays whole solo games with scripted players and prints how each went, to judge difficulty
// without a human.
// Usage: node tools/balance.mjs [seed] [size] [design] [-v]
//   size    a key of MAP_SIZES (default: s, the size recommended for one player), or "all"
//   design  a key of MAP_DESIGNS (default: warehouse; the bots' layout suits an open floor)
//   -v      also print every wave
//
// Bots:
//   nothing   builds nothing (the game should be lost quickly)
//   honest    builds a fixed plan as money allows (production lines that wall the floor into a
//             zigzag, with security at every gap and on the dads' short cut), patches what gym
//             bros wreck, and then stops spending
//   keen      the same, then keeps buying forklifts on a loose grid, and when the floor is full
//             spends everything on upgrades, cheapest first
import {
  createGame, addPlayer, applyCommand, step, canPlace, canUpgrade, upgradeCost, BUILD, TICK_HZ, MAP_SIZES,
} from '../src/sim/index.js';

const S = 1, N = 3;

/** The honest bot's plan for a map, in buying order: [kind, x, y, facing]. */
function plan(s) {
  const { w, h } = s, mid = h >> 1;
  const list = [];
  const cols = [];
  for (let x = 5; x <= w - 6; x += 7) cols.push(x);
  cols.forEach((x, k) => {
    // A production line the full height of the floor, with one gap: bottom, top, bottom...
    const down = k % 2 === 0;
    const ys = [];
    for (let y = 1; y <= h - 3; y++) ys.push(down ? y : h - 1 - y);
    const d = down ? S : N, last = ys.length - 1;
    const press = Math.round(last / 3), packer = Math.round((2 * last) / 3);
    ys.forEach((y, j) => {
      const kind = j === 0 ? 'unpacker' : j === last ? 'chute' : j === press ? 'press' : j === packer && k > 0 ? 'packer' : 'belt';
      list.push([kind, x, y, d]);
    });
    // Security at the gap.
    const gy = down ? h - 2 : 1, inY = down ? gy - 1 : gy + 1;
    list.push(['sprinkler', x - 1, inY, 0], ['sprinkler', x + 1, inY, 0], ['wetfloor', x, gy, 0]);
    // Dads step over the belts and walk straight across from the entrance: guard that lane too.
    list.push(['wetfloor', x - 1, mid - 1, 0], ['wetfloor', x - 1, mid, 0],
      ['sprinkler', x - 1, mid - 2, 0], ['sprinkler', x - 1, mid + 1, 0], ['forklift', x + 2, mid - 2, 0]);
    if (k > 0) list.push(['samples', x - 2, inY, 0], ['forklift', x + 2, mid + 1, 0]);
  });
  return list;
}

/** The keen bot's extra shopping: forklifts on a loose grid over the whole floor. */
function extras(s) {
  const out = [];
  for (let y = 2; y <= s.h - 3; y += 3) for (let x = 2; x <= s.w - 3; x += 3) out.push(['forklift', x, y, 0]);
  return out;
}

function play(bot, seed, map) {
  const s = createGame({ seed, map });
  addPlayer(s, 'Bot');
  const me = s.players[0];
  const buyer = bot !== 'nothing';
  const list = buyer ? plan(s).concat(bot === 'keen' ? extras(s) : []) : [];
  let next = 0; // how far down the list it has got
  let bought = 0, upgrades = 0, rebuilt = 0, wrecked = 0;
  const rows = [];
  let byKind = {};
  const limit = 90 * 60 * TICK_HZ; // an hour and a half of game time

  function shop() {
    // Patch holes first: put back whatever gym bros have wrecked.
    if (s.rubble.length) {
      const r = applyCommand(s, 0, { c: 'rebuild' });
      if (r.ok) rebuilt += r.n;
    }
    while (next < list.length) {
      const [k, x, y, d] = list[next];
      if (me.cash < BUILD[k].cost) return;
      const why = canPlace(s, k, x, y, 0);
      if (why === 'shopper') return; // try again shortly
      if (!why && applyCommand(s, 0, { c: 'place', k, x, y, d }).ok) bought++;
      next++;
    }
    if (bot !== 'keen') return;
    // Nothing left to build: upgrade, cheapest first. Sprinklers sit at the gaps everyone must
    // pass, so it will pay up to three times as much for one of those as for a forklift.
    for (;;) {
      let best = -1, cost = Infinity, score = Infinity;
      for (let i = 0; i < s.grid.length; i++) {
        const b = s.grid[i];
        if (!b || !BUILD[b.k].tower) continue;
        const c = upgradeCost(b);
        const sc = b.k === 'sprinkler' ? c / 3 : c;
        if (c && sc < score) { score = sc; cost = c; best = i; }
      }
      if (best < 0 || me.cash < cost) return;
      const x = best % s.w, y = (best / s.w) | 0;
      if (canUpgrade(s, x, y, 0) !== null || !applyCommand(s, 0, { c: 'upgrade', x, y }).ok) return;
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
    for (const e of step(s)) {
      if (e.e === 'waveStart') byKind = {};
      if (e.e === 'escape') { const k = (e.sup ? 'SUPER ' : '') + e.k; byKind[k] = (byKind[k] || 0) + 1; }
      if (e.e === 'smash') wrecked++;
      if (e.e === 'waveEnd' || e.e === 'lost') {
        rows.push({
          wave: s.wave, escaped: s.ws.escaped, stopped: s.ws.stopped, wrecked: s.ws.wrecked,
          earned: s.ws.earned, cash: Math.round(me.cash), refunds: s.refunds, built: bought, up: upgrades,
          who: Object.entries(byKind).map(([k, n]) => k + ' ' + n).join(', '),
        });
      }
    }
  }
  return {
    bot, result: s.phase, wave: s.wave, refunds: s.refunds, limit: s.refundLimit, cash: Math.round(me.cash),
    bought, of: list.length, upgrades, rebuilt, wrecked, minutes: (s.tick / TICK_HZ / 60).toFixed(1), rows,
  };
}

const args = process.argv.slice(2);
const verbose = args.includes('-v');
const [seedArg, sizeArg, designArg] = args.filter((a) => a !== '-v');
const seed = Number(seedArg) || 11;
const sizes = sizeArg === 'all' ? Object.keys(MAP_SIZES) : [sizeArg || 's'];
const design = designArg || 'warehouse';

for (const size of sizes) {
  const z = MAP_SIZES[size];
  console.log(`\n#### ${design}, ${z.name} (${z.w} x ${z.h}), seed ${seed}, one player`);
  for (const bot of ['nothing', 'honest', 'keen']) {
    const r = play(bot, seed, { design, size });
    console.log(`== ${bot.padEnd(7)} ${r.result.toUpperCase().padEnd(5)} wave ${String(r.wave).padStart(2)}, `
      + `${r.refunds}/${r.limit} refunds, cash left $${r.cash}, built ${r.bought}/${r.of}, `
      + `${r.upgrades} upgrades, ${r.wrecked} wrecked (${r.rebuilt} rebuilt), ${r.minutes} min`);
    if (!verbose) continue;
    console.log('wave  escaped  stopped  wrecked  earned    cash  refunds   built  upgr  who got through');
    for (const w of r.rows) {
      console.log([w.wave, w.escaped, w.stopped, w.wrecked, w.earned, w.cash, w.refunds, w.built, w.up]
        .map((v, i) => String(v).padStart([4, 8, 8, 8, 7, 7, 8, 7, 5][i])).join(' ') + '  ' + w.who);
    }
  }
}
