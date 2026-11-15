// The game screen: puts the top bar, the canvas, the build bar and the floating panels together,
// connects them to the session, and runs the drawing loop.
import { createRenderer } from '../render/renderer.js';
import { nopeLine } from '../content/lines.js';
import { h } from './dom.js';
import { createTopBar, createPlayersPanel } from './hud.js';
import { createBuildBar } from './buildbar.js';
import { createInput } from './input.js';
import { createDeb } from './deb.js';
import { createToasts } from './toasts.js';
import { createReview } from './review.js';
import { endScreen, closedScreen, helpScreen } from './overlays.js';

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
 */
export function startGame(session, { roomCode = null, roomKind = null, prepare = null, ff = 0, autostart = false, mount }) {
  const canvas = h('canvas', { class: 'world', 'aria-label': 'The warehouse floor. Use the mouse to build.' });
  const stage = h('main', { class: 'stage' }, canvas);
  const renderer = createRenderer(canvas, session);

  let help = null;
  const toggleHelp = () => {
    if (help) { help.remove(); help = null; return; }
    help = helpScreen(() => { help?.remove(); help = null; });
    root.append(help);
  };

  const review = createReview(session);
  const input = createInput({
    canvas, renderer, session,
    onEscape: () => {
      if (help) { toggleHelp(); return true; }
      if (review.open) { review.close(); return true; }
      return false;
    },
  });
  const top = createTopBar(session, { roomCode, roomKind, onHelp: toggleHelp });
  const players = createPlayersPanel(session);
  const bar = createBuildBar(input);
  const deb = createDeb();
  const toasts = createToasts();

  stage.append(players.el, toasts.notices, toasts.reviews, deb.el, review.el);
  const root = h('div', { class: 'game' }, top.el, stage, bar.el, bar.tip);
  mount.replaceChildren(root);
  document.body.classList.add('in-game');

  // ---- Messages ----------------------------------------------------------------------------------
  let replaying = false; // true during a fast-forward: news is history, show only the latest
  let pendingReport = null;
  let lastDeb = null;
  let ended = false;
  let closed = false;
  const myName = () => session.state?.players[session.me]?.name || 'you';

  session.on('say', (m) => { lastDeb = String(m.text ?? ''); deb.say(m); });
  session.on('nope', (m) => { if (!replaying) deb.nope(m.why, nopeLine(m.why, myName())); });
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

  const resize = () => { renderer.resize(); input.calibrate(); };
  resize();
  new ResizeObserver(resize).observe(stage);
  session.start();

  // ---- Drawing loop --------------------------------------------------------------------------------
  function frame(now) {
    requestAnimationFrame(frame);
    const s = session.state;
    if (!s) return;
    top.update(s);
    players.update(s);
    bar.update(s);
    review.update(s);
    input.tick(now);
    deb.tick(now);
    toasts.tick(now);
    if (!ended && (s.phase === 'won' || s.phase === 'lost')) {
      ended = true;
      root.classList.add('ended');
      review.close();
      input.setTool(null);
      // Give DEB's verdict a moment to arrive with the final update before the curtain drops.
      setTimeout(() => root.append(endScreen(session.state, lastDeb)), session.isHost ? 600 : 1200);
    }
    renderer.draw(input.view());
  }
  requestAnimationFrame(frame);

  return { session, renderer, input };
}
