// Entry point: reads the page options, shows the menu, and starts games.
//
// Page options (see docs/architecture.md):
//   ?solo=1 [&name=Dave]          start a solo game straight away
//   ?tutorial=1 [&step=9]         start the training shift, optionally at a later lesson (0-based)
//   ?demo=1                       solo game with the ready-made layout, doors already open
//   &ff=900                       run that many ticks before the first frame (host only)
//   &seed=7                       fixed random seed
//   &map=showroom&size=m          the store: a design and a size (keys of MAP_DESIGNS and MAP_SIZES)
//   &lobby=1                      start in the lobby, as games started from the menu do
//   &waves=10&difficulty=hard&cash=800   the game's settings (see SETTINGS in src/sim/constants.js)
//   ?local=host&code=TEST         host between tabs of this browser
//   ?local=join&code=TEST         join a tab of this browser
//   ?join=ABCDE                   an invite link: opens the menu with the room code filled in
//   ?online=host&code=ABCDE       test only: host online with a fixed room code
//   ?online=join&code=ABCDE       test only: join online straight away
//   &autostart=1                  test only: open the doors whenever a build phase starts
//   &holiday=xmas                 test only: play as if it were that holiday (a key of HOLIDAYS),
//                                 or &holiday=none for no holiday, whatever today's date
//   &cards=1                      deal the game's cards (through the deal) where it would have none:
//                                 ?solo=1, ?demo=1 (there the hand is dealt with no deal phase,
//                                 since the layout is built at once). &cards=0: no cards, even
//                                 where the menu would deal them (&lobby=1)
//   &cards=litter,hardy:karen     test only: exactly that hand (ids of CARDS, a per-kind card with
//                                 its kind), with no deal phase
//   &back=1                       start looking at The Back (0.4), the floor under the shop
//   &cam=x,y,zoom                 test only: centre the view on tile x,y at zoom CSS pixels a tile
//   &outof=7,11,dmg               test only: the OUT OF ... warning over the building on that tile
//   &hold=conv&dir=1&hover=12,5   test only: hold a building or part (dir its facing) with the mouse
//                                 on that tile, so a screenshot shows the build bar's card and the
//                                 placement preview (also hold=wire or hold=reinforce, 0.4)
//   &wireprev=9,8,1               test only: the floor shows the wire of the building on 9,8 run in
//                                 direction 1 (0-3 east, south, west, north; -1 none) as if it were
//                                 being tried, with the dads' routes as they would be (0.4)
import { showError } from './ui/errors.js';
import { holidayFor } from './content/holidays.js';
import { HostSession, ClientSession } from './net/session.js';
import { createDirector } from './content/director.js';
import { hostOnline, joinOnline, hostLocal, joinLocal, makeRoomCode } from './net/transports.js';
import { applyDemoLayout, createGame, MAP_DESIGNS, MAP_SIZES } from './sim/index.js';
import { loadName, saveName } from './ui/dom.js';
import { showMenu } from './ui/menu.js';
import { startGame } from './ui/game.js';
import { keepSaved, readSave, clearSave, dropOldSave } from './ui/save.js';

const app = document.getElementById('app');

// Lets phones and tablets offer "Install app" / "Add to Home screen", which opens the game full
// screen like an app. The worker stores nothing (see sw.js). Only on a real web address.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
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
/** How the first frame is looked at (see startGame's `look`): the page options above. */
const look = {
  floor: flag('back') ? 1 : 0,
  cam: q.get('cam'),
  hold: q.get('hold'),
  dir: num('dir'),
  hover: q.get('hover'),
  outof: q.get('outof'),
  select: q.get('select'),
  wireprev: q.get('wireprev'),
};
const defaultName = () => opts.name || loadName() || 'New Guy';

/** The store a new game is played in unless the player picks another: sized for one player. */
const DEFAULT_MAP = { design: 'warehouse', size: 's' };
/** Where a host learns that his page is hidden (0.4): the page itself, if there is one. */
const pageVisibility = () => (typeof document !== 'undefined' ? document : null);

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
 * @param {boolean} [lobby] start in the lobby: players look at the store, the host may change
 *   it, and the game begins when everyone has pressed Ready. Games started from the menu do.
 * @param {{design: string, size: string}|null} [map] the store chosen in the menu. `null` means
 *   the original small warehouse with one entrance (which the ready-made demo layout is for).
 */
function newHost(name, map = urlMap() || DEFAULT_MAP, lobby = flag('lobby'), settings = urlSettings()) {
  const inLobby = lobby && !!map;
  // Games through the lobby (every game from the menu) are dealt cards; the URL can say otherwise.
  const cards = urlCards() ?? inLobby;
  // (visibility: while this page is hidden, everyone else is told why the game crawls, 0.4.)
  return new HostSession({ name, seed: opts.seed, director: createDirector(), map, lobby: inLobby, settings, holiday: holidayNow(), cards, visibility: pageVisibility() });
}

/**
 * The cards the address asks for: true (&cards=1, a deal), false (&cards=0, none), a list of card
 * ids (a forced hand), or undefined if it does not say.
 */
function urlCards() {
  if (!q.has('cards')) return undefined;
  const v = (q.get('cards') || '').trim();
  if (v === '1' || v === 'true' || v === 'deal') return true;
  if (v === '' || v === '0' || v === 'false' || v === 'none') return false;
  return v.split(',').map((id) => id.trim()).filter(Boolean);
}

/**
 * The holiday a new game is played in: today's by this computer's date (the host's, since only
 * the host makes games), or the one the address asks for. See src/content/holidays.js.
 */
const holidayNow = () => holidayFor(q.get('holiday'));

/** Game settings named in the address, if any (anything not on the list falls back to the default). */
function urlSettings() {
  if (!q.has('waves') && !q.has('difficulty') && !q.has('cash')) return null;
  return { waves: num('waves'), difficulty: q.get('difficulty') || undefined, startCash: num('cash') };
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

/** The game screen now showing, if any. */
let game = null;

/** Shows a game, replacing the one on screen (after a host hand-over or a reconnection). */
function show(session, options) {
  if (game) game.destroy();
  if (stopSaving) stopSaving();
  // The host of a multiplayer game can take the group back to the lobby when it ends, keeping
  // the room open. The new game gets a fresh joke director, which remembers only one game. Its cards
  // follow the last game (the host's Cards setting carries over) unless the address says otherwise.
  const onLobby = session.isHost && options.roomKind
    ? () => session.backToLobby({ seed: opts.seed, director: createDirector(), holiday: holidayNow(), cards: urlCards() })
    : null;
  game = startGame(session, { mount: app, sound, onLobby, look, ...options });
  // Whoever hosts keeps the game saved in his browser, so it can be carried on another day.
  // (Not the training shift, and not the test options that fast-forward or build by themselves.)
  const real = session.isHost && !options.tutorial && !options.prepare && !options.ff && !options.autostart;
  stopSaving = real ? keepSaved(session, { kind: options.roomKind || 'solo' }) : null;
  return game;
}
let stopSaving = null;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tries something that may fail for a while (a room code still held, a host not up yet). */
async function keepTrying(fn, tries, pauseMs = 2000) {
  for (let n = 1; ; n++) {
    try { return await fn(); } catch (err) { if (n >= tries) throw err; }
    await wait(pauseMs);
  }
}

/**
 * What a joined player's game does when its host disappears: the game carries on with a new host.
 * Every player still in the game works out the same successor (the first of them in the list
 * of players). The successor's browser takes the game over from its own copy and opens the room
 * again under the same code; the others reconnect to it. The player who left can come back
 * with the original link and gets his place back by name.
 * @param {'online'|'local'} kind
 * @param {string} code the room code
 */
function hostLost(kind, code) {
  return async (old) => {
    const s = old.state;
    const name = s.players[old.me].name;
    const gone = s.host | 0;
    const staying = s.players.filter((p) => p.on && p.id !== gone);
    const successor = staying.length ? staying[0].id : old.me;
    if (successor === old.me) {
      const session = new HostSession({ name, director: createDirector(), state: JSON.parse(JSON.stringify(s)), takeOver: true, visibility: pageVisibility() });
      const accept = (conn) => session.accept(conn);
      // The old host's room code is released a few seconds after his page closes.
      const room = await keepTrying(async () => (kind === 'online' ? hostOnline(code, accept) : hostLocal(code, accept)), 30);
      addEventListener('pagehide', () => room.close());
      show(session, { roomCode: code, roomKind: kind, autostart: opts.autostart });
    } else {
      await wait(1500);
      const session = await keepTrying(async () => {
        const conn = await (kind === 'online' ? joinOnline(code) : joinLocal(code));
        const client = new ClientSession(conn, name);
        try { await whenReady(client); } catch (err) { conn.close(); throw err; }
        return client;
      }, 30);
      show(session, { roomCode: code, roomKind: kind, onHostLost: hostLost(kind, code) });
    }
  };
}

/** Leaves a game for the menu or a fresh solo game by reloading the page. */
function leaveTo(where) {
  if (game) game.allowLeave(); // he pressed a button to leave: do not ask "are you sure"
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
        ? 'The game is full. Seven people already work there, which is six too many.'
        : 'The host hung up on you before you got in. Rude, but fair.'));
    });
  });
}

const actions = {
  async solo(name, map, lobby, settings) {
    show(newHost(name, map, lobby, settings), { ff: opts.ff, autostart: opts.autostart });
  },
  /** The training shift: a guided game that cannot be lost. `step` jumps ahead (for screenshots). */
  async tutorial(name, step = 0) {
    const session = new HostSession({
      name, director: createDirector(), state: createGame({ seed: opts.seed || 7, training: true }),
    });
    show(session, { tutorial: true, tutorialStep: step, onExit: leaveTo });
  },
  async host(name, fixedCode, map, lobby, settings) {
    const code = fixedCode || makeRoomCode();
    const session = newHost(name, map, lobby, settings);
    const room = await hostOnline(code, (conn) => session.accept(conn));
    addEventListener('pagehide', () => room.close());
    show(session, { roomCode: code, roomKind: 'online', ff: opts.ff, autostart: opts.autostart });
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
    show(session, { roomCode: code.toUpperCase(), roomKind: 'online', onHostLost: hostLost('online', code.toUpperCase()) });
  },
  async hostLocal(name, code, map, lobby, settings) {
    const session = newHost(name, map, lobby, settings);
    const room = hostLocal(code, (conn) => session.accept(conn));
    addEventListener('pagehide', () => room.close());
    show(session, { roomCode: code.toUpperCase(), roomKind: 'local', ff: opts.ff, autostart: opts.autostart });
  },
  /**
   * Carries on the game saved in this browser, with this browser as its host. A game that had
   * other players in it reopens online under a new room code; they join with it and get their
   * places and money back by name.
   */
  async resume() {
    const save = readSave();
    if (!save) throw new Error('The saved game could not be read. It may be from an older version.');
    const session = new HostSession({ name: save.host, director: createDirector(), state: save.state, resume: true, visibility: pageVisibility() });
    if (save.players.length > 1 && save.kind !== 'local') {
      const code = makeRoomCode();
      const room = await hostOnline(code, (conn) => session.accept(conn));
      addEventListener('pagehide', () => room.close());
      show(session, { roomCode: code, roomKind: 'online' });
    } else if (save.kind === 'local') {
      const code = makeRoomCode();
      const room = hostLocal(code, (conn) => session.accept(conn));
      addEventListener('pagehide', () => room.close());
      show(session, { roomCode: code, roomKind: 'local' });
    } else {
      show(session, {});
    }
  },
  /** Throws the saved game away. */
  forget() { clearSave(); },
  async joinLocal(name, code) {
    const conn = await joinLocal(code);
    const session = new ClientSession(conn, name);
    try {
      await whenReady(session);
    } catch (err) {
      conn.close();
      throw err;
    }
    show(session, { roomCode: code.toUpperCase(), roomKind: 'local', onHostLost: hostLost('local', code.toUpperCase()) });
  },
};

/** The room code from an invite link (?join=ABCDE), tidied up. */
const inviteCode = (q.get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

function menu(error = '') {
  // A save from before 0.4 cannot be carried on: say so once, and it is gone.
  const old = dropOldSave();
  const note = old === null ? '' : `Your saved game${old ? ` (from version ${old})` : ''} was thrown out: the factory has moved downstairs since then, and old saves cannot follow it. Start a new one.`;
  showMenu(app, actions, { error, note, name: opts.name, code: inviteCode, map: urlMap(), settings: urlSettings(), save: readSave() });
}

async function boot() {
  const name = defaultName();
  if (flag('demo')) {
    // The demo builds its layout and opens the doors at once, which the deal would refuse: asked
    // for a deal, it gets the hand the deal would have given, without the deal.
    const host = newHost(name, null);
    const s = host.state;
    if (s.phase === 'cards') { s.phase = 'build'; delete s.dealT; }
    show(host, {
      ff: opts.ff, autostart: opts.autostart,
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
