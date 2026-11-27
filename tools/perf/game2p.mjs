// Plays a whole two-player game with the scripted team (teambot.mjs) on the store size recommended
// for two players, timing every simulation step, and saves the state at the busiest moment (most
// shoppers on the floor) of chosen sales events, for the other perf tools.
// Usage: node tools/perf/game2p.mjs [--profile=FROM-TO] [--dump=TICK] [--seed=11] [--players=2] [--design=warehouse] [--size=auto]
//          [--waves=30] [--events=8,11,13,16,20,25] [--cards=1] [--out=tools/perf/out]
//   --cards=1  deal a hand as a game from the menu does (the owner's games had cards)
// Writes <out>/states/e<NN>.json (the state, plus a "meta" file) and <out>/game-ticks.json (per
// event timing, the worst ticks and what happened in them). Prints a summary.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGame, addPlayer, applyCommand, step, recommendedSize, TICK_HZ } from '../../src/sim/index.js';
import { createDirector } from '../../src/content/director.js';
import { createTeamBot, direct } from './teambot.mjs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const seed = Number(arg('seed', 11));
const players = Number(arg('players', 2));
const design = arg('design', 'warehouse');
const size = arg('size', 'auto') === 'auto' ? recommendedSize(players) : arg('size');
const waves = Number(arg('waves', 30));
const events = new Set(arg('events', '8,11,13,16,20,25').split(',').map(Number));
const cards = arg('cards', '1') !== '0';
const out = arg('out', 'tools/perf/out');
// --profile=FROM-TO: a CPU profile of the steps between those ticks (sampling, in-process), its
// heaviest functions printed at the end. --dump=TICK saves the state as it was before that tick.
const [profFrom, profTo] = (arg('profile', '') || '0-0').split('-').map(Number);
const dumpAt = Number(arg('dump', -1));
mkdirSync(join(out, 'states'), { recursive: true });

// A seeded random for the director, so runs repeat.
let r = seed * 9301 + 49297;
const random = () => ((r = (r * 9301 + 49297) % 233280) / 233280);

const s = createGame({ seed, map: { design, size }, settings: { waves }, cards });
for (let i = 0; i < players; i++) addPlayer(s, ['Bobb', 'Tusker', 'Phantasm', 'P4', 'P5', 'P6', 'P7'][i]);
const director = createDirector(random);
const bot = createTeamBot(() => s, direct(s));

const now = () => Number(process.hrtime.bigint()) / 1e6;
const perWave = new Map(); // wave -> { n, sum, max, peak, ticksOver1ms, dir }
const worst = []; // the 40 worst steps
const best = new Map(); // wave -> { n, state }
let lastVer = s.gridVer;
let limitRaised = 0;
const limit = 4 * 60 * 60 * TICK_HZ;
const t0 = now();
let prof = null;
const { Session } = await import('node:inspector/promises');
while (s.phase !== 'won' && s.phase !== 'lost' && s.tick < limit) {
  if (s.phase === 'cards') {
    for (const p of s.players) if (!p.skip) applyCommand(s, p.id, { c: 'skipCards', on: true });
    step(s);
    continue;
  }
  if (s.tick % 15 === 0) {
    bot.shop();
  }
  if (s.phase === 'build' && s.phaseT === -1 && bot.stats.bought === 0) { step(s); continue; }
  // Keep the bots alive to the late events: the point is the crowd, not the result. Recorded.
  if (s.refunds >= s.refundLimit - 2) { s.refundLimit += 10; limitRaised += 10; }
  if (s.tick === dumpAt) writeFileSync(join(out, 'states', 'dump-' + dumpAt + '.json'), JSON.stringify(s));
  if (profTo && s.tick === profFrom && !prof) { prof = new Session(); prof.connect(); await prof.post('Profiler.enable'); await prof.post('Profiler.setSamplingInterval', { interval: 50 }); await prof.post('Profiler.start'); }
  if (prof && s.tick === profTo) { const { profile } = await prof.post('Profiler.stop'); prof.disconnect(); prof = null; writeFileSync(join(out, 'profile-' + profFrom + '.cpuprofile'), JSON.stringify(profile)); topFunctions(profile); }
  const nShop = s.shoppers.length, qLen = s.spawnQ.length, rub = s.rubble.length, phase = s.phase;
  const a = now();
  const ev = step(s);
  const b = now();
  director.handle(ev, s);
  if (s.tick % TICK_HZ === 0) director.idle(s);
  const c = now();
  const ms = b - a;
  const w = s.wave;
  let row = perWave.get(w);
  if (!row) perWave.set(w, row = { wave: w, waveTicks: 0, waveSum: 0, buildTicks: 0, buildSum: 0, max: 0, over1: 0, over4: 0, peak: 0, dirSum: 0, dirMax: 0, verChanges: 0 });
  if (phase === 'wave') { row.waveTicks++; row.waveSum += ms; } else { row.buildTicks++; row.buildSum += ms; }
  row.max = Math.max(row.max, ms);
  if (ms > 1) row.over1++;
  if (ms > 4) row.over4++;
  row.peak = Math.max(row.peak, s.shoppers.length);
  row.dirSum += c - b; row.dirMax = Math.max(row.dirMax, c - b);
  const verChanged = s.gridVer !== lastVer;
  if (verChanged) row.verChanges++;
  lastVer = s.gridVer;
  if (worst.length < 40 || ms > worst[worst.length - 1].ms) {
    const kinds = {};
    for (const e of ev) kinds[e.e] = (kinds[e.e] || 0) + 1;
    worst.push({ ms: +ms.toFixed(3), wave: w, phase, tick: s.tick, shoppers: nShop, spawnQ: qLen, rubble: rub, layoutChangedThisStep: verChanged, events: kinds, director: +(c - b).toFixed(3) });
    worst.sort((x, y) => y.ms - x.ms);
    worst.length = Math.min(worst.length, 40);
  }
  if (events.has(w) && phase === 'wave' && s.phase === 'wave') {
    const k = best.get(w);
    if (!k || s.shoppers.length > k.n) best.set(w, { n: s.shoppers.length, tick: s.tick, json: JSON.stringify(s) });
  }
  // A 30-event game won: carry on endless so the later events can be captured too.
  if (s.phase === 'won') applyCommand(s, 0, { c: 'endless' });
}
const total = now() - t0;

for (const [w, k] of best) {
  writeFileSync(join(out, 'states', `e${String(w).padStart(2, '0')}.json`), k.json);
}
const rows = [...perWave.values()].map((r) => ({
  wave: r.wave, peakShoppers: r.peak,
  waveMeanMs: r.waveTicks ? +(r.waveSum / r.waveTicks).toFixed(4) : null,
  buildMeanMs: r.buildTicks ? +(r.buildSum / r.buildTicks).toFixed(4) : null,
  maxMs: +r.max.toFixed(3), stepsOver1ms: r.over1, stepsOver4ms: r.over4,
  layoutChanges: r.verChanges, directorMeanMs: +((r.dirSum) / Math.max(1, r.waveTicks + r.buildTicks)).toFixed(4), directorMaxMs: +r.dirMax.toFixed(3),
}));
const meta = {
  seed, players, design, size, w: s.w, h: s.h, waves, cards: s.cards || [], result: s.phase, lastWave: s.wave,
  refunds: s.refunds, refundLimit: s.refundLimit, limitRaised, ticks: s.tick, wallMs: Math.round(total), bot: bot.stats,
  captured: Object.fromEntries([...best].map(([w, k]) => [w, { shoppers: k.n, tick: k.tick, bytes: k.json.length }])),
};
writeFileSync(join(out, 'game-ticks.json'), JSON.stringify({ meta, rows, worst }, null, 1));
console.log(JSON.stringify(meta, null, 1));
console.log('wave peak waveMean buildMean   max  >1ms >4ms layout dirMean dirMax');
for (const r of rows) console.log([r.wave, r.peakShoppers, r.waveMeanMs, r.buildMeanMs, r.maxMs, r.stepsOver1ms, r.stepsOver4ms, r.layoutChanges, r.directorMeanMs, r.directorMaxMs].map((v, i) => String(v).padStart([4, 5, 9, 9, 6, 5, 5, 6, 8, 7][i])).join(' '));
console.log('\nworst steps:');
for (const x of worst.slice(0, 15)) console.log(JSON.stringify(x));

function topFunctions(profile) {
  const self = new Map();
  const dt = profile.timeDeltas; const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const hit = new Map();
  for (let i = 0; i < profile.samples.length; i++) hit.set(profile.samples[i], (hit.get(profile.samples[i]) || 0) + (dt[i] || 0));
  for (const [id, us] of hit) { const n = byId.get(id); const cf = n.callFrame; const key = (cf.functionName || '(anon)') + ' ' + cf.url.split('/').slice(-2).join('/') + ':' + (cf.lineNumber + 1); self.set(key, (self.get(key) || 0) + us); }
  const tot = [...self.values()].reduce((a, b) => a + b, 0);
  console.log('PROFILE ' + profFrom + '-' + profTo + ': ' + (tot / 1000).toFixed(1) + ' ms sampled');
  for (const [k, us] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log((us / 1000).toFixed(2).padStart(9) + ' ms  ' + k);
}
