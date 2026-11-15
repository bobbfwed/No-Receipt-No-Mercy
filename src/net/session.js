// Sessions connect the simulation to the screen and to the other players.
//
// The host's browser owns the real game state: it runs the simulation, checks every command,
// and sends the whole state to the other players a few times a second. Each client runs the same
// simulation on its copy between updates, so movement stays smooth, and replaces its copy
// whenever a fresh one arrives.
//
// Both kinds of session offer the same interface to the user interface:
//   session.state        the current game state (null on a client until it has joined)
//   session.me           this player's id
//   session.isHost
//   session.send(cmd)    issue a command (see applyCommand in src/sim/commands.js)
//   session.on(type, fn) listen for messages; returns a function that stops listening
//   session.drainFx()    simulation events since the last call, for effects and sounds
//   session.start() / session.stop()   run on a timer
//   session.update(nowMs)              or drive it by hand (tests)
//
// Message types passed to on():
//   'ready'   {}                       client only: joined, state is available
//   'say'     {who, text, mood}        a character speaks (DEB the HR chatbot)
//   'review'  {stars, text, kind}      a customer review toast
//   'report'  {wave, bonus, rows, employee, deb, totals}  end-of-wave performance review
//   'players' {text}                   someone joined or left
//   'nope'    {why, cmd}               your command was refused
//   'cursor'  {pid, x, y}              where another player is pointing, in tiles
//   'closed'  {why}                    client only: lost the host
//   'fx'      [event, ...]             the simulation events of one tick (see step() in
//                                      src/sim/step.js), for sound and the tutorial. The handler
//                                      receives the array itself, not an object. On a client these
//                                      come from its own prediction, so treat them as cosmetic.
import { createGame, addPlayer, setPlayerOnline, applyCommand, step, TICK_HZ } from '../sim/index.js';

const TICK_MS = 1000 / TICK_HZ;
/** Ticks between routine state updates sent to clients (5 a second). */
const SNAP_EVERY = 6;
/** A client stops predicting this many ticks after its last update, in case the host has stalled. */
const MAX_AHEAD = 20;

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
    const dt = Math.max(0, Math.min(3000, now - this._last));
    this._last = now;
    return dt;
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
   * @param {Object} [o.director] turns simulation events into jokes; see src/content/director.js
   * @param {Object} [o.state]   continue an existing game instead of starting a new one
   */
  constructor({ name, seed = (Date.now() & 0x7fffffff) || 1, director = null, state = null }) {
    super();
    this.isHost = true;
    this.state = state || createGame({ seed });
    this.me = addPlayer(this.state, name);
    this.director = director;
    /** @type {Map<Object, number>} connection -> player id */
    this.conns = new Map();
    this._dirty = false;
    this._sinceSnap = 0;
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

  update(now) {
    this._acc += this._elapsed(now) * (this.state.speed || 1);
    let n = 0;
    while (this._acc >= TICK_MS && n++ < 400) {
      this._acc -= TICK_MS;
      this._tick();
    }
    if (this._acc > TICK_MS * 400) this._acc = 0;
    if (this._dirty) this._sendSnapshots();
  }

  /** Runs the game forward a number of ticks at once (testing and screenshots). */
  fastForward(ticks) {
    for (let i = 0; i < ticks; i++) this._tick();
    if (this._dirty) this._sendSnapshots();
  }

  _tick() {
    const ev = step(this.state);
    if (ev.length) this._onSimEvents(ev);
    if (this.director && this.state.tick % TICK_HZ === 0) {
      for (const msg of this.director.idle(this.state)) this._announce(msg);
    }
    if (++this._sinceSnap >= SNAP_EVERY) this._dirty = true;
  }

  _onMessage(conn, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      if (this.conns.has(conn)) return;
      const pid = addPlayer(this.state, m.name);
      if (pid < 0) {
        conn.send({ t: 'closed', why: 'full' });
        conn.close();
        return;
      }
      this.conns.set(conn, pid);
      conn.send({ t: 'welcome', me: pid, s: this.state });
      this._dirty = true;
      this._announce({ t: 'players', text: `${this.state.players[pid].name} has clocked in.` });
      this._direct([{ e: 'joined', by: pid }]);
      return;
    }
    const pid = this.conns.get(conn);
    if (pid === undefined) return;
    if (m.t === 'cmd') {
      const r = this._apply(pid, m.c);
      if (!r.ok) conn.send({ t: 'nope', why: r.why, cmd: m.c });
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
    setPlayerOnline(this.state, pid, false);
    this._dirty = true;
    this._announce({ t: 'players', text: `${this.state.players[pid].name} has left the building.` });
    this._direct([{ e: 'quit', by: pid }]);
  }

  _apply(pid, cmd) {
    const ev = [];
    const r = applyCommand(this.state, pid, cmd, ev);
    if (r.ok) this._dirty = true;
    else if (pid === this.me) this.emit('nope', { why: r.why, cmd });
    if (ev.length) this._onSimEvents(ev);
    return r;
  }

  _onSimEvents(ev) {
    for (const e of ev) this.fx.push(e);
    this.emit('fx', ev);
    this._direct(ev);
  }

  _direct(ev) {
    if (!this.director) return;
    for (const msg of this.director.handle(ev, this.state)) this._announce(msg);
  }

  /** Tells every player something: the host's own screen and all clients. */
  _announce(msg) {
    this.emit(msg.t, msg);
    this._broadcast(msg);
  }

  _broadcast(msg) {
    for (const c of this.conns.keys()) c.send(msg);
  }

  _sendSnapshots() {
    this._dirty = false;
    this._sinceSnap = 0;
    if (this.conns.size) this._broadcast({ t: 'snap', s: this.state });
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
    this._ahead = 0;
    this._fxTick = -1;
    conn.onmessage = (m) => this._onMessage(m);
    conn.onclose = () => this.emit('closed', { why: 'lost' });
    conn.send({ t: 'hello', name });
  }

  send(cmd) {
    this.conn.send({ t: 'cmd', c: cmd });
  }

  sendCursor(x, y) {
    this.conn.send({ t: 'cursor', x, y });
  }

  update(now) {
    const dt = this._elapsed(now);
    if (!this.state) return;
    this._acc += dt * (this.state.speed || 1);
    while (this._acc >= TICK_MS) {
      this._acc -= TICK_MS;
      if (this._ahead >= MAX_AHEAD) { this._acc = 0; break; }
      this._ahead++;
      const ev = step(this.state);
      // Effects only, and only for ticks not shown before; real news comes from the host.
      if (this.state.tick > this._fxTick) {
        this._fxTick = this.state.tick;
        for (const e of ev) this.fx.push(e);
        if (ev.length) this.emit('fx', ev);
      }
    }
  }

  _onMessage(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'welcome':
        this.me = m.me;
        this.state = m.s;
        this._ahead = 0;
        this.emit('ready', {});
        break;
      case 'snap':
        this.state = m.s;
        this._ahead = 0;
        this._acc = 0;
        break;
      case 'closed':
        this.emit('closed', { why: m.why });
        break;
      default:
        this.emit(m.t, m);
    }
  }
}
