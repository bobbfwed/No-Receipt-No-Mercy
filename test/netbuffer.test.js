// Tests for the 0.4 changes to how the joined players are kept in step (the stutter investigation,
// .claude/reports/2026-11-26-stutter-investigation.md): the adaptive buffer that lets a client run
// further behind the host after its picture has stopped, the routine full copy once a minute, and
// the host saying when its page is hidden. Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { HostSession, ClientSession, BUFFER } from '../src/net/session.js';
import { memoryPair } from '../src/net/transports.js';
import { applyDemoLayout, TICK_HZ } from '../src/sim/index.js';

const TICK_MS = 1000 / TICK_HZ;
const same = (a, b) => JSON.stringify(a.state) === JSON.stringify(b.state);

/**
 * A host and one client over the in-memory transport, with a tap on the host's side: while `held`
 * is set, what the host sends waits in a queue (a link that has stalled), and `release()` delivers
 * it all at once and in order, as a reliable link does after a lost packet is sent again. Every
 * message the host sends is also counted by type.
 */
function linked({ demo = true, visibility = null } = {}) {
  const host = new HostSession({ name: 'Dave', seed: 5, visibility });
  if (demo) applyDemoLayout(host.state, 0);
  const [a, b] = memoryPair();
  const link = { held: false, queue: [], sent: {} };
  const send = a.send.bind(a);
  a.send = (m) => {
    link.sent[m.t] = (link.sent[m.t] || 0) + 1;
    if (link.held) link.queue.push(m); else send(m);
  };
  link.release = () => { link.held = false; for (const m of link.queue.splice(0)) send(m); };
  host.accept(a);
  const client = new ClientSession(b, 'Steve');
  return { host, client, link, hostConn: a, clientConn: b };
}

/** Runs both in pretend time, a frame every 16 ms; `each(now)` before every frame. Returns the time. */
function run(host, clients, seconds, from = 0, each = null) {
  let now = from;
  const end = from + seconds * 1000;
  while (now < end) {
    now += 16;
    if (each) each(now);
    host.update(now);
    for (const c of clients) c.update(now);
  }
  return now;
}

function settle(host, client, now) {
  host._advance();
  for (let i = 0; i < 4000 && client._n < host._n; i++) client.update(now += TICK_MS);
  return now;
}

// ---------------------------------------------------------------- the adaptive buffer

test('on a steady link the client stays 3 steps (about 100 ms) behind and never counts a stop', () => {
  const { host, client } = linked();
  host.send({ c: 'start' });
  run(host, [client], 60);
  assert.equal(client.stats.stops, 0);
  assert.equal(client.stats.want, BUFFER.min);
  assert.equal(BUFFER.min, 3);
  assert.ok(Math.abs(client.buffer - 100) < 1, 'about 100 ms');
  assert.ok(host._n - client._n <= BUFFER.min + 2, `${host._n - client._n} steps behind`);
});

test('a stall long enough to stop the picture moves the aim back, up to the cap, with no jump and no burst', () => {
  const { host, client, link } = linked();
  host.send({ c: 'start' });
  let now = run(host, [client], 5);
  const wants = [];
  let most = 0;
  // Five stalls of 300 ms, ten seconds apart.
  for (let k = 0; k < 5; k++) {
    link.held = true;
    now = run(host, [client], 0.3, now);
    link.release();
    let last = client._n;
    now = run(host, [client], 10, now, () => { most = Math.max(most, client._n - last); last = client._n; });
    wants.push(client.stats.want);
  }
  // The first three stopped the picture (3, 5 and 7 steps are less than 300 ms); by then the aim
  // is 9 steps, 300 ms, which rides the same stall out.
  assert.equal(client.stats.stops, 3, 'each stall stopped the picture once, until the aim covered it');
  assert.deepEqual(wants, [5, 7, 9, 9, 9], 'two steps further back each time, never past the cap');
  assert.equal(BUFFER.max, 9);
  assert.equal(client.stats.jumps, 0, 'no full copy was skipped to');
  assert.ok(most <= 2, `at most two steps in one frame while catching up (was ${most})`);
  // Further back means the next stall of the same length no longer stops the picture.
  const stops = client.stats.stops;
  link.held = true;
  now = run(host, [client], 0.25, now);
  link.release();
  now = run(host, [client], 5, now);
  assert.equal(client.stats.stops, stops, 'a 250 ms stall is ridden out now');
  now = settle(host, client, now);
  assert.ok(same(host, client), 'and the copies are still the same');
});

test('the aim moves back gently: the client slows a little rather than standing still', () => {
  const { host, client, link } = linked();
  host.send({ c: 'start' });
  let now = run(host, [client], 5);
  link.held = true;
  now = run(host, [client], 0.3, now);
  link.release();
  // From here on the link is steady again. The gap grows from about 3 to about 5 steps by the client
  // playing a little slower, so the picture keeps moving: no stretch of 100 ms without a step.
  let lastStep = now, still = 0, prev = client._n;
  now = run(host, [client], 8, now, (t) => {
    if (client._n !== prev) { still = Math.max(still, t - lastStep); lastStep = t; prev = client._n; }
  });
  assert.ok(still < 100, `the longest stretch without a step after the stall was ${still} ms`);
  const behind = host._n - client._n;
  assert.ok(behind >= 4 && behind <= 7, `about 5 steps behind now (was ${behind})`);
});

test('after a long calm spell the aim comes back one step at a time, down to 3', () => {
  const { host, client, link } = linked();
  host.send({ c: 'start' });
  let now = run(host, [client], 5);
  for (let k = 0; k < 3; k++) {
    link.held = true;
    now = run(host, [client], 0.3, now);
    link.release();
    now = run(host, [client], 2, now);
  }
  assert.equal(client.stats.want, BUFFER.max);
  now = run(host, [client], BUFFER.calmSecs + 1, now);
  assert.equal(client.stats.want, BUFFER.max - 1, 'one step closer after one calm spell');
  now = run(host, [client], BUFFER.calmSecs * (BUFFER.max - BUFFER.min), now);
  assert.equal(client.stats.want, BUFFER.min);
  assert.equal(client.stats.jumps, 0);
  now = settle(host, client, now);
  assert.ok(same(host, client));
});

test('a paused game does not count as a stall', () => {
  const { host, client } = linked();
  host.send({ c: 'start' });
  let now = run(host, [client], 3);
  host.send({ c: 'pause', on: true });
  now = run(host, [client], 5, now);
  host.send({ c: 'pause', on: false });
  run(host, [client], 3, now);
  assert.equal(client.stats.stops, 0);
  assert.equal(client.stats.want, BUFFER.min);
});

// ---------------------------------------------------------------- routine full copies

test('routine full copies come once a minute; joining and leaving still send one at once', () => {
  const { host, client, link } = linked();
  host.send({ c: 'start' });
  let now = run(host, [client], 125);
  assert.equal(link.sent.snap, 2, 'two routine copies in a little over two minutes');
  // Another player joins: the one already here is brought a copy at once.
  const [a, b] = memoryPair();
  host.accept(a);
  const gaz = new ClientSession(b, 'Gaz');
  assert.equal(link.sent.snap, 3);
  now = run(host, [client, gaz], 2, now);
  // ...and leaves.
  b.close();
  assert.equal(link.sent.snap, 4);
  now = run(host, [client], 2, now);
  now = settle(host, client, now);
  assert.ok(same(host, client));
  assert.equal(client.stats.jumps, 0);
});

test('a checksum mismatch still brings a fresh copy within a second, long before the routine one', () => {
  const { host, client, link } = linked();
  host.send({ c: 'start' });
  let now = run(host, [client], 2);
  client.state.players[0].cash += 123; // drift the checksum sees
  now = run(host, [client], 1.5, now);
  assert.equal(client.stats.mismatches, 1);
  assert.equal(link.sent.snap, 1);
  now = settle(host, client, now);
  assert.ok(same(host, client));
});

// ---------------------------------------------------------------- the host's page hidden

/** A stand-in for the page's document: hidden, and the visibilitychange listeners. */
function page() {
  const fns = new Set();
  return {
    hidden: false,
    addEventListener(type, fn) { if (type === 'visibilitychange') fns.add(fn); },
    removeEventListener(type, fn) { fns.delete(fn); },
    set(on) { this.hidden = on; for (const fn of fns) fn(); },
    get listeners() { return fns.size; },
  };
}

test('the host says when its page is hidden and when it is back; everyone hears it, once per change', () => {
  const doc = page();
  const { host, client } = linked({ visibility: doc });
  const heardHost = [], heardClient = [];
  host.on('away', (m) => heardHost.push(m.on));
  client.on('away', (m) => heardClient.push(m.on));
  assert.equal(host.away, false);
  doc.set(true);
  doc.set(true); // no change: nothing said
  assert.equal(host.away, true);
  assert.equal(client.hostAway, true);
  doc.set(false);
  assert.deepEqual(heardHost, [true, false]);
  assert.deepEqual(heardClient, [true, false]);
  assert.equal(client.hostAway, false);
  // A player who joins while the host's page is hidden is told straight after his welcome.
  doc.set(true);
  const [a, b] = memoryPair();
  host.accept(a);
  const gaz = new ClientSession(b, 'Gaz');
  assert.equal(gaz.hostAway, true);
  // The session can stop following the page.
  host._unwatch();
  assert.equal(doc.listeners, 0);
});

test('a host whose timer runs about once a second while hidden does not make the client move its aim back', () => {
  const { host, client } = linked();
  host.send({ c: 'start' });
  let now = run(host, [client], 3);
  host.setAway(true);
  // A hidden page's timer: the host updates once a second, the client every frame.
  for (let k = 0; k < 10; k++) {
    for (let f = 0; f < 62; f++) { now += 16; client.update(now); }
    host.update(now);
  }
  assert.equal(client.stats.stops, 0, 'stops while the host is away are its timer\'s, not the link\'s');
  assert.equal(client.stats.want, BUFFER.min);
  host.setAway(false);
  now = run(host, [client], 3, now);
  now = settle(host, client, now);
  assert.ok(same(host, client));
});

test('the session never looks at the page itself: without a visibility source nothing is said', () => {
  const { host, client } = linked();
  let heard = 0;
  client.on('away', () => heard++);
  run(host, [client], 2);
  assert.equal(host.away, false);
  assert.equal(heard, 0);
});
