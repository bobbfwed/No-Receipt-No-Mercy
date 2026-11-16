// Entry point: reads the page options, shows the menu, and starts games.
//
// Page options (see docs/architecture.md):
//   ?solo=1 [&name=Dave]          start a solo game straight away
//   ?tutorial=1 [&step=9]         start the training shift, optionally at a later lesson (0-based)
//   ?demo=1                       solo game with the ready-made layout, doors already open
//   &ff=900                       run that many ticks before the first frame (host only)
//   &seed=7                       fixed random seed
//   &map=showroom&size=m          the store: a design and a size (keys of MAP_DESIGNS and MAP_SIZES)
//   ?local=host&code=TEST         host between tabs of this browser
//   ?local=join&code=TEST         join a tab of this browser
//   ?join=ABCDE                   an invite link: opens the menu with the room code filled in
//   ?online=host&code=ABCDE       test only: host online with a fixed room code
//   ?online=join&code=ABCDE       test only: join online straight away
//   &autostart=1                  test only: open the doors whenever a build phase starts
import { showError } from './ui/errors.js';
import { HostSession, ClientSession } from './net/session.js';
import { createDirector } from './content/director.js';
import { hostOnline, joinOnline, hostLocal, joinLocal, makeRoomCode } from './net/transports.js';
import { applyDemoLayout, createGame, MAP_DESIGNS, MAP_SIZES } from './sim/index.js';
import { loadName, saveName } from './ui/dom.js';
import { showMenu } from './ui/menu.js';
import { startGame } from './ui/game.js';

const app = document.getElementById('app');
const q = new URLSearchParams(location.search);
const flag = (k) => q.has(k) && q.get(k) !== '0' && q.get(k) !== 'false';
const num = (k) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : undefined);

const opts = {
  name: (q.get('name') || '').trim().slice(0, 14),
  seed: num('seed') !== undefined ? (num('seed') >>> 0) || 1 : undefined,
  ff: Math.max(0, Math.floor(num('ff') || 0)),
  autostart: flag('autostart'),
};
if (opts.name) saveName(opts.name);
const defaultName = () => opts.name || loadName() || 'New Guy';

/** The store a new game is played in unless the player picks another: sized for one player. */
const DEFAULT_MAP = { design: 'warehouse', size: 's' };
/** A store named in the URL, if any. */
function urlMap() {
  const design = q.get('map'), size = q.get('size');
  if (!design && !size) return null;
  return {
    design: MAP_DESIGNS[design] ? design : DEFAULT_MAP.design,
    size: MAP_SIZES[size] ? size : DEFAULT_MAP.size,
  };
}

/**
 * @param {string} name
 * @param {{design: string, size: string}|null} [map] the store chosen in the menu. `null` means
 *   the original small warehouse with one entrance (which the ready-made demo layout is for).
 */
function newHost(name, map = urlMap() || DEFAULT_MAP) {
  return new HostSession({ name, seed: opts.seed, director: createDirector(), map });
}

// Sound is optional: if the module fails to load, the game still runs, silently.
let sound = null;
try {
  const { createSound } = await import('./audio/sound.js');
  sound = createSound();
  // Browsers only allow sound after the player has clicked or pressed a key.
  const unlock = () => sound.unlock();
  addEventListener('pointerdown', unlock, true);
  addEventListener('keydown', unlock, true);
} catch (err) {
  console.warn('Sound is unavailable:', err);
}

/** Leaves a game for the menu or a fresh solo game by reloading the page. */
function leaveTo(where) {
  location.assign(where === 'solo' ? `${location.pathname}?solo=1` : location.pathname);
}

/** Waits for a client's first state, or for the host to turn it away. */
function whenReady(session, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const stop = () => { clearTimeout(timer); offReady(); offClosed(); };
    const timer = setTimeout(() => { stop(); reject(new Error('Connected, but the host never let us in. Try again.')); }, timeoutMs);
    const offReady = session.on('ready', () => { stop(); resolve(); });
    const offClosed = session.on('closed', (m) => {
      stop();
      reject(new Error(m.why === 'full'
        ? 'The game is full. Six people already work there, which is five too many.'
        : 'The host hung up on you before you got in. Rude, but fair.'));
    });
  });
}

const actions = {
  async solo(name, map) {
    startGame(newHost(name, map), { mount: app, sound, ff: opts.ff, autostart: opts.autostart });
  },
  /** The training shift: a guided game that cannot be lost. `step` jumps ahead (for screenshots). */
  async tutorial(name, step = 0) {
    const session = new HostSession({
      name, director: createDirector(), state: createGame({ seed: opts.seed || 7, training: true }),
    });
    startGame(session, { mount: app, sound, tutorial: true, tutorialStep: step, onExit: leaveTo });
  },
  async host(name, fixedCode, map) {
    const code = fixedCode || makeRoomCode();
    const session = newHost(name, map);
    const room = await hostOnline(code, (conn) => session.accept(conn));
    addEventListener('pagehide', () => room.close());
    startGame(session, { mount: app, sound, roomCode: code, roomKind: 'online', ff: opts.ff, autostart: opts.autostart });
  },
  async join(name, code) {
    const conn = await joinOnline(code);
    const session = new ClientSession(conn, name);
    try {
      await whenReady(session);
    } catch (err) {
      conn.close();
      throw err;
    }
    startGame(session, { mount: app, sound, roomCode: code.toUpperCase(), roomKind: 'online' });
  },
  async hostLocal(name, code, map) {
    const session = newHost(name, map);
    const room = hostLocal(code, (conn) => session.accept(conn));
    addEventListener('pagehide', () => room.close());
    startGame(session, { mount: app, sound, roomCode: code.toUpperCase(), roomKind: 'local', ff: opts.ff, autostart: opts.autostart });
  },
  async joinLocal(name, code) {
    const conn = await joinLocal(code);
    const session = new ClientSession(conn, name);
    try {
      await whenReady(session);
    } catch (err) {
      conn.close();
      throw err;
    }
    startGame(session, { mount: app, sound, roomCode: code.toUpperCase(), roomKind: 'local' });
  },
};

/** The room code from an invite link (?join=ABCDE), tidied up. */
const inviteCode = (q.get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

function menu(error = '') {
  showMenu(app, actions, { error, name: opts.name, code: inviteCode, map: urlMap() });
}

async function boot() {
  const name = defaultName();
  if (flag('demo')) {
    startGame(newHost(name, null), {
      mount: app, sound, ff: opts.ff, autostart: opts.autostart,
      prepare(session) {
        const problems = applyDemoLayout(session.state, session.me);
        if (problems.length) showError(`Demo layout: ${problems.join('; ')}`);
        session.send({ c: 'start' });
      },
    });
  } else if (flag('tutorial')) {
    await actions.tutorial(name, Math.max(0, Math.floor(num('step') || 0)));
  } else if (flag('solo')) {
    await actions.solo(name);
  } else if (q.get('online') === 'host' || q.get('online') === 'join') {
    // Test only: host or join over the internet without touching the menu.
    const code = (q.get('code') || '').toUpperCase();
    try {
      await (q.get('online') === 'host' ? actions.host(name, code) : actions.join(name, code));
    } catch (err) {
      menu(err && err.message ? err.message : String(err));
    }
  } else if (q.get('local') === 'host' || q.get('local') === 'join') {
    const code = (q.get('code') || 'TEST').toUpperCase();
    try {
      await (q.get('local') === 'host' ? actions.hostLocal(name, code) : actions.joinLocal(name, code));
    } catch (err) {
      menu(err && err.message ? err.message : String(err));
    }
  } else {
    menu();
  }
}

boot();
