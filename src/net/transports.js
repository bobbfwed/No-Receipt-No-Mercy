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

/** A connection that queues incoming messages until someone is listening. */
function makeConn(sendFn, closeFn) {
  let handler = null;
  const pending = [];
  const conn = {
    open: true,
    onclose: null,
    send(obj) { if (conn.open) sendFn(obj); },
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
    /** Called by the transport when a message arrives. */
    _receive(obj) {
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

/** Two connections joined back to back. Messages are copied as JSON, like a real network. */
export function memoryPair() {
  const a = makeConn((o) => b._receive(JSON.parse(JSON.stringify(o))), () => b._closed());
  const b = makeConn((o) => a._receive(JSON.parse(JSON.stringify(o))), () => a._closed());
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
  const conn = makeConn((o) => dc.send(o), () => dc.close());
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
    const peer = new Peer(peerId(code));
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
export function joinOnline(code, timeoutMs = 15000) {
  const Peer = peerLibrary();
  return new Promise((resolve, reject) => {
    const peer = new Peer();
    let done = false;
    const fail = (text) => { if (!done) { done = true; peer.destroy(); reject(new Error(text)); } };
    const timer = setTimeout(() => fail('Timed out. Check the room code, and that the host still has the game open.'), timeoutMs);
    peer.on('open', () => {
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
