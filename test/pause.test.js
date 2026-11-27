// Tests for pausing the game (0.3.02): the 'pause' command, what freezes, what is refused, and how
// sessions, saves and DEB behave while a game is paused. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, setPlayerOnline, applyCommand, step, applyDemoLayout, canPlace, canUpgrade, TICK_HZ } from '../src/sim/index.js';
import { HostSession, ClientSession, checksum } from '../src/net/session.js';
import { memoryPair } from '../src/net/transports.js';
import { createDirector } from '../src/content/director.js';
import { LINES, NOPE, textOf } from '../src/content/lines.js';
import { writeSave, readSave } from '../src/ui/save.js';

const TICK_MS = 1000 / TICK_HZ;
const json = (s) => JSON.stringify(s);
const clone = (s) => JSON.parse(JSON.stringify(s));

/** Dave and Steve in the original small warehouse, the ready-made layout built, the doors open
 *  and `secs` seconds of a sales event played, so there are shoppers on the floor. */
function midWave(seed = 5, secs = 20) {
  const s = createGame({ seed });
  addPlayer(s, 'Dave');
  addPlayer(s, 'Steve');
  applyDemoLayout(s, 0);
  s.wave = 6; // a crowd big enough to still be in the store (supers among them)
  assert.equal(applyCommand(s, 0, { c: 'start' }).ok, true);
  for (let i = 0; i < secs * TICK_HZ; i++) step(s);
  assert.equal(s.phase, 'wave');
  assert.ok(s.shoppers.length > 0, 'shoppers on the floor');
  return s;
}

/** Steps a state n times, returning every event. */
function run(s, n) {
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...step(s));
  return ev;
}

test('any player may pause and anyone may resume; asking for what already is changes nothing', () => {
  const s = midWave();
  const ev = [];
  assert.deepEqual(applyCommand(s, 1, { c: 'pause', on: true }, ev), { ok: true });
  assert.deepEqual(s.pause, { by: 1 });
  assert.deepEqual(ev, [{ e: 'pause', on: true, by: 1 }]);
  // Pausing again: yes, nothing changes, no event, and the one who paused it stays named.
  const again = [];
  assert.deepEqual(applyCommand(s, 0, { c: 'pause', on: true }, again), { ok: true });
  assert.deepEqual(s.pause, { by: 1 });
  assert.equal(again.length, 0);
  // Dave carries on, though Steve paused it.
  const back = [];
  assert.deepEqual(applyCommand(s, 0, { c: 'pause', on: false }, back), { ok: true });
  assert.equal('pause' in s, false, 'the field goes altogether');
  assert.deepEqual(back, [{ e: 'pause', on: false, by: 0 }]);
  // Resuming a game that is not paused: yes, and nothing.
  const none = [];
  assert.deepEqual(applyCommand(s, 1, { c: 'pause', on: false }, none), { ok: true });
  assert.equal(none.length, 0);
  // Without `on` it flips; anything but true or false is refused.
  applyCommand(s, 0, { c: 'pause' });
  assert.deepEqual(s.pause, { by: 0 });
  applyCommand(s, 0, { c: 'pause' });
  assert.equal(s.pause, undefined);
  assert.equal(applyCommand(s, 0, { c: 'pause', on: 'yes' }).why, 'bad');
  assert.equal(applyCommand(s, 7, { c: 'pause', on: true }).why, 'bad', 'not a player');
});

test('the game can be paused in the deal, a build pause and a sales event, not in the lobby or once it is over', () => {
  const lobby = createGame({ seed: 1, lobby: true });
  addPlayer(lobby, 'Dave');
  assert.equal(applyCommand(lobby, 0, { c: 'pause', on: true }).why, 'lobby');
  assert.equal(lobby.pause, undefined);

  const build = createGame({ seed: 1 });
  addPlayer(build, 'Dave');
  assert.equal(applyCommand(build, 0, { c: 'pause', on: true }).ok, true);

  const deal = createGame({ seed: 1, cards: true });
  addPlayer(deal, 'Dave');
  assert.equal(deal.phase, 'cards');
  assert.equal(applyCommand(deal, 0, { c: 'pause', on: true }).ok, true);

  assert.equal(applyCommand(midWave(), 0, { c: 'pause', on: true }).ok, true);

  for (const phase of ['won', 'lost']) {
    const over = createGame({ seed: 1 });
    addPlayer(over, 'Dave');
    over.phase = phase;
    assert.equal(applyCommand(over, 0, { c: 'pause', on: true }).why, 'over', phase);
    assert.equal(over.pause, undefined);
  }
});

test('Head Office may pause and resume too', () => {
  const s = createGame({ seed: 2 });
  addPlayer(s, 'Dave');
  addPlayer(s, 'Steve');
  assert.equal(applyCommand(s, 1, { c: 'side', side: 'office' }).ok, true);
  assert.equal(applyCommand(s, 1, { c: 'pause', on: true }).ok, true);
  assert.deepEqual(s.pause, { by: 1 });
  assert.equal(applyCommand(s, 1, { c: 'pause', on: false }).ok, true);
});

test('a paused game does not change at all, however many steps run', () => {
  for (const s of [midWave(5), midWave(9, 40)]) {
    applyCommand(s, 0, { c: 'pause', on: true });
    const before = json(s);
    const ev = run(s, 3000);
    assert.equal(ev.length, 0, 'no events');
    assert.equal(json(s), before);
  }
  // The build pause's countdown and a dropped player's grace period wait too.
  const b = createGame({ seed: 3 });
  addPlayer(b, 'Dave');
  addPlayer(b, 'Steve');
  applyCommand(b, 0, { c: 'place', k: 'crate', x: 5, y: 5 });
  assert.ok(b.phaseT > 0, 'the build clock runs');
  setPlayerOnline(b, 1, false);
  run(b, 10);
  applyCommand(b, 0, { c: 'pause', on: true });
  const before = json(b);
  run(b, 200 * TICK_HZ); // longer than the grace period and the build pause
  assert.equal(json(b), before);
  assert.equal(b.players[1].cash > 0, true, 'Steve still has his money');
});

test('paused and then resumed plays out exactly as never paused (mid sales event, several seeds)', () => {
  for (const seed of [1, 5, 11, 23]) {
    const a = midWave(seed, 15 + seed);
    const b = clone(a);
    applyCommand(a, 0, { c: 'pause', on: true });
    run(a, 500 + seed * 37);
    applyCommand(a, 1, { c: 'pause', on: false });
    const evA = run(a, 60 * TICK_HZ), evB = run(b, 60 * TICK_HZ);
    assert.equal(json(a), json(b), `seed ${seed}`);
    assert.deepEqual(evA, evB, `seed ${seed}: the same events`);
  }
});

test('paused and then resumed during the deal of the cards plays out exactly as never paused', () => {
  for (const seed of [4, 8]) {
    const a = createGame({ seed, cards: true });
    addPlayer(a, 'Dave');
    run(a, 3 * TICK_HZ + seed);
    assert.equal(a.phase, 'cards');
    const b = clone(a);
    applyCommand(a, 0, { c: 'pause', on: true });
    run(a, 900);
    applyCommand(a, 0, { c: 'pause', on: false });
    // On through the rest of the deal and into the build phase.
    run(a, 60 * TICK_HZ);
    run(b, 60 * TICK_HZ);
    assert.equal(a.phase, 'build');
    assert.equal(json(a), json(b), `seed ${seed}`);
  }
});

test('nothing can be built, sold, upgraded, rebuilt, given or bought while paused', () => {
  const s = midWave();
  // A building to act on, owned by Dave: the demo's first.
  const at = s.grid.findIndex((b) => b && b.part === undefined && b.k === 'sprinkler');
  const x = at % s.w, y = (at / s.w) | 0;
  s.rubble.push({ i: 0, k: 'crate', d: 0, o: 0, u: {}, spent: 10 });
  applyCommand(s, 0, { c: 'pause', on: true });
  const before = json(s);
  const refused = [
    { c: 'place', k: 'crate', x: 3, y: 3 }, { c: 'remove', x, y }, { c: 'rotate', x, y },
    { c: 'upgrade', x, y }, { c: 'upgrade', x, y, t: 'rng' }, { c: 'give', to: 1, n: 10 },
    { c: 'rebuild' }, { c: 'rebuild', all: true }, { c: 'start' }, { c: 'side', side: 'office' },
    { c: 'plan', groups: [] }, { c: 'endless' }, { c: 'ready', on: true }, { c: 'map', design: 'warehouse', size: 'm' },
    { c: 'settings', waves: 10 }, { c: 'nonsense' },
  ];
  for (const cmd of refused) assert.deepEqual(applyCommand(s, 0, cmd), { ok: false, why: 'paused' }, cmd.c);
  assert.equal(json(s), before, 'nothing changed');
  // The preview on the floor says so too.
  assert.equal(canPlace(s, 'crate', 3, 3, 0), 'paused');
  assert.equal(canUpgrade(s, x, y, 0), 'paused');
  // DEB has a plain answer for it.
  assert.ok(NOPE.paused.length >= 3);
});

test('speed, job titles and pausing still work while paused; a rebuild paid for before the pause waits for the game to carry on', () => {
  const s = midWave();
  s.rubble.push({ i: 3 * s.w + 3, k: 'crate', d: 0, o: 0, u: {}, spent: 10 });
  // (Paid for just before the pause, but not yet built: as if a shopper had been in the hole.
  // Since 0.3.04 a Rebuild press orders it and step() puts it back when it can.)
  Object.assign(s.rubble[0], { by: 0, res: 5 });
  s.players[0].cash -= 5;
  applyCommand(s, 0, { c: 'pause', on: true });
  assert.equal(applyCommand(s, 0, { c: 'speed', n: 3 }).ok, true);
  assert.equal(s.speed, 3);
  assert.equal(applyCommand(s, 1, { c: 'role', role: s.players[1].role }).ok, true);
  // Auto-rebuild's switch went in 0.3.04: like any unknown command, refused while paused.
  assert.deepEqual(applyCommand(s, 0, { c: 'autoRebuild', on: true }), { ok: false, why: 'paused' });
  run(s, TICK_HZ);
  assert.equal(s.rubble.length, 1, 'the wreck is still a wreck');
  // Once it carries on, the paid-for wreck goes back by itself.
  applyCommand(s, 0, { c: 'pause', on: false });
  run(s, TICK_HZ);
  assert.equal(s.rubble.length, 0, 'rebuilt after the pause');

  // In the deal, asking to skip the rest is allowed, but the cards wait for the game to carry on.
  const d = createGame({ seed: 6, cards: true });
  addPlayer(d, 'Dave');
  run(d, 5);
  applyCommand(d, 0, { c: 'pause', on: true });
  assert.equal(applyCommand(d, 0, { c: 'skipCards', on: true }).ok, true);
  run(d, 30);
  assert.equal(d.phase, 'cards', 'nothing moves while paused');
  applyCommand(d, 0, { c: 'pause', on: false });
  run(d, 2);
  assert.equal(d.phase, 'build', 'the skip takes effect once it carries on');
});

test('a paused game survives a JSON round trip, and a save made while paused loads paused', () => {
  const s = midWave();
  applyCommand(s, 1, { c: 'pause', on: true });
  const copy = clone(s);
  assert.deepEqual(copy.pause, { by: 1 });
  assert.equal(json(copy), json(s));
  run(copy, 100);
  assert.equal(json(copy), json(s), 'the copy stays paused');

  const data = new Map();
  const storage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  assert.equal(writeSave(s, { storage }), true);
  const save = readSave({ storage });
  assert.deepEqual(save.state.pause, { by: 1 });
  // Resumed by the host, it is still paused, and stays put.
  const host = new HostSession({ name: 'Dave', state: save.state, resume: true });
  const tick = host.state.tick;
  host.fastForward(300);
  assert.deepEqual(host.state.pause, { by: 1 });
  assert.equal(host.state.tick, tick);
});

test('the host keeps counting steps while paused, but the state stands still and DEB is not asked every step', () => {
  let idles = 0;
  const director = { handle: () => [], idle: () => { idles++; return []; } };
  const host = new HostSession({ name: 'Dave', seed: 5, director });
  applyDemoLayout(host.state, 0);
  host.send({ c: 'start' });
  // Pause exactly on a whole second of play: the moment that would ask her every step.
  while (host.state.tick % TICK_HZ !== 0 || host.state.tick === 0) host._tick();
  const asked = idles;
  assert.equal(host.send({ c: 'pause', on: true }).ok, true);
  const n = host._n, before = json(host.state);
  let now = 0;
  for (let i = 0; i < 5 * TICK_HZ; i++) host.update(now += TICK_MS);
  assert.ok(host._n > n + 100, 'the session runs on');
  assert.equal(json(host.state), before, 'the game does not');
  assert.equal(idles, asked, 'DEB was not asked while paused');
  // Carrying on, she is asked about once a second again.
  host.send({ c: 'pause', on: false });
  for (let i = 0; i < 3 * TICK_HZ; i++) host.update(now += TICK_MS);
  assert.ok(idles >= asked + 2 && idles <= asked + 4, `${idles - asked} calls in about 3 seconds`);
  // fastForward on a paused game returns.
  host.send({ c: 'pause', on: true });
  const t = host.state.tick;
  host.fastForward(1000);
  assert.equal(host.state.tick, t);
});

test('the checksum includes the pause', () => {
  const s = midWave();
  const plain = checksum(s);
  applyCommand(s, 0, { c: 'pause', on: true });
  assert.notEqual(checksum(s), plain);
  const p0 = checksum(s);
  s.pause.by = 1;
  assert.notEqual(checksum(s), p0, 'and who paused it');
  applyCommand(s, 1, { c: 'pause', on: false });
  assert.equal(checksum(s), plain, 'a game that is not paused sums as before');
});

test('a client joining a paused game lands paused, and a pause made with him in the game reaches him', () => {
  const host = new HostSession({ name: 'Dave', seed: 7 });
  applyDemoLayout(host.state, 0);
  host.send({ c: 'start' });
  host.fastForward(10 * TICK_HZ);
  host.send({ c: 'pause', on: true });
  const [a, b] = memoryPair();
  host.accept(a);
  const late = new ClientSession(b, 'Steve');
  assert.deepEqual(late.state.pause, { by: 0 });

  // Now Steve pauses and Dave carries on, while both play.
  host.send({ c: 'pause', on: false });
  let now = 0;
  const both = (secs) => { for (let i = 0; i < secs * TICK_HZ; i++) { host.update(now += TICK_MS); late.update(now); } };
  both(2);
  const seen = [];
  late.on('fx', (ev) => { for (const e of ev) if (e.e === 'pause') seen.push(e); });
  late.send({ c: 'pause', on: true });
  assert.deepEqual(host.state.pause, { by: 1 });
  both(2);
  host._advance();
  for (let i = 0; i < 200 && late._n < host._n; i++) late.update(now += TICK_MS);
  assert.deepEqual(late.state.pause, { by: 1 });
  assert.equal(late.state.tick, host.state.tick, 'both stand at the same moment');
  assert.equal(checksum(late.state), checksum(host.state));
  assert.deepEqual(seen, [{ e: 'pause', on: true, by: 1 }], 'his copy heard it too');
  assert.equal(late.stats.mismatches, 0);
});

test('DEB says one line when the game is paused and one when it carries on, naming who, and no flood', () => {
  const s = createGame({ seed: 1 });
  addPlayer(s, 'Dave');
  addPlayer(s, 'Gareth');
  s.tick = 1000;
  const d = createDirector(() => 0.01);
  const says = (out) => out.filter((m) => m.t === 'say');
  const paused = says(d.handle([{ e: 'pause', on: true, by: 1 }], s));
  assert.equal(paused.length, 1);
  assert.ok(LINES.paused.map(textOf).some((t) => paused[0].text === t.replace(/\{p\}/g, 'Gareth')), paused[0].text);
  const resumed = says(d.handle([{ e: 'pause', on: false, by: 0 }], s));
  assert.equal(resumed.length, 1, 'carrying on gets its line at the same tick');
  assert.ok(LINES.resumed.map(textOf).some((t) => resumed[0].text === t.replace(/\{p\}/g, 'Dave')), resumed[0].text);
  // Pressing it over and over at the same moment of play: no more lines.
  for (let i = 0; i < 10; i++) {
    assert.equal(says(d.handle([{ e: 'pause', on: true, by: 0 }], s)).length, 0);
    assert.equal(says(d.handle([{ e: 'pause', on: false, by: 0 }], s)).length, 0);
  }
  assert.equal(LINES.paused.length, 8);
  assert.equal(LINES.resumed.length, 4);
});
