// Tests for multiplayer sessions and the joke director. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { HostSession, ClientSession } from '../src/net/session.js';
import { memoryPair } from '../src/net/transports.js';
import { VERSION, RELEASE, versionText } from '../src/version.js';
import { createDirector } from '../src/content/director.js';
import { nopeLine, LINES, ESCAPE_REVIEWS, LEFT_REVIEWS, NOPE } from '../src/content/lines.js';
import { applyDemoLayout, TICK_HZ, TUNE, SHOPPERS, BUILD } from '../src/sim/index.js';

const at = (x, y) => y * 30 + x; // the original small map is 30 tiles wide

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
  assert.equal(host.state.grid[at(5, 5)].k, 'crate');
  assert.equal(host.state.grid[at(5, 5)].o, 1, 'owned by the client player');
  assert.equal(client.state.grid[at(5, 5)].k, 'crate');
  assert.equal(client.state.players[1].cash, TUNE.startCash - BUILD.crate.cost);
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
  assert.ok(client.state.tick - tick <= 70, 'it runs on a little (over two seconds) and then waits');
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

test('an eighth player is turned away', () => {
  const host = new HostSession({ name: 'Dave', seed: 1 });
  const clients = [];
  for (let i = 0; i < 7; i++) {
    const [a, b] = memoryPair();
    host.accept(a);
    const c = new ClientSession(b, `P${i}`);
    let closed = null;
    c.on('closed', (m) => { closed = m.why; });
    clients.push({ c, closed: () => closed });
  }
  assert.equal(host.state.players.length, 7);
  assert.equal(clients[6].c.me, -1);
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

test('on a chosen map, a joining player gets his own entrance and money, and upgrades cross the wire', () => {
  const host = new HostSession({ name: 'Dave', seed: 9, map: { design: 'showroom', size: 'm' } });
  assert.equal(host.state.w, 44);
  assert.equal(host.state.open, 1);
  const [a, b] = memoryPair();
  host.accept(a);
  const client = new ClientSession(b, 'Steve');
  assert.equal(host.state.open, 2, 'a second entrance opened for Steve');
  assert.equal(client.state.w, 44);
  assert.equal(client.state.tiles, host.state.tiles);
  assert.equal(client.state.players[1].cash, TUNE.startCash);

  // Steve builds and upgrades a sprinkler with his own money; Dave's is untouched.
  client.send({ c: 'place', k: 'sprinkler', x: 4, y: 4 });
  client.send({ c: 'upgrade', x: 4, y: 4 });
  for (let n = 0; n < 12; n++) { host.update(n * TICK_MS); client.update(n * TICK_MS); }
  const i = 4 * host.state.w + 4;
  assert.equal(host.state.grid[i].lv, 2);
  assert.equal(client.state.grid[i].lv, 2);
  assert.equal(client.state.players[0].cash, TUNE.startCash);
  assert.equal(client.state.players[1].cash, TUNE.startCash - BUILD.sprinkler.cost * 2);
});

test('a client can take the Head Office job, plan a wave over the wire, and DEB announces it', () => {
  const { host, client } = hostAndClient({ director: createDirector(), map: { design: 'warehouse', size: 'm' } });
  const said = [];
  host.on('say', (m) => said.push(m.text));
  const run = (from, ticks) => { for (let n = 0; n < ticks; n++) { host.update((from + n) * TICK_MS); client.update((from + n) * TICK_MS); } };
  client.send({ c: 'side', side: 'office' });
  run(0, 10);
  assert.equal(host.state.players[1].side, 'office');
  assert.equal(client.state.office.pid, 1);
  assert.ok(said.some((t) => t.includes('Steve') && t.includes('Head Office')), 'DEB says who took the job');

  client.send({ c: 'plan', groups: [{ k: 'hunter', n: 3, sup: 0, door: 1, at: 0 }] });
  client.send({ c: 'start' });
  run(10, 10);
  assert.equal(host.state.phase, 'build', 'the store has not asked yet');
  assert.equal(client.state.office.ready, true);
  host.send({ c: 'start' });
  run(20, 10);
  assert.equal(host.state.phase, 'wave');
  assert.equal(host.state.spawnQ.length + host.state.shoppers.length, 3);
  assert.ok(said.some((t) => LINES.officeWave.some((l) => t === l.replace('{p}', 'Steve').replace('{n}', '3'))), 'DEB blames him for the wave');

  // His building is refused, and he is told why.
  const nopes = [];
  client.on('nope', (m) => nopes.push(m.why));
  client.send({ c: 'place', k: 'crate', x: 5, y: 5 });
  run(30, 10);
  assert.deepEqual(nopes, ['office']);
  assert.ok(NOPE.office && NOPE.taken && NOPE.lonely && NOPE.budget && NOPE.locked && NOPE.door);
});

test('a player who joins in the middle of a wave can build at once and gets his entrance and cash', () => {
  const host = new HostSession({ name: 'Dave', seed: 9, map: { design: 'warehouse', size: 'm' } });
  host.state.wave = 4;
  host.send({ c: 'start' }); // wave 5 is under way
  for (let n = 0; n < 60; n++) host.update(n * TICK_MS);
  assert.equal(host.state.phase, 'wave');
  const limit = host.state.refundLimit;

  const [a, b] = memoryPair();
  host.accept(a);
  const client = new ClientSession(b, 'Steve');
  assert.equal(client.state.phase, 'wave', 'he sees the wave in progress');
  assert.equal(host.state.open, 2, 'his entrance opens straight away');
  assert.equal(host.state.refundLimit, limit + TUNE.refundPerPlayer);
  assert.equal(client.state.players[1].cash, TUNE.startCash + 5 * TUNE.joinCash, 'starting cash plus something for the waves he missed');

  // He builds during the wave, with his own money.
  client.send({ c: 'place', k: 'sprinkler', x: 4, y: 4 });
  for (let n = 60; n < 75; n++) { host.update(n * TICK_MS); client.update(n * TICK_MS); }
  const i = 4 * host.state.w + 4;
  assert.equal(host.state.grid[i].k, 'sprinkler');
  assert.equal(host.state.grid[i].o, 1);
  assert.equal(client.state.grid[i].k, 'sprinkler');

  // Shoppers use his entrance for the rest of this wave.
  const used = new Set();
  const seen = new Set(host.state.shoppers.map((s) => s.id));
  for (let n = 75; n < 75 + 40 * TICK_HZ && host.state.phase === 'wave'; n++) {
    host.update(n * TICK_MS);
    for (const s of host.state.shoppers) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      used.add(host.state.doors.findIndex((d) => d.includes((s.y | 0) * host.state.w + (s.x | 0))));
    }
  }
  assert.ok(used.has(1), 'some arrive through the new entrance');
});

test('the version reads as a big number and a two-digit release', () => {
  assert.match(VERSION, /^\d+\.\d+$/);
  assert.ok(Number.isInteger(RELEASE) && RELEASE >= 1);
  assert.match(versionText(), /^\d+\.\d+\.\d{2,}$/);
});

test('when the host leaves, another player takes the game over and the others get their places back', () => {
  // Dave hosts; Steve and Gaz join; a wave is under way with things built.
  const host = new HostSession({ name: 'Dave', seed: 3, map: { design: 'warehouse', size: 'm' } });
  const link = (name) => { const [a, b] = memoryPair(); host.accept(a); return new ClientSession(b, name); };
  const steve = link('Steve'), gaz = link('Gaz');
  steve.send({ c: 'place', k: 'sprinkler', x: 4, y: 4 });
  host.send({ c: 'start' });
  for (let i = 0; i < 90; i++) { host.update(i * TICK_MS); steve.update(i * TICK_MS); gaz.update(i * TICK_MS); }
  assert.equal(steve.state.phase, 'wave');
  assert.equal(steve.state.host, 0);
  const cash = steve.state.players.map((p) => p.cash);

  // Dave's browser goes. Steve is first in the list of those left, so his browser takes over,
  // from his own copy of the game.
  const copy = JSON.parse(JSON.stringify(steve.state));
  const next = new HostSession({ name: 'Steve', state: copy, takeOver: true, director: createDirector() });
  assert.equal(next.me, 1, 'Steve keeps his own place');
  assert.equal(next.state.host, 1);
  assert.deepEqual(next.state.players.map((p) => p.on), [false, true, false], 'the others count as gone until they reconnect');
  assert.equal(next.state.wave, 1);
  assert.equal(next.state.grid[4 * next.state.w + 4].k, 'sprinkler', 'what was built is still there');
  // Dave left for good as far as the game knows, so his money was shared out between the other two.
  assert.deepEqual(next.state.players.map((p) => p.cash), [0, cash[1] + cash[0] / 2, cash[2] + cash[0] / 2]);

  // Gaz reconnects and gets his place back; so does Dave, later, as an ordinary player.
  const relink = (name) => { const [a, b] = memoryPair(); next.accept(a); return new ClientSession(b, name); };
  const gaz2 = relink('Gaz');
  assert.equal(gaz2.me, 2);
  const before = next.state.tick;
  for (let i = 90; i < 150; i++) { next.update(i * TICK_MS); gaz2.update(i * TICK_MS); }
  assert.ok(next.state.tick > before + 30, 'the game carries on');
  assert.ok(Math.abs(gaz2.state.tick - next.state.tick) <= 2, 'and the reconnected player follows it');
  const dave2 = relink('Dave');
  assert.equal(dave2.me, 0, 'the old host gets his place back by name');
  assert.equal(dave2.state.host, 1, 'but he is not the host any more');
  assert.deepEqual(next.state.players.map((p) => p.on), [true, true, true]);
  assert.equal(next.state.open, 3, 'nobody gained or lost an entrance');

  // In a lobby, the new host is the one who may change the store.
  const lobby = new HostSession({ name: 'Dave', map: { design: 'warehouse', size: 's' }, lobby: true });
  const [a, b] = memoryPair();
  lobby.accept(a);
  const s2 = new ClientSession(b, 'Steve');
  const taken = new HostSession({ name: 'Steve', state: JSON.parse(JSON.stringify(s2.state)), takeOver: true });
  assert.ok(taken.send({ c: 'map', design: 'aisles', size: 'm' }).ok);
  assert.equal(taken.state.map.design, 'aisles');
});

test('chat: a line from any player reaches everyone, tidied, and a flood is cut off', () => {
  const host = new HostSession({ name: 'Dave', seed: 3 });
  const link = (name) => { const [a, b] = memoryPair(); host.accept(a); return new ClientSession(b, name); };
  const steve = link('Steve'), gaz = link('Gaz');
  const heard = { host: [], steve: [], gaz: [] };
  host.on('chat', (m) => heard.host.push(m));
  steve.on('chat', (m) => heard.steve.push(m));
  gaz.on('chat', (m) => heard.gaz.push(m));

  steve.chat('  where   is the\nloading bay  ');
  host.chat('top of the map, genius');
  for (const who of ['host', 'steve', 'gaz']) {
    assert.deepEqual(heard[who].map((m) => [m.pid, m.name, m.text]), [
      [1, 'Steve', 'where is the loading bay'],
      [0, 'Dave', 'top of the map, genius'],
    ], who);
    assert.equal(heard[who][0].color, host.state.players[1].color);
  }
  // Empty lines are dropped, long ones are cut, and nobody can send more than a few at once.
  gaz.chat('   ');
  gaz.chat('x'.repeat(1000));
  assert.equal(heard.host.length, 3);
  assert.equal(heard.host[2].text.length, 200);
  for (let i = 0; i < 20; i++) gaz.chat(`spam ${i}`);
  assert.ok(heard.steve.length <= 3 + 5, `the flood was cut off after ${heard.steve.length - 3} lines`);
  // Chat is not part of the game state.
  assert.ok(!JSON.stringify(host.state).includes('loading bay'));
});
