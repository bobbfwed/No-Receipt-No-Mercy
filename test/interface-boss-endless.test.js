// Tests for what the interface says about endless games and the boss, where it can be checked
// without a browser: the numbers in src/content/facts.js, the endless record (src/ui/record.js)
// and when a game is saved (src/ui/save.js).
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, applyCommand, step, bossPatience, bossTier, bossTitle, BOSS, TUNE, TICK_HZ, SETTINGS,
} from '../src/sim/index.js';
import { sampleWaves, bossWaves, bossFacts, bossBounty, lengthText, eventOf } from '../src/content/facts.js';
import { BOSS_HELP } from '../src/content/help.js';
import { forTouch } from '../src/content/touch.js';
import { noteRecord, readRecords, recordLine, recordWhere } from '../src/ui/record.js';
import { saveStep } from '../src/ui/save.js';

/** A storage object like the browser's, kept in a Map. */
function memory() {
  const store = new Map();
  return { store, getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
}

test('an endless game reads sensibly: no "of 0", and sample sales events that go on', () => {
  assert.equal(lengthText(20), '20 sales events');
  assert.equal(lengthText(0), 'Endless');
  assert.equal(eventOf(7, 20), '7 / 20');
  assert.equal(eventOf(7, 0), '7');
  assert.deepEqual(sampleWaves(0), [1, 5, 10, 20, 30, 40]);
  assert.deepEqual(sampleWaves(20), [1, 5, 10, 15, 20], 'other lengths as before');
  assert.deepEqual(bossWaves(20), [5, 10, 15, 20]);
  assert.deepEqual(bossWaves(10), [5, 10]);
  assert.deepEqual(bossWaves(0), [5, 10, 15, 20, 25, 30, 40, 50]);
  for (const n of bossWaves(0)) assert.ok(bossTier(n) > 0, `${n} is a boss event`);
});

test('the boss facts are the rules\' own numbers', () => {
  const hard = SETTINGS.difficulty.hard;
  const f = bossFacts({ hpMul: hard.hp, pay: hard.pay, waves: 20 });
  assert.equal(f.name, BOSS.name);
  assert.deepEqual(f.titles.map((t) => t.title), BOSS.titles);
  assert.deepEqual(f.titles.map((t) => t.from), [5, 10, 15, 20]);
  assert.equal(f.refunds, TUNE.bossRefunds);
  assert.equal(f.speed, BOSS.speed);
  assert.deepEqual(f.waves.map((w) => w.n), [5, 10, 15, 20]);
  for (const w of f.waves) {
    assert.equal(w.hp, bossPatience(w.n, hard.hp));
    assert.equal(w.title, bossTitle(bossTier(w.n)));
    assert.equal(w.refund, BOSS.refund * bossTier(w.n));
  }
  assert.ok(f.waves[3].hp > f.waves[0].hp * 2, 'he gets much tougher');
  assert.ok(BOSS_HELP.trick.length > 40 && BOSS_HELP.beat.length > 20);
  // The help text has no keys or mouse words for the touch rewording to miss.
  assert.equal(forTouch(BOSS_HELP.trick), BOSS_HELP.trick);
  assert.equal(forTouch(BOSS_HELP.beat), BOSS_HELP.beat);
});

test('the bounty the interface promises is the bounty the rules pay', () => {
  const s = createGame({ seed: 3, settings: { difficulty: 'easy' } });
  addPlayer(s, 'Dave');
  s.players[0].cash = 1e5;
  s.wave = 9;
  assert.ok(applyCommand(s, 0, { c: 'place', k: 'forklift', x: 3, y: 5, d: 0 }).ok);
  assert.ok(applyCommand(s, 0, { c: 'start' }).ok);
  s.spawnQ = s.spawnQ.filter((q) => q[1] === 'boss');
  let out = null;
  for (let i = 0; i < 60 * TICK_HZ && !out; i++) {
    const boss = s.shoppers.find((m) => m.k === 'boss');
    if (boss && boss.hp > 1) boss.hp = 1;
    out = step(s).find((e) => e.e === 'bossOut');
  }
  assert.ok(out, 'he stormed out');
  const want = bossFacts({ hpMul: SETTINGS.difficulty.easy.hp, pay: SETTINGS.difficulty.easy.pay, waves: 20 }).waves.find((w) => w.n === 10);
  assert.equal(out.bounty, want.bounty);
  assert.equal(out.bounty, bossBounty(2, SETTINGS.difficulty.easy.pay));
});

test('a lost endless game is remembered per difficulty, and only beaten by going further', () => {
  const storage = memory();
  const lost = (wave, difficulty = 'normal', players = ['Dave'], waves = 0) => {
    const s = createGame({ seed: 1, settings: { waves, difficulty }, map: { design: 'warehouse', size: 'm' } });
    for (const p of players) addPlayer(s, p);
    s.wave = wave;
    s.phase = 'lost';
    return s;
  };
  assert.equal(recordLine({ storage }), '', 'nothing to show yet');
  assert.equal(noteRecord(lost(12, 'normal', ['Dave'], 20), { storage }), null, 'a game with an end is no endless record');
  const won = lost(12); won.phase = 'won';
  assert.equal(noteRecord(won, { storage }), null);

  const first = noteRecord(lost(23, 'normal', ['Dave', 'Steve']), { storage, now: 5 });
  assert.equal(first.isNew, true);
  assert.equal(first.wave, 23);
  assert.deepEqual(readRecords({ storage }).normal, { wave: 23, design: 'warehouse', size: 'm', players: 2, at: 5 });
  assert.match(recordLine({ storage }), /^Endless record: sales event 23 on Normal \(.+, 2 players\)\.$/);

  const worse = noteRecord(lost(19), { storage });
  assert.equal(worse.isNew, false);
  assert.equal(worse.best.wave, 23, 'the record stands');
  assert.equal(readRecords({ storage }).normal.wave, 23);
  assert.equal(noteRecord(lost(30), { storage }).isNew, true);
  assert.equal(readRecords({ storage }).normal.wave, 30);

  // Another difficulty keeps its own.
  assert.equal(noteRecord(lost(8, 'brutal'), { storage }).isNew, true);
  assert.deepEqual(Object.keys(readRecords({ storage })).sort(), ['brutal', 'normal']);
  assert.match(recordLine({ storage }), /Normal 30/);
  assert.match(recordLine({ storage }), /Brutal 8/);
  assert.match(recordWhere({ design: 'nope', size: 'nope', players: 1 }), /original store, 1 player$/);

  // Storage that is missing, broken or refuses: nothing remembered, nothing thrown.
  assert.equal(noteRecord(lost(5), { storage: null }).isNew, true);
  const broken = memory();
  broken.setItem('returns-dept.records', '{not json');
  assert.deepEqual(readRecords({ storage: broken }), {});
  const refuses = { getItem: () => null, setItem: () => { throw new Error('full'); } };
  assert.equal(noteRecord(lost(5), { storage: refuses }).isNew, true);
});

test('a won game stops being saved, and is saved again once it is carried on as endless', () => {
  const s = createGame({ seed: 7, settings: { waves: 10 } });
  addPlayer(s, 'Dave');
  s.wave = 4;
  assert.equal(saveStep(s), 'write');
  s.phase = 'won';
  s.wave = 10;
  assert.equal(saveStep(s), 'clear');
  assert.ok(applyCommand(s, 0, { c: 'endless' }).ok);
  assert.equal(s.phase, 'build');
  assert.equal(saveStep(s), 'write');
  s.phase = 'lost';
  assert.equal(saveStep(s), 'stop');
  assert.equal(saveStep(null), 'skip');
});
