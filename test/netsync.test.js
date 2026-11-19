// Tests for how the host keeps the other players' copies of the game in step: the stream of
// commands and checksums, full copies only when needed, cutting big messages into parts, and the
// awkward cases (late messages, drift, falling behind, joining mid-wave, speed changes).
// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { HostSession, ClientSession, checksum } from '../src/net/session.js';
import { memoryPair, splitMessage, createJoiner, utf8Length, MAX_MESSAGE, OWN_RELAY, ICE_SERVERS, relayProblem } from '../src/net/transports.js';
import { RELAY } from '../src/net/relay.js';
import { createDirector } from '../src/content/director.js';
import { applyDemoLayout, createGame, addPlayer, TICK_HZ, TUNE } from '../src/sim/index.js';

const TICK_MS = 1000 / TICK_HZ;
const same = (a, b) => JSON.stringify(a.state) === JSON.stringify(b.state);

/** A host, and clients joined to it through the in-memory transport. */
function game({ names = ['Steve'], seed = 5, map = null, prepare = null, director = null } = {}) {
  const host = new HostSession({ name: 'Dave', seed, map, director });
  if (prepare) prepare(host.state);
  const links = names.map((name) => {
    const [a, b] = memoryPair();
    host.accept(a);
    return { conn: a, client: new ClientSession(b, name) };
  });
  return { host, clients: links.map((l) => l.client), conns: links.map((l) => l.conn) };
}

/** Runs the host and clients together in pretend time; `each(i)` is called before every tick. */
function run(host, clients, seconds, from = 0, each = null) {
  let now = from;
  const n = Math.round(seconds * TICK_HZ);
  for (let i = 1; i <= n; i++) {
    now = from + i * TICK_MS;
    if (each) each(i, now);
    host.update(now);
    for (const c of clients) c.update(now);
  }
  return now;
}

/** Has the host send everything so far, and lets each client play up to it. */
function settle(host, clients, now) {
  host._advance();
  for (const c of clients) {
    let t = now;
    for (let i = 0; i < 4000 && c._n < host._n; i++) c.update(t += TICK_MS);
  }
}

/** A wave in progress on the original small map, with the ready-made layout. */
const demo = (s) => { applyDemoLayout(s, 0); };

// ---------------------------------------------------------------- how much is sent

/**
 * Bytes of JSON the host sent to each client in the busy game below, measured with the old
 * scheme (the whole state up to five times a second) before it was replaced: about 130 KB a
 * second per client.
 */
const OLD_BYTES = { Steve: 3897882, Gaz: 3897564 };

test('a busy game sends each client at least ten times less than the old scheme, and everyone ends in step', () => {
  // Wave 11 on a medium map (not 10: a boss wave has a smaller crowd); three players; a maze of crates and two rows of towers built
  // through commands during the first seconds; then 30 seconds of play.
  const { host, clients, conns } = game({
    names: ['Steve', 'Gaz'], seed: 11, map: { design: 'warehouse', size: 'm' },
    prepare: (s) => { s.wave = 10; s.players[0].cash = 6000; },
  });
  const [steve, gaz] = clients;
  const st = host.state;
  const jobs = [];
  for (const [wx, gapTop] of [[12, true], [20, false], [28, true], [36, false]]) {
    for (let y = 1; y < st.h - 1; y++) {
      if (gapTop ? y <= 3 : y >= st.h - 4) continue;
      jobs.push([host, { c: 'place', k: 'crate', x: wx, y }]);
    }
  }
  for (let x = 8; x < 40; x += 4) {
    jobs.push([steve, { c: 'place', k: 'sprinkler', x: x + 2, y: 6 }]);
    jobs.push([gaz, { c: 'place', k: 'forklift', x: x + 2, y: st.h - 7 }]);
  }
  const start = conns.map((c) => c.sent);
  let j = 0;
  const now = run(host, clients, 30, 0, (i) => {
    // Two commands a tick until the plan is done, then the doors open.
    for (let n = 0; n < 2 && j < jobs.length; n++, j++) jobs[j][0].send(jobs[j][1]);
    if (i === 90) host.send({ c: 'start' });
    // Now and then someone upgrades a tower mid-wave.
    if (i > 90 && i % 60 === 0) steve.send({ c: 'upgrade', x: 10 + ((i / 60) % 8) * 4, y: 6 });
  });
  const sent = conns.map((c, k) => c.sent - start[k]);
  assert.equal(st.wave, 11);
  // (Over 150 until 0.2.09 halved the crowd; the old scheme's bytes were measured with the bigger one.)
  assert.ok(st.shoppers.length > 100, `a big crowd (${st.shoppers.length})`);
  assert.ok(st.grid.filter(Boolean).length > 60, 'plenty was built');
  for (const [k, name] of ['Steve', 'Gaz'].entries()) {
    const ratio = OLD_BYTES[name] / sent[k];
    console.log(`  ${name}: ${sent[k]} bytes in 30 s (${Math.round(sent[k] / 30)} a second); before: ${OLD_BYTES[name]} (${Math.round(OLD_BYTES[name] / 30)} a second); ${ratio.toFixed(1)} times less`);
    assert.ok(sent[k] * 10 <= OLD_BYTES[name], `${name}: ${sent[k]} bytes is not ten times less than ${OLD_BYTES[name]}`);
  }
  settle(host, clients, now);
  assert.ok(same(steve, host) && same(gaz, host), 'both copies match the host exactly');
  assert.equal(steve.stats.mismatches + gaz.stats.mismatches, 0, 'and never drifted on the way');
  assert.ok(steve.stats.checks > 250, 'checked about ten times a second');
});

// ---------------------------------------------------------------- the awkward cases

test('a command that arrives between ticks takes effect at the same moment on every copy', () => {
  const { host, clients } = game({ names: ['Steve', 'Gaz'], prepare: demo });
  const [steve, gaz] = clients;
  host.send({ c: 'start' });
  let now = run(host, clients, 8);
  assert.ok(host.state.shoppers.length > 3, 'shoppers are walking, so timing matters');
  // Half a tick after the last update, Steve drops a crate in the shoppers' way.
  host.update(now + TICK_MS / 2);
  const tile = [[12, 7], [12, 8], [13, 6], [13, 9]].find(([x, y]) => host.state.grid[y * 30 + x] === 0 && !host.state.shoppers.some((s) => (s.x | 0) === x && (s.y | 0) === y));
  steve.send({ c: 'place', k: 'crate', x: tile[0], y: tile[1] });
  const placedAt = host._n;
  assert.equal(host.state.grid[tile[1] * 30 + tile[0]].k, 'crate');
  now = run(host, clients, 5, now + TICK_MS / 2);
  settle(host, clients, now);
  assert.ok(same(steve, host) && same(gaz, host));
  assert.equal(steve.stats.mismatches + gaz.stats.mismatches, 0);
  assert.ok(placedAt > 0);
});

test('several commands in one tick from different players, one of them refused, play out the same everywhere', () => {
  const { host, clients } = game({ names: ['Steve', 'Gaz'], map: { design: 'warehouse', size: 'm' } });
  const [steve, gaz] = clients;
  const nopes = [];
  gaz.on('nope', (m) => nopes.push(m.why));
  host.send({ c: 'place', k: 'crate', x: 5, y: 5 });
  steve.send({ c: 'place', k: 'sprinkler', x: 8, y: 8 });
  gaz.send({ c: 'place', k: 'forklift', x: 8, y: 8 }); // too late: Steve got there first
  gaz.send({ c: 'place', k: 'forklift', x: 9, y: 8 });
  steve.send({ c: 'upgrade', x: 8, y: 8 });
  host.send({ c: 'start' });
  const now = run(host, clients, 3);
  settle(host, clients, now);
  assert.deepEqual(nopes, ['occupied']);
  const w = host.state.w;
  for (const c of [steve, gaz]) {
    assert.equal(c.state.grid[8 * w + 8].k, 'sprinkler');
    assert.equal(c.state.grid[8 * w + 8].o, 1);
    assert.equal(c.state.grid[8 * w + 8].u.dmg, 1);
    assert.equal(c.state.grid[8 * w + 9].o, 2);
    assert.equal(c.state.phase, 'wave');
    assert.ok(same(c, host));
  }
});

test('a client whose copy drifts is noticed at once and given a fresh copy; the others are left alone', () => {
  const { host, clients } = game({ names: ['Steve', 'Gaz'], prepare: demo });
  const [steve, gaz] = clients;
  host.send({ c: 'start' });
  let now = run(host, clients, 3); // (the routine copy every ten seconds is not due in this test)
  const gazCopies = gaz.stats.copies, steveCopies = steve.stats.copies;
  // Something knocks Steve's copy off: a shopper a fraction of a tile out, and some cash.
  assert.ok(steve.state.shoppers.length > 0);
  steve.state.shoppers[0].x += 0.3;
  steve.state.players[1].cash += 7;
  now = run(host, clients, 1, now);
  assert.equal(steve.stats.mismatches, 1, 'spotted within a second');
  assert.equal(steve.stats.copies, steveCopies + 1, 'and sent a fresh copy');
  now = run(host, clients, 3, now);
  settle(host, clients, now);
  assert.ok(same(steve, host), 'and repaired');
  assert.equal(steve.stats.mismatches, 1, 'for good');
  assert.equal(gaz.stats.copies, gazCopies, 'Gaz was not sent anything extra');
  assert.ok(same(gaz, host));
});

test('drift the checksum cannot see is repaired by the routine copy within ten seconds', () => {
  const { host, clients } = game({ prepare: demo });
  const [steve] = clients;
  host.send({ c: 'start' });
  let now = run(host, clients, 2);
  steve.state.ws.stolen = 999; // a statistic for the end-of-wave review: not in the checksum
  now = run(host, clients, 11, now);
  assert.equal(steve.stats.mismatches, 0);
  assert.notEqual(steve.state.ws.stolen, 999);
  settle(host, clients, now);
  assert.ok(same(steve, host));
  assert.equal(steve.stats.jumps, 0, 'the routine copy fitted in without a jump');
});

test('a player joining mid-wave gets a copy, and the player already there carries on without a jump', () => {
  const { host, clients } = game({ map: { design: 'warehouse', size: 'm' } });
  const [steve] = clients;
  host.send({ c: 'start' });
  let now = run(host, clients, 6);
  assert.equal(host.state.phase, 'wave');
  const [a, b] = memoryPair();
  host.accept(a);
  const gaz = new ClientSession(b, 'Gaz');
  assert.equal(gaz.state.phase, 'wave');
  now = run(host, [steve, gaz], 5, now);
  settle(host, [steve, gaz], now);
  assert.ok(same(steve, host) && same(gaz, host));
  assert.equal(steve.state.players.length, 3);
  assert.equal(steve.stats.jumps, 0);
  assert.equal(steve.stats.mismatches + gaz.stats.mismatches, 0);
});

test('when the host changes speed, clients follow at the new pace with about the same number of messages', () => {
  const { host, clients, conns } = game({ prepare: demo });
  const [steve] = clients;
  const kinds = [];
  const send = conns[0].send;
  conns[0].send = (o) => { kinds.push(o.t); send(o); };
  host.send({ c: 'start' });
  let now = run(host, clients, 2);
  const advsAt1 = kinds.filter((t) => t === 'adv').length;
  host.send({ c: 'speed', n: 3 });
  kinds.length = 0;
  const t0 = host.state.tick;
  let most = 0;
  now = run(host, clients, 2, now, () => { most = Math.max(most, host.state.tick - steve.state.tick); });
  assert.ok(host.state.tick - t0 > 170, 'three times as many ticks');
  const advsAt3 = kinds.filter((t) => t === 'adv').length;
  assert.ok(advsAt3 <= advsAt1 + 5 && advsAt1 >= 50 && advsAt1 <= 62, `still about thirty messages a second (${advsAt1} then ${advsAt3} in two seconds)`);
  assert.equal(steve.state.speed, 3);
  assert.ok(most <= 40, `the client keeps up (at most ${most} ticks behind, about a third of a second)`);
  host.send({ c: 'speed', n: 1 });
  now = run(host, clients, 1, now);
  settle(host, clients, now);
  assert.ok(same(steve, host));
  assert.equal(steve.stats.mismatches, 0);
});

test('fastForward on the host makes clients skip straight to the result', () => {
  const { host, clients } = game({ names: ['Steve', 'Gaz'], prepare: demo });
  host.send({ c: 'start' });
  let now = run(host, clients, 1);
  host.fastForward(20 * TICK_HZ);
  now = run(host, clients, 0.2, now);
  settle(host, clients, now);
  for (const c of clients) {
    assert.ok(same(c, host));
    assert.equal(c.stats.jumps, 1);
  }
});

test('a client that falls behind catches up: a little by running faster, a lot by skipping to a fresh copy', () => {
  const { host, clients, conns } = game({ prepare: demo });
  const [steve] = clients;
  host.send({ c: 'start' });
  let now = run(host, clients, 2);
  const caughtUp = (seconds) => {
    let caught = -1;
    now = run(host, clients, seconds, now, (i) => { if (caught < 0 && host._n - steve._n <= 10) caught = i; });
    return caught;
  };

  // The link holds everything back for most of a second, then delivers it all at once. He keeps
  // running his copy as usual meanwhile, so he is now well behind and must run faster for a bit.
  const held = [];
  const send = conns[0].send;
  conns[0].send = (o) => held.push(JSON.parse(JSON.stringify(o)));
  now = run(host, clients, 0.9, now);
  conns[0].send = send;
  for (const o of held) send(o);
  assert.ok(host._n - steve._n > 20);
  let caught = caughtUp(4);
  assert.ok(caught > 0 && caught < 3 * TICK_HZ, `caught up within three seconds (${caught} ticks)`);
  assert.equal(steve.stats.jumps, 0, 'without skipping anything');

  // His browser stalls for two seconds (the host carries on), then runs again: he plays the
  // missed time straight away.
  for (let i = 1; i <= 2 * TICK_HZ; i++) host.update(now + i * TICK_MS);
  now += 2 * TICK_HZ * TICK_MS;
  assert.ok(host._n - steve._n > 50);
  caught = caughtUp(4);
  assert.ok(caught > 0 && caught < TICK_HZ, `caught up within a second (${caught} ticks)`);
  assert.equal(steve.stats.jumps, 0, 'still without skipping anything');

  // Now his tab is hidden for twenty seconds.
  for (let i = 1; i <= 20 * TICK_HZ; i++) host.update(now + i * TICK_MS);
  now += 20 * TICK_HZ * TICK_MS;
  caught = caughtUp(3);
  assert.ok(caught > 0 && caught < TICK_HZ, `back in step within a second (${caught} ticks)`);
  assert.ok(steve.stats.jumps >= 1, 'by skipping to a fresh copy');
  settle(host, clients, now);
  assert.ok(same(steve, host));
});

test('messages that arrive late and in bursts still leave every copy in step, and a client never runs ahead', () => {
  const { host, clients, conns } = game({ names: ['Steve', 'Gaz'], prepare: demo });
  // Hold back everything the host sends to Steve and let it through in uneven bursts.
  const held = [];
  const send = conns[0].send;
  conns[0].send = (o) => held.push(JSON.parse(JSON.stringify(o))); // as it was when sent
  let r = 12345;
  const roll = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296);
  host.send({ c: 'start' });
  let ahead = 0;
  const now = run(host, clients, 30, 0, (i) => {
    if (roll() < 0.12) for (const o of held.splice(0)) send(o);
    if (i % 200 === 0) clients[1].send({ c: 'place', k: 'crate', x: 3 + ((i / 200) % 5), y: 2 });
    ahead = Math.max(ahead, clients[0].state.tick - host.state.tick);
  });
  for (const o of held.splice(0)) send(o);
  conns[0].send = send;
  assert.equal(ahead, 0);
  settle(host, clients, now);
  for (const c of clients) assert.ok(same(c, host));
  assert.equal(clients[0].stats.mismatches, 0);
});

test('game messages reach a client when his own copy gets to that moment', () => {
  const { host, clients } = game({ prepare: demo, director: createDirector() });
  const [steve] = clients;
  const phaseAtReport = [];
  steve.on('report', () => phaseAtReport.push(steve.state.phase));
  const hostSaid = [], steveSaid = [];
  host.on('say', (m) => hostSaid.push(m.text));
  steve.on('say', (m) => steveSaid.push(m.text));
  host.send({ c: 'start' });
  let now = 0;
  for (let k = 0; k < 120 && !phaseAtReport.length; k++) now = run(host, clients, 1, now);
  assert.deepEqual(phaseAtReport, ['build'], 'the review appears as the wave is seen to end');
  settle(host, clients, now);
  assert.deepEqual(steveSaid, hostSaid);
});

test('when the host goes, a client plays everything it was sent, so a successor starts from the freshest copy', () => {
  const { host, clients, conns } = game({ prepare: demo });
  const [steve] = clients;
  host.send({ c: 'start' });
  run(host, clients, 3);
  host._advance();
  assert.ok(steve._n < host._n, 'he was a moment behind');
  let closed = false;
  steve.on('closed', () => { closed = same(steve, host); });
  conns[0].close();
  assert.ok(closed, 'and caught up before being told');
});

test('the checksum notices small changes and ignores nothing that matters', () => {
  const s = createGame({ seed: 3 });
  addPlayer(s, 'Dave');
  applyDemoLayout(s, 0);
  const base = checksum(s);
  const tweaks = [
    (x) => { x.tick++; }, (x) => { x.rng++; }, (x) => { x.players[0].cash += 0.1; },
    (x) => { x.refunds++; }, (x) => { x.gridVer++; }, (x) => { x.grid[x.grid.findIndex(Boolean)].cd = 5; },
  ];
  for (const t of tweaks) {
    const c = JSON.parse(JSON.stringify(s));
    t(c);
    assert.notEqual(checksum(c), base, String(t));
  }
  assert.equal(checksum(JSON.parse(JSON.stringify(s))), base, 'a copy has the same checksum');
});

// ---------------------------------------------------------------- big messages

test('a big message is cut into parts that each fit, and put back together exactly', () => {
  const text = JSON.stringify({
    t: 'snap',
    s: { quotes: '"\\"'.repeat(30000), words: 'café señor 漢字 '.repeat(4000), emoji: '😀🍆'.repeat(3000), n: [1, 2.5, -3] },
  });
  assert.ok(utf8Length(text) > 200000);
  for (const max of [MAX_MESSAGE, 15 * 1024, 2000]) {
    const parts = splitMessage(text, 7, max);
    assert.ok(parts.length > 1);
    for (const p of parts) assert.ok(utf8Length(JSON.stringify(p)) <= max, `a part of ${utf8Length(JSON.stringify(p))} bytes exceeds ${max}`);
    const join = createJoiner();
    // Parts arriving out of order, one twice, with an ordinary message in between.
    const order = parts.map((p, i) => i).reverse();
    let out;
    assert.deepEqual(join.take({ t: 'adv', n: 3 }), { t: 'adv', n: 3 }, 'ordinary messages pass straight through');
    for (const i of order) {
      const got = join.take(JSON.parse(JSON.stringify(parts[i])));
      if (i !== order[order.length - 1]) assert.equal(got, undefined);
      else out = got;
      if (i === order[0]) assert.equal(join.take(parts[i]), undefined, 'a repeated part changes nothing');
    }
    assert.equal(JSON.stringify(out), text);
  }
  assert.equal(utf8Length('aé漢😀'), 1 + 2 + 3 + 4);
});

test('the in-memory transport cuts up a big state and delivers it whole and in order', () => {
  const [a, b] = memoryPair(4000);
  const got = [];
  b.onmessage = (m) => got.push(m);
  const host = new HostSession({ name: 'Dave', seed: 2, map: { design: 'warehouse', size: 'xl' } });
  const big = { t: 'snap', n: 1, s: host.state };
  a.send({ t: 'first' });
  a.send(big);
  a.send({ t: 'last' });
  assert.equal(got.length, 3);
  assert.equal(got[0].t, 'first');
  assert.equal(JSON.stringify(got[1]), JSON.stringify(big));
  assert.equal(got[2].t, 'last');
  assert.ok(a.sent > JSON.stringify(big).length, 'counted, envelopes and all');

  // A whole game played over a transport that only carries small messages.
  const h = new HostSession({ name: 'Dave', seed: 4, map: { design: 'warehouse', size: 'l' } });
  const [x, y] = memoryPair(3000);
  h.accept(x);
  const c = new ClientSession(y, 'Steve');
  h.send({ c: 'start' });
  const now = run(h, [c], 10);
  settle(h, [c], now);
  assert.ok(same(c, h));
});

// ---------------------------------------------------------------- resuming a saved game

test('resuming a saved game: everyone is away with his money safe, and gets it back by name whenever he returns', () => {
  const host = new HostSession({ name: 'Dave', seed: 6, map: { design: 'warehouse', size: 's' } });
  const [a, b] = memoryPair();
  host.accept(a);
  const steve = new ClientSession(b, 'Steve');
  host.send({ c: 'place', k: 'sprinkler', x: 4, y: 4 });
  host.send({ c: 'start' });
  run(host, [steve], 5);
  // Gaz had dropped out just before the save, so his grace period was running.
  host.state.players.push({ ...JSON.parse(JSON.stringify(host.state.players[1])), id: 2, name: 'Gaz', on: false, gone: host.state.tick - 10, cash: 77 });
  host.state.players[1].cash = 321;
  const saved = JSON.parse(JSON.stringify(host.state));

  // Picked up again later by Steve, of all people.
  const again = new HostSession({ name: 'Steve', state: JSON.parse(JSON.stringify(saved)), resume: true });
  assert.equal(again.me, 1, 'seated by name');
  assert.equal(again.state.host, 1, 'and he is the host now');
  assert.deepEqual(again.state.players.map((p) => p.on), [false, true, false]);
  assert.ok(again.state.players.every((p) => p.gone === undefined), 'no grace period is running for anyone');
  const cash = again.state.players.map((p) => p.cash);
  assert.equal(cash[1], 321);
  assert.equal(cash[2], 77);
  again.state.refundLimit = 1e9;
  again.fastForward(TUNE.graceSecs * 3 * TICK_HZ);
  assert.equal(again.state.players[0].cash, cash[0], 'Dave\'s money is still his, however long he takes');
  assert.equal(again.state.players[2].cash, 77);
  const [c, d] = memoryPair();
  again.accept(c);
  const dave = new ClientSession(d, 'Dave');
  assert.equal(dave.me, 0);
  assert.equal(dave.state.players[0].cash, cash[0]);
  assert.equal(again.state.players.length, 3, 'nobody was added twice');

  // Resuming as the player who saved it is the same, from his own seat.
  const mine = new HostSession({ name: 'Dave', state: JSON.parse(JSON.stringify(saved)), resume: true });
  assert.equal(mine.me, 0);
  assert.equal(mine.state.host, 0);
  assert.deepEqual(mine.state.players.map((p) => p.on), [true, false, false]);
});

test('on a take-over, a player who had already dropped out keeps his original grace period', () => {
  const { host, clients } = game({ names: ['Steve', 'Gaz'], map: { design: 'warehouse', size: 's' } });
  const [steve, gaz] = clients;
  host.send({ c: 'start' });
  let now = run(host, clients, 2);
  gaz.conn.close(); // Gaz drops
  now = run(host, [steve], 30, now);
  settle(host, [steve], now);
  const gone = steve.state.players[2].gone;
  assert.ok(gone > 0);
  const next = new HostSession({ name: 'Steve', state: JSON.parse(JSON.stringify(steve.state)), takeOver: true });
  assert.equal(next.state.players[2].gone, gone, 'his clock was not restarted');
  assert.equal(next.state.players[0].gone, 0, 'the old host\'s starts now');
  assert.equal(next.state.players[1].gone, undefined, 'and the new host is here');
});

// ---------------------------------------------------------------- the owner's relay

test('the owner\'s relay is used when it is filled in, and nothing changes when it is not', () => {
  if (relayProblem(RELAY)) assert.equal(OWN_RELAY, null);
  else assert.ok(OWN_RELAY && ICE_SERVERS[0] === OWN_RELAY, 'tried first');
  assert.ok(ICE_SERVERS.some((s) => [].concat(s.urls).some((u) => u.startsWith('stun:'))));
  // A half-filled relay is left out: browsers refuse a relay without a user name and password,
  // and would refuse every other server along with it.
  assert.equal(relayProblem({ urls: [], username: '', credential: '' }), 'empty');
  assert.match(relayProblem({ urls: ['turn:a.example:80'], username: '', credential: 'x' }), /user name/);
  assert.match(relayProblem({ urls: ['turn:a.example:80'], username: 'u', credential: ' ' }), /password/);
  assert.match(relayProblem({ urls: ['stun:a.example:80'], username: 'u', credential: 'p' }), /turn:/);
  assert.match(relayProblem({ urls: [], username: 'u', credential: 'p' }), /addresses/);
  assert.equal(relayProblem({ urls: 'turns:a.example:443?transport=tcp', username: 'u', credential: 'p' }), null);
  assert.equal(relayProblem({ urls: ['turn:a.example:80', 'turns:a.example:443'], username: 'u', credential: 'p' }), null);
});
