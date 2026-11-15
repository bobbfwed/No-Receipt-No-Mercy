// Tests for multiplayer sessions and the joke director. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { HostSession, ClientSession } from '../src/net/session.js';
import { memoryPair } from '../src/net/transports.js';
import { createDirector } from '../src/content/director.js';
import { nopeLine, LINES, ESCAPE_REVIEWS, LEFT_REVIEWS, NOPE } from '../src/content/lines.js';
import { applyDemoLayout, TICK_HZ, TUNE, SHOPPERS, BUILD, idxOf } from '../src/sim/index.js';

const TICK_MS = 1000 / TICK_HZ;

function hostAndClient(opts = {}) {
  const host = new HostSession({ name: 'Dave', seed: 5, ...opts });
  const [a, b] = memoryPair();
  host.accept(a);
  const client = new ClientSession(b, 'Steve');
  return { host, client, hostConn: a, clientConn: b };
}

/** Runs both sessions for a number of seconds of pretend time. */
function runBoth(host, client, seconds, from = 0) {
  let now = from;
  for (let i = 0; i <= seconds * TICK_HZ; i++) {
    now = from + i * TICK_MS;
    host.update(now);
    client.update(now);
  }
  return now;
}

test('a client joins, gets a player slot and a copy of the state', () => {
  const { host, client } = hostAndClient();
  assert.equal(host.me, 0);
  assert.equal(client.me, 1);
  assert.equal(client.state.players.length, 2);
  assert.equal(client.state.players[1].name, 'Steve');
  assert.notEqual(client.state, host.state, 'the client has its own copy');
});

test('client commands are applied by the host and come back in the state', () => {
  const { host, client } = hostAndClient();
  client.send({ c: 'place', k: 'crate', x: 5, y: 5 });
  host.update(0); client.update(0);
  host.update(TICK_MS); client.update(TICK_MS);
  assert.equal(host.state.grid[idxOf(5, 5)].k, 'crate');
  assert.equal(host.state.grid[idxOf(5, 5)].o, 1, 'owned by the client player');
  assert.equal(client.state.grid[idxOf(5, 5)].k, 'crate');
  assert.equal(client.state.cash, TUNE.startCash - BUILD.crate.cost);
});

test('a refused command is reported only to the player who sent it', () => {
  const { host, client } = hostAndClient();
  const hostNopes = [], clientNopes = [];
  host.on('nope', (m) => hostNopes.push(m));
  client.on('nope', (m) => clientNopes.push(m));
  client.send({ c: 'place', k: 'crate', x: 0, y: 0 });
  assert.equal(clientNopes.length, 1);
  assert.equal(clientNopes[0].why, 'bounds');
  assert.equal(hostNopes.length, 0);
  host.send({ c: 'place', k: 'crate', x: 0, y: 0 });
  assert.equal(hostNopes.length, 1);
});

test('host and client stay in step through a whole wave', () => {
  const { host, client } = hostAndClient();
  applyDemoLayout(host.state, 0);
  host.send({ c: 'start' });
  const end = runBoth(host, client, 30);
  assert.ok(host.state.tick > 25 * TICK_HZ);
  assert.ok(Math.abs(host.state.tick - client.state.tick) <= 6, 'client is never far behind');
  // Right after an update from the host the two copies are identical.
  host.send({ c: 'speed', n: 1 });
  host.update(end + TICK_MS);
  assert.equal(JSON.stringify(client.state), JSON.stringify(host.state));
  assert.ok(client.drainFx().length > 0, 'the client produced effects from its own prediction');
});

test('a client stops predicting when the host goes quiet', () => {
  const { host, client } = hostAndClient();
  host.send({ c: 'start' });
  host.update(0); client.update(0);
  const tick = client.state.tick;
  for (let i = 1; i <= 300; i++) client.update(i * TICK_MS); // ten seconds with no word from the host
  assert.ok(client.state.tick - tick <= 20);
});

test('the director announces to everyone and the report lists every player', () => {
  const { host, client } = hostAndClient({ director: createDirector() });
  const seen = { host: [], client: [] };
  for (const type of ['say', 'review', 'report']) {
    host.on(type, (m) => seen.host.push(m));
    client.on(type, (m) => seen.client.push(m));
  }
  host.state.wave = 1; // next wave is 2, which has a dad line
  host.send({ c: 'start' });
  host.fastForward(120 * TICK_HZ);
  assert.deepEqual(seen.client, seen.host, 'clients receive exactly what the host shows');
  const says = seen.host.filter((m) => m.t === 'say');
  assert.ok(says.length >= 2, 'wave opening line and dad line warning');
  assert.ok(says.some((m) => /dad/i.test(m.text)));
  assert.ok(says.every((m) => !/\{\w\}/.test(m.text)), 'no unfilled placeholders');
  assert.ok(seen.host.some((m) => m.t === 'review' && m.stars === 5 && m.kind === 'dad'), 'a dad who got through leaves 5 stars');
  const report = seen.host.find((m) => m.t === 'report');
  assert.ok(report);
  assert.equal(report.wave, 2);
  assert.deepEqual(report.rows.map((r) => r.name), ['Dave', 'Steve']);
  assert.ok(report.rows.every((r) => r.stamp && r.color));
  assert.ok(report.employee && report.deb);
});

test('a player who drops out is marked offline and can come back to the same slot', () => {
  const { host, clientConn } = hostAndClient();
  const notes = [];
  host.on('players', (m) => notes.push(m.text));
  clientConn.close();
  assert.equal(host.state.players[1].on, false);
  assert.match(notes[0], /Steve/);
  const [a, b] = memoryPair();
  host.accept(a);
  const again = new ClientSession(b, 'Steve');
  assert.equal(again.me, 1);
  assert.equal(host.state.players.length, 2);
  assert.equal(host.state.players[1].on, true);
});

test('a seventh player is turned away', () => {
  const host = new HostSession({ name: 'Dave', seed: 1 });
  const clients = [];
  for (let i = 0; i < 6; i++) {
    const [a, b] = memoryPair();
    host.accept(a);
    const c = new ClientSession(b, `P${i}`);
    let closed = null;
    c.on('closed', (m) => { closed = m.why; });
    clients.push({ c, closed: () => closed });
  }
  assert.equal(host.state.players.length, 6);
  assert.equal(clients[5].c.me, -1);
});

test('cursor positions are relayed to the other players only', () => {
  const { host, client } = hostAndClient();
  const [a, b] = memoryPair();
  host.accept(a);
  const third = new ClientSession(b, 'Kev');
  const got = { host: [], client: [], third: [] };
  host.on('cursor', (m) => got.host.push(m));
  client.on('cursor', (m) => got.client.push(m));
  third.on('cursor', (m) => got.third.push(m));
  client.sendCursor(3.5, 4.5);
  assert.equal(got.client.length, 0);
  assert.deepEqual(got.host[0], { t: 'cursor', pid: 1, x: 3.5, y: 4.5 });
  assert.deepEqual(got.third[0], { t: 'cursor', pid: 1, x: 3.5, y: 4.5 });
});

test('every line bank is non-empty and covers every shopper and refusal reason', () => {
  for (const [key, bank] of Object.entries(LINES)) {
    const lists = Array.isArray(bank) ? [bank] : Object.values(bank);
    for (const list of lists) assert.ok(list.length > 0, key);
  }
  for (const kind of Object.keys(SHOPPERS)) {
    assert.ok(ESCAPE_REVIEWS[kind]?.length, `escape reviews for ${kind}`);
    assert.ok(LEFT_REVIEWS[kind]?.length, `left reviews for ${kind}`);
  }
  for (const why of ['cash', 'blocked', 'occupied', 'shopper', 'bounds', 'over']) assert.ok(NOPE[why]?.length, why);
  assert.equal(nopeLine('cash', 'Kev', () => 0), "You can't afford that. Add it to the list, Kev.");
  assert.ok(nopeLine('something-new', 'Kev').length > 0);
});
