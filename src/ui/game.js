// The game screen: puts the top bar, the canvas, the build bar and the floating panels together,
// connects them to the session, and runs the drawing loop.
import { createRenderer } from '../render/renderer.js';
import { createMinimap } from '../render/minimap.js';
import { nopeLine } from '../content/lines.js';
import { h } from './dom.js';
import { createTopBar, createPlayersPanel } from './hud.js';
import { createBuildBar } from './buildbar.js';
import { createPlanner } from './planner.js';
import { createInput } from './input.js';
import { createDeb } from './deb.js';
import { createToasts } from './toasts.js';
import { createReview } from './review.js';
import { endScreen, closedScreen, handoverScreen, helpScreen } from './overlays.js';
import { createTutorialPanel } from './tutorial.js';
import { createLobby } from './lobby.js';
import { createChat } from './chat.js';
import { openHandbook } from './handbook.js';
import { createBossBar } from './bossbar.js';
import { createRebuildPop } from './rebuild.js';
import { noteRecord } from './record.js';
import { forTouch, isTouch } from '../content/touch.js';
import { createTouchControls, isCoarse } from './touch.js';
import { BUILD, ZONES } from '../sim/index.js';

/** A phone-sized screen (the same limits as the narrow layout in style.css). */
const narrow = () => innerWidth < 1100 || innerHeight < 560;

/**
 * Shows the game for a session that is ready (a host, or a client after 'ready').
 * @param {Object} session
 * @param {Object} [o]
 * @param {string|null} [o.roomCode]
 * @param {'online'|'local'|null} [o.roomKind]
 * @param {(session) => void} [o.prepare]  runs after the interface listens, before fast-forward
 * @param {number} [o.ff]          host only: ticks to run before the first frame
 * @param {boolean} [o.autostart]  host only, for tests: open the doors whenever a build phase starts
 * @param {HTMLElement} o.mount
 * @param {boolean} [o.tutorial]   run the training shift (the session's game must be in training mode)
 * @param {number} [o.tutorialStep] start the training at this step (for screenshots)
 * @param {(where: 'solo'|'menu') => void} [o.onExit] leave the training shift
 * @param {Object} [o.sound]       the sound module from src/audio/sound.js, if there is one
 * @param {(session) => Promise} [o.onHostLost] a joined player's game lost its host: carry the
 *   game on some other way (see main.js). It resolves once a new game screen has replaced
 *   this one, or rejects if that could not be done, and then the usual "host has left" shows.
 * @param {() => void} [o.onLobby] host of a multiplayer game only: the end screen's button takes
 *   everyone back to the lobby with this (see HostSession.backToLobby) instead of reloading
 */
export function startGame(session, {
  roomCode = null, roomKind = null, prepare = null, ff = 0, autostart = false, mount,
  tutorial = false, tutorialStep = 0, onExit = () => {}, sound = null, onHostLost = null, onLobby = null,
}) {
  const canvas = h('canvas', { class: 'world', 'aria-label': 'The warehouse floor. Use the mouse to build.' });
  const stage = h('main', { class: 'stage' }, canvas);
  const renderer = createRenderer(canvas, session);
  const playSound = (name) => { if (sound) sound.play(name); };

  let help = null;
  const toggleHelp = () => {
    if (help) { help.remove(); help = null; return; }
    help = helpScreen(() => { help?.remove(); help = null; }, () => { toggleHelp(); openHandbook(session.state); });
    root.append(help);
  };

  const review = createReview(session);
  const input = createInput({
    canvas, renderer, session, playSound,
    onEscape: () => {
      if (help) { toggleHelp(); return true; }
      if (review.open) { review.close(); return true; }
      return false;
    },
  });
  // The Head Office player sees the planner instead of the build bar.
  const planner = createPlanner(session, { playSound });
  const top = createTopBar(session, { roomCode, roomKind, onHelp: toggleHelp, onHandbook: () => openHandbook(session.state), sound, playSound, budgetLeft: planner.left });
  const players = createPlayersPanel(session, { playSound });
  const bar = createBuildBar(input, session);
  // Buttons for what the keyboard and the right mouse button do, for touch screens only.
  const touchUi = createTouchControls({ input, session, renderer, playSound });
  bar.el.append(touchUi.bar);
  const deb = createDeb();
  const toasts = createToasts({ getState: () => session.state });
  const training = tutorial && session.isHost
    ? createTutorialPanel(session, { onExit, highlight: bar.highlight, playSound })
    : null;

  // A small map of the whole store, for maps too big to see at once. Click it to jump there.
  const mapCanvas = h('canvas', { class: 'minimap-canvas' });
  const mapBox = h('div', { class: 'minimap hidden', title: 'The whole store. Click to jump there. WASD moves the view, the wheel zooms, F shows everything, H goes to your entrance.' }, mapCanvas);
  const minimap = createMinimap(mapCanvas, session, renderer);
  const jump = (e) => {
    const t = minimap.tileAt(e.clientX, e.clientY);
    if (t) renderer.centerOn(t.x + 0.5, t.y + 0.5);
  };
  mapBox.addEventListener('pointerdown', (e) => { e.preventDefault(); mapBox.setPointerCapture(e.pointerId); jump(e); });
  mapBox.addEventListener('pointermove', (e) => { if (e.buttons & 1) jump(e); });

  // On a big map the painted floor a machine needs may be off screen. When it is, say where the
  // nearest patch is and offer to go there.
  let zoneSpot = null;
  const zoneText = h('span');
  const zoneHint = h('div', { class: 'zone-hint hidden', role: 'status' }, zoneText,
    h('button', { type: 'button', class: 'btn-small', onclick: () => { if (zoneSpot) renderer.centerOn(zoneSpot.x + 0.5, zoneSpot.y + 0.5); } }, 'Take me there'));
  stage.append(zoneHint);
  let zoneKey = '';
  function updateZoneHint(s) {
    const def = BUILD[input.tool];
    const ch = def && s.zones ? def.zone : null;
    const r = renderer.viewRect();
    const key = ch ? `${ch},${Math.round(r.x0)},${Math.round(r.y0)},${Math.round(r.x1)},${Math.round(r.y1)}` : '';
    if (key === zoneKey) return;
    zoneKey = key;
    zoneSpot = null;
    if (ch) {
      const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
      let best = Infinity, seen = false;
      for (let i = 0; i < s.zones.length && !seen; i++) {
        if (s.zones[i] !== ch) continue;
        const x = i % s.w, y = (i / s.w) | 0;
        if (x + 1 > r.x0 && x < r.x1 && y + 1 > r.y0 && y < r.y1) { seen = true; break; }
        const d = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
        if (d < best) { best = d; zoneSpot = { x, y }; }
      }
      if (seen) zoneSpot = null;
      if (zoneSpot) {
        const dx = zoneSpot.x + 0.5 - cx, dy = zoneSpot.y + 0.5 - cy;
        const ns = Math.abs(dy) > Math.abs(dx) * 0.4 ? (dy < 0 ? 'up' : 'down') : '';
        const ew = Math.abs(dx) > Math.abs(dy) * 0.4 ? (dx < 0 ? 'left' : 'right') : '';
        const many = def.name.endsWith('s') ? `${def.name}es` : `${def.name}s`;
        zoneText.textContent = `No ${ZONES[ch].name} floor on screen. ${many} only go there. Nearest: ${[ns, ew].filter(Boolean).join(' and ')}. `;
        zoneHint.style.borderColor = ZONES[ch].color;
      }
    }
    zoneHint.classList.toggle('hidden', !zoneSpot);
  }

  const chat = createChat(session, { playSound });
  stage.append(chat.el);

  const bossBar = createBossBar(session);
  stage.append(bossBar.el);

  // The big REBUILD button over the floor while anything of this player's is wrecked (0.2.14): on a
  // phone the build bar's Rebuild button is usually scrolled out of sight.
  const rebuildPop = createRebuildPop(session, { rebuild: () => input.rebuild(), playSound });
  stage.append(rebuildPop.el);

  // Before the game starts: pick the store and press Ready. It sits where the players list goes.
  const lobby = createLobby(session, { renderer, playSound });
  stage.append(lobby.el);

  // In training the lesson panel sits where the players list normally is.
  stage.append(training ? training.el : players.el, toasts.notices, toasts.reviews, deb.el, review.el, mapBox, touchUi.pad, touchUi.sheet);
  const root = h('div', { class: `game${training ? ' is-training' : ''}` }, top.el, stage, bar.el, planner.el, bar.tip, planner.tip);
  mount.replaceChildren(root);
  document.body.classList.add('in-game');
  if (sound) sound.attach(session);
  // Safari zooms the page with two fingers whatever CSS says; the floor has its own pinch.
  const noPageZoom = (e) => e.preventDefault();
  document.addEventListener('gesturestart', noPageZoom);

  // ---- Messages ----------------------------------------------------------------------------------
  let replaying = false; // true during a fast-forward: news is history, show only the latest
  let pendingReport = null;
  let lastDeb = null;
  let ended = false;
  let closed = false;
  const myName = () => session.state?.players[session.me]?.name || 'you';

  session.on('say', (m) => { lastDeb = String(m.text ?? ''); deb.say(m); });
  let lastBuzz = 0;
  session.on('nope', (m) => {
    if (replaying) return;
    deb.nope(m.why, nopeLine(m.why, myName()));
    const now = performance.now();
    if (now - lastBuzz > 400) { lastBuzz = now; playSound('nope'); }
  });
  session.on('review', (m) => toasts.review(m));
  session.on('players', (m) => toasts.notice(m.text));
  // The host took everyone back to the lobby: the finished game's leftovers go. (The end screen
  // itself comes down in the drawing loop, which sees the phase change.)
  session.on('lobby', () => {
    review.close();
    pendingReport = null;
    lastDeb = null;
  });
  // Doors opened early: say that the factory's takings for the skipped time were paid, so nobody
  // wonders where the money came from (or thinks opening early costs him).
  session.on('fx', (events) => {
    const e = events.find((x) => x.e === 'early');
    if (!e || !(e.cash > 0)) return;
    const several = session.state.players.filter((p) => p.on && p.side !== 'office').length > 1;
    toasts.notice(`Doors opened ${e.secs} seconds early. The factory was paid for that time: +$${Math.round(e.cash).toLocaleString('en-US')}${several ? ', split between you' : ''}.`);
  });
  // A won game carried on as an endless one: say who decided it.
  session.on('fx', (events) => {
    const e = events.find((x) => x.e === 'endless');
    if (!e || replaying) return;
    const who = session.state?.players[e.by];
    toasts.notice(`${e.by === session.me ? 'You' : who ? who.name : 'Somebody'} kept the doors open. Endless mode: it ends when the refunds close the store.`);
  });
  session.on('report', (m) => {
    if (replaying) pendingReport = m;
    else review.show(m);
  });
  session.on('closed', (m) => {
    if (closed || ended) return;
    closed = true;
    session.stop();
    if (m.why !== 'full' && onHostLost && session.state) {
      // The host has gone. Another player's browser takes the game over; say so while it does.
      const note = handoverScreen();
      root.append(note);
      onHostLost(session).catch(() => { note.remove(); root.append(closedScreen(m.why)); });
      return;
    }
    root.append(closedScreen(m.why));
  });

  // ---- Leaving by accident -----------------------------------------------------------------------
  // Once the game is under way, or anyone else is in it, the browser asks before the page is
  // left: a stray Back or Refresh should not end a game.
  let leaving = false;
  const onBeforeUnload = (e) => {
    const s = session.state;
    if (leaving || dead || closed || ended || !s) return;
    if (s.phase === 'lobby' && s.players.filter((p) => p.on).length < 2) return;
    e.preventDefault();
    e.returnValue = '';
  };
  addEventListener('beforeunload', onBeforeUnload);
  let dead = false;

  // ---- Start -------------------------------------------------------------------------------------
  if (prepare) prepare(session);
  if (ff > 0 && session.isHost) {
    replaying = true;
    // In chunks, so the test-only autostart can open the doors in between.
    for (let done = 0; done < ff;) {
      const n = Math.min(30, ff - done);
      session.fastForward(n);
      done += n;
      if (autostart && session.state.phase === 'build') session.send({ c: 'start' });
    }
    replaying = false;
    deb.collapse();
    const s = session.state;
    if (pendingReport && s.phase === 'build' && s.wave === pendingReport.wave) review.show(pendingReport);
  }
  if (autostart && session.isHost) {
    setInterval(() => { if (session.state.phase === 'build') session.send({ c: 'start' }); }, 300);
  }
  if (training) {
    // Jumping ahead plays the earlier lessons by themselves; their chatter is history.
    replaying = tutorialStep > 0;
    training.start(tutorialStep);
    if (replaying) { replaying = false; deb.collapse(); }
  }

  const resize = () => renderer.resize();
  resize();
  const watcher = new ResizeObserver(resize);
  watcher.observe(stage);
  // On a map too big for the screen, start by looking at this player's own entrance.
  input.goHome();
  session.start();

  // ---- Drawing loop --------------------------------------------------------------------------------
  const touchWords = isTouch();
  let mapShown = false, mapDrawn = 0, office = false, wasLobby = false, marksSig = '', sheetUp = false, wasBoss = false;
  let endEl = null; // the end screen, while it is up
  function frame(now) {
    if (dead) return;
    requestAnimationFrame(frame);
    const s = session.state;
    if (!s) return;
    // Head Office does not build: swap the build bar for the planner, and drop any tool he held.
    const isOffice = s.players[session.me]?.side === 'office';
    if (isOffice !== office) {
      office = isOffice;
      root.classList.toggle('is-office', office);
      bar.el.classList.toggle('hidden', office);
      planner.el.classList.toggle('hidden', !office);
      bar.tip.classList.add('hidden');
      planner.hideTip();
      if (office) input.setTool(null);
    }
    top.update(s);
    players.update(s);
    bar.update(s);
    planner.update(s);
    touchUi.update(s);
    rebuildPop.update(s);
    // It stands on the held tool's card, which floats over the bottom of the floor too.
    if (!rebuildPop.el.classList.contains('hidden')) {
      const card = !office && !bar.info.classList.contains('hidden') ? bar.info.offsetHeight : 0;
      const lift = card ? `${card + 16}px` : '';
      if (rebuildPop.el.style.bottom !== lift) rebuildPop.el.style.bottom = lift;
    }
    // A sheet over the bottom of the floor (the held tool's card, or a tapped building's actions):
    // on a phone DEB's bubble makes room for it.
    const up = touchUi.sheetOpen || (!!input.tool && !office);
    if (up !== sheetUp) { sheetUp = up; root.classList.toggle('sheet-up', up); }
    review.update(s);
    input.tick(now);
    deb.tick(now);
    toasts.tick(now);
    if (training) training.tick();
    updateZoneHint(s);
    // In the lobby the floor is drawn to the right of the panel, whole, so the store can be seen.
    const inLobby = lobby.update(s);
    if (inLobby !== wasLobby) {
      wasLobby = inLobby;
      root.classList.toggle('in-lobby', inLobby);
      renderer.resize();
      if (inLobby) renderer.fit(); else input.goHome();
      if (inLobby) input.setTool(null);
    }
    // The small map only earns its space when the whole store does not fit on screen.
    const r = renderer.viewRect();
    const partial = r.x1 - r.x0 < s.w - 0.5 || r.y1 - r.y0 < s.h - 0.5;
    if (partial !== mapShown) { mapShown = partial; mapBox.classList.toggle('hidden', !partial); root.classList.toggle('has-minimap', partial); }
    chat.update(s);
    if (partial && now - mapDrawn > 120) { mapDrawn = now; minimap.draw(); }
    if (!ended && (s.phase === 'won' || s.phase === 'lost')) {
      ended = true;
      root.classList.add('ended');
      review.close();
      input.setTool(null);
      // A lost endless game may be a record (Head Office's win is not the store's record).
      const record = s.players[session.me]?.side === 'office' ? null : noteRecord(s);
      // Give DEB's verdict a moment to arrive with the final update before the curtain drops.
      const shownFor = s.phase;
      setTimeout(() => {
        const now = session.state;
        if (dead || !ended || !now || now.phase !== shownFor) return;
        endEl = endScreen(now, lastDeb, session.me, {
          onEndless: () => session.send({ c: 'endless' }), record,
          // In a multiplayer game the group goes round again from the lobby, and only the host
          // can send them there. A solo game keeps its plain "New game".
          onLobby: session.isHost ? onLobby : null, waitForHost: !session.isHost && !!roomKind,
        });
        root.append(endEl);
      }, session.isHost ? 600 : 1200);
    } else if (ended && (s.phase === 'build' || s.phase === 'wave' || s.phase === 'lobby')) {
      // Somebody pressed "Keep going (endless)", or the host took everyone back to the lobby:
      // the game is on again, for everyone.
      ended = false;
      root.classList.remove('ended');
      endEl?.remove();
      endEl = null;
    }
    // The boss: a strip over the top of the floor while he is coming or in the store.
    const bossUp = bossBar.update(s);
    if (bossUp !== wasBoss) { wasBoss = bossUp; root.classList.toggle('boss-up', bossUp); }
    const view = input.view();
    // Show where shoppers will walk whenever the player is planning: between waves, while
    // holding something to build, and all through training. Head Office always sees them: the
    // routes are what he is planning against.
    view.route = office || !!training || s.phase === 'build' || s.phase === 'lobby' || !!input.tool;
    // Nor does he get the tile outline under the mouse that says "you could build here".
    if (office) view.hover = null;
    view.marks = training ? training.marks() : null;
    // The captions on highlighted tiles speak of the mouse; on a touch screen, of taps.
    if (view.marks && touchWords) for (const m of view.marks) if (m.label) m.label = forTouch(m.label);
    // On a phone the training floor does not fit on screen: when a lesson marks tiles that are
    // out of view, bring them into view. (A big screen always shows the whole training floor.)
    if (view.marks && view.marks.length && (isCoarse() || narrow())) {
      const sig = view.marks.map((m) => `${m.x},${m.y}`).join(';');
      if (sig !== marksSig) {
        marksSig = sig;
        // In view means clear of the edges, where the camera buttons, DEB and the small map sit.
        const r = renderer.viewRect();
        const z = renderer.cam.zoom || 30;
        const side = 70 / z, low = 120 / z, edge = 0.5;
        if (view.marks.some((m) => m.x < r.x0 + edge || m.x + 1 > r.x1 - side || m.y < r.y0 + edge || m.y + 1 > r.y1 - low)) {
          const xs = view.marks.map((m) => m.x), ys = view.marks.map((m) => m.y);
          renderer.centerOn((Math.min(...xs) + Math.max(...xs) + 1) / 2, (Math.min(...ys) + Math.max(...ys) + 1) / 2);
        }
      }
    } else if (!view.marks || !view.marks.length) marksSig = '';
    renderer.draw(view);
  }
  requestAnimationFrame(frame);

  // For the test pages in tools/, which drive the game with made-up mouse and key events and
  // need to know where a tile is on screen.
  /** Shuts this game screen down, so another can take its place (a new host, a reconnection). */
  function destroy() {
    dead = true;
    session.stop();
    watcher.disconnect();
    input.destroy();
    chat.destroy();
    removeEventListener('beforeunload', onBeforeUnload);
    document.removeEventListener('gesturestart', noPageZoom);
  }
  /** The player meant to leave (a button did it): do not ask. */
  const allowLeave = () => { leaving = true; };
  globalThis.__game = { session, renderer, input, allowLeave };
  return { session, renderer, input, destroy, allowLeave };
}
