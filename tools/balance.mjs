// Plays whole games with scripted players and prints how each wave went, to judge difficulty
// without a human. Usage: node tools/balance.mjs [seed]
//
// Bots:
//   nothing   builds nothing (the game should be lost quickly)
//   demo      gets the full demo layout for free at the start and never builds again
//   honest    starts with the normal cash and buys a fixed shopping list as money allows
import {
  createGame, addPlayer, applyCommand, step, applyDemoLayout, canPlace, BUILD, TUNE, TICK_HZ,
} from '../src/sim/index.js';

const S = 1, N = 3;

/** The honest bot's shopping list, in order. It buys the next entry as soon as it can afford it. */
const SHOPPING = [
  // A first production line that is also a wall down column 6.
  ['unpacker', 6, 1, S], ['belt', 6, 2, S], ['belt', 6, 3, S], ['belt', 6, 4, S], ['belt', 6, 5, S],
  ['press', 6, 6, S], ['belt', 6, 7, S], ['belt', 6, 8, S], ['belt', 6, 9, S], ['belt', 6, 10, S], ['chute', 6, 11, 0],
  // Guard the gap under it.
  ['sprinkler', 7, 11, 0], ['sprinkler', 5, 13, 0], ['wetfloor', 6, 13, 0], ['sprinkler', 7, 14, 0],
  // Dads step over the belts and walk straight down the middle: guard that lane too.
  ['wetfloor', 4, 7, 0], ['wetfloor', 4, 8, 0], ['sprinkler', 5, 6, 0], ['sprinkler', 5, 9, 0],
  ['wetfloor', 8, 7, 0], ['wetfloor', 8, 8, 0], ['forklift', 9, 6, 0],
  // Second line, a wall up column 13, with a packer.
  ['unpacker', 13, 14, N], ['belt', 13, 13, N], ['belt', 13, 12, N], ['belt', 13, 11, N], ['belt', 13, 10, N],
  ['press', 13, 9, N], ['belt', 13, 8, N], ['belt', 13, 7, N], ['packer', 13, 6, N], ['belt', 13, 5, N], ['chute', 13, 4, 0],
  ['sprinkler', 12, 3, 0], ['sprinkler', 14, 3, 0], ['wetfloor', 13, 2, 0], ['forklift', 9, 8, 0], ['samples', 9, 13, 0],
  // Third line and wall in column 21.
  ['unpacker', 21, 1, S], ['belt', 21, 2, S], ['belt', 21, 3, S], ['belt', 21, 4, S], ['press', 21, 5, S],
  ['belt', 21, 6, S], ['packer', 21, 7, S], ['belt', 21, 8, S], ['belt', 21, 9, S], ['chute', 21, 10, 0],
  ['crate', 21, 11, 0], ['crate', 21, 12, 0],
  ['sprinkler', 20, 13, 0], ['sprinkler', 22, 13, 0], ['wetfloor', 21, 13, 0], ['forklift', 17, 7, 0],
  // Then keep adding security along the route.
  ['forklift', 25, 8, 0], ['sprinkler', 12, 1, 0], ['sprinkler', 14, 1, 0], ['samples', 16, 3, 0],
  ['forklift', 10, 12, 0], ['sprinkler', 20, 14, 0], ['sprinkler', 22, 14, 0], ['forklift', 18, 12, 0],
  ['samples', 24, 13, 0], ['forklift', 24, 10, 0], ['forklift', 16, 5, 0], ['sprinkler', 7, 13, 0],
  ['forklift', 3, 5, 0], ['forklift', 3, 10, 0], ['sprinkler', 27, 6, 0], ['sprinkler', 27, 9, 0],
  ['forklift', 26, 5, 0], ['forklift', 26, 11, 0], ['forklift', 10, 5, 0], ['forklift', 18, 9, 0],
  ['forklift', 15, 12, 0], ['forklift', 23, 5, 0], ['forklift', 11, 9, 0], ['forklift', 8, 12, 0],
];

function play(bot, seed) {
  const s = createGame({ seed });
  addPlayer(s, 'Bot');
  if (bot === 'demo') applyDemoLayout(s, 0);
  const buyer = bot === 'honest' || bot === 'keen';
  let next = 0;
  const rows = [];
  let byKind = {};
  const limit = 60 * 60 * TICK_HZ; // an hour of game time
  while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < limit) {
    if (bot === 'honest' || bot === 'keen') {
      const list = bot === 'keen' ? SHOPPING.concat(EXTRA) : SHOPPING;
      while (next < list.length) {
        const [k, x, y, d] = list[next];
        if (s.cash < BUILD[k].cost) break;
        const why = canPlace(s, k, x, y);
        if (why === 'shopper') break; // try again next tick
        if (!why) applyCommand(s, 0, { c: 'place', k, x, y, d });
        next++;
      }
    }
    if (s.phase === 'build' && (s.phaseT === -1 || (!buyer && s.phaseT > 1))) {
      // The honest bot uses the whole build pause, like a person would; the others skip it.
      if (!buyer || s.phaseT === -1) {
        if (buyer && next === 0) { step(s); continue; }
        applyCommand(s, 0, { c: 'start' });
        byKind = {};
      }
    }
    for (const e of step(s)) {
      if (e.e === 'waveStart') byKind = {};
      if (e.e === 'escape') byKind[e.k] = (byKind[e.k] || 0) + 1;
      if (e.e === 'waveEnd' || e.e === 'lost') {
        rows.push({
          wave: s.wave, escaped: s.ws.escaped, stopped: s.ws.stopped, stolen: s.ws.stolen,
          earned: s.ws.earned, cash: Math.round(s.cash), refunds: s.refunds, built: next,
          who: Object.entries(byKind).map(([k, n]) => k + ' ' + n).join(', '),
        });
      }
    }
  }
  return { bot, result: s.phase, wave: s.wave, refunds: s.refunds, minutes: (s.tick / TICK_HZ / 60).toFixed(1), rows };
}

const seed = Number(process.argv[2]) || 11;
// The 'keen' bot follows the same list, then keeps buying forklifts on a loose grid for the rest of the game.
const EXTRA = [];
for (let y = 2; y <= 13; y += 3) for (let x = 2; x <= 27; x += 3) EXTRA.push(['forklift', x, y, 0]);

for (const bot of ['nothing', 'demo', 'honest', 'keen']) {
  const r = play(bot, seed);
  console.log(`\n== ${bot}: ${r.result.toUpperCase()} at wave ${r.wave}, ${r.refunds}/${TUNE.refundLimit} refunds, ${r.minutes} min of game time`);
  console.log('wave  escaped  stopped  stolen  earned   cash  refunds  bought  who got through');
  for (const w of r.rows) {
    console.log([w.wave, w.escaped, w.stopped, w.stolen, w.earned, w.cash, w.refunds, w.built]
      .map((v, i) => String(v).padStart([4, 8, 8, 7, 7, 7, 8, 7][i])).join(' ') + '  ' + w.who);
  }
}
