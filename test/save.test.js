// Tests for saving a game in the host's browser and carrying it on later.
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, applyCommand, step, addStock, itemCode, TICK_HZ, TUNE, STATE_VERSION } from '../src/sim/index.js';
import { HostSession, ClientSession } from '../src/net/session.js';
import { memoryPair } from '../src/net/transports.js';
import { writeSave, readSave, clearSave, worthSaving, whenSaved, dropOldSave } from '../src/ui/save.js';

/** A stand-in for the browser's storage. */
function fakeStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), data };
}

/** Dave and Steve, three waves in, with things built. */
function game() {
  const s = createGame({ seed: 5, map: { design: 'warehouse', size: 'm' }, settings: { waves: 15, startCash: 800, difficulty: 'hard' } });
  addPlayer(s, 'Dave');
  addPlayer(s, 'Steve');
  applyCommand(s, 0, { c: 'place', k: 'sprinkler', x: 4, y: 4 });
  applyCommand(s, 1, { c: 'place', k: 'crate', x: 6, y: 6 });
  // Stocked with two units of Name Brand Bottled Spite, as if they had come up its Dumbwaiter, so
  // the save carries a building's stock (0.4: stock took the place of bought upgrades).
  for (let n = 0; n < 2; n++) addStock(s.grid[4 * s.w + 4], itemCode(1, 2));
  s.wave = 3;
  applyCommand(s, 0, { c: 'start' });
  for (let i = 0; i < 5 * TICK_HZ; i++) step(s);
  return s;
}

test('a game under way is saved and read back exactly', () => {
  const storage = fakeStorage();
  const s = game();
  assert.equal(writeSave(s, { kind: 'online', storage }), true);
  const save = readSave({ storage });
  assert.ok(save);
  assert.deepEqual(save.state, JSON.parse(JSON.stringify(s)));
  assert.equal(save.kind, 'online');
  assert.equal(save.wave, 4);
  assert.equal(save.waves, 15);
  assert.deepEqual(save.players, ['Dave', 'Steve']);
  assert.equal(save.host, 'Dave');
  assert.match(save.store, /Open Warehouse, Superstore/);
  clearSave({ storage });
  assert.equal(readSave({ storage }), null);
});

test('only real, unfinished games are saved', () => {
  const storage = fakeStorage();
  assert.equal(worthSaving(createGame()), false, 'nothing has happened yet');
  assert.equal(writeSave(createGame({ training: true }), { storage }), false, 'not the training shift');
  const lobby = createGame({ lobby: true, map: { design: 'warehouse', size: 's' } });
  addPlayer(lobby, 'Dave');
  assert.equal(writeSave(lobby, { storage }), false, 'not while still in the lobby');
  const over = game();
  over.phase = 'lost';
  assert.equal(writeSave(over, { storage }), false, 'not a finished game');
  assert.equal(storage.data.size, 0);
  // One building is enough to be worth keeping.
  const fresh = createGame();
  addPlayer(fresh, 'Dave');
  applyCommand(fresh, 0, { c: 'place', k: 'crate', x: 5, y: 5 });
  assert.equal(writeSave(fresh, { storage }), true);
});

test('a damaged or out-of-date save is ignored instead of breaking the menu', () => {
  const storage = fakeStorage();
  for (const junk of ['', 'not json', '{}', '{"v":1}', JSON.stringify({ v: 1, state: { v: 1 } }), JSON.stringify({ v: 9, state: game() })]) {
    storage.setItem('returns-dept.save', junk);
    assert.equal(readSave({ storage }), null, junk.slice(0, 20));
  }
  const cut = game();
  cut.grid.length = 10; // not the size the map says
  storage.setItem('returns-dept.save', JSON.stringify({ v: 1, at: 1, state: cut }));
  assert.equal(readSave({ storage }), null);
  // No storage at all (a private window) is not an error either.
  assert.equal(writeSave(game(), { storage: null }), false);
  assert.equal(readSave({ storage: null }), null);
});

test('resuming makes the saver the host again, and the others get their places and money back by name', () => {
  const storage = fakeStorage();
  const s = game();
  s.players[1].cash = 321;
  writeSave(s, { kind: 'online', storage });
  const save = readSave({ storage });

  const host = new HostSession({ name: save.host, state: save.state, resume: true });
  assert.equal(host.me, 0);
  assert.equal(host.state.host, 0);
  assert.deepEqual(host.state.players.map((p) => p.on), [true, false], 'Steve is away until he joins again');
  assert.equal(host.state.wave, 4);
  assert.equal(host.state.grid[4 * host.state.w + 4].s.dmg[0], 2, 'the stocked sprinkler is still there, its stock with it');
  // The game runs on while Steve is away, and however long he takes, his money is still his.
  for (let i = 0; i < (TUNE.graceSecs || 90) * 2 * TICK_HZ / 30; i++) host.fastForward(30);
  assert.equal(host.state.players[1].cash, 321);
  const [a, b] = memoryPair();
  host.accept(a);
  const steve = new ClientSession(b, 'Steve');
  assert.equal(steve.me, 1);
  assert.equal(steve.state.players[1].cash, 321);
  assert.deepEqual(host.state.players.map((p) => p.on), [true, true]);
  assert.equal(host.state.players.length, 2, 'nobody was added twice');
});

test('0.4 loads no save from before it: such a save is not offered, and is thrown out once with a note', () => {
  const storage = fakeStorage();
  const s = game();
  assert.equal(s.v, STATE_VERSION);
  assert.equal(STATE_VERSION, 6, 'version 6 since 0.4.01');
  // A save of this version is offered and left alone.
  writeSave(s, { storage });
  assert.equal(dropOldSave({ storage }), null);
  assert.ok(readSave({ storage }));
  // One made by 0.3 (state version 4) is not offered; the menu throws it out and says which
  // version made it.
  const old = JSON.parse(storage.getItem('returns-dept.save'));
  old.state.v = 4;
  old.release = '0.3.04';
  storage.setItem('returns-dept.save', JSON.stringify(old));
  assert.equal(readSave({ storage }), null);
  assert.equal(dropOldSave({ storage }), '0.3.04');
  assert.equal(storage.data.size, 0, 'gone');
  assert.equal(dropOldSave({ storage }), null, 'and said only once');
  // Nothing saved, junk, or no storage at all: nothing to say.
  storage.setItem('returns-dept.save', 'not json');
  assert.equal(dropOldSave({ storage }), null);
  assert.equal(dropOldSave({ storage: null }), null);
});

test('the time a save was made is shown in plain words', () => {
  const now = new Date(2026, 10, 15, 22, 0).getTime();
  assert.equal(whenSaved(new Date(2026, 10, 15, 21, 14).getTime(), now), 'today 21:14');
  assert.equal(whenSaved(new Date(2026, 10, 14, 9, 5).getTime(), now), 'yesterday 09:05');
  assert.equal(whenSaved(new Date(2026, 10, 2, 7, 30).getTime(), now), '2 Nov 07:30');
});
