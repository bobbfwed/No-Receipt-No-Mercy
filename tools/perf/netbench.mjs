// Network side of the stutter investigation (2026-11-26).
//
// Part 1 (--sizes): for each saved state, how big a full copy is, how long JSON.stringify and
// JSON.parse take, how many parts it is cut into at the internet limit (15 KB), and what the host
// and the client do with it, step by step, as transports.js and PeerJS do it.
//
// Part 2 (default): a host and a client session (the real HostSession / ClientSession) joined by a
// pretend internet link, run in pretend time: one-way delay, jitter, bandwidth, lost packets (on
// the reliable, ordered channel PeerJS uses, a lost packet holds up everything sent after it until
// it is sent again), and a client whose device is slower than this computer (its simulation steps
// cost `--slow` times what they cost here, and each frame it also spends `--render` ms drawing,
// growing with the crowd). The scripted team (teambot.mjs) plays both players: player 0 on the
// host, player 1's commands go over the link. Reports what the client sees: how far behind it runs,
// how often the picture stands still (no step for over two steps' time), bursts of several steps in one frame (the picture
// jumps), full copies and why they were sent, checksum mismatches, bytes a second by message type.
//
// Usage:
//   node tools/perf/netbench.mjs --sizes [--states=e08,e11,e13,e16,e20]
//   node tools/perf/netbench.mjs [--from=e11|new] [--secs=300] [--speed=1] [--link=ideal|home|mobile|bad]
//        [--slow=1] [--render=0] [--renderPer=0] [--ulp=0] [--seed=11] [--json=file]
//   --from=new plays a whole game from the start (--secs is then a cap; default: to event 22)
//   --render=MS --renderPer=MS: the client spends MS + renderPer x shoppers ms drawing each frame
//   --ulp=1     the client's Math.hypot differs from the host's in the last bit for some inputs,
//               standing in for a phone whose JavaScript engine is not the PC's (Safari's on an iPhone)
import { readFileSync, writeFileSync } from 'node:fs';
// --session=<file URL of a session.js>: measure another version of the sessions (the code before a
// change, kept elsewhere with its import pointed at this tree's src/sim/index.js).
const sessionUrl = (process.argv.find((x) => x.startsWith('--session=')) || '').slice(10) || '../../src/net/session.js';
const { HostSession, ClientSession, checksum } = await import(sessionUrl);
import { splitMessage, createJoiner } from '../../src/net/transports.js';
import { createGame, TICK_HZ, TUNE } from '../../src/sim/index.js';
import { createDirector } from '../../src/content/director.js';
import { createTeamBot } from './teambot.mjs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const has = (k) => process.argv.includes(`--${k}`);
const dir = arg('dir', 'tools/perf/out/states');
const PEER_MAX = 15 * 1024;
const hr = () => Number(process.hrtime.bigint()) / 1e6;
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r2 = (v) => +(+v).toFixed(2);

if (has('sizes')) sizes(); else await simulate();

// ---------------------------------------------------------------------------------------- part 1
function sizes() {
  const rows = [];
  for (const name of arg('states', 'e08,e11,e13,e16,e20').split(',')) {
    const raw = readFileSync(`${dir}/${name}.json`, 'utf8');
    const state = JSON.parse(raw);
    const msg = { t: 'snap', n: 123456, s: state };
    const T = (fn, n = 30) => { const t = []; for (let i = 0; i < n; i++) { const a = hr(); fn(); t.push(hr() - a); } return median(t); };
    const text = JSON.stringify(msg);
    // Host: transports.js makeConn.send: stringify, cut up (splitMessage re-stringifies each piece
    // until it fits), stringify each part; PeerJS's JSON channel stringifies each part once more.
    const stringify = T(() => JSON.stringify(msg));
    const split = T(() => splitMessage(text, 1, PEER_MAX));
    const parts = splitMessage(text, 1, PEER_MAX);
    const partTexts = parts.map((p) => JSON.stringify(p));
    const partsBytes = partTexts.reduce((a, t) => a + t.length, 0);
    const hostAll = T(() => { const t = JSON.stringify(msg); for (const p of splitMessage(t, 1, PEER_MAX)) { const pt = JSON.stringify(p); JSON.stringify(JSON.parse(pt)); } });
    // Client: PeerJS parses each part, the joiner joins them and parses the whole.
    const clientAll = T(() => { const j = createJoiner(); let out; for (const pt of partTexts) out = j.take(JSON.parse(pt)); if (!out) throw new Error('join'); });
    const parse = T(() => JSON.parse(text));
    const sum = T(() => checksum(state), 200);
    const big = Object.entries(state).map(([k, v]) => [k, JSON.stringify(v)?.length || 0]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${(v / 1024).toFixed(1)}K`).join(', ');
    rows.push({ state: name, shoppers: state.shoppers.length, buildings: state.grid.filter((b) => b && b.part === undefined).length,
      kb: r2(text.length / 1024), parts: parts.length, wireKb: r2(partsBytes / 1024), stringifyMs: r2(stringify), splitMs: r2(split),
      hostSendAllMs: r2(hostAll), parseMs: r2(parse), clientReceiveAllMs: r2(clientAll), checksumMs: +sum.toFixed(4), biggest: big });
  }
  console.table(rows);
  if (arg('json', '')) writeFileSync(arg('json'), JSON.stringify(rows, null, 1));
}

// ---------------------------------------------------------------------------------------- part 2
async function simulate() {
  const LINKS = {
    ideal: { delay: 0, jitter: 0, mbps: 1000, loss: 0 },
    home: { delay: 30, jitter: 15, mbps: 20, loss: 0 }, // two home broadband connections, same region
    mobile: { delay: 50, jitter: 40, mbps: 4, loss: 0.01 }, // a phone on 4G or busy wifi
    bad: { delay: 70, jitter: 80, mbps: 1.5, loss: 0.03 }, // a poor mobile signal
  };
  const link = { ...LINKS[arg('link', 'home')] };
  for (const k of ['delay', 'jitter', 'mbps', 'loss']) if (arg(k, null) !== null) link[k] = Number(arg(k));
  const RTO = Number(arg('rto', 250)); // ms before a lost packet is sent again (SCTP's minimum is about 200-1000)
  const speed = Number(arg('speed', 1));
  const slow = Number(arg('slow', 1));
  const render = Number(arg('render', 0)), renderPer = Number(arg('renderPer', 0));
  const ulp = arg('ulp', '0') === '1';
  const from = arg('from', 'e11');
  const secs = Number(arg('secs', from === 'new' ? 4 * 3600 : 300));
  const until = Number(arg('until', 22));
  const seed = Number(arg('seed', 11));

  // A seeded random for the link, so runs repeat.
  let rs = seed * 7919 + 17;
  const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);

  // --- pretend time and events
  let now = 0;
  const heap = [];
  let seq = 0;
  const at = (t, fn) => {
    heap.push({ t, s: seq++, fn });
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p].t < heap[i].t || (heap[p].t === heap[i].t && heap[p].s < heap[i].s)) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        const less = (a, b) => heap[a].t < heap[b].t || (heap[a].t === heap[b].t && heap[a].s < heap[b].s);
        if (l < heap.length && less(l, m)) m = l;
        if (r < heap.length && less(r, m)) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  // --- the link: each direction is a reliable, ordered channel with a bandwidth queue
  const bytes = { adv: 0, snap: 0, welcome: 0, at: 0, other: 0, up: 0 };
  const counts = { adv: 0, snapParts: 0, snaps: 0, lost: 0 };
  function channel(deliver, up) {
    let free = 0, last = 0;
    return (text, type) => {
      const size = text.length + 48; // + headers (IP, UDP, DTLS, SCTP)
      const tx = (size * 8) / (link.mbps * 1000); // ms
      free = Math.max(free, now) + tx;
      let t = free + link.delay + (link.jitter ? rnd() * link.jitter : 0);
      // A lost packet is sent again after RTO; on an ordered channel everything behind it waits.
      const packets = Math.ceil(size / 1200);
      for (let p = 0; p < packets; p++) if (link.loss && rnd() < link.loss) { t += RTO; counts.lost++; }
      t = Math.max(t, last);
      last = t;
      if (up) bytes.up += size; else bytes[type in bytes ? type : 'other'] += size;
      at(t, () => deliver(text));
    };
  }
  function makeEnd(max) {
    let handler = null;
    const pending = [];
    const joiner = createJoiner();
    let nextId = 1;
    let out = null;
    const conn = {
      open: true, onclose: null,
      send(obj) {
        if (!conn.open) return;
        const text = JSON.stringify(obj);
        const type = obj.t === 'snap' ? 'snap' : obj.t === 'welcome' ? 'welcome' : obj.t === 'adv' ? 'adv' : obj.t === 'at' ? 'at' : 'other';
        if (obj.t === 'snap') counts.snaps++;
        if (obj.t === 'adv') counts.adv++;
        if (text.length <= max) { out(text, type); return; }
        for (const part of splitMessage(text, nextId++, max)) { out(JSON.stringify(part), type); if (type === 'snap') counts.snapParts++; }
      },
      close() { conn.open = false; },
      get onmessage() { return handler; },
      set onmessage(fn) { handler = fn; while (fn && pending.length) fn(pending.shift()); },
      _receive(text) {
        const obj = joiner.take(JSON.parse(text));
        if (obj === undefined) return;
        if (handler) handler(obj); else pending.push(obj);
      },
      set _out(fn) { out = fn; },
    };
    return conn;
  }
  const hostEnd = makeEnd(PEER_MAX), clientEnd = makeEnd(PEER_MAX);
  hostEnd._out = channel((t) => clientEnd._receive(t), false);
  clientEnd._out = channel((t) => hostEnd._receive(t), true);

  // --- the game
  let host;
  if (from === 'new') {
    // A new game from the menu: the host is player 0, the client joins as player 1; cards dealt.
    const state = createGame({ seed, map: { design: 'warehouse', size: 'm' }, settings: { waves: 30 }, cards: true });
    host = new HostSession({ name: 'Bobb', state, director: createDirector(rand(seed)) });
  } else {
    // A saved two-player game picked up again: both get their places back by name.
    const state = JSON.parse(readFileSync(`${dir}/${from}.json`, 'utf8'));
    host = new HostSession({ name: 'Bobb', state, resume: true, director: createDirector(rand(seed)) });
  }
  host.state.speed = speed;
  // Keep the bots in the game to the late events: the crowd matters here, not the result. Set
  // before the client joins (and in TUNE, which a join reads), so both copies agree: changing the
  // host's state by hand later would itself put the client out of step.
  TUNE.refundLimit = 100000;
  host.state.refundLimit = 100000;
  // Why each full copy was sent.
  const causes = { join: 0, routine: 0, asked: 0, leave: 0 };
  const origCopy = host._copy.bind(host);
  let inDue = false;
  host._copy = (conns = null, jump = false) => { causes[inDue ? (conns ? 'asked' : 'routine') : 'join']++; return origCopy(conns, jump); };
  const origDue = host._sendDue.bind(host);
  host._sendDue = () => { inDue = true; try { origDue(); } finally { inDue = false; } };
  host.accept(hostEnd);
  const client = new ClientSession(clientEnd, 'Tusker');
  // --diff=1: on the first few checksum mismatches, print what differs between the client's copy
  // and the host's state at that same step (the host's is kept for every advance message).
  const diffs = [];
  if (arg('diff', '0') === '1') {
    const kept = new Map();
    const origAdv = host._advance.bind(host);
    host._advance = () => { const n = host._n; origAdv(); kept.set(n, JSON.stringify(host.state)); if (kept.size > 400) kept.delete(kept.keys().next().value); };
    const origCheck = client._check.bind(client);
    client._check = (m) => {
      const before = client.stats.mismatches;
      origCheck(m);
      if (client.stats.mismatches > before && diffs.length < 5 && kept.has(m.n)) diffs.push(diffStates(JSON.parse(kept.get(m.n)), JSON.parse(JSON.stringify(client.state)), m.n));
    };
  }

  // The client's Math.hypot, nudged in the last bit for some inputs (see --ulp).
  const realHypot = Math.hypot;
  const buf = new Float64Array(1), bits = new BigUint64Array(buf.buffer);
  // (--ulpScale=1e-9 nudges by that share instead of one bit: a check that the probe is wired in.)
  const scale = Number(arg('ulpScale', 0));
  const nudged = (a, b) => { const v = realHypot(a, b); buf[0] = v; if ((bits[0] & 7n) === 3n) { if (scale) return v * (1 + scale); bits[0] ^= 1n; } return buf[0]; };
  const onClient = (fn) => { if (!ulp) return fn(); Math.hypot = nudged; try { return fn(); } finally { Math.hypot = realHypot; } };

  const bot = createTeamBot(() => host.state, (pid, cmd) => (pid === host.me ? host.send(cmd) : client.state ? client.send(cmd) : undefined));

  // --- timers
  // How often the host's timer runs (16 ms; a hidden tab's timers run about once a second: --hostEvery=1000).
  const HOST_EVERY = Number(arg('hostEvery', 16));
  const lags = [], starvedMs = [], bursts = [], costs = [];
  let starved = 0, lastStepAt = -1, longestStarve = 0, frames = 0, burstFrames = 0, maxSteps = 0, behindAsks = 0;
  let lastShop = -1;
  const log = [];
  function hostTick() {
    host.update(now);
    const s = host.state;
    if (s.phase === 'cards') { for (const p of s.players) if (p.on && !p.skip) (p.id === host.me ? host.send({ c: 'skipCards', on: true }) : client.state && client.send({ c: 'skipCards', on: true })); }
    else if (s.phase === 'build' || s.phase === 'wave') {
      const k = Math.floor(s.tick / 15);
      if (k !== lastShop) {
        lastShop = k;
        // (Auto-rebuild is not switched on here; the bot rebuilds.)
        bot.shop();
        if (s.phase === 'build' && s.phaseT === -1 && bot.stats.bought > 0) host.send({ c: 'start' });
      }
      if (s.phase === 'won') host.send({ c: 'endless' });
    }
    at(now + HOST_EVERY, hostTick);
  }
  const tickMs = 1000 / TICK_HZ;
  function clientTick() {
    const n0 = client._n, copies0 = client.stats.copies;
    const a = hr();
    onClient(() => client.update(now));
    const steps = client._n - n0;
    // The client's processor time for this update: by default a model fitted to
    // tools/perf/simbench.mjs on this computer (0.08 ms + 0.0016 ms a shopper per step, 0.3 ms to
    // take on a full copy), times --slow, so this busy computer's own hiccups do not count;
    // --measured=1 uses the real time taken instead.
    const adopted = client.stats.copies - copies0;
    const work = arg('measured', '0') === '1' ? (hr() - a) * slow
      : ((client.state ? steps * (0.08 + 0.0016 * client.state.shoppers.length) : 0) + adopted * 0.3) * slow;
    const draw = client.state ? render + renderPer * client.state.shoppers.length : 0;
    const cost = Math.max(1000 / 60, work + draw);
    frames++;
    costs.push(cost);
    if (client.state) {
      const behind = host._n - client._n;
      lags.push(behind);
      // The picture stood still: no step for longer than 67 ms, two steps at 1x (at 1x a step
      // comes every 33 ms, so a gap over 67 ms is a visible stop), whatever the cause: nothing
      // had arrived from the host, or the host itself had not moved on.
      const sp0 = client.state.speed || 1;
      if (steps > 0) {
        if (lastStepAt >= 0 && now - lastStepAt > 2 * tickMs + 1) { const gap = now - lastStepAt; starvedMs.push(gap); starved++; longestStarve = Math.max(longestStarve, gap); }
        lastStepAt = now;
      }
      const sp = client.state.speed || 1;
      if (steps >= 3 * sp) { burstFrames++; bursts.push(steps); }
      maxSteps = Math.max(maxSteps, steps);
    }
    at(now + cost, clientTick);
  }
  at(0, hostTick);
  at(1, clientTick);
  // Sample once a game second.
  function sampler() {
    const s = host.state;
    log.push({ t: Math.round(now / 1000), wave: s.wave, phase: s.phase[0], shoppers: s.shoppers.length, behind: client.state ? host._n - client._n : null });
    at(now + 1000, sampler);
  }
  at(1000, sampler);

  const wall0 = hr();
  const endAt = secs * 1000;
  while (heap.length) {
    const e = pop();
    now = e.t;
    if (now > endAt) break;
    if (host.state.wave > until) break;
    e.fn();
  }
  const wall = hr() - wall0;
  const gameSecs = now / 1000;
  const st = client.stats;
  const result = {
    from, link, rto: RTO, speed, slow, render, renderPer, ulp, gameSecs: Math.round(gameSecs), wallSecs: Math.round(wall / 1000), lastWave: host.state.wave,
    clientFrameMs: { p50: r2(pct(costs, 0.5)), p95: r2(pct(costs, 0.95)), max: r2(costs.reduce((a, b) => Math.max(a, b), 0)) },
    behindSteps: { p50: pct(lags, 0.5), p95: pct(lags, 0.95), p99: pct(lags, 0.99), max: lags.reduce((a, b) => Math.max(a, b), 0) },
    stalls: { count: starved, perMinute: r2(starved / (gameSecs / 60)), longestMs: Math.round(longestStarve), p50Ms: Math.round(pct(starvedMs, 0.5)), p95Ms: Math.round(pct(starvedMs, 0.95)), stillSharePct: r2((100 * starvedMs.reduce((a, b) => a + b, 0)) / (gameSecs * 1000)) },
    bursts: { frames: burstFrames, perMinute: r2(burstFrames / (gameSecs / 60)), maxStepsInOneFrame: maxSteps },
    client: { checks: st.checks, mismatches: st.mismatches, copiesAdopted: st.copies, jumps: st.jumps },
    copiesSent: causes, lostPackets: counts.lost,
    kbPerSec: Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, r2(v / 1024 / gameSecs)])),
    advPerSec: r2(counts.adv / gameSecs), snapParts: counts.snapParts,
    inStep: client.state ? checksum(client.state) === checksum(host.state) || `${client._n} vs ${host._n}` : null,
  };
  if (diffs.length) result.firstDiffs = diffs;
  console.log(JSON.stringify(result, null, 1));
  if (arg('json', '')) writeFileSync(arg('json'), JSON.stringify({ result, log }, null, 1));
  void behindAsks;
}

function rand(seed) {
  let r = seed * 9301 + 49297;
  return () => ((r = (r * 9301 + 49297) % 233280) / 233280);
}

/** The paths where two states differ (at most 12), for the first mismatches. */
function diffStates(a, b, n) {
  const out = [];
  const walk = (x, y, path) => {
    if (out.length >= 12) return;
    if (typeof x !== typeof y || Array.isArray(x) !== Array.isArray(y) || (x === null) !== (y === null)) { out.push(`${path}: ${JSON.stringify(x)?.slice(0, 80)} | ${JSON.stringify(y)?.slice(0, 80)}`); return; }
    if (x && typeof x === 'object') {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${path}.${k}`);
    } else if (x !== y) out.push(`${path}: host ${JSON.stringify(x)} client ${JSON.stringify(y)}`);
  };
  walk(a, b, 's');
  return { step: n, differences: out };
}
