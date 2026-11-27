// Sessions connect the simulation to the screen and to the other players.
//
// The host's browser owns the real game state: it runs the simulation and checks every command.
// The simulation is deterministic (the same state and the same commands always give the same
// next state), so the other players do not need the whole state sent over and over. Instead:
//
//   - A joining player gets one full copy of the state ('welcome').
//   - Ten times a second the host sends a small 'adv' (advance) message: how far it has got (a
//     count of simulation steps), the commands it applied since the last one (each with the step
//     it took effect at and the player who gave it), and a checksum of its state.
//   - Each client replays that on its own copy: it applies each command at exactly the step the
//     host did, steps the simulation up to the host's count, and compares checksums. Clients
//     therefore run a fraction of a second behind the host, at an even pace, rather than ahead.
//   - A full copy ('snap') is sent only when the stream cannot say what happened (a player joined,
//     left or came back; fastForward), when a client reports a checksum that does not match
//     (different browsers can differ in the last digit of some maths, so copies can drift), when
//     a client has fallen far behind, and every ten seconds as a safety net. A copy fits into the
//     stream at the step it was taken, so a routine one causes no jump on screen.
//
// Both kinds of session offer the same interface to the user interface:
//   session.state        the current game state (null on a client until it has joined)
//   session.me           this player's id
//   session.isHost
//   session.send(cmd)    issue a command (see applyCommand in src/sim/commands.js)
//   session.on(type, fn) listen for messages; returns a function that stops listening
//   session.drainFx()    simulation events since the last call, for effects and sounds
//   session.alpha()      0..1 progress between ticks, for smooth drawing
//   session.start() / session.stop()   run on a timer
//   session.update(nowMs)              or drive it by hand (tests)
//
// Message types passed to on():
//   'ready'   {}                       client only: joined, state is available
//   'lobby'   {}                       the finished game was replaced by a fresh one in the lobby
//                                      (host: backToLobby() was called; client: the host did it)
//   'say'     {who, text, mood}        a character speaks (DEB the HR chatbot)
//   'review'  {stars, text, kind}      a customer review toast
//   'report'  {wave, bonus, rows, employee, deb, totals}  end-of-wave performance review
//   'players' {text}                   someone joined or left
//   'nope'    {why, cmd}               your command was refused
//   'cursor'  {pid, x, y}              where another player is pointing, in tiles
//   'chat'    {pid, name, color, text} a chat line
//   'closed'  {why}                    client only: lost the host
//   'fx'      [event, ...]             the simulation events of one tick or one command (see
//                                      step() in src/sim/step.js), for sound and the tutorial. The
//                                      handler receives the array itself, not an object.
// On a client, 'say', 'review' and 'report' arrive when its replay reaches the moment the host
// said them, so a line about the wave ending comes as the wave is seen to end.
//
// Messages between host and client (the transport turns each into JSON and cuts big ones up):
//   client -> host  hello {name} · cmd {c} · chat {text} · cursor {x, y} · sync {} (send me a copy)
//   host -> client  welcome {me, n, s} · adv {n, h, c: [[n, pid, cmd], ...]} · snap {n, s}
//                   at {n, m} (a message to show at step n) · nope · cursor · chat · players · closed
//                   lobby {me, n, s} (the game is over and a fresh one starts in the lobby: s is
//                   its state, me the client's id in it, n the step it starts at; anything the
//                   host sent about an earlier step is from the old game and is dropped)
import { createGame, addPlayer, setPlayerOnline, applyCommand, step, migrateSave, TICK_HZ, SPEEDS, STOCK_TRACKS } from '../sim/index.js';

const TICK_MS = 1000 / TICK_HZ;
/** Steps between advance messages at normal speed: one every step, thirty a second. They are
 *  tiny, and sending them this often is what lets clients run close behind the host. */
const ADV_EVERY = 1;
/** Client: how many steps behind the host to aim for at normal speed (about 100 ms). Enough to
 *  ride out a message that arrives a little late without the picture stopping. */
const WANT_BEHIND = 3;
/** Seconds between routine full copies, the safety net for drift the checksum cannot see. */
const FULL_EVERY_SECS = 10;
/** Host: the fewest steps between two copies sent because one client asked. */
const SYNC_GAP = TICK_HZ;
/**
 * Client: further behind the host than this (in seconds of play), it asks for a fresh copy;
 * a copy that arrives while it is more than JUMP_SECS behind is skipped to at once. Less than
 * that, it catches up by running faster for a moment.
 */
const FAR_BEHIND_SECS = 3, JUMP_SECS = 1;
/** The longest gap between two frames that is played in full (a hitch, a tab briefly hidden). */
const MAX_FRAME_MS = 3000;
/**
 * Host: the most steps it runs in one update(). Enough for a whole MAX_FRAME_MS at the fastest
 * speed (450 at 5x; it was 400 when 3x was the top), so a hitch is caught up rather than lost;
 * any more would mean a frame stuck for over a second. A heavy late-game step costs well under
 * a millisecond (0.3 ms on average with seven players and a thousand shoppers, on a desktop), so
 * even 5x, 150 steps a second, is a small share of a frame's time.
 */
const HOST_MAX_STEPS = Math.ceil(MAX_FRAME_MS * Math.max(...SPEEDS) / (1000 / TICK_HZ));
/** Client: the most steps it simulates in one update(), so a slow device never locks up. It was
 *  120 with 3x the top speed, and grows with the top speed so a client at 5x has the same
 *  headroom (a frame up to about 0.4 s long, at double pace while catching up). */
const MAX_STEPS = Math.ceil(120 * Math.max(...SPEEDS) / 3);
/** Chat: the longest line, and how many lines one player may send in a short while. */
const CHAT_MAX = 200, CHAT_BURST = 6, CHAT_WINDOW_MS = 8000;

/** Steps between advance messages right now. At 2x, 3x and 5x speed steps pass faster, so the count
 *  scales to keep the same number of messages a second. */
const advEvery = (state) => ADV_EVERY * (state.speed || 1);

/**
 * A cheap fingerprint of a game state, for spotting a client whose copy has drifted from the
 * host's. It covers what drifts first and matters most: the clock and random numbers, every
 * shopper's position and patience, money, refunds, and every building's timers. Decimals are
 * rounded so the result does not hang on the last digit, which is exactly where two browsers'
 * maths may differ; a real drift grows and is caught a moment later. Anything it misses is
 * repaired by the routine full copy.
 * @returns {number} a 32-bit unsigned number
 */
export function checksum(s) {
  let h = 0x811c9dc5;
  const mix = (v) => { h = Math.imul(h ^ (v | 0), 0x01000193); };
  const dec = (v) => mix(Math.round((v || 0) * 64));
  mix(s.tick); mix(s.rng); mix(s.gridVer); mix(s.refunds); mix(s.refundLimit); mix(s.wave);
  mix(s.nextId); mix(s.open); mix(s.phaseT); mix(s.speed); mix(s.waveAt);
  mix(s.phase.charCodeAt(0)); mix(s.phase.length);
  mix(s.spawnQ.length); mix(s.messes.length); mix(s.rubble.length); mix(s.carts ? s.carts.length : 0); mix(s.waves);
  // (Money held for rebuilds players have paid for and that are waiting, 0.3.04: it has left their
  // cash, so it is counted here. Nothing is mixed while nothing is held.)
  let held = 0;
  for (const r of s.rubble) if (r.by !== undefined) held += (r.res | 0) + 1;
  if (held) mix(held);
  mix(s.office ? s.office.pid + 1 : 0);
  // (The deal's clock, only in a game with cards while it runs.)
  if (s.dealT !== undefined) mix(s.dealT);
  // (Paused, and by whom. Only while it is: a game never paused sums as it always did.)
  if (s.pause) { mix(0x50415553); mix(s.pause.by); }
  for (const p of s.players) { mix(p.on ? 1 : 0); dec(p.cash); mix((p.side || '').length); mix(p.ready ? 1 : 0); dec(p.gone ?? -1); }
  for (const sh of s.shoppers) {
    mix(sh.id); mix(sh.st); dec(sh.x); dec(sh.y); dec(sh.hp); mix(sh.kd);
    mix(sh.kn); mix(sh.cd); mix(sh.pc); mix(sh.ru); dec(sh.sv); mix(sh.pp);
  }
  const g = s.grid;
  for (let i = 0; i < g.length; i++) {
    const b = g[i];
    if (!b) continue;
    mix(i); mix(b.k.charCodeAt(0)); mix(b.part ?? -1); mix(b.o); mix(b.d); dec(b.cd); mix(b.t); mix(b.n);
    mix(b.hit); mix(b.off);
    if (b.it) mix(b.it.length);
    // (Its stock from The Back, 0.4: every run's tier and uses, track by track in a fixed order.
    // Only on a stocked building, so an unstocked one sums as it did.)
    if (b.s) {
      for (let t = 0; t < STOCK_TRACKS.length; t++) {
        const run = b.s[STOCK_TRACKS[t]];
        if (!run) continue;
        mix(t + 1);
        for (let k = 0; k < run.length; k++) mix(run[k]);
      }
    }
  }
  // The Back (0.4), in one pass: how many items are on it (belts, Overpass lanes and the one-item
  // hands), the sums of their positions and codes, each weighted by a number from its tile so an
  // item on the wrong tile shows; the Splitters' hands and turns, the Interns' hands and timers, the
  // Returns Drops' timers and levels; the machines' and Rebranders' counters and what they hold
  // (0.4, stage 3); the Dumbwaiters' buildings; and the layout's version. Whole numbers, so exact
  // (the sums stay far below where whole numbers stop being exact).
  if (s.back) {
    let n = 0, pos = 0, codes = 0, parts = 0, wt = 1;
    const lane = (it) => { for (let k = 0; k < it.length; k += 2) { n++; codes += it[k] * wt; pos += it[k + 1] * wt; } };
    const back = s.back;
    for (let i = 0; i < back.length; i++) {
      const p = back[i];
      if (!p) continue;
      wt = (i % 1021) + 1;
      if (p.it) lane(p.it);
      // (A Dumbwaiter's `a` is its building's tile, not a lane.)
      if (p.k === 'lift') { parts += (p.a + 1) * 13 * wt; continue; }
      if (p.a) lane(p.a);
      if (p.b) lane(p.b);
      if (p.h) n++;
      if (p.q) for (let k = 0; k < p.q.length; k++) { n++; codes += p.q[k] * wt; }
      if (p.out) { n++; codes += p.out * wt; }
      parts += ((p.h | 0) * 7 + (p.r | 0) * 3 + (p.t | 0) * 5 + (p.lv | 0) * 11 + (p.d | 0) + (p.n | 0) * 17) * wt;
    }
    mix(s.backVer); mix(n); mix(pos % 0x7fffffff); mix(codes % 0x7fffffff); mix(parts % 0x7fffffff);
  }
  return h >>> 0;
}

/** A copy of a command that nothing else holds on to (the state may keep parts of it). */
const copy = (cmd) => JSON.parse(JSON.stringify(cmd));

class Emitter {
  constructor() { this._handlers = {}; }
  on(type, fn) {
    (this._handlers[type] ||= []).push(fn);
    return () => { this._handlers[type] = this._handlers[type].filter((f) => f !== fn); };
  }
  emit(type, msg = {}) {
    for (const fn of this._handlers[type] || []) fn(msg);
  }
}

class Session extends Emitter {
  constructor() {
    super();
    this.state = null;
    this.me = -1;
    this.fx = [];
    this._acc = 0;
    this._last = null;
    this._timer = null;
  }
  drainFx() {
    const out = this.fx;
    this.fx = [];
    return out;
  }
  /** How far we are between two ticks, 0..1. Draw a shopper at x + vx * alpha() for smooth motion. */
  alpha() {
    return Math.max(0, Math.min(1, this._acc / TICK_MS));
  }
  /** Time in ms to simulate since the last call, capped so a sleeping tab does not explode. */
  _elapsed(now) {
    if (this._last === null) this._last = now;
    const dt = Math.max(0, Math.min(MAX_FRAME_MS, now - this._last));
    this._last = now;
    return dt;
  }
  _fx(ev) {
    if (!ev.length) return;
    for (const e of ev) this.fx.push(e);
    this.emit('fx', ev);
  }
  start() {
    if (this._timer) return;
    // A timer, not requestAnimationFrame: the game must keep running when the host's tab is hidden.
    this._timer = setInterval(() => this.update(performance.now()), 16);
  }
  stop() {
    clearInterval(this._timer);
    this._timer = null;
  }
}

export class HostSession extends Session {
  /**
   * @param {Object} o
   * @param {string} o.name      the host player's name
   * @param {number} [o.seed]
   * @param {{design: string, size: string}} [o.map] the floor plan; left out, the original small warehouse
   * @param {boolean} [o.lobby] start in the lobby (players press Ready; the host may change the map)
   * @param {Object} [o.settings] waves, starting cash and difficulty (see SETTINGS in constants.js)
   * @param {Object} [o.director] turns simulation events into jokes; see src/content/director.js
   * @param {Object} [o.state]   continue an existing game instead of starting a new one
   * @param {boolean} [o.takeOver] `state` is a player's copy of a game whose host has left, and
   *   this player (found by `name`) is now its host. Everyone else counts as away until his
   *   browser reconnects, which gives him his place back by name. Each of them, the old host
   *   included, keeps his money for the usual grace period (TUNE.graceSecs) and loses it to the
   *   others only if he has not come back by then.
   * @param {boolean} [o.resume] `state` is a saved game being picked up again. Every player in it
   *   counts as away, with no grace period running and nobody's money shared out: each gets his
   *   place and money back by name whenever he rejoins. This player (found by `name`) is the host.
   * @param {string|null} [o.holiday] a new game's holiday (see createGame; main.js works it out
   *   from the date). Ignored with `state`, which keeps its own.
   * @param {boolean|string[]} [o.cards] a new game's cards (see createGame): true deals a hand
   *   (games from the menu), a list forces one (test options). Ignored with `state`.
   */
  constructor({ name, seed = (Date.now() & 0x7fffffff) || 1, director = null, state = null, map = null, lobby = false, takeOver = false, resume = false, settings = null, holiday = null, cards = null }) {
    super();
    this.isHost = true;
    this.state = state || createGame({ seed, map, lobby, settings, holiday, cards });
    const s = this.state;
    if (resume) {
      // A save from an older version of the rules is brought up to date first (once).
      migrateSave(s);
      // Nobody is here yet, and nobody has walked out on anyone either.
      for (const p of s.players) { p.on = false; delete p.gone; }
    } else if (takeOver) {
      // Everyone, the old host included, is away for now. Their grace periods start (or carry on,
      // for anyone who had already dropped out); see setPlayerOnline in src/sim/state.js. This is
      // done by hand rather than through setPlayerOnline so the Head Office job is not taken
      // away in the moment nobody is connected.
      for (const p of s.players) {
        if (!p.on) continue;
        p.on = false;
        if (s.phase !== 'lobby') p.gone = 0;
      }
    }
    this.me = addPlayer(s, name);
    s.host = this.me;
    this.director = director;
    /** @type {Map<Object, number>} connection -> player id */
    this.conns = new Map();
    /** Simulation steps run by this session. Clients count the same way. */
    this._n = 0;
    /** Commands applied since the last advance message, as [step, player, command]. */
    this._log = [];
    this._sinceAdv = 0;
    /** The step of the last advance message, and of the last full copy sent to everyone. */
    this._advN = -1;
    this._fullN = 0;
    /** @type {Map<Object, number>} connection -> the step it last got a full copy at */
    this._copyN = new Map();
    /** @type {Set<Object>} connections that have asked for a full copy */
    this._asked = new Set();
    /** @type {Map<number, number[]>} player id -> when his recent chat lines were sent */
    this._chatTimes = new Map();
  }

  /**
   * Once a game is over (won or lost), takes everyone back to the lobby for another round, over
   * the connections already open: same room code, nobody reconnects. A fresh game is made in the
   * lobby on the same store and settings, holding the players still here in the order they were
   * in (so the host can change the store, the settings, and everyone presses Ready again). Each
   * client gets the new game in a 'lobby' message with his new player id. Only the host can do
   * this; a client has no way to ask for it.
   * @param {Object} [o]
   * @param {number} [o.seed]     the new game's random seed; left out, a new one
   * @param {Object} [o.director] a fresh joke director: the old one remembers what it said this game
   * @param {string|null} [o.holiday] the new game's holiday (main.js gives today's, which may differ
   *   from the old game's); left out, the old game's
   * @param {boolean|string[]} [o.cards] the new game's cards (see createGame); left out, a fresh
   *   deal if the old game had cards, none if it had not (main.js always asks for a deal)
   * @returns {boolean} false if the game is not over yet
   */
  backToLobby({ seed = (Date.now() & 0x7fffffff) || 1, director = null, holiday = this.state.holiday, cards = !!(this.state.cards && this.state.cards.length) } = {}) {
    const old = this.state;
    if (old.phase !== 'won' && old.phase !== 'lost') return false;
    const s = createGame({ seed, map: old.map, zones: !!old.zones, lobby: true, settings: old, holiday, cards });
    // Drawing code keeps pictures of the floor keyed on this number; never let it repeat one.
    s.gridVer = (old.gridVer | 0) + 1;
    const connected = new Set([this.me, ...this.conns.values()]);
    const newId = new Map();
    for (const p of old.players) {
      if (p.on && connected.has(p.id)) newId.set(p.id, addPlayer(s, p.name));
    }
    this.me = newId.get(this.me);
    s.host = this.me;
    for (const [conn, pid] of this.conns) this.conns.set(conn, newId.get(pid));
    this.state = s;
    if (director) this.director = director;
    // Nothing from the old game is owed to anyone. The step count moves on by one, so every
    // message of the old game has a smaller count than anything of the new one; a client drops
    // any old-game message that turns up late (see ClientSession._floor).
    this._n++;
    this._log = [];
    this._sinceAdv = 0;
    this._acc = 0;
    this._advN = this._fullN = this._n;
    this._asked.clear();
    this._chatTimes.clear();
    this.fx = [];
    for (const [conn, pid] of this.conns) {
      conn.send({ t: 'lobby', me: pid, n: this._n, s });
      this._copyN.set(conn, this._n);
    }
    this.emit('lobby', {});
    return true;
  }

  /** Takes over a new connection from a transport. The client must send 'hello' next. */
  accept(conn) {
    conn.onmessage = (m) => this._onMessage(conn, m);
    conn.onclose = () => this._onClose(conn);
  }

  /** On the host the answer is known at once and returned; a client's send() returns nothing. */
  send(cmd) {
    return this._apply(this.me, cmd);
  }

  /** Where the local player is pointing, in tiles. */
  sendCursor(x, y) {
    this._broadcast({ t: 'cursor', pid: this.me, x, y });
  }

  /** Says something to everyone in the game. */
  chat(text) {
    this._chat(this.me, text);
  }

  /**
   * A chat line from a player. The host tidies it (one line, at most 200 characters), drops it
   * if that player is talking too fast, and sends it to everyone, the sender included.
   */
  _chat(pid, text) {
    const p = this.state.players[pid];
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
    if (!p || !clean) return;
    const now = Date.now();
    const recent = (this._chatTimes.get(pid) || []).filter((t) => now - t < CHAT_WINDOW_MS);
    if (recent.length >= CHAT_BURST) return;
    recent.push(now);
    this._chatTimes.set(pid, recent);
    this._announce({ t: 'chat', pid, name: p.name, color: p.color, text: clean });
  }

  update(now) {
    this._acc += this._elapsed(now) * (this.state.speed || 1);
    let n = 0;
    while (this._acc >= TICK_MS && n++ < HOST_MAX_STEPS) {
      this._acc -= TICK_MS;
      this._tick();
    }
    if (this._acc > TICK_MS * HOST_MAX_STEPS) this._acc = 0;
    this._sendDue();
  }

  /**
   * Runs the game forward a number of ticks at once (testing and screenshots). Clients are not
   * made to replay all of it: they get a fresh copy afterwards. (On a paused game it runs the
   * steps, which change nothing, and returns as usual.)
   */
  fastForward(ticks) {
    this._advance();
    for (let i = 0; i < ticks; i++) this._tick();
    this._copy(null, true);
  }

  _tick() {
    const ev = step(this.state);
    this._n++;
    this._sinceAdv++;
    if (ev.length) this._onSimEvents(ev);
    // About once a second of play. While the game is paused the step count goes on (messages,
    // copies and joins all keep working) but state.tick stands still, so without the check a pause
    // on a whole second would ask the director every step.
    if (this.director && !this.state.pause && this.state.tick % TICK_HZ === 0) {
      for (const msg of this.director.idle(this.state)) this._announce(msg, true);
    }
  }

  /** Sends whatever is due: an advance message, the routine full copy, copies clients asked for. */
  _sendDue() {
    if (!this.conns.size) {
      // Nobody to tell. Forget what would have been said, so the first to join starts clean.
      this._log = [];
      this._sinceAdv = 0;
      this._fullN = this._n;
      return;
    }
    if (this._n - this._fullN >= FULL_EVERY_SECS * TICK_HZ * (this.state.speed || 1)) this._copy();
    else if (this._sinceAdv >= advEvery(this.state)) this._advance();
    for (const conn of this._asked) {
      if (this._n - (this._copyN.get(conn) ?? -Infinity) < SYNC_GAP) continue;
      this._asked.delete(conn);
      this._copy([conn]);
    }
  }

  /** Tells every client how far the game has got, what was done on the way, and the checksum. */
  _advance() {
    this._sinceAdv = 0;
    if (!this.conns.size) { this._log = []; return; }
    if (this._n === this._advN && !this._log.length) return; // they know all this already
    const msg = { t: 'adv', n: this._n, h: checksum(this.state) };
    if (this._log.length) msg.c = this._log;
    this._log = [];
    this._advN = this._n;
    this._broadcast(msg);
  }

  /**
   * Sends a full copy of the state to some clients (all, if none are named). Everyone is brought
   * up to this step first, so the copy fits seamlessly onto what the clients already have.
   * @param {boolean} [jump] everyone gets it, and nobody is to replay the steps before it
   *   (after fastForward): the clients skip straight to it.
   */
  _copy(conns = null, jump = false) {
    if (jump) {
      // The copy holds everything up to now, so there is nothing else to tell.
      this._log = [];
      this._sinceAdv = 0;
      this._advN = this._n;
    } else {
      this._advance();
    }
    const to = conns || [...this.conns.keys()];
    if (!to.length) return;
    const msg = { t: 'snap', n: this._n, s: this.state };
    for (const c of to) {
      c.send(msg);
      this._copyN.set(c, this._n);
      this._asked.delete(c);
    }
    if (!conns) this._fullN = this._n;
  }

  _onMessage(conn, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      if (this.conns.has(conn)) return;
      // The others are brought up to now before the player list changes under them.
      this._advance();
      const pid = addPlayer(this.state, m.name);
      if (pid < 0) {
        conn.send({ t: 'closed', why: 'full' });
        conn.close();
        return;
      }
      const others = [...this.conns.keys()];
      this.conns.set(conn, pid);
      conn.send({ t: 'welcome', me: pid, n: this._n, s: this.state });
      this._copyN.set(conn, this._n);
      if (others.length) this._copy(others);
      this._announce({ t: 'players', text: `${this.state.players[pid].name} has clocked in.` });
      this._direct([{ e: 'joined', by: pid }]);
      return;
    }
    const pid = this.conns.get(conn);
    if (pid === undefined) return;
    if (m.t === 'cmd') {
      const r = this._apply(pid, m.c);
      if (!r.ok) conn.send({ t: 'nope', why: r.why, cmd: m.c });
    } else if (m.t === 'sync') {
      // His copy has drifted, or he has fallen behind. He gets a fresh one as soon as allowed.
      this._asked.add(conn);
    } else if (m.t === 'chat') {
      this._chat(pid, m.text);
    } else if (m.t === 'cursor' && Number.isFinite(m.x) && Number.isFinite(m.y)) {
      const msg = { t: 'cursor', pid, x: m.x, y: m.y };
      this.emit('cursor', msg);
      for (const c of this.conns.keys()) if (c !== conn) c.send(msg);
    }
  }

  _onClose(conn) {
    const pid = this.conns.get(conn);
    if (pid === undefined) return;
    this.conns.delete(conn);
    this._copyN.delete(conn);
    this._asked.delete(conn);
    this._advance();
    setPlayerOnline(this.state, pid, false);
    this._copy();
    this._announce({ t: 'players', text: `${this.state.players[pid].name} has left the building.` });
    this._direct([{ e: 'quit', by: pid }]);
  }

  _apply(pid, cmd) {
    const ev = [];
    let mine = cmd;
    try { if (cmd && typeof cmd === 'object') mine = copy(cmd); } catch { mine = null; }
    const r = applyCommand(this.state, pid, mine, ev);
    // Clients replay what the host did. A refused command changes nothing, except that refusing
    // a rebuild can tidy away rubble that has been built over (giving back any money held for
    // it), so that one goes too.
    if (r.ok || (mine && mine.c === 'rebuild')) this._log.push([this._n, pid, copy(mine)]);
    if (!r.ok && pid === this.me) this.emit('nope', { why: r.why, cmd });
    if (ev.length) this._onSimEvents(ev);
    return r;
  }

  _onSimEvents(ev) {
    this._fx(ev);
    this._direct(ev);
  }

  _direct(ev) {
    if (!this.director) return;
    for (const msg of this.director.handle(ev, this.state)) this._announce(msg, true);
  }

  /**
   * Tells every player something: the host's own screen and all clients.
   * @param {boolean} [timed] it is about something in the game: clients show it when their
   *   replay reaches this moment, not the moment it arrives
   */
  _announce(msg, timed = false) {
    this.emit(msg.t, msg);
    this._broadcast(timed ? { t: 'at', n: this._n, m: msg } : msg);
  }

  _broadcast(msg) {
    for (const c of this.conns.keys()) c.send(msg);
  }
}

export class ClientSession extends Session {
  /**
   * @param {Object} conn a connection to the host, from a transport
   * @param {string} name this player's name
   */
  constructor(conn, name) {
    super();
    this.isHost = false;
    this.conn = conn;
    /** Steps this copy has run, counted the host's way, and the furthest the host has told of. */
    this._n = 0;
    this._top = 0;
    /** What the host has sent and this copy has not caught up with yet: adv and snap messages. */
    this._q = [];
    /** Messages to show when the replay reaches a step, as [step, message], oldest first. */
    this._later = [];
    /** A smoothed measure of how far behind the host this copy runs, in steps. */
    this._lag = 0;
    /** The step at which a fresh copy was asked for, or -1. */
    this._askedAt = -1;
    /** The step the current game began at (after a return to the lobby). Anything the host sent
     *  about an earlier step belongs to the game before and is ignored. */
    this._floor = 0;
    /** Counters, for tests and for anyone curious. */
    this.stats = { checks: 0, mismatches: 0, copies: 0, jumps: 0 };
    conn.onmessage = (m) => this._onMessage(m);
    conn.onclose = () => {
      // Everything the host managed to send is real: play it all, so that a player who takes
      // over as host starts from the freshest copy there is.
      if (this.state) this._catchUp();
      this.emit('closed', { why: 'lost' });
    };
    conn.send({ t: 'hello', name });
  }

  send(cmd) {
    this.conn.send({ t: 'cmd', c: cmd });
  }

  sendCursor(x, y) {
    this.conn.send({ t: 'cursor', x, y });
  }

  /** Says something to everyone in the game (the host passes it on). */
  chat(text) {
    this.conn.send({ t: 'chat', text: String(text ?? '').slice(0, 400) });
  }

  update(now) {
    const dt = this._elapsed(now);
    if (!this.state) return;
    const speed = this.state.speed || 1;
    // Stay a few steps behind the host (WANT_BEHIND): enough to ride out a late message
    // without stopping. Run a little slower when closer than that and faster when further, so
    // the gap settles there by itself without visible jumps.
    const behind = this._top - this._n;
    const want = WANT_BEHIND * speed;
    this._lag += (behind - this._lag) * 0.05;
    const rate = 1 + Math.max(-0.15, Math.min(1, (this._lag - want) / (3 * want)));
    if (behind > FAR_BEHIND_SECS * TICK_HZ * speed) this._ask();
    // Copies and commands due at this very step take effect now; only steps wait for the clock.
    this._stepOnce(false);
    this._acc += dt * speed * rate;
    let steps = 0;
    while (this._acc >= TICK_MS) {
      if (steps >= MAX_STEPS) { this._acc = Math.min(this._acc, TICK_MS * 2); break; }
      if (!this._stepOnce()) {
        // Nothing more from the host yet: hold the picture at the end of this tick.
        this._acc = Math.min(this._acc, TICK_MS);
        break;
      }
      this._acc -= TICK_MS;
      steps++;
    }
    if (this._askedAt >= 0 && this._n - this._askedAt > 10 * TICK_HZ * speed) {
      this._askedAt = -1; // no answer: ask again
      this._ask();
    }
  }

  /**
   * Works through what the host has sent until one simulation step has been run.
   * @param {boolean} [mayStep] false: do only what is due before the next step
   * @returns {boolean} true if it ran a step
   */
  _stepOnce(mayStep = true) {
    const q = this._q;
    for (;;) {
      const m = q[0];
      if (!m) return false;
      if (m.t === 'snap') {
        q.shift();
        this._adopt(m);
        continue;
      }
      const cmds = m.c || [];
      while (m.i < cmds.length && cmds[m.i][0] <= this._n) this._run(cmds[m.i++]);
      if (this._n >= m.n) {
        while (m.i < cmds.length) this._run(cmds[m.i++]);
        q.shift();
        this._check(m);
        continue;
      }
      if (!mayStep) return false;
      this._n++;
      this._fx(step(this.state));
      this._release();
      return true;
    }
  }

  /** Plays everything received so far, at once. */
  _catchUp() {
    while (this._stepOnce());
    this._release(true);
  }

  /** Applies one command the host applied, at the same step. */
  _run([, pid, cmd]) {
    const ev = [];
    applyCommand(this.state, pid, cmd, ev);
    this._fx(ev);
  }

  /** Compares this copy with the host's at the end of an advance message. */
  _check(m) {
    if (m.h === undefined || this._askedAt >= 0) return;
    this.stats.checks++;
    if (checksum(this.state) === m.h) return;
    this.stats.mismatches++;
    this._ask();
  }

  /** Asks the host for a fresh copy (once; it is repeated only if none comes). */
  _ask() {
    if (this._askedAt >= 0) return;
    this._askedAt = this._n;
    this.conn.send({ t: 'sync' });
  }

  /** Takes on a full copy from the host. */
  _adopt(m) {
    if (m.n !== this._n) this.stats.jumps++;
    this.stats.copies++;
    this.state = m.s;
    this._n = m.n;
    this._askedAt = -1;
    this._release();
  }

  /** Shows the messages whose moment has come (all of them, with `all`). */
  _release(all = false) {
    while (this._later.length && (all || this._later[0][0] <= this._n)) {
      const msg = this._later.shift()[1];
      if (msg && typeof msg.t === 'string') this.emit(msg.t, msg);
    }
  }

  _onMessage(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'welcome':
        this.me = m.me;
        this.state = m.s;
        this._n = this._top = m.n | 0;
        this._q = [];
        this._lag = 0;
        this._acc = 0;
        this.emit('ready', {});
        break;
      case 'lobby':
        // The host took everyone back to the lobby. The new game replaces the old one outright:
        // whatever of the old game is still waiting to be played or shown is thrown away.
        if (!this.state || !m.s) break;
        this.me = m.me;
        this.state = m.s;
        this._n = this._top = this._floor = m.n | 0;
        this._q = [];
        this._later = [];
        this._lag = 0;
        this._acc = 0;
        this._askedAt = -1;
        this.fx = [];
        this.emit('lobby', {});
        break;
      case 'adv':
        if (!this.state || m.n < this._floor) break;
        m.i = 0;
        this._q.push(m);
        this._top = Math.max(this._top, m.n);
        break;
      case 'snap':
        if (!this.state || m.n < this._floor) break;
        // Far behind (a tab that was hidden, a slow device): skip straight to this copy rather
        // than replay everything before it.
        if (m.n - this._n > JUMP_SECS * TICK_HZ * (this.state.speed || 1)) this._q = [];
        this._q.push(m);
        this._top = Math.max(this._top, m.n);
        break;
      case 'at':
        if (m.n < this._floor) break;
        this._later.push([m.n, m.m]);
        this._release(); // at once, if the replay is already there
        break;
      case 'closed':
        this.emit('closed', { why: m.why });
        break;
      default:
        this.emit(m.t, m);
    }
  }
}
