// Tests for endless games (state.waves === 0: no last sales event, never won) and for the cap on
// how many shoppers one wave can send.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, setPlayerOnline, applyCommand, step, waveSpec, cleanSettings, isEndless, patienceGrowth,
  SETTINGS, TUNE, TICK_HZ,
} from '../src/sim/index.js';
import { checksum } from '../src/net/session.js';
import { writeSave, readSave } from '../src/ui/save.js';

/** A real solo game of `waves` sales events, about to open the doors on wave n. */
function before(n, waves, players = ['Dave']) {
  const s = createGame({ seed: 7, settings: { waves } });
  for (const p of players) addPlayer(s, p);
  s.wave = n - 1;
  return s;
}
/** Opens the doors with only a few shoppers coming, and plays until the wave is over. */
function quickWave(s) {
  const ev = [];
  assert.ok(applyCommand(s, 0, { c: 'start' }, ev).ok);
  s.spawnQ = s.spawnQ.slice(0, 3);
  for (let i = 0; i < 120 * TICK_HZ; i++) {
    const tick = step(s);
    ev.push(...tick);
    if (tick.some((e) => e.e === 'waveEnd')) break;
  }
  return ev;
}
const total = (groups) => groups.filter((g) => g.k !== 'boss').reduce((sum, g) => sum + g.n, 0);

test('endless is one of the settings, written as 0 waves', () => {
  assert.ok(SETTINGS.waves.includes(0));
  assert.equal(cleanSettings({ waves: 0 }).waves, 0);
  assert.equal(cleanSettings({ waves: 7 }).waves, SETTINGS.defaults.waves, 'anything not on the list is still the default');
  const s = createGame({ settings: { waves: 0 } });
  assert.equal(s.waves, 0);
  assert.ok(isEndless(s));
  assert.ok(!isEndless(createGame()));
  // The host can choose it in the lobby.
  const l = createGame({ lobby: true });
  addPlayer(l, 'Dave');
  assert.ok(applyCommand(l, 0, { c: 'settings', waves: 0 }).ok);
  assert.ok(isEndless(l));
  assert.ok(applyCommand(l, 0, { c: 'settings', waves: 15 }).ok);
  assert.ok(!isEndless(l));
});

test('an endless game is never won: wave 20 ends in a build pause and wave 21 begins', () => {
  // The same wave in a 20-wave game is the last.
  const short = before(20, 20);
  assert.ok(quickWave(short).some((e) => e.e === 'won'));
  assert.equal(short.phase, 'won');

  const s = before(20, 0);
  const ev = quickWave(s);
  assert.ok(ev.some((e) => e.e === 'waveEnd' && e.wave === 20));
  assert.ok(!ev.some((e) => e.e === 'won'));
  assert.equal(s.phase, 'build');
  assert.equal(s.phaseT, TUNE.buildSecs * TICK_HZ);
  let started = null;
  for (let i = 0; i < 60 * TICK_HZ && !started; i++) started = step(s).find((e) => e.e === 'waveStart');
  assert.equal(started.wave, 21);
  assert.equal(s.phase, 'wave');
  // And on, well past anything the other settings reach.
  s.wave = 99;
  s.phase = 'build';
  s.shoppers = [];
  const late = quickWave(s);
  assert.ok(late.some((e) => e.e === 'waveStart' && e.wave === 100 && e.boss === 20), 'wave 100 brings The CEO, tier 20');
  assert.equal(s.phase, 'build');
  // A late joiner gets the usual extra cash for every wave played.
  const id = addPlayer(s, 'Steve');
  assert.equal(s.players[id].cash, s.startCash + TUNE.joinCash * 100);
});

test('an endless game ends only when the refund limit is reached', () => {
  const s = before(30, 0);
  applyCommand(s, 0, { c: 'start' });
  for (let i = 0; i < 200 * TICK_HZ && s.phase === 'wave'; i++) step(s);
  assert.equal(s.phase, 'lost');
  assert.ok(s.refunds >= s.refundLimit);
});

test('a won game can be carried on as an endless one', () => {
  const s = before(10, 10, ['Dave', 'Steve', 'Kev']);
  assert.deepEqual(applyCommand(s, 0, { c: 'endless' }), { ok: false, why: 'phase' }, 'not before it is won');
  quickWave(s);
  assert.equal(s.phase, 'won');
  // Somebody who has dropped out cannot decide it.
  setPlayerOnline(s, 2, false);
  assert.deepEqual(applyCommand(s, 2, { c: 'endless' }), { ok: false, why: 'bad' });
  const ev = [];
  assert.ok(applyCommand(s, 1, { c: 'endless' }, ev).ok);
  assert.deepEqual(ev, [{ e: 'endless', by: 1 }]);
  assert.equal(s.waves, 0);
  assert.equal(s.phase, 'build');
  assert.equal(s.phaseT, TUNE.buildSecs * TICK_HZ, 'the usual build pause');
  assert.deepEqual(applyCommand(s, 0, { c: 'endless' }), { ok: false, why: 'phase' }, 'only once');
  // Building works again, and the next wave comes when the timer runs out.
  s.players[0].cash = 1000;
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'crate', x: 5, y: 3 }).ok);
  let started = null;
  for (let i = 0; i < 60 * TICK_HZ && !started; i++) started = step(s).find((e) => e.e === 'waveStart');
  assert.equal(started.wave, 11);
  // The checksum sees the change of setting.
  const a = createGame({ settings: { waves: 10 } }), b = createGame({ settings: { waves: 0 } });
  assert.notEqual(checksum(a), checksum(b));
});

test('Head Office cannot carry the game on, but gets a budget for the next wave when it is', () => {
  const s = createGame({ seed: 4, map: { design: 'warehouse', size: 'm' }, zones: false, settings: { waves: 10 } });
  addPlayer(s, 'Dave');
  addPlayer(s, 'Steve');
  s.wave = 9;
  assert.ok(applyCommand(s, 1, { c: 'side', side: 'office' }).ok);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  assert.ok(applyCommand(s, 1, { c: 'start' }).ok);
  s.spawnQ = s.spawnQ.slice(0, 2);
  for (let i = 0; i < 120 * TICK_HZ && s.phase === 'wave'; i++) step(s);
  assert.equal(s.phase, 'won');
  assert.deepEqual(applyCommand(s, 1, { c: 'endless' }), { ok: false, why: 'office' });
  assert.ok(applyCommand(s, 0, { c: 'endless' }).ok);
  assert.ok(s.office.budget > 0);
});

test('one wave sends at most TUNE.maxCrowd shoppers per player; waves up to 30 are untouched', (t) => {
  const capped = {};
  for (const p of [1, 2, 3, 7]) for (const n of [30, 46, 60, 100]) capped[`${p}:${n}`] = waveSpec(n, p);
  const old = TUNE.maxCrowd;
  TUNE.maxCrowd = Infinity;
  t.after(() => { TUNE.maxCrowd = old; });
  for (const p of [1, 2, 3, 7]) {
    const most = Math.round(old * (1 + TUNE.crowdPerPlayer * (p - 1)));
    for (let n = 1; n <= 30; n++) assert.ok(total(waveSpec(n, p)) <= most, `wave ${n} for ${p} is under the cap`);
    assert.deepEqual(capped[`${p}:30`], waveSpec(30, p), 'so wave 30 is as it was');
    // (46 and not 40: a boss wave's smaller crowd does not reach the cap until later.)
    for (const n of [46, 60, 100]) {
      const g = capped[`${p}:${n}`], free = waveSpec(n, p);
      assert.ok(total(free) > most, `wave ${n} would send ${total(free)}`);
      assert.ok(total(g) <= most && total(g) >= most - g.length, `wave ${n} for ${p} sends ${total(g)} (cap ${most})`);
      // Every kind still comes, each group arriving over the same time as before.
      assert.deepEqual(g.map((x) => x.k), free.map((x) => x.k));
      for (let i = 0; i < g.length; i++) {
        assert.ok(g[i].n >= 1 && g[i].sup <= g[i].n);
        if (g[i].k !== 'boss') assert.ok(Math.abs(g[i].n * g[i].gap - free[i].n * free[i].gap) < 1e-6, g[i].k);
      }
    }
  }
  // Patience keeps growing, so an endless game is lost in the end.
  assert.ok(patienceGrowth(100) > patienceGrowth(60) * 2);
});

test('an endless game is saved and read back like any other', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const s = before(25, 0);
  s.phase = 'build';
  assert.ok(writeSave(s, { storage }));
  const back = readSave({ storage });
  assert.equal(back.waves, 0);
  assert.equal(back.state.waves, 0);
});
