// The cards' playtest (0.3.01, the owner's request: "play test the different cards to make sure
// none wildly change the difficulty"). Plays whole one-player games on the Open Warehouse (its
// one-player size, Normal, 20 sales events, as tools/balance.mjs does) with the scripted players of
// tools/balance.mjs, for each hand of cards over a list of seeds, and prints per hand and player: the
// sales event he loses in (mean, median, lowest and highest over the seeds) and how far that is from
// the same seeds with no cards. A game that is won counts as event 21 (one past the last). Games run
// side by side on the processor's cores (worker threads; no packages).
//
// Usage: node tools/cardtest.mjs <suite> [options]
//   baseline   no cards (seeds 1-30 unless --seeds), and which seeds collapse (lost by event 10, far below the rest)
//   alone      every card in CARDS alone (seeds 1-20); a per-kind card three times, with karen, dad
//              and hunter. --only=a,b limits it to those cards (ids as in CARDS, or with a kind)
//   hands      the fixed hands of five in HANDS below (seeds 1-20); every card is in at least one
//   deal       hands dealt as a real game deals them (seeds 1-40, one game per seed, each its own
//              hand), compared with the same seed without cards
//   stalls     the cards about Free Samples, the TV Salesman and Wet Floor Signs (STALL_CARDS),
//              played by the "stalls" player, who builds those, against his own no-card games
//   hand=a,b,c one hand of your own (seeds 1-20)
// Options:
//   --seeds=1-20 or --seeds=3,7,11   the seeds (default: as above)
//   --bots=keen,focus                which scripted players (default keen, focus, keen+steady and
//                                    focus+steady; also honest, stalls; see tools/balance.mjs)
//   --jobs=N                         games at once (default: one fewer than the processor's threads)
//   --design=warehouse --size=s      the store (default: the Open Warehouse, one-player size)
//   --json=file                      also write every game's result to that file
//   --games                          also print every game (seed, event, hand)
//   --set=doubledip.share=0.2        try other numbers for the cards (CARDS keys) without editing
//                                    constants.js; several with commas, nested with dots
//                                    (rentacop.cost.back=1.1)
// Also printed per hand: how many games collapsed (lost by event 10), and the refunds taken by the
// end of event 12 (CHECK below), which shows effects too small to move the event lost in.
//
// The yardstick is "keen" and "focus", the two players who keep investing: without cards they lose
// around event 16. Read them beside their "+steady" versions. Without the steady opening their
// first events are a knife edge (two seeds in twenty collapse by event 7 without cards, and $25
// more or less starting cash moves their average by several events), so any card that moves money
// early (prices, refunds, sale prices) shows up mostly as seeds tipped over that edge or rescued
// from it; the steady versions never collapse and show the card's own effect.
// How long it takes on a six-core, twelve-thread machine (11 games at once, two to six seconds
// each): baseline 2 minutes, alone about 45, hands about 10, deal about 6, stalls about 4.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CARDS, CARDS_APART, DEALABLE, cardParts } from '../src/sim/index.js';

/**
 * The fixed hands of five: bad, good, bad, good, odd, as a real game deals them, none holding a
 * pair from CARDS_APART. Between them every card that can be dealt (DEALABLE) is in at least one (a
 * per-kind card with one kind), so a run of these is the "every card in a hand of five" test the
 * owner asked for. (Hands 5 and 6 hold eightyproof and klepto, as they did at first; while those two
 * were out of the deal, restocking and pissing stood in for them. Reworked, they came back on the
 * owner's decision of 2026-11-24. The keen and focus players build few sample tables, so eightyproof
 * shows little here: the stalls suite measures it.)
 */
export const HANDS = [
  ['litter', 'lootbox', 'doubledip', 'asseenontv', 'convention'],
  ['freerange', 'regifting', 'offleash', 'offatruck', 'bulkbuy'],
  ['preworkout', 'mallcop', 'spayed', 'pulledout', 'flashmob'],
  ['bde', 'eyesup', 'hardy:karen', 'wrongway', 'artisanal'],
  ['hurry:dad', 'slushie', 'clearance', 'eightyproof', 'premature'],
  ['klepto', 'frail:hunter', 'shrinkflation', 'slow:dad', 'fathersday'],
  ['pissing', 'warranty', 'doorbuster', 'supportdog', 'payday'],
  ['sensibleshoes', 'staffdiscount', 'dryjanuary', 'overtime', 'mallwalkers'],
  ['retreat', 'mopmike', 'litter', 'restocking', 'openbar'],
  ['doubledip', 'firecode', 'freerange', 'happyhour', 'rentacop'],
  ['shrinkflation', 'mallcop', 'preworkout', 'firecode', 'sweatshop'],
  ['bde', 'lootbox', 'spayed', 'staffdiscount', 'flashmob'],
];

/** The kinds a per-kind card is tried with when alone. */
const ALONE_KINDS = ['karen', 'dad', 'hunter'];

/** The cards only the "stalls" player exercises properly (see stalls() in balance.mjs). */
export const STALL_CARDS = ['eightyproof', 'warranty', 'mopmike', 'sensibleshoes', 'supportdog', 'firecode'];

const SIDE_ORDER = ['bad', 'good', 'bad', 'good', 'odd'];

/**
 * The scripted players lose almost every steady game in event 16 or 17, where the crowd outgrows
 * them all at once; so most cards move the event they lose in by less than one whole event, and it
 * shows only as a seed rescued or lost. The refunds they have taken by the end of this event (well
 * before that wall) show the smaller effects: fewer is better for the players.
 */
const CHECK = 12;

/**
 * --set=doubledip.share=0.2,rentacop.cost.back=1.1: tries other numbers for the cards without
 * editing constants.js (each worker changes its own copy of CARDS before its first game).
 */
function applySets(sets) {
  for (const s of sets || []) {
    const [path, v] = s.split('=');
    const keys = path.split('.');
    const holder = keys.slice(0, -1).reduce((o, k) => o[k], CARDS);
    if (!holder || !(keys[keys.length - 1] in holder)) throw new Error(`--set: no such number ${path}`);
    holder[keys[keys.length - 1]] = Number(v);
  }
}

/** Plays every job on a pool of workers; resolves to the results in the jobs' order. */
function runAll(jobs, n) {
  return new Promise((resolve, reject) => {
    const out = new Array(jobs.length);
    let next = 0, done = 0;
    if (!jobs.length) { resolve(out); return; }
    const file = fileURLToPath(import.meta.url);
    const workers = [];
    const feed = (w) => {
      if (next >= jobs.length) { w.terminate(); return; }
      const id = next++;
      w.postMessage({ ...jobs[id], id });
    };
    for (let i = 0; i < Math.min(n, jobs.length); i++) {
      const w = new Worker(file);
      w.on('message', (m) => {
        out[m.id] = m;
        done++;
        if (done % 50 === 0 || done === jobs.length) process.stderr.write(`\r  ${done}/${jobs.length} games`);
        if (done === jobs.length) { process.stderr.write('\n'); resolve(out); }
        feed(w);
      });
      w.on('error', reject);
      workers.push(w);
      feed(w);
    }
  });
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function median(a) {
  const b = [...a].sort((x, y) => x - y), m = b.length >> 1;
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
}
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const signed = (v) => (v > 0 ? '+' : v < 0 ? '-' : ' ') + f1(Math.abs(v));

function parseSeeds(arg, def) {
  if (!arg) return def;
  const out = [];
  for (const part of arg.split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) for (let i = +m[1]; i <= +m[2]; i++) out.push(i);
    else if (part) out.push(+part);
  }
  return out;
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** Every card in CARDS as it is tried alone: a per-kind card once per ALONE_KINDS. */
function aloneList() {
  const out = [];
  for (const [id, c] of Object.entries(CARDS)) {
    if (c.per === 'kind') for (const k of ALONE_KINDS) out.push([`${id}:${k}`]);
    else out.push([id]);
  }
  return out;
}

/** Why a hand of five is not a hand a real game could deal, or null. */
function checkHand(hand) {
  if (hand.length !== 5) return 'not five cards';
  for (let i = 0; i < 5; i++) {
    const [id] = cardParts(hand[i]);
    if (!CARDS[id]) return `${hand[i]} is not a card`;
    if (!DEALABLE.includes(id)) return `${hand[i]} is not dealt`;
    if (CARDS[id].side !== SIDE_ORDER[i]) return `${hand[i]} is not ${SIDE_ORDER[i]}`;
  }
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
    const [a, ka] = cardParts(hand[i]), [b, kb] = cardParts(hand[j]);
    const apart = CARDS_APART.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    if (a === b || (apart && (ka === null || ka === kb))) return `${hand[i]} and ${hand[j]} are never dealt together`;
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };
  const suite = args.find((a) => !a.startsWith('--')) || 'baseline';
  const design = opt('design') || 'warehouse', size = opt('size') || 's';
  const jobsN = Number(opt('jobs')) || Math.max(1, availableParallelism() - 1);
  let bots = (opt('bots') || 'keen,focus,keen+steady,focus+steady').split(',').filter(Boolean);
  const printGames = args.includes('--games');
  const sets = (opt('set') || '').split(',').filter(Boolean);
  applySets(sets); // (here too, so a bad name fails at once)
  const started = Date.now();

  // What to play: a list of hands (null: no cards; true: dealt from the seed) over the seeds.
  let hands, seeds;
  if (suite === 'baseline') { hands = [null]; seeds = parseSeeds(opt('seeds'), range(1, 30)); }
  else if (suite === 'alone') {
    hands = aloneList();
    const only = opt('only');
    if (only) {
      const want = only.split(',');
      hands = hands.filter(([h]) => want.includes(h) || want.includes(cardParts(h)[0]));
      for (const w of want) if (w.includes(':') && !hands.some(([h]) => h === w)) hands.push([w]);
    }
    seeds = parseSeeds(opt('seeds'), range(1, 20));
  } else if (suite === 'hands') {
    for (const h of HANDS) { const why = checkHand(h); if (why) throw new Error(`Hand ${h.join(' ')}: ${why}`); }
    const missing = DEALABLE.filter((c) => !HANDS.some((h) => h.some((id) => cardParts(id)[0] === c)));
    if (missing.length) console.log(`(Not in any fixed hand: ${missing.join(', ')})`);
    hands = HANDS; seeds = parseSeeds(opt('seeds'), range(1, 20));
  } else if (suite === 'deal') { hands = [true]; seeds = parseSeeds(opt('seeds'), range(1, 40)); }
  else if (suite === 'stalls') {
    hands = STALL_CARDS.map((c) => [c]);
    if (!opt('bots')) bots = ['stalls', 'stalls+steady'];
    seeds = parseSeeds(opt('seeds'), range(1, 20));
  } else if (suite.startsWith('hand=')) {
    hands = [suite.slice(5).split(',').map((c) => c.trim()).filter(Boolean)];
    seeds = parseSeeds(opt('seeds'), range(1, 20));
  } else {
    console.log('Suites: baseline, alone, hands, deal, stalls, hand=a,b,c (see the top of this file).');
    process.exit(1);
  }

  // Every game: the hands', and the same seeds without cards to compare with.
  const jobs = [];
  const key = (bot, seed, hand) => `${bot}|${seed}|${hand === null ? '-' : hand === true ? 'deal' : hand.join(',')}`;
  const want = new Map();
  const add = (bot, seed, hand) => {
    const k = key(bot, seed, hand);
    if (!want.has(k)) { want.set(k, jobs.length); jobs.push({ bot, seed, cards: hand, design, size, sets }); }
  };
  for (const bot of bots) for (const seed of seeds) {
    add(bot, seed, null);
    for (const h of hands) if (h !== null) add(bot, seed, h);
  }
  if (sets.length) console.log(`Cards' numbers changed for this run: ${sets.join(', ')}`);
  console.log(`${suite}: ${jobs.length} games (${design}, size ${size}, seeds ${seeds[0]}-${seeds[seeds.length - 1]}, `
    + `${bots.join(', ')}), ${jobsN} at once`);
  const res = await runAll(jobs, jobsN);
  const got = (bot, seed, hand) => res[want.get(key(bot, seed, hand))];

  // The yardstick: the same seeds without cards.
  const base = {};
  for (const bot of bots) {
    const ends = seeds.map((sd) => got(bot, sd, null).end), early = seeds.map((sd) => got(bot, sd, null).early);
    base[bot] = { ends, mean: mean(ends), median: median(ends), early, earlyMean: mean(early) };
  }
  console.log('\nWithout cards (the same seeds):');
  for (const bot of bots) {
    const b = base[bot], e = b.ends;
    console.log(`  ${bot.padEnd(7)} mean ${f1(b.mean)}  median ${f1(b.median)}  lowest ${Math.min(...e)}  highest ${Math.max(...e)}`
      + `  won ${e.filter((v) => v > 20).length}/${e.length}  refunds by event ${CHECK}: ${f1(b.earlyMean)}`);
  }
  const collapsed = seeds.filter((sd) => bots.some((bot) => bot !== 'honest' && got(bot, sd, null).end <= 10));
  console.log(`  seeds that collapse (an investing player lost by event 10): ${collapsed.length ? collapsed.join(', ') : 'none'}`);
  if (printGames || suite === 'baseline') {
    console.log('  by seed: ' + seeds.map((sd) => `${sd}:${bots.map((b) => got(b, sd, null).end).join('/')}`).join('  '));
  }

  const record = { suite, design, size, seeds, bots, base, hands: [] };
  if (suite === 'deal') {
    // Every seed has its own hand: one game each, the spread is what a player meets.
    console.log('\nDealt hands (event lost in, with cards / without):');
    const per = {};
    for (const bot of bots) per[bot] = [];
    for (const sd of seeds) {
      const parts = [];
      let hand = null;
      for (const bot of bots) {
        const r = got(bot, sd, true), b = got(bot, sd, null);
        per[bot].push({ seed: sd, end: r.end, base: b.end, hand: r.hand });
        parts.push(`${bot} ${String(r.end).padStart(2)} / ${String(b.end).padStart(2)}`);
        hand = r.hand;
      }
      console.log(`  seed ${String(sd).padStart(2)}  ${parts.join('   ')}   ${hand.join(' ')}`);
    }
    console.log('\nSpread of the dealt hands:');
    for (const bot of bots) {
      const e = per[bot].map((g) => g.end), d = per[bot].map((g) => g.end - g.base);
      const out = e.filter((v) => v < 12 || v > 19).length;
      console.log(`  ${bot.padEnd(7)} lowest ${Math.min(...e)}  median ${f1(median(e))}  highest ${Math.max(...e)}  mean ${f1(mean(e))}`
        + `  (without cards: median ${f1(base[bot].median)}, mean ${f1(base[bot].mean)}; change mean ${signed(mean(d))}, median ${signed(median(d))})`
        + `  outside 12-19: ${out}/${e.length}`);
      record.hands.push({ bot, games: per[bot] });
    }
  } else if (hands.some((h) => h !== null)) {
    console.log('\nWith cards (event lost in; the change is from the same seeds without cards):');
    console.log(`  (collapsed: games lost by event 10, without cards in brackets; refunds: taken by the end of event ${CHECK}, fewer is better)`);
    console.log('  ' + 'hand'.padEnd(64) + bots.map((b) => `${b.padEnd(7)} mean (chg)   median (chg)  low-high  collapsed  refunds (chg)`).join('    '));
    for (const h of hands) {
      if (h === null) continue;
      const cells = [], row = { hand: h, bots: {} };
      for (const bot of bots) {
        const e = seeds.map((sd) => got(bot, sd, h).end);
        const m = mean(e), md = median(e);
        const d = seeds.map((sd, i) => e[i] - got(bot, sd, null).end);
        const early = seeds.map((sd) => got(bot, sd, h).early), em = mean(early);
        const col = e.filter((v) => v <= 10).length, bcol = base[bot].ends.filter((v) => v <= 10).length;
        row.bots[bot] = { ends: e, mean: m, median: md, dMean: m - base[bot].mean, dMedian: md - base[bot].median, dPaired: median(d),
          early, earlyMean: em, dEarly: em - base[bot].earlyMean, collapsed: col };
        cells.push(`${bot.padEnd(7)} ${f1(m).padStart(4)} (${signed(m - base[bot].mean)})  ${f1(md).padStart(4)} (${signed(md - base[bot].median)})  `
          + `${String(Math.min(...e)).padStart(2)}-${String(Math.max(...e)).padEnd(2)}    ${String(col).padStart(2)} (${bcol})    `
          + `${f1(em).padStart(4)} (${signed(em - base[bot].earlyMean)})`);
      }
      record.hands.push(row);
      console.log('  ' + h.join(' ').padEnd(64) + cells.join('    '));
      if (printGames) for (const bot of bots) console.log('      ' + bot.padEnd(7) + seeds.map((sd) => `${sd}:${got(bot, sd, h).end}`).join(' '));
    }
  }
  const json = opt('json');
  if (json) writeFileSync(json, JSON.stringify(record, null, 1));
  console.log(`\n(${jobs.length} games in ${((Date.now() - started) / 1000).toFixed(0)} s)`);
}

// ---- A worker plays one game at a time; the main thread hands them out -------------------------------
// (At the bottom, so every helper above is defined before main() runs.)
if (!isMainThread) {
  const { play } = await import('./balance.mjs');
  let tuned = false;
  parentPort.on('message', (job) => {
    if (!tuned) { tuned = true; applySets(job.sets); }
    const r = play(job.bot, job.seed, { design: job.design, size: job.size }, false, null, job.cards);
    // Won: one past the last event. Still going at the time limit: the event it had reached.
    const end = r.result === 'won' ? r.wave + 1 : r.wave;
    // A finer yardstick than the event lost in, which moves in whole steps: the refunds taken in the
    // first CHECK events (the whole limit if the game was lost by then).
    const row = r.rows.find((w) => w.wave === CHECK);
    const early = row && r.wave > CHECK ? row.refunds : r.limit;
    parentPort.postMessage({ id: job.id, end, early, result: r.result, hand: r.hand, minutes: Number(r.minutes) });
  });
} else {
  await main();
}
