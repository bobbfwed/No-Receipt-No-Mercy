// Tests for going round again: when a multiplayer game ends, the host takes everyone back to the
// lobby over the same connections, and a fresh game starts from there. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { HostSession, ClientSession, checksum } from '../src/net/session.js';
import { memoryPair } from '../src/net/transports.js';
import { createDirector } from '../src/content/director.js';
import { TICK_HZ } from '../src/sim/index.js';

const TICK_MS = 1000 / TICK_HZ;

/** A host in the lobby on a small warehouse, with two friends joined over in-memory links. */
function room() {
  const host = new HostSession({ name: 'Dave', seed: 5, map: { design: 'warehouse', size: 's' }, lobby: true, director: createDirector(() => 0.5) });
  const join = (name) => {
    const [a, b] = memoryPair();
    host.accept(a);
    return { client: new ClientSession(b, name), hostSide: a, conn: b };
  };
  const one = join('Steve'), two = join('Bob');
  return { host, join, c1: one.client, c2: two.client, conn1: one.conn, conn2: two.conn };
}

/** Runs the host and every client for some seconds of pretend time. */
function run(host, clients, seconds, from = 0) {
  let now = from;
  for (let i = 0; i <= seconds * TICK_HZ; i++) {
    now = from + i * TICK_MS;
    host.update(now);
    for (const c of clients) c.update(now);
  }
  return now;
}

/** Has the host send what it has, and lets each client play it all. */
function settle(host, clients, now) {
  host._advance();
  for (const c of clients) {
    let t = now;
    for (let i = 0; i < 2000 && c._n < host._n; i++) c.update(t += TICK_MS);
  }
}

/** Everyone presses Ready and the game begins. */
function allReady(host, clients, now) {
  host.send({ c: 'ready', on: true });
  for (const c of clients) c.send({ c: 'ready', on: true });
  return run(host, clients, 0.5, now);
}

test('after a game ends, the host takes everyone back to the lobby over the same connections and a fresh game starts from there', () => {
  const { host, c1, c2, conn1, conn2 } = room();
  const clients = [c1, c2];
  let now = allReady(host, clients, 0);
  assert.equal(host.state.phase, 'build');
  // Something built in the first game, so it can be seen to be gone afterwards.
  const gridHad = () => host.state.grid.some((b) => b);
  for (let i = 0; i < host.state.grid.length && !gridHad(); i++) {
    host.send({ c: 'place', k: 'crate', x: i % host.state.w, y: (i / host.state.w) | 0 });
  }
  assert.ok(gridHad(), 'the first game has a building');
  now = run(host, clients, 1, now);

  // The store closes.
  host.state.phase = 'lost';
  host.fastForward(1);
  now = run(host, clients, 0.5, now);
  assert.equal(c1.state.phase, 'lost');
  assert.equal(c2.state.phase, 'lost');
  const oldN = host._n;
  const oldState = JSON.parse(JSON.stringify(host.state));

  // A client cannot send everyone back: there is no such command, and the host ignores the message.
  c1.conn.send({ t: 'lobby' });
  c1.send({ c: 'lobby' });
  now = run(host, clients, 0.2, now);
  assert.equal(host.state.phase, 'lost', 'a client cannot start the return');
  assert.equal(typeof c1.backToLobby, 'undefined');

  const seen = { host: 0, c1: 0, c2: 0 };
  host.on('lobby', () => seen.host++);
  c1.on('lobby', () => seen.c1++);
  c2.on('lobby', () => seen.c2++);
  assert.equal(host.backToLobby({ seed: 9, director: createDirector(() => 0.5) }), true);
  assert.deepEqual(seen, { host: 1, c1: 1, c2: 1 });

  // All three are in the lobby of a fresh game, still on the same links, same names and slots.
  for (const s of [host.state, c1.state, c2.state]) {
    assert.equal(s.phase, 'lobby');
    assert.deepEqual(s.players.map((p) => p.name), ['Dave', 'Steve', 'Bob']);
    assert.ok(s.players.every((p) => p.on && !p.ready && p.cash === s.startCash));
    assert.ok(!s.grid.some((b) => b), 'the old floor is gone');
    assert.equal(s.wave, 0);
    assert.deepEqual(s.map, { design: 'warehouse', size: 's' }, 'same store as before, until the host changes it');
  }
  assert.equal(host.me, 0);
  assert.equal(c1.me, 1);
  assert.equal(c2.me, 2);
  assert.equal(host.state.host, 0);
  assert.equal(host.conns.size, 2);
  assert.equal(c1.conn, conn1, 'nobody reconnected');
  assert.equal(c2.conn, conn2);

  // Late messages from the old game are thrown away.
  let oldSay = 0;
  c1.on('say', () => oldSay++);
  c1._onMessage(JSON.parse(JSON.stringify({ t: 'adv', n: oldN, h: 1, c: [[oldN - 1, 1, { c: 'ready', on: true }]] })));
  c1._onMessage(JSON.parse(JSON.stringify({ t: 'snap', n: oldN, s: oldState })));
  c1._onMessage({ t: 'at', n: oldN - 5, m: { t: 'say', who: 'deb', text: 'about the old game', mood: 'angry' } });
  now = run(host, clients, 0.3, now);
  assert.equal(oldSay, 0, 'an old line is not said in the new lobby');
  assert.equal(c1.state.phase, 'lobby', 'an old copy is not taken on');
  assert.equal(c1.state.players[1].ready, false, 'an old command is not replayed');

  // The host picks another store and other settings; both clients see them.
  host.send({ c: 'map', design: 'showroom', size: 'm' });
  host.send({ c: 'settings', difficulty: 'hard', waves: 10 });
  now = run(host, clients, 0.5, now);
  for (const c of clients) {
    assert.deepEqual(c.state.map, { design: 'showroom', size: 'm' });
    assert.equal(c.state.difficulty, 'hard');
    assert.equal(c.state.waves, 10);
  }

  // Everyone presses Ready and the second game runs for all three, in step.
  now = allReady(host, clients, now);
  assert.equal(host.state.phase, 'build');
  host.send({ c: 'start' });
  now = run(host, clients, 3, now);
  settle(host, clients, now);
  for (const c of clients) {
    assert.equal(c.state.phase, host.state.phase);
    assert.equal(c.state.map.design, 'showroom');
    assert.equal(checksum(c.state), checksum(host.state), 'the client follows the new game');
  }
  assert.equal(c1.stats.mismatches, 0);
});

test('the return is refused while a game is still on, and only players still connected come back', () => {
  const { host, c1, c2, conn2 } = room();
  let now = allReady(host, [c1, c2], 0);
  assert.equal(host.backToLobby(), false, 'not while the game is on');
  assert.equal(host.state.phase, 'build');

  // Steve's friend Bob walks out; the store then closes.
  conn2.close();
  now = run(host, [c1], 0.2, now);
  assert.equal(host.state.players[2].on, false);
  host.state.phase = 'won';
  host.fastForward(1);
  now = run(host, [c1], 0.5, now);
  assert.equal(host.backToLobby({ seed: 3 }), true);
  assert.deepEqual(host.state.players.map((p) => p.name), ['Dave', 'Steve']);
  assert.equal(c1.state.players.length, 2);
  assert.notEqual(c2.state.phase, 'lobby', 'a player who had left hears nothing more');
});

test('after the return, the lobby works like a first one: a new friend joins with the same room, a player can leave', () => {
  const { host, join, c1, c2, conn1 } = room();
  let now = allReady(host, [c1, c2], 0);
  host.state.phase = 'lost';
  host.fastForward(1);
  now = run(host, [c1, c2], 0.5, now);
  host.backToLobby({ seed: 4 });

  const late = join('Gary').client;
  assert.equal(late.me, 3);
  assert.equal(late.state.phase, 'lobby');
  now = run(host, [c1, c2, late], 0.3, now);
  for (const c of [c1, c2]) assert.deepEqual(c.state.players.map((p) => p.name), ['Dave', 'Steve', 'Bob', 'Gary']);

  conn1.close();
  now = run(host, [c2, late], 0.3, now);
  assert.equal(host.state.players[1].on, false);
  assert.equal(c2.state.players[1].on, false);

  // The three still here start the next game; nobody waits for the one who left.
  host.send({ c: 'ready', on: true });
  c2.send({ c: 'ready', on: true });
  late.send({ c: 'ready', on: true });
  now = run(host, [c2, late], 0.5, now);
  assert.equal(host.state.phase, 'build');
  assert.equal(late.state.phase, 'build');
});
