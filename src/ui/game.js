// The game screen: puts the top bar, the canvas, the build bar and the floating panels together,
// connects them to the session, and runs the drawing loop.
import { createRenderer } from '../render/renderer.js';
import { createMinimap } from '../render/minimap.js';
import { nopeLine, nopeKey } from '../content/lines.js';
import { h, setText } from './dom.js';
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
import { createDeal } from './deal.js';
import { createHandStrip, handPanel, handRow } from './hand.js';
import { createPayPanel } from './eventpay.js';
import { handOf } from './cardart.js';
import { createChat } from './chat.js';
import { openHandbook } from './handbook.js';
import { createBossBar } from './bossbar.js';
import { createRebuildPop } from './rebuild.js';
import { noteRecord } from './record.js';
import { forTouch, isTouch } from '../content/touch.js';
import { createTouchControls, isCoarse } from './touch.js';
import { createPointer } from './pointer.js';
import { BUILD, statsOf, sizeOf } from '../sim/index.js';
import { CARDS_HIDDEN } from './buildbar.js';
import { hostAwayLine, hostBackLine, HOST_AWAY_NOTICE } from '../content/lines.js';

/**
 * A phone-sized screen (the same limits as the narrow layout in style.css). Read from a media query
 * that is told when it changes: reading the window's size every frame, after the interface had
 * changed something, forced the browser to lay the page out again (the stutter investigation of
 * 2026-11-26 found 4 s of a phone's 116 busy seconds there).
 */
const smallQuery = typeof matchMedia === 'function' ? matchMedia('(max-width: 1099px), (max-height: 559px)') : { matches: false, addEventListener() {} };
const narrow = () => smallQuery.matches;

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
 * @param {Object} [o.look] how the first frame is looked at (page options, see main.js): floor (1
 *   The Back), and for screenshots cam ('x,y,zoom'), hold (a kind to hold), dir, hover ('x,y'),
 *   outof ('x,y,track': the OUT OF ... warning over a building), select ('x,y': open its sheet),
 *   wireprev ('x,y,d': a wire direction shown as if being tried, 0.4)
 */
export function startGame(session, {
  roomCode = null, roomKind = null, prepare = null, ff = 0, autostart = false, mount,
  tutorial = false, tutorialStep = 0, onExit = () => {}, sound = null, onHostLost = null, onLobby = null, look = null,
}) {
  const canvas = h('canvas', { class: 'world', 'aria-label': 'The warehouse floor. Use the mouse to build.' });
  const stage = h('main', { class: 'stage' }, canvas);
  const renderer = createRenderer(canvas, session);
  const playSound = (name, opts) => { if (sound) sound.play(name, opts); };

  // The game's cards (0.3.01): a panel with all five at a readable size, from the strip of slots,
  // the ? screen and the end screen.
  let cardsPanel = null;
  const closeCards = () => { cardsPanel?.remove(); cardsPanel = null; };
  const openCards = () => {
    if (cardsPanel || !handOf(session.state).length) return;
    playSound('click');
    cardsPanel = handPanel(session.state, closeCards);
    root.append(cardsPanel);
  };

  let help = null;
  const toggleHelp = () => {
    if (help) { help.remove(); help = null; return; }
    help = helpScreen(() => { help?.remove(); help = null; }, () => { toggleHelp(); openHandbook(session.state); },
      handOf(session.state).length ? () => { toggleHelp(); openCards(); } : null);
    root.append(help);
  };

  const review = createReview(session);
  const input = createInput({
    canvas, renderer, session, playSound,
    onEscape: () => {
      if (cardsPanel) { closeCards(); return true; }
      if (help) { toggleHelp(); return true; }
      if (review.open) { review.close(); return true; }
      return false;
    },
  });
  // The Head Office player sees the planner instead of the build bar.
  const planner = createPlanner(session, { playSound });
  const top = createTopBar(session, { roomCode, roomKind, onHelp: toggleHelp, onHandbook: () => openHandbook(session.state), sound, playSound, budgetLeft: planner.left });
  const players = createPlayersPanel(session, { playSound });
  const toasts = createToasts({ getState: () => session.state });
  // The card's "Don't show these" button (0.4): say how to see one anyway, and how to undo it.
  const bar = createBuildBar(input, session, { onCardsOff: () => toasts.notice(isTouch() ? CARDS_HIDDEN.touch : CARDS_HIDDEN.mouse) });
  // Buttons for what the keyboard and the right mouse button do, for touch screens only.
  const touchUi = createTouchControls({ input, session, renderer, playSound });
  bar.el.append(touchUi.bar);
  const deb = createDeb();
  const training = tutorial && session.isHost
    ? createTutorialPanel(session, { onExit, highlight: bar.highlight, playSound, floor: () => input.floor, setFloor: (f) => input.setFloor(f) })
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

  const chat = createChat(session, { playSound });
  stage.append(chat.el);

  const bossBar = createBossBar(session);
  stage.append(bossBar.el);

  // Paused (0.3.02): the floor dims and a banner says who stopped it and how to carry on. A click
  // on the banner carries on; the dimming lets clicks through to the floor.
  const pauseVeil = h('div', { class: 'pause-veil hidden', 'aria-hidden': 'true' });
  const pauseWho = h('span', { class: 'pb-who' });
  const pauseBanner = h('div', {
    class: 'pause-banner hidden', role: 'button', tabindex: '0', 'aria-live': 'polite', 'aria-label': 'Paused. Carry on',
    onclick: () => { playSound('click'); session.send({ c: 'pause', on: false }); },
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } },
  }, h('b', { class: 'pb-word' }, 'PAUSED'), pauseWho,
  h('span', { class: 'pb-how' }, ...(isTouch()
    ? ['Tap here to carry on, or ▶ beside the speed buttons.']
    : ['Click here, press ', h('kbd', null, 'P'), ' or the ▶ button by the speeds to carry on.'])));
  stage.append(pauseVeil, pauseBanner);
  let pausedBy = undefined; // who the banner names: undefined while the game is not paused
  function updatePause(s) {
    const by = s.pause ? (s.pause.by | 0) : undefined;
    const name = by === undefined ? '' : by === session.me ? 'you' : s.players[by]?.name || 'somebody';
    const key = by === undefined ? undefined : `${by}|${name}`;
    if (key === pausedBy) return;
    pausedBy = key;
    const on = by !== undefined;
    pauseVeil.classList.toggle('hidden', !on);
    pauseBanner.classList.toggle('hidden', !on);
    root.classList.toggle('is-paused', on);
    if (on) setText(pauseWho, by === session.me ? 'You stopped the store. Everyone is waiting on you.' : `${name} stopped the store. Anyone can carry on.`);
  }

  // The big REBUILD button over the floor while anything of this player's is wrecked, or paid for
  // and waiting to go back (0.2.15, 0.3.04): on a phone the build bar's Rebuild button is usually
  // scrolled out of sight.
  const rebuildPop = createRebuildPop(session, { rebuild: () => input.rebuild() });
  stage.append(rebuildPop.el);

  // The floor switch (0.4): the bottom right of the floor, over DEB's corner (style.css lifts her
  // above it). It says where it takes you; Tab does the same. On a touch screen it is the only way.
  const floorWord = h('span', { class: 'fs-word' });
  const floorKey = h('kbd', { class: 'fs-key' }, 'Tab');
  const floorBtn = h('button', {
    type: 'button', class: 'floor-switch',
    onclick: () => input.setFloor(input.floor ? 0 : 1),
  }, h('span', { class: 'fs-stripes', 'aria-hidden': 'true' }), floorWord, floorKey);
  stage.append(floorBtn);
  let shownFloor = -1;
  function updateFloorBtn() {
    if (input.floor === shownFloor) return;
    shownFloor = input.floor;
    const back = shownFloor === 1;
    setText(floorWord, back ? 'BACK TO THE FLOOR' : 'CHECK IN THE BACK');
    floorBtn.setAttribute('aria-label', back ? 'Back to the shop floor (Tab)' : 'Check in The Back, the floor under the shop (Tab)');
    floorBtn.classList.toggle('is-back', back);
    root.classList.toggle('on-back', back);
  }

  // Before the game starts: pick the store and press Ready. It sits where the players list goes.
  const lobby = createLobby(session, { renderer, playSound });
  stage.append(lobby.el);

  // The game's cards: five slots under the players panel for the whole game, filled by the deal
  // between the lobby and the first build phase (which covers the whole screen while it runs).
  const strip = createHandStrip({ onOpen: openCards });
  const deal = createDeal(session, { strip, playSound });
  // What the sales event pays, and the speed bonus (0.4; the INCOME panel of 0.3.03 had this place).
  const pay = createPayPanel(session);
  // The three panels at the top left (0.4, the owner): ON SHIFT, the hand of cards, EVENT PAY. On a
  // big screen they always stand in one column in that order (EVENT PAY used to be put beside the
  // hand when the column would cover an entrance; the owner wants it below, and each panel folds
  // down to one line instead); on a small screen they are one row of chips. The style sheet lays
  // the box out either way (.left-col), so nothing is measured or placed from here.
  // In training the lesson panel sits where the players list normally is.
  const leftCol = h('div', { class: 'left-col' }, training ? null : players.el, strip.el, pay.el);
  stage.append(leftCol);
  let smallNow = null;
  function applySmall() {
    const small = narrow();
    if (small === smallNow) return;
    smallNow = small;
    strip.setSide(!small);
    pay.setChip(small);
  }
  applySmall();
  smallQuery.addEventListener?.('change', applySmall);

  stage.append(...[training ? training.el : null, toasts.el, deb.el, review.el, mapBox, touchUi.pad, touchUi.sheet, touchUi.aid].filter(Boolean));
  const root = h('div', { class: `game${training ? ' is-training' : ''}` }, top.el, stage, bar.el, planner.el, bar.tip, planner.tip, deal.el);
  mount.replaceChildren(root);
  document.body.classList.add('in-game');
  // The training shift's arrow on whatever the lesson wants pressed next (0.3.03; src/ui/pointer.js).
  const pointer = training ? createPointer({
    root, canvas, renderer, input, selected: () => touchUi.selected, target: (ui) => training.arrow(ui), touch: isTouch, marks: () => training.marks(), card: bar.info,
  }) : null;
  if (sound) sound.attach(session, { floor: () => input.floor });
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
    // (Some commands have refusals of their own: a wire walling the dads in, 0.4. nopeKey picks.)
    deb.nope(m.why, nopeLine(nopeKey(m.why, m.cmd), myName()));
    const now = performance.now();
    if (now - lastBuzz > 400) { lastBuzz = now; playSound('nope'); }
  });
  session.on('review', (m) => toasts.review(m));
  session.on('players', (m) => toasts.notice(m.text));
  // The host's page is in the background (0.4): his browser then runs the game about once a second,
  // so for everyone else it crawls. A joined player is told why, by a notice that stays until the
  // host is back, and by DEB. (The host himself cannot see his own hidden page.)
  let awayDown = null;
  session.on('away', (m) => {
    if (session.isHost) return;
    const s = session.state;
    const host = s?.players[s.host | 0]?.name || 'The host';
    if (m.on && !awayDown) {
      awayDown = toasts.standing(HOST_AWAY_NOTICE.replace('{name}', host));
      deb.say({ who: 'DEB (HR)', text: hostAwayLine(host, Math.random), mood: 'angry' });
    } else if (!m.on && awayDown) {
      awayDown();
      awayDown = null;
      deb.say({ who: 'DEB (HR)', text: hostBackLine(host, Math.random), mood: 'smug' });
    }
  });
  // The host took everyone back to the lobby: the finished game's leftovers go. (The end screen
  // itself comes down in the drawing loop, which sees the phase change.)
  session.on('lobby', () => {
    review.close();
    pendingReport = null;
    lastDeb = null;
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
      if (autostart && session.state.phase === 'build' && !session.state.pause) session.send({ c: 'start' });
    }
    replaying = false;
    deb.collapse();
    const s = session.state;
    if (pendingReport && s.phase === 'build' && s.wave === pendingReport.wave) review.show(pendingReport);
  }
  if (autostart && session.isHost) {
    // (Not while paused, when the doors cannot open: it would only collect refusals.)
    setInterval(() => { if (session.state.phase === 'build' && !session.state.pause) session.send({ c: 'start' }); }, 300);
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
  if (look) applyLook(look);
  session.start();

  // ---- Drawing loop --------------------------------------------------------------------------------
  const touchWords = isTouch();
  let mapShown = false, mapDrawn = 0, office = false, wasLobby = false, marksSig = '', sheetUp = false, wasBoss = false;
  let dealFilled = Infinity, wasHand = false;
  let endEl = null; // the end screen, while it is up
  function frame(now) {
    if (dead) return;
    requestAnimationFrame(frame);
    const s = session.state;
    if (!s) return;
    // (First, before this frame changes anything on the page: reading the boxes is then free.)
    if (now - insetsAt >= INSETS_MS) { insetsAt = now; measureInsets(); }
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
    updatePause(s);
    updateFloorBtn();
    players.update(s);
    bar.update(s);
    planner.update(s);
    touchUi.update(s);
    rebuildPop.update(s);
    updateDock();
    // A sheet over the bottom of the floor (the held tool's card, or a tapped building's actions):
    // on a phone DEB's bubble makes room for it.
    const up = touchUi.sheetOpen || (!!input.tool && !office);
    if (up !== sheetUp) { sheetUp = up; root.classList.toggle('sheet-up', up); }
    review.update(s);
    input.tick(now);
    deb.tick(now);
    toasts.tick(now);
    if (training) training.tick();
    // The strip of cards (and, during the deal, the cards flying into it).
    const handUp = strip.update(s, dealFilled);
    if (handUp !== wasHand) { wasHand = handUp; root.classList.toggle('has-hand', handUp); }
    dealFilled = deal.update(s);
    pay.update(s);
    // In the lobby the floor is drawn to the right of the panel, whole, so the store can be seen.
    const inLobby = lobby.update(s);
    if (inLobby !== wasLobby) {
      wasLobby = inLobby;
      root.classList.toggle('in-lobby', inLobby);
      renderer.resize();
      if (inLobby) renderer.fit(); else input.goHome();
      if (inLobby) { input.setTool(null); input.setFloor(0); }
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
          hand: handRow(now, openCards),
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
      closeCards();
    }
    // The boss: a strip over the top of the floor while he is coming or in the store.
    const bossUp = bossBar.update(s);
    if (bossUp !== wasBoss) { wasBoss = bossUp; root.classList.toggle('boss-up', bossUp); }
    const view = input.view();
    // Where shoppers will walk is always shown (the owner, 0.4). While they are on the floor it is a
    // little fainter, unless the player is planning: holding something to build, in training, or
    // Head Office, for whom the routes are what he is planning against.
    // (view.tool is also a building being dragged out of the bar.)
    view.route = true;
    view.routeFaint = s.phase === 'wave' && !office && !training && !view.tool;
    // Nor does he get the tile outline under the mouse that says "you could build here".
    if (office) view.hover = null;
    // The building whose sheet is open: the floor shows its reach (src/render/reach.js). Head Office
    // has no sheet.
    view.selected = office ? null : touchUi.selected;
    // A wire direction being tried (0.4): the Wire tool's drag, or a direction pointed at in the
    // sheet's picker. The floor shows the wire and the dads' routes as they would be with it.
    if (!view.wirePreview && !office && !input.floor) view.wirePreview = touchUi.wirePreview;
    keepInSight(s, input.floor ? null : view.selected); // (a Returns Drop's sheet, in The Back, has no reach)
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
    if (pointer) pointer.update(now);
    if (training) keepOffMarks(view.marks, now);
  }
  requestAnimationFrame(frame);

  // ---- The bottom of the floor (0.4) ---------------------------------------------------------------
  // The held tool's card and a tapped building's sheet stand over the bottom of the floor. What
  // lives there (on a phone: the small map, DEB, the floor switch, the chat, the REBUILD button; on
  // a big screen the REBUILD button) stands on top of them instead of under them: the style sheet
  // lifts it by --dock-lift. Their heights come from a ResizeObserver, which reports them after the
  // browser has laid the page out anyway, so no frame forces a layout to find them out.
  let cardH = 0, sheetH = 0, dockLift = -1, popLift = -1;
  const sizes = new ResizeObserver((entries) => {
    for (const e of entries) {
      const hgt = e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height;
      if (e.target === bar.info) cardH = hgt; else if (e.target === touchUi.sheet) sheetH = hgt;
    }
  });
  sizes.observe(bar.info);
  sizes.observe(touchUi.sheet);
  function updateDock() {
    const cardUp = !office && !touchUi.sheetOpen && cardH > 0 && !bar.info.classList.contains('hidden') && !bar.info.classList.contains('tut-top');
    const sheetUp = touchUi.sheetOpen && sheetH > 0 && !touchUi.sheet.classList.contains('at-top');
    // (The gap between them: the card floats 0.4rem over the bar, the sheet 0.5rem over the floor.)
    const lift = Math.round(Math.max(cardUp ? cardH + 12 : 0, sheetUp ? sheetH + 14 : 0));
    if (lift !== dockLift) { dockLift = lift; root.style.setProperty('--dock-lift', `${lift}px`); }
    // On a big screen the REBUILD button stands on the card (it is in the same place, the middle of
    // the bottom); the sheet has its own rule in the style sheet.
    const pop = cardUp && !narrow() ? Math.round(cardH + 16) : 0;
    if (pop !== popLift) { popLift = pop; rebuildPop.el.style.bottom = pop ? `${pop}px` : ''; }
  }

  // ---- How far the camera may go past the map (0.4.01) ------------------------------------------------
  // The owner, on a phone: the chips, notices and reviews at the top and the build card, the
  // building sheet, DEB and the small map at the bottom covered the first and last rows of tiles,
  // and the camera stopped before they came clear. On a touch screen the renderer is told how much
  // of each edge of the floor the interface covers, and lets the camera go that much further, so
  // black shows past the map instead. A mouse keeps the old limit (one tile), so a PC is unchanged.
  // Measured four times a second, at the start of a frame (the page is laid out then, so reading
  // the boxes costs nothing), and again just before the view is moved for an opening sheet.
  const INSETS_MS = 250;
  let insetsAt = -1e9;
  /** What floats over the floor (the same pieces tools/layout.mjs checks, less the placing aid). */
  const COVER = '.players, .hand-wrap, .eventpay-wrap .eventpay, .notice, .review-toast, .deb, .touch-sheet, .bb-info, '
    + '.minimap, .floor-switch, .touch-pad, .rebuild-pop .rp-btn, .boss-bar, .chat';
  /** Least room past the map at the left and right on a touch screen, in CSS pixels. */
  const SIDE_PX = 24;
  const shownBox = (el) => {
    if (!el.getClientRects().length || el.classList.contains('hidden') || el.classList.contains('leaving')) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return null;
    return el.getBoundingClientRect();
  };
  function measureInsets() {
    if (!isCoarse()) { if (renderer.insets.top || renderer.insets.bottom || renderer.insets.left || renderer.insets.right) renderer.setInsets({}); return; }
    const f = canvas.getBoundingClientRect();
    if (!(f.width > 50 && f.height > 50)) return;
    const ins = { top: 0, bottom: 0, left: SIDE_PX, right: SIDE_PX };
    for (const el of root.querySelectorAll(COVER)) {
      const r = shownBox(el);
      if (!r || r.width < 1 || r.height < 1) continue;
      // Only what is over the floor itself.
      if (r.right <= f.left || r.left >= f.right || r.bottom <= f.top || r.top >= f.bottom) continue;
      if (r.height > f.height / 2) {
        // A tall piece stands at a side: room at that side (no more than a third of the floor).
        if (r.left + r.width / 2 < f.left + f.width / 2) ins.left = Math.max(ins.left, Math.min(f.width / 3, r.right - f.left));
        else ins.right = Math.max(ins.right, Math.min(f.width / 3, f.right - r.left));
      } else if (r.top + r.height / 2 < f.top + f.height / 2) ins.top = Math.max(ins.top, r.bottom - f.top);
      else ins.bottom = Math.max(ins.bottom, f.bottom - r.top);
    }
    // A few pixels' gap, so the edge row is clearly clear.
    if (ins.top) ins.top += 4;
    if (ins.bottom) ins.bottom += 4;
    renderer.setInsets(ins);
  }

  // ---- The training shift's marked tiles stay clear (0.4) -------------------------------------------
  // A lesson marks the tile it wants used. If DEB's bubble or the floor switch stands over it (on a
  // phone the camera may not be able to move far enough to bring the tile clear of the bottom of the
  // floor), that one steps up to the top of the floor while it would. Looked at four times a second,
  // and only in training.
  let dodgeAt = 0;
  const dodgers = [deb.el, floorBtn];
  function keepOffMarks(marks, now) {
    if (now - dodgeAt < 250) return;
    dodgeAt = now;
    const cr = canvas.getBoundingClientRect(), cam = renderer.cam, z = cam.zoom || 30;
    const tiles = (marks || []).map((m) => ({
      l: cr.left + cr.width / 2 + (m.x - cam.x) * z, t: cr.top + cr.height / 2 + (m.y - cam.y) * z, size: z,
    }));
    const st = stage.getBoundingClientRect();
    // The top of the floor in the stage (on a phone held upright the lesson panel is above it): the
    // reviews and notices stand there in training (style.css), and anything dodging goes there.
    const floorTop = Math.round(cr.top - st.top);
    if (floorTop !== shownFloorTop) { shownFloorTop = floorTop; root.style.setProperty('--floor-top', `${floorTop}px`); }
    // The held tool's card may have gone to the top of the floor for the same reason (pointer.js):
    // then what dodges stands under it.
    const card = bar.info.classList.contains('tut-top') && !bar.info.classList.contains('hidden') ? bar.info.getBoundingClientRect() : null;
    for (const el of dodgers) {
      const was = el.classList.contains('dodge');
      if (!tiles.length) { if (was) { el.classList.remove('dodge'); el.style.top = ''; } continue; }
      // Where it stands when not dodging, so the decision does not flicker.
      if (was) { el.classList.remove('dodge'); el.style.top = ''; }
      const r = el.getBoundingClientRect();
      const hits = (y0, y1) => tiles.some((t) => t.l < r.right && t.l + t.size > r.left && t.t < y1 && t.t + t.size > y0);
      if (!(r.width > 0) || !hits(r.top, r.bottom)) continue;
      let top = floorTop + 6;
      if (card && card.left < r.right && card.right > r.left) top = Math.max(top, Math.round(card.bottom - st.top + 8));
      el.classList.add('dodge');
      el.style.top = `${top}px`;
    }
  }
  let shownFloorTop = null;

  // On a phone the building sheet covers the bottom of the floor (0.3.02). When a building is
  // tapped low on the screen, its reach (or the building itself) would be under the sheet, so as the
  // sheet opens the view moves up once, just far enough to show it above the sheet, as far as the
  // map's edge allows and never pushing the top of the reach off the floor; where that is not far
  // enough, the sheet opens at the top of the floor instead. Not on a big screen with a mouse,
  // where a click must not move the view.
  // On a big screen with a mouse the view must not move on a click (and usually shows the whole
  // store, so it cannot): there the sheet itself moves to the top of the floor instead (.at-top).
  let sightKey = '';
  function keepInSight(s, t) {
    const key = t ? `${t.x},${t.y}` : '';
    if (key === sightKey) return;
    sightKey = key;
    const mouse = !(isCoarse() || narrow());
    touchUi.sheet.classList.remove('at-top');
    if (!t) return;
    const b = s.grid[t.y * s.w + t.x];
    if (!b || !BUILD[b.k]) return;
    const [, bh] = sizeOf(b.k, BUILD[b.k].rot ? b.d | 0 : 0);
    const reach = statsOf(b, s).range || 0;
    const circle = reach > 0 && !BUILD[b.k].beam;
    // What must show, from top to bottom, in tiles: the reach's circle, or the building (and a
    // beam fired downward).
    const top = circle ? t.y + bh / 2 - reach : t.y;
    const bottom = circle ? t.y + bh / 2 + reach : t.y + bh + (BUILD[b.k].beam && (b.d & 3) === 1 ? reach : 0);
    const r = canvas.getBoundingClientRect(), cam = renderer.cam, z = cam.zoom || 30;
    const screenY = (ty) => r.top + r.height / 2 + (ty - cam.y) * z;
    const over = screenY(bottom) - (touchUi.sheet.getBoundingClientRect().top - 10);
    if (over <= 0) return;
    if (mouse) { touchUi.sheet.classList.add('at-top'); return; }
    const room = screenY(top) - (r.top + 8);
    const dy = Math.min(over, Math.max(0, room)) / z;
    // (The sheet has just opened: let the camera know it covers the bottom now, so it may go further.)
    measureInsets();
    if (dy > 0) renderer.pan(0, dy);
    // The camera stops at the map's edge (and cannot move at all when the store's height fits on
    // screen): if the reach is still under the sheet, the sheet goes to the top of the floor.
    if (screenY(bottom) > touchUi.sheet.getBoundingClientRect().top - 10) touchUi.sheet.classList.add('at-top');
  }

  /** The page options for the first frame (see main.js): which floor, and for screenshots a view and a held kind. */
  function applyLook(o) {
    if (o.floor) input.setFloor(1);
    if (o.cam) {
      const [cx, cy, cz] = String(o.cam).split(',').map((v) => (v === '' ? NaN : Number(v)));
      if (cz > 0) renderer.zoomBy(cz / renderer.cam.zoom);
      renderer.centerOn(Number.isFinite(cx) ? cx : renderer.cam.x, Number.isFinite(cy) ? cy : renderer.cam.y);
    }
    if (o.hold) {
      input.setTool(o.hold);
      for (let n = 0; n < ((o.dir | 0) & 3); n++) input.rotate();
    }
    if (o.outof) {
      const [x, y, tr] = String(o.outof).split(',');
      const s = session.state;
      if (s && Number.isInteger(+x) && Number.isInteger(+y)) renderer.warn(+y * s.w + +x, tr);
    }
    if (o.select) {
      const [x, y] = String(o.select).split(',').map(Number);
      if (Number.isInteger(x) && Number.isInteger(y)) input.select({ x, y });
    }
    if (o.hover) {
      const [x, y] = String(o.hover).split(',').map(Number);
      if (Number.isInteger(x) && Number.isInteger(y)) input.setHover({ x, y });
    }
    if (o.wireprev) {
      const [x, y, d] = String(o.wireprev).split(',').map(Number);
      input.setWirePreview({ x, y, d });
    }
  }

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
  // (marks: the tiles the training shift has marked, for tools/layout.mjs.)
  globalThis.__game = { session, renderer, input, allowLeave, marks: () => (training ? training.marks() : null) };
  return { session, renderer, input, destroy, allowLeave };
}
