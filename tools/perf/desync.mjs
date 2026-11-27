// Hunts for host and client falling out of step (stutter investigation, 2026-11-26).
//
// A host session and one joined player (and, now and then, a third player who joins in the middle
// of a sales event and leaves again) are linked through a pretend internet link in pretend time:
// a delay and jitter each way, messages delivered in order, as JSON text cut into parts at the
// 15 KB internet limit, exactly as transports.js does. Scripted players on BOTH sides use
// everything the game has: placing, removing and turning on the shop floor and in The Back (belts,
// Splitters, Overpasses, Interns, the five machines, Rebranders, Clearance Bins and whole supply
// lines from the Returns Drops), dropUp, wire, reinforce, rebuild orders (one and all), giving
// cash, the cards' skip, pause and resume, speed changes and opening the doors early. A client's
// commands reach the host whenever the link delivers them, so they land at awkward moments.
// Both sides also do what their screens do every frame: the real renderer draws the game (with a
// stand-in canvas that draws nothing), with a random building held over a random tile on either
// floor (its placement preview asks the rules), and the rebuild button's status is worked out.
//
// After every advance message the client has played, its copy is compared IN FULL with the host's
// state at that same step (not just the checksum). At the first difference the tool prints the
// paths of the fields that differ, the step and tick, and the last commands the client applied.
// It then waits for the copy to be repaired (by a full copy) before reporting again.
//
// Usage: node tools/perf/desync.mjs [--games=6] [--seed=1] [--waves=8] [--size=m] [--design=warehouse]
//          [--delay=40] [--jitter=60] [--draw=1] [--quiet]
import { HostSession, ClientSession, checksum } from '../../src/net/session.js';
import { splitMessage, createJoiner } from '../../src/net/transports.js';
import * as sim from '../../src/sim/index.js';
import { createDirector } from '../../src/content/director.js';
import { chain, drops } from './backchain.mjs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const GAMES = Number(arg('games', 6)), SEED0 = Number(arg('seed', 1)), WAVES = Number(arg('waves', 8));
const SIZE = arg('size', 'm'), DESIGN = arg('design', 'warehouse');
const DELAY = Number(arg('delay', 40)), JITTER = Number(arg('jitter', 60));
const DRAW = arg('draw', '1') === '1';
const QUIET = process.argv.includes('--quiet');
const PEER_MAX = 15 * 1024;
const { TICK_HZ, TUNE, BUILD, SPEEDS } = sim;

// ---- a stand-in browser, so the real renderer can run in Node and ask the rules what it asks --
const noop = () => {};
const grad = { addColorStop: noop };
const ctx = new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'measureText') return (s) => ({ width: String(s).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient') return () => grad;
    if (k === 'createPattern') return () => ({ setTransform: noop });
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w, height: h });
    if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } });
    if (k === 'getLineDash') return () => [];
    return noop;
  },
  set(t, k, v) { t[k] = v; return true; },
});
const fakeCanvas = () => ({ width: 1600, height: 900, clientWidth: 1600, clientHeight: 900, style: {}, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900 }), addEventListener: noop });
globalThis.document ??= { createElement: () => fakeCanvas() };
globalThis.devicePixelRatio ??= 1;
globalThis.Path2D ??= class { addPath() {} moveTo() {} lineTo() {} arc() {} rect() {} closePath() {} bezierCurveTo() {} quadraticCurveTo() {} ellipse() {} roundRect() {} };
const { createRenderer } = DRAW ? await import('../../src/render/renderer.js') : { createRenderer: null };
let rebuildStatus = null;
try { ({ rebuildStatus } = await import('../../src/ui/rebuild.js')); } catch { /* the interface module needs more of a browser */ }

// ---- helpers -----------------------------------------------------------------------------------
function rng(seed) { let r = (seed * 2654435761) >>> 0 || 1; return () => ((r = (Math.imul(r ^ (r >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 4294967296); }
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];

/** Same JSON values, whatever the order of the keys? Returns the paths that differ (up to 12). */
function diff(a, b, path = 's', out = []) {
  if (out.length >= 12) return out;
  if (a === b) return out;
  if (typeof a !== typeof b || a === null || b === null || Array.isArray(a) !== Array.isArray(b) || typeof a !== 'object') {
    out.push(`${path}: host ${JSON.stringify(a)?.slice(0, 90)} | client ${JSON.stringify(b)?.slice(0, 90)}`);
    return out;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${path}.${k}`, out);
  return out;
}

// ---- the pretend link --------------------------------------------------------------------------
function makeClock() {
  const heap = [];
  let seq = 0;
  const less = (a, b) => heap[a].t < heap[b].t || (heap[a].t === heap[b].t && heap[a].s < heap[b].s);
  return {
    now: 0,
    at(t, fn) {
      heap.push({ t, s: seq++, fn });
      for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (less(p, i)) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    },
    next() {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && less(l, m)) m = l; if (r < heap.length && less(r, m)) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; }
      }
      return top;
    },
    get size() { return heap.length; },
  };
}

function makeLink(clock, rnd) {
  function end() {
    let handler = null, peer = null, last = 0, nextId = 1;
    const pending = [], joiner = createJoiner();
    const conn = {
      open: true, onclose: null,
      send(obj) {
        if (!conn.open) return;
        const text = JSON.stringify(obj);
        const parts = text.length <= PEER_MAX ? [text] : splitMessage(text, nextId++, PEER_MAX).map((p) => JSON.stringify(p));
        for (const t of parts) {
          last = Math.max(last, clock.now + DELAY + rnd() * JITTER);
          clock.at(last, () => { if (peer.open) peer._receive(t); });
        }
      },
      close() { if (!conn.open) return; conn.open = false; clock.at(Math.max(last, clock.now + DELAY), () => peer._closed()); },
      get onmessage() { return handler; },
      set onmessage(fn) { handler = fn; while (fn && pending.length) fn(pending.shift()); },
      _receive(text) { const o = joiner.take(JSON.parse(text)); if (o === undefined) return; if (handler) handler(o); else pending.push(o); },
      _closed() { if (conn._ended) return; conn._ended = true; conn.open = false; if (conn.onclose) conn.onclose(); },
    };
    return { conn, setPeer: (p) => { peer = p; } };
  }
  const a = end(), b = end();
  a.setPeer(b.conn); b.setPeer(a.conn);
  return [a.conn, b.conn];
}

// ---- the scripted players ----------------------------------------------------------------------
const SHOP = ['crate', 'crate', 'crate', 'sprinkler', 'sprinkler', 'forklift', 'wetfloor', 'samples', 'railgun', 'salesman'];
const BACK = ['conv', 'conv', 'conv', 'conv', 'split', 'over', 'intern', 'still', 'cannery', 'spooler', 'bender', 'rebrand', 'bin'];

function anchors(s, pred) { const out = []; for (let i = 0; i < s.grid.length; i++) { const b = s.grid[i]; if (b && b.part === undefined && pred(b)) out.push(i); } return out; }
function backParts(s, pred) { const out = []; for (let i = 0; i < s.back.length; i++) { const p = s.back[i]; if (p && pred(p)) out.push(i); } return out; }

/** One player's next few commands, chosen from what his own copy of the game shows. */
function think(s, pid, rnd, plan) {
  const xy = (i) => ({ x: i % s.w, y: (i / s.w) | 0 });
  const tile = () => ({ x: 1 + Math.floor(rnd() * (s.w - 2)), y: 1 + Math.floor(rnd() * (s.h - 2)) });
  const me = s.players[pid];
  if (!me) return [];
  if (s.phase === 'cards') return rnd() < 0.3 ? [{ c: 'skipCards', on: true }] : [];
  if (s.phase !== 'build' && s.phase !== 'wave') return [];
  // In every build pause each player (re)lays supply lines from the drops, Razor Wire mostly, once
  // there is security for them to reach.
  if (plan.wave !== s.wave && s.phase === 'build' && !plan.length) {
    for (const d of drops(s)) { const cmds = chain(s, d, rnd() < 0.7 ? 'wire' : 'dmg'); if (cmds) plan.push(...cmds); }
    if (plan.length) plan.wave = s.wave;
  }
  // A wire across the dads' way in (once a game per player, in a build pause): a sprinkler just
  // inside his entrance, its wire facing across the row the dads walk in by, and a Razor Wire line
  // from a drop to it, so dads bump into live wire, are charged, and go round.
  if (!plan.trap && s.phase === 'build' && !plan.length) {
    const door = s.doors[Math.min(pid, s.open - 1)][0];
    const dx = door % s.w, dy = (door / s.w) | 0;
    const x = Math.min(s.w - 2, Math.max(1, dx + (dx < s.w / 2 ? 6 : -6))), y = dy + (dy < s.h / 2 ? 1 : -1);
    if (!sim.canPlace(s, 'sprinkler', x, y, pid, 0)) {
      const at = y * s.w + x;
      plan.trap = true;
      plan.push({ c: 'place', k: 'sprinkler', x, y, d: 0 }, { c: 'wire', x, y, d: dy < s.h / 2 ? 3 : 1 });
      plan.pendingTrap = at;
    }
  }
  if (plan.pendingTrap !== undefined && s.back[plan.pendingTrap] && s.back[plan.pendingTrap].k === 'lift') {
    const at = plan.pendingTrap;
    delete plan.pendingTrap;
    for (const d of drops(s)) { const cmds = chain(s, d, 'wire', new Set(), at); if (cmds) { plan.push(...cmds); break; } }
  }
  if (plan.length) return [plan.shift()]; // a supply line under way, one part at a time
  const r = rnd();
  if (s.pause) return r < 0.25 ? [{ c: 'pause', on: false }] : [];
  // Dads and the wire (0.4): while dads are walking, lay, turn or clear the wire of a building near
  // one of them, so wire goes live, changes direction and is taken away under their feet.
  if (s.phase === 'wave' && rnd() < 0.15) {
    const dads = s.shoppers.filter((m) => m.k === 'dad');
    // Mostly a building that holds Razor Wire (so the wire is live at once), else one near a dad.
    const armed = anchors(s, (b) => b.s && b.s.wire);
    const lifts = anchors(s, (b) => BUILD[b.k].lift);
    if (armed.length && rnd() < 0.7) return [{ c: 'wire', ...xy(pick(rnd, armed)), d: Math.floor(rnd() * 5) - 1 }];
    if (dads.length && lifts.length) {
      const dad = pick(rnd, dads);
      const near = lifts.filter((i) => Math.abs((i % s.w) - dad.x) + Math.abs(((i / s.w) | 0) - dad.y) < 6);
      return [{ c: 'wire', ...xy(pick(rnd, near.length ? near : lifts)), d: Math.floor(rnd() * 5) - 1 }];
    }
  }
  if (r < 0.30) return [{ c: 'place', k: pick(rnd, SHOP), ...tile(), d: Math.floor(rnd() * 4) }];
  if (r < 0.36) { const a = anchors(s, () => true); return a.length ? [{ c: 'remove', ...xy(pick(rnd, a)) }] : []; }
  if (r < 0.40) { const a = anchors(s, (b) => BUILD[b.k].rot); return a.length ? [{ c: 'rotate', ...xy(pick(rnd, a)) }] : []; }
  if (r < 0.45) { const a = anchors(s, (b) => BUILD[b.k].lift); return a.length ? [{ c: 'wire', ...xy(pick(rnd, a)), d: Math.floor(rnd() * 5) - 1 }] : []; }
  if (r < 0.48) { const a = anchors(s, (b) => b.k === 'crate'); return a.length ? [{ c: 'reinforce', ...xy(pick(rnd, a)) }] : []; }
  if (r < 0.51) return [{ c: 'rebuild', all: rnd() < 0.5 }];
  if (r < 0.62) {
    // Something in The Back next to what is there already (or anywhere).
    const near = backParts(s, (p) => p.k !== 'lift');
    let at = tile();
    if (near.length && rnd() < 0.7) { const i = pick(rnd, near) + pick(rnd, [1, -1, s.w, -s.w]); if (i > 0 && i < s.back.length) at = xy(i); }
    // (0.4.01) A whole belt line dragged from there to somewhere near, crossing whatever is in the way.
    if (rnd() < 0.3) {
      const to = { x: Math.max(0, Math.min(s.w - 1, at.x + Math.floor(rnd() * 17) - 8)), y: Math.max(0, Math.min(s.h - 1, at.y + Math.floor(rnd() * 11) - 5)) };
      return [{ c: 'line', f: 1, ...at, x2: to.x, y2: to.y, a: rnd() < 0.5 ? 0 : 1 }];
    }
    return [{ c: 'place', k: pick(rnd, BACK), ...at, d: Math.floor(rnd() * 4), f: 1 }];
  }
  if (r < 0.635) { const a = backParts(s, (p) => !BUILD[p.k].fixed); return a.length ? [{ c: 'remove', ...xy(pick(rnd, a)), f: 1 }] : []; }
  if (r < 0.71) { const a = backParts(s, (p) => BUILD[p.k].rot); return a.length ? [{ c: 'rotate', ...xy(pick(rnd, a)), f: 1 }] : []; }
  if (r < 0.74) { const d = drops(s); return d.length ? [{ c: 'dropUp', ...xy(pick(rnd, d)) }] : []; }
  if (r < 0.80) {
    // A whole supply line from a drop, laid over the next few moments.
    const d = drops(s);
    const cmds = d.length ? chain(s, pick(rnd, d), pick(rnd, ['dmg', 'spd', 'rng', 'wire', 'wire', 'wire'])) : null;
    if (cmds) { plan.push(...cmds.slice(1)); return [cmds[0]]; }
    return [];
  }
  if (r < 0.82) { const o = s.players.find((p) => p.id !== pid && p.on); return o ? [{ c: 'give', to: o.id, n: 1 + Math.floor(rnd() * 30) }] : []; }
  if (r < 0.84) return [{ c: 'speed', n: pick(rnd, SPEEDS) }];
  if (r < 0.85) return [{ c: 'pause', on: true }];
  if (r < 0.88 && s.phase === 'build') return [{ c: 'start' }];
  if (r < 0.89) return [{ c: 'role', role: pick(rnd, sim.ROLES) }];
  return [];
}

/** What a screen does every frame: draw (asking the rules for a placement preview) and the rebuild button. */
function screen(session, renderer, rnd) {
  const s = session.state;
  if (!s) return;
  const floor = rnd() < 0.5 ? 1 : 0;
  const tool = rnd() < 0.6 ? (floor ? pick(rnd, BACK) : pick(rnd, SHOP)) : rnd() < 0.5 ? 'remove' : null;
  const hover = { x: Math.floor(rnd() * s.w), y: Math.floor(rnd() * s.h) };
  const view = { tool, dir: Math.floor(rnd() * 4), hover, route: s.phase === 'build' || rnd() < 0.3, floor, cursors: new Map(), selected: rnd() < 0.2 ? hover : null };
  if (renderer) renderer.draw(view); else session.drainFx();
  if (rebuildStatus) rebuildStatus(s, session.me);
  // The other questions an interface asks.
  const i = hover.y * s.w + hover.x;
  sim.canPlace(s, tool && BUILD[tool] && !BUILD[tool].back ? tool : 'crate', hover.x, hover.y, session.me, view.dir);
  sim.canPlaceBack(s, pick(rnd, BACK), hover.x, hover.y, session.me, view.dir);
  sim.canWire(s, session.me, hover.x, hover.y, Math.floor(rnd() * 5) - 1);
  sim.canReinforce(s, session.me, hover.x, hover.y);
  sim.wireTiles(s, hover.x, hover.y, Math.floor(rnd() * 4));
  sim.overpassDirs(s, i); sim.beltShape(s, i);
}

// ---- one game ----------------------------------------------------------------------------------
function play(seed) {
  const rnd = rng(seed);
  const clock = makeClock();
  const keepLimit = TUNE.refundLimit;
  TUNE.refundLimit = 100000; // keep the game going: the point is the replay, not the result
  const host = new HostSession({ name: 'Bobb', seed, map: { design: DESIGN, size: SIZE }, cards: true, director: createDirector(rng(seed + 7)) });
  // (TUNE stays raised for the whole game: a player joining works the limit out again from it.)
  host.state.refundLimit = 100000;
  // The host's state as JSON at each advance message, keyed by step AND checksum: commands applied
  // at a step after its advance message go out in a second advance message for the same step.
  const kept = new Map();
  const origAdv = host._advance.bind(host);
  host._advance = () => {
    const n = host._n, before = host._advN, logged = host._log.length;
    origAdv();
    if (host._advN !== before || logged) { kept.set(`${n}:${checksum(host.state)}`, JSON.stringify(host.state)); if (kept.size > 3000) kept.delete(kept.keys().next().value); }
  };
  const hostCmds = [];
  const origApply = host._apply.bind(host);
  host._apply = (pid, cmd) => { const r = origApply(pid, cmd); hostCmds.push([host._n, pid, cmd && cmd.c, JSON.stringify(cmd).slice(0, 80), r.ok ? 'ok' : r.why]); if (hostCmds.length > 40) hostCmds.shift(); return r; };
  const reports = [];
  const stats = { checks: 0, compared: 0, copies: 0, mismatches: 0, joins: 0, commands: 0, refused: 0, turned: 0, wireOut: 0, wireCmds: 0, stocked: 0, armed: 0, live: 0, lines: 0 };
  // What the game did with the wire, to show the hunt covered it.
  host.on('fx', (ev) => { for (const e of ev) { if (e.e === 'turned') stats.turned++; if (e.e === 'stockOut' && e.t === 'wire') stats.wireOut++; if (e.e === 'wire') stats.wireCmds++; } });

  function joinClient(name) {
    const [a, b] = makeLink(clock, rnd);
    host.accept(a);
    const c = new ClientSession(b, name);
    c._ran = [];
    const origRun = c._run.bind(c);
    c._run = (entry) => { origRun(entry); c._ran.push([entry[0], entry[1], JSON.stringify(entry[2]).slice(0, 80)]); if (c._ran.length > 30) c._ran.shift(); };
    const origCheck = c._check.bind(c);
    c._check = (m) => {
      stats.checks++;
      const k = kept.get(`${m.n}:${m.h}`);
      if (k !== undefined && !c._broken) {
        stats.compared++;
        const mine = JSON.stringify(c.state);
        if (mine !== k) {
          const paths = diff(JSON.parse(k), JSON.parse(mine));
          if (paths.length) {
            c._broken = true;
            reports.push({ seed, client: name, step: m.n, tick: c.state.tick, phase: c.state.phase, wave: c.state.wave, speed: c.state.speed, checksumSame: checksum(c.state) === m.h, paths, clientLastCommands: c._ran.slice(-12), hostRecentCommands: hostCmds.slice(-15) });
          }
        }
      }
      const before = c.stats.mismatches;
      origCheck(m);
      stats.mismatches += c.stats.mismatches - before;
    };
    const origAdopt = c._adopt.bind(c);
    c._adopt = (m) => { origAdopt(m); stats.copies++; c._broken = false; };
    c.renderer = DRAW ? createRenderer(fakeCanvas(), c) : null;
    c.plan = [];
    stats.joins++;
    return { client: c, conn: b };
  }

  const A = joinClient('Tusker');
  let third = null, thirdUntil = 0, nextThird = 30000 + rnd() * 60000;
  const hostRenderer = DRAW ? createRenderer(fakeCanvas(), host) : null;
  const hostPlan = [];
  const cap = 60 * 60 * 1000; // an hour of play at most
  let lastWave = 0;

  // Timers: the host and each client update every 16 ms (a little irregular); each player thinks
  // every 150-1200 ms and sometimes fires off a burst.
  const hostTimer = () => {
    host.update(clock.now);
    // (How much wire there was: buildings holding Razor Wire, and those with it live.)
    if (host.state.tick % 30 === 0) {
      let armed = 0, live = 0, machines = 0;
      for (const b of host.state.grid) if (b && b.s && b.s.wire) { armed++; if (b.wd !== undefined) live++; }
      for (const p of host.state.back) if (p && p.k === 'bender') machines++;
      stats.armed = Math.max(stats.armed, armed); stats.live = Math.max(stats.live, live); stats.lines = Math.max(stats.lines, machines);
    } if (DRAW || rnd() < 0.2) screen(host, hostRenderer, rnd); clock.at(clock.now + 14 + rnd() * 6, hostTimer); };
  const clientTimer = (c) => () => { if (!c.conn.open && c._gone) return; c.update(clock.now); if (c.state && (DRAW || rnd() < 0.2)) screen(c, c.renderer, rnd); clock.at(clock.now + 12 + rnd() * 10, clientTimer(c)); };
  const thinker = (who) => () => {
    const isHost = who === 'host';
    const c = isHost ? null : who;
    const s = isHost ? host.state : c.state;
    if (s && (isHost || !c._gone)) {
      const pid = isHost ? host.me : c.me;
      const n = rnd() < 0.1 ? 2 + Math.floor(rnd() * 4) : 1;
      for (let k = 0; k < n; k++) {
        for (const cmd of think(s, pid, rnd, isHost ? hostPlan : c.plan)) {
          stats.commands++;
          if (isHost) { const r = host.send(cmd); if (!r.ok) stats.refused++; } else c.send(cmd);
        }
      }
    }
    if (isHost || !c._gone) clock.at(clock.now + 150 + rnd() * 1050, thinker(who));
  };
  clock.at(0, hostTimer);
  clock.at(1, clientTimer(A.client));
  clock.at(5, thinker('host'));
  clock.at(7, thinker(A.client));

  while (clock.size) {
    const e = clock.next();
    clock.now = e.t;
    if (clock.now > cap) break;
    const s = host.state;
    if (s.phase === 'won' || s.phase === 'lost' || s.wave > WAVES) break;
    if (s.wave !== lastWave) { lastWave = s.wave; if (!QUIET) process.stdout.write(`  seed ${seed}: event ${s.wave} at ${Math.round(clock.now / 1000)} s\r`); }
    // A third player drops in during a sales event and leaves a while later.
    if (!third && clock.now > nextThird && s.phase === 'wave') {
      third = joinClient('Phantasm');
      thirdUntil = clock.now + 5000 + rnd() * 35000;
      clock.at(clock.now + 2, clientTimer(third.client));
      clock.at(clock.now + 9, thinker(third.client));
    } else if (third && clock.now > thirdUntil) {
      third.client.conn.close();
      third.client._gone = true;
      third = null;
      nextThird = clock.now + 20000 + rnd() * 60000;
    }
    e.fn();
  }
  TUNE.refundLimit = keepLimit;
  stats.stocked = host.state.grid.filter((b) => b && b.s).length;
  return { seed, secs: Math.round(clock.now / 1000), wave: host.state.wave, ...stats, reports };
}

// ---- many games --------------------------------------------------------------------------------
const all = [];
for (let g = 0; g < GAMES; g++) {
  const seed = SEED0 + g;
  const t0 = Date.now();
  const r = play(seed);
  all.push(r);
  console.log(`seed ${seed}: ${r.secs} s of play to event ${r.wave}, ${r.commands} commands (${r.refused} of the host's refused), `
    + `${r.compared} full comparisons, ${r.mismatches} checksum mismatches, ${r.copies} copies, ${r.joins - 1} mid-game joins, `
    + `wire: ${r.wireCmds} laid or turned, ${r.turned} dads charged, ${r.wireOut} ran out; at most ${r.lines} wire machines, ${r.armed} buildings holding wire, ${r.live} live; `
    + `${r.reports.length} DIFFERENCES  (${Math.round((Date.now() - t0) / 1000)} s)`);
  for (const rep of r.reports.slice(0, 3)) {
    console.log(`  step ${rep.step} tick ${rep.tick} event ${rep.wave} ${rep.phase} speed ${rep.speed} ${rep.client}, checksum ${rep.checksumSame ? 'SAME' : 'differs'}:\n    ${rep.paths.join('\n    ')}`);
  }
}
if (arg('json', '')) { const { writeFileSync, mkdirSync } = await import('node:fs'); mkdirSync('tools/perf/out', { recursive: true }); writeFileSync(arg('json'), JSON.stringify(all, null, 1)); }
const total = all.reduce((a, r) => a + r.reports.length, 0);
console.log(`\n${all.length} games, ${all.reduce((a, r) => a + r.compared, 0)} full comparisons, ${total} differences.`);
process.exitCode = total ? 1 : 0;
