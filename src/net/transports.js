// Transports carry messages between the host's browser and the other players' browsers.
// Every transport produces the same kind of connection object:
//   conn.send(obj)       send a JSON-safe object to the other side
//   conn.close()
//   conn.onmessage = fn  called with each object received
//   conn.onclose = fn    called once when the link is lost
//
// Three transports:
//   memoryPair()                  two linked connections in one page (tests)
//   hostLocal() / joinLocal()     browser tabs on one computer, via BroadcastChannel (testing)
//   hostOnline() / joinOnline()   over the internet, browser to browser (WebRTC via PeerJS)
//
// A message too big for one go (a whole game state on a big map) is cut into parts here and
// put back together on the other side, so a session never has to think about sizes.
import { RELAY } from './relay.js';

/** The biggest single message, in bytes of JSON, sent in one piece; anything bigger is cut up. */
export const MAX_MESSAGE = 48 * 1024;
/**
 * The same for the internet link. PeerJS refuses (and reports as an error, which drops the
 * player) any message of 16,300 bytes or more on its JSON channel, so stay well under that.
 */
const PEER_MAX_MESSAGE = 15 * 1024;
/** The type of the envelope a part travels in. Sessions never see it. */
const PART = '~part';

/** Bytes a string takes as UTF-8, which is what goes down the wire. */
export function utf8Length(str) {
  let n = str.length;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) continue;
    if (c < 0x800) n += 1;
    else if (c >= 0xd800 && c <= 0xdbff) { i++; n += 2; } // a pair of halves: 4 bytes for 2 chars
    else n += 2;
  }
  return n;
}

/**
 * Cuts a message into parts that each fit in `max` bytes of JSON.
 * @param {string} text the message as JSON
 * @param {number} id tells this message's parts from another's
 * @returns {Array<{t: string, id: number, i: number, n: number, d: string}>}
 */
export function splitMessage(text, id, max = MAX_MESSAGE) {
  const room = max - 80; // the envelope around each piece
  const pieces = [];
  let pos = 0;
  while (pos < text.length) {
    let len = Math.min(room, text.length - pos);
    // Quotes and backslashes grow when the piece is written as a JSON string, and so do
    // letters outside plain ASCII; shrink the piece until it really fits.
    while (len > 16 && utf8Length(JSON.stringify(text.slice(pos, pos + len))) > room) len = Math.floor(len * 0.8);
    pieces.push(text.slice(pos, pos + len));
    pos += len;
  }
  return pieces.map((d, i) => ({ t: PART, id, i, n: pieces.length, d }));
}

/**
 * Puts parts back together. `take(msg)` returns the message itself if it is not a part, the
 * whole message once its last part has arrived, and undefined while parts are still missing.
 */
export function createJoiner() {
  const open = new Map(); // id -> { n, got, parts }
  return {
    take(msg) {
      if (!msg || msg.t !== PART) return msg;
      const { id, i, n, d } = msg;
      if (!(n > 0) || !(i >= 0 && i < n) || typeof d !== 'string') return undefined;
      let job = open.get(id);
      if (!job) {
        job = { n, got: 0, parts: new Array(n) };
        open.set(id, job);
        // A message whose other parts never come (a link that dropped half way) is forgotten.
        if (open.size > 8) open.delete(open.keys().next().value);
      }
      if (job.parts[i] === undefined) { job.parts[i] = d; job.got++; }
      if (job.got < job.n) return undefined;
      open.delete(id);
      try { return JSON.parse(job.parts.join('')); } catch { return undefined; }
    },
  };
}

/**
 * A connection that queues incoming messages until someone is listening, and cuts big messages
 * into parts.
 * @param {(obj: Object, text: string) => void} sendFn sends one message; `text` is its JSON
 * @param {number} [max] the biggest message, in bytes of JSON, to send in one piece
 */
function makeConn(sendFn, closeFn, max = MAX_MESSAGE) {
  let handler = null;
  const pending = [];
  const joiner = createJoiner();
  let nextId = 1;
  const conn = {
    open: true,
    onclose: null,
    /** Bytes of JSON sent so far (for measuring). */
    sent: 0,
    send(obj) {
      if (!conn.open) return;
      const text = JSON.stringify(obj);
      if (text === undefined) return;
      // Most messages are small and plain ASCII, so the length is the size; check properly only
      // when it might matter.
      if (text.length * 3 <= max || utf8Length(text) <= max) {
        conn.sent += text.length;
        sendFn(obj, text);
        return;
      }
      for (const part of splitMessage(text, nextId++, max)) {
        const t = JSON.stringify(part);
        conn.sent += t.length;
        sendFn(part, t);
      }
    },
    close() {
      if (!conn.open) return;
      conn.open = false;
      closeFn();
    },
    get onmessage() { return handler; },
    set onmessage(fn) {
      handler = fn;
      while (fn && pending.length) fn(pending.shift());
    },
    /** Called by the transport when a message (or part of one) arrives. */
    _receive(raw) {
      const obj = joiner.take(raw);
      if (obj === undefined) return;
      if (handler) handler(obj); else pending.push(obj);
    },
    /** Called by the transport when the link is lost. */
    _closed() {
      if (!conn.open) return;
      conn.open = false;
      if (conn.onclose) conn.onclose();
    },
  };
  return conn;
}

/**
 * Two connections joined back to back. Messages are copied as JSON, like a real network.
 * @param {number} [max] the biggest message sent in one piece (tests use a small one)
 */
export function memoryPair(max = MAX_MESSAGE) {
  const a = makeConn((o, text) => b._receive(JSON.parse(text)), () => b._closed(), max);
  const b = makeConn((o, text) => a._receive(JSON.parse(text)), () => a._closed(), max);
  return [a, b];
}

// ---- Same computer: BroadcastChannel ---------------------------------------------------------

const channelName = (code) => `returns-dept-${String(code).toUpperCase()}`;

/**
 * Hosts a game other tabs of this browser can join.
 * @param {string} code room code
 * @param {(conn: Object) => void} onConnection called for each tab that joins
 * @returns {{close: () => void}}
 */
export function hostLocal(code, onConnection) {
  const ch = new BroadcastChannel(channelName(code));
  const conns = new Map();
  ch.onmessage = ({ data }) => {
    if (!data || data.to !== 'host') return;
    let conn = conns.get(data.from);
    if (data.kind === 'open' && !conn) {
      conn = makeConn(
        (o) => ch.postMessage({ to: data.from, kind: 'data', body: o }),
        () => { ch.postMessage({ to: data.from, kind: 'close' }); conns.delete(data.from); },
      );
      conns.set(data.from, conn);
      ch.postMessage({ to: data.from, kind: 'accepted' });
      onConnection(conn);
    } else if (data.kind === 'data' && conn) {
      conn._receive(data.body);
    } else if (data.kind === 'close' && conn) {
      conns.delete(data.from);
      conn._closed();
    }
  };
  return {
    close() {
      for (const id of conns.keys()) ch.postMessage({ to: id, kind: 'close' });
      ch.close();
    },
  };
}

/**
 * Joins a game hosted in another tab of this browser.
 * @returns {Promise<Object>} the connection, once the host has answered
 */
export function joinLocal(code, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const ch = new BroadcastChannel(channelName(code));
    const id = `tab-${Math.random().toString(36).slice(2, 10)}`;
    const conn = makeConn(
      (o) => ch.postMessage({ to: 'host', from: id, kind: 'data', body: o }),
      () => { ch.postMessage({ to: 'host', from: id, kind: 'close' }); ch.close(); },
    );
    const timer = setTimeout(() => { ch.close(); reject(new Error('No game with that code is open in this browser.')); }, timeoutMs);
    ch.onmessage = ({ data }) => {
      if (!data || data.to !== id) return;
      if (data.kind === 'accepted') { clearTimeout(timer); resolve(conn); }
      else if (data.kind === 'data') conn._receive(data.body);
      else if (data.kind === 'close') { conn._closed(); ch.close(); }
    };
    addEventListener('pagehide', () => conn.close());
    ch.postMessage({ to: 'host', from: id, kind: 'open' });
  });
}

// ---- Over the internet: WebRTC through PeerJS --------------------------------------------------

const peerId = (code) => `returns-dept-v1-${String(code).toUpperCase()}`;

/**
 * Helper servers two browsers use to find a way to each other.
 * STUN servers tell a browser its public address; that is enough for most home routers.
 * TURN servers relay the traffic when it is not (strict routers, some mobile and office
 * networks). tools/net-check.html reports which of these answer from a given computer.
 */
export const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // The relays the PeerJS project runs for its users. Free, and not always up: when they are
  // down, two players on the same wifi, or behind strict routers, cannot connect without a
  // relay of the owner's own (src/net/relay.js), which is added below when it is filled in.
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
];

/**
 * What is wrong with the owner's relay settings in src/net/relay.js: null if they are complete,
 * 'empty' if nothing has been filled in, otherwise a sentence for tools/net-check.html. A relay
 * with no user name or password must never reach the browser: it refuses the whole list of
 * helper servers, which would stop online play altogether.
 */
export const OWN_RELAY_PROBLEM = relayProblem(RELAY);
/** The owner's own relay, in the form browsers want, or null if it is not (fully) filled in. */
export const OWN_RELAY = OWN_RELAY_PROBLEM ? null : {
  urls: relayUrls(RELAY),
  username: String(RELAY.username).trim(),
  credential: String(RELAY.credential).trim(),
};
if (OWN_RELAY) ICE_SERVERS.unshift(OWN_RELAY);

function relayUrls(r) {
  return [].concat((r && r.urls) || []).map((u) => String(u).trim()).filter(Boolean);
}

export function relayProblem(r) {
  const urls = relayUrls(r);
  if (!urls.length && !String((r && r.username) || '').trim() && !String((r && r.credential) || '').trim()) return 'empty';
  if (!urls.length) return 'There is a user name or password but no addresses (urls).';
  const odd = urls.find((u) => !/^turns?:/i.test(u));
  if (odd) return `"${odd}" is not a relay address: each one starts with turn: or turns:`;
  if (!String(r.username || '').trim()) return 'The user name is missing.';
  if (!String(r.credential || '').trim()) return 'The password (credential) is missing.';
  return null;
}
const PEER_OPTIONS = { config: { iceServers: ICE_SERVERS } };

/** A five-letter room code without letters that are easy to confuse. */
export function makeRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 5; i++) code += letters[(Math.random() * letters.length) | 0];
  return code;
}

function peerLibrary() {
  const Peer = globalThis.Peer;
  if (!Peer) throw new Error('The network library (vendor/peerjs.min.js) did not load.');
  return Peer;
}

function wrapPeerConn(dc) {
  const conn = makeConn((o) => dc.send(o), () => dc.close(), PEER_MAX_MESSAGE);
  dc.on('data', (o) => conn._receive(o));
  dc.on('close', () => conn._closed());
  dc.on('error', () => conn._closed());
  return conn;
}

/**
 * Hosts a game friends can join from anywhere with the room code.
 * @param {string} code room code, e.g. from makeRoomCode()
 * @param {(conn: Object) => void} onConnection called for each friend who joins
 * @returns {Promise<{close: () => void}>} resolves once the room is registered
 */
export function hostOnline(code, onConnection) {
  const Peer = peerLibrary();
  return new Promise((resolve, reject) => {
    const peer = new Peer(peerId(code), PEER_OPTIONS);
    let ready = false;
    peer.on('open', () => { ready = true; resolve({ close: () => peer.destroy() }); });
    peer.on('connection', (dc) => dc.on('open', () => onConnection(wrapPeerConn(dc))));
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('error', (err) => {
      if (ready) return; // players already connected keep working without the broker
      reject(new Error(err.type === 'unavailable-id' ? 'That room code is already in use.' : `Could not open a room (${err.type || err.message}).`));
    });
  });
}

/**
 * Joins a friend's game.
 * @returns {Promise<Object>} the connection to the host
 */
export function joinOnline(code, timeoutMs = 20000) {
  const Peer = peerLibrary();
  return new Promise((resolve, reject) => {
    const peer = new Peer(PEER_OPTIONS);
    let done = false;
    const fail = (text) => { if (!done) { done = true; peer.destroy(); reject(new Error(text)); } };
    // Two different failures look the same from outside, so say which it was.
    let asked = false; // true once the broker has been asked to put us through to the host
    const timer = setTimeout(() => fail(asked
      ? 'Found the room, but your browser and the host\'s could not reach each other. This usually means you are both on the same wifi, or one of you is behind a strict firewall or VPN. Try from a different network (a phone on mobile data, for example).'
      : 'Timed out reaching the matchmaking service. Check your internet connection and try again.'), timeoutMs);
    peer.on('open', () => {
      asked = true;
      const dc = peer.connect(peerId(code), { reliable: true, serialization: 'json' });
      dc.on('open', () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const conn = wrapPeerConn(dc);
        const close = conn.close;
        conn.close = () => { close(); peer.destroy(); };
        resolve(conn);
      });
      dc.on('error', () => fail('Could not connect to the host.'));
    });
    peer.on('error', (err) => {
      clearTimeout(timer);
      fail(err.type === 'peer-unavailable' ? 'No game found with that room code.' : `Could not connect (${err.type || err.message}).`);
    });
  });
}
