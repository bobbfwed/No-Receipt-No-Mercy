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
import { endScreen, closedScreen, helpScreen } from './overlays.js';
import { createTutorialPanel } from './tutorial.js';

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
 */
export function startGame(session, {
  roomCode = null, roomKind = null, prepare = null, ff = 0, autostart = false, mount,
  tutorial = false, tutorialStep = 0, onExit = () => {}, sound = null,
}) {
  const canvas = h('canvas', { class: 'world', 'aria-label': 'The warehouse floor. Use the mouse to build.' });
  const stage = h('main', { class: 'stage' }, canvas);
  const renderer = createRenderer(canvas, session);
  const playSound = (name) => { if (sound) sound.play(name); };

  let help = null;
  const toggleHelp = () => {
    if (help) { help.remove(); help = null; return; }
    help = helpScreen(() => { help?.remove(); help = null; });
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
  const top = createTopBar(session, { roomCode, roomKind, onHelp: toggleHelp, sound, playSound, budgetLeft: planner.left });
  const players = createPlayersPanel(session, { playSound });
  const bar = createBuildBar(input, session);
  const deb = createDeb();
  const toasts = createToasts();
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

  // In training the lesson panel sits where the players list normally is.
  stage.append(training ? training.el : players.el, toasts.notices, toasts.reviews, deb.el, review.el, mapBox);
  const root = h('div', { class: `game${training ? ' is-training' : ''}` }, top.el, stage, bar.el, planner.el, bar.tip, planner.tip);
  mount.replaceChildren(root);
  document.body.classList.add('in-game');
  if (sound) sound.attach(session);

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
  session.on('report', (m) => {
    if (replaying) pendingReport = m;
    else review.show(m);
  });
  session.on('closed', (m) => {
    if (closed || ended) return;
    closed = true;
    session.stop();
    root.append(closedScreen(m.why));
  });

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
  new ResizeObserver(resize).observe(stage);
  // On a map too big for the screen, start by looking at this player's own entrance.
  input.goHome();
  session.start();

  // ---- Drawing loop --------------------------------------------------------------------------------
  let mapShown = false, mapDrawn = 0, office = false;
  function frame(now) {
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
    review.update(s);
    input.tick(now);
    deb.tick(now);
    toasts.tick(now);
    if (training) training.tick();
    // The small map only earns its space when the whole store does not fit on screen.
    const r = renderer.viewRect();
    const partial = r.x1 - r.x0 < s.w - 0.5 || r.y1 - r.y0 < s.h - 0.5;
    if (partial !== mapShown) { mapShown = partial; mapBox.classList.toggle('hidden', !partial); }
    if (partial && now - mapDrawn > 120) { mapDrawn = now; minimap.draw(); }
    if (!ended && (s.phase === 'won' || s.phase === 'lost')) {
      ended = true;
      root.classList.add('ended');
      review.close();
      input.setTool(null);
      // Give DEB's verdict a moment to arrive with the final update before the curtain drops.
      setTimeout(() => root.append(endScreen(session.state, lastDeb, session.me)), session.isHost ? 600 : 1200);
    }
    const view = input.view();
    // Show where shoppers will walk whenever the player is planning: between waves, while
    // holding something to build, and all through training. Head Office always sees them: the
    // routes are what he is planning against.
    view.route = office || !!training || s.phase === 'build' || !!input.tool;
    // Nor does he get the tile outline under the mouse that says "you could build here".
    if (office) view.hover = null;
    view.marks = training ? training.marks() : null;
    renderer.draw(view);
  }
  requestAnimationFrame(frame);

  // For the test pages in tools/, which drive the game with made-up mouse and key events and
  // need to know where a tile is on screen.
  globalThis.__game = { session, renderer, input };
  return { session, renderer, input };
}
