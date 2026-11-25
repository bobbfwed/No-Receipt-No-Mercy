// The top bar (cash, sales event, doors, refunds, speed, room code) and the players panel.
import { TUNE, ROLES, SPEEDS, officePlayer, isEndless, bossTier, bossTitle } from '../sim/index.js';
import { eventOf } from '../content/facts.js';
import { h, setText, setClass, setStyle, money, clock, safeColor, copyButton, copyText } from './dom.js';
import { createAutoSwitch } from './rebuild.js';
import { GROUPS, DEFAULTS as DEFAULT_LEVELS } from '../audio/groups.js';

const CASH_TITLE = 'Your own money. Everything the store earns or refunds is split evenly between the players; what you build comes out of yours.';
/** How many steps the top bar can take to fit a short window (the .fit-N rules in style.css). */
const FIT_STEPS = 10;
const PAUSE_TITLE = 'Pause the game (P). The whole store stops for everyone, and nothing can be built until somebody carries on.';
const RESUME_TITLE = 'Carry on (P). Anyone can.';
const BUDGET_TITLE = 'What you have left to spend on shoppers for the coming sales event. Half of what you leave unspent carries over to the next one.';

/** The store players' money added up (Head Office's frozen cash is not the store's). */
function storeCash(s) {
  let sum = 0;
  for (const p of s.players) if (p.side !== 'office') sum += p.cash;
  return Math.floor(sum + 1e-6);
}

/**
 * @param {Object} session
 * @param {Object} o
 * @param {string|null} o.roomCode
 * @param {string|null} o.roomKind 'online' | 'local' | null
 * @param {() => void} o.onHelp
 * @param {() => void} [o.onHandbook] open the Employee Handbook
 * @param {(s) => number|null} [o.budgetLeft] Head Office's budget left, or null if this player is not Head Office
 */
export function createTopBar(session, { roomCode = null, roomKind = null, onHelp, onHandbook = null, sound = null, playSound = () => {}, budgetLeft = () => null }) {
  const cashVal = h('b', { class: 'val' });
  const teamVal = h('small', { class: 'team-cash' });
  const cashLbl = h('span', { class: 'lbl' }, 'YOUR CASH');
  const cash = h('div', { class: 'hud-box hud-cash', title: CASH_TITLE },
    h('span', { class: 'coin', 'aria-hidden': 'true' }, '$'), cashLbl, cashVal, teamVal);

  const evTitle = h('b', { class: 'ev-title' });
  const evSub = h('small', { class: 'ev-sub' });
  const event = h('div', { class: 'hud-box hud-event' }, evTitle, evSub);

  const cdLabel = h('small');
  const cdVal = h('b');
  const countdown = h('div', { class: 'hud-stat countdown' }, cdLabel, cdVal);
  const openBtn = h('button', {
    type: 'button', class: 'btn-doors',
    title: 'Start the next sales event now. Shoppers will not wait for you to finish.',
    onclick: () => { playSound('click'); session.send({ c: 'start' }); },
  }, 'OPEN THE DOORS');
  const leftVal = h('b');
  const remaining = h('div', { class: 'hud-stat remaining' }, h('small', null, 'SHOPPERS LEFT'), leftVal);
  const phase = h('div', { class: 'hud-phase' }, countdown, openBtn, remaining);

  const refVal = h('b');
  const refMax = h('span');
  const refFill = h('i');
  const refunds = h('div', { class: 'hud-box hud-refunds', title: 'Too many refunds and corporate closes the store. The limit rises with the number of players.' },
    h('span', { class: 'ref-text' }, 'Refunds ', refVal, ' / ', refMax),
    h('div', { class: 'meter', role: 'presentation' }, refFill));

  const speedBtns = SPEEDS.map((n) => h('button', {
    type: 'button', class: 'btn-speed', 'aria-pressed': 'false',
    title: n === 1 ? 'Normal speed' : n === 5 ? '5x speed. Premature, sloppy, over before anyone enjoyed it. You will love it.'
      : `${n}x speed. For people who think they are good at this.`,
    onclick: () => session.send({ c: 'speed', n }),
  }, `${n}x`));
  const speed = h('div', { class: 'hud-speed', role: 'group', 'aria-label': 'Game speed' }, speedBtns);
  // Pause (0.3.02): anyone may pause the whole store for everyone, and anyone may carry on. Two
  // bars while it runs, a play triangle while it is paused (drawn in CSS: .pz-icon).
  const pauseBtn = h('button', {
    type: 'button', class: 'btn-pause', 'aria-pressed': 'false', 'aria-label': 'Pause the game', title: PAUSE_TITLE,
    onclick: () => { playSound('click'); session.send({ c: 'pause', on: !session.state?.pause }); },
  }, h('span', { class: 'pz-icon', 'aria-hidden': 'true' }));
  // The pause button sits just before the speed buttons, and goes wherever they go (under ☰ on a phone).
  const timeBox = h('div', { class: 'hud-clock' }, pauseBtn, speed);
  // Auto-rebuild lives up here so it can be switched on before anything breaks, on any screen.
  const auto = createAutoSwitch(session, { playSound, cls: 'hud-auto' });

  // An invite link opens the menu with the room code already filled in. When the bar is short of
  // room (see fit() below), "Copy link" shrinks to a link icon and then goes, and the code itself
  // copies the link (the code, in a test room) when clicked; it turns green when that worked.
  const roomText = roomKind === 'online' ? () => `${location.origin}${location.pathname}?join=${roomCode}` : () => roomCode;
  let codeEl = null, linkWord = null;
  async function copyRoom() {
    const ok = await copyText(roomText());
    setClass(codeEl, 'copied', ok);
    // The browser refused: at least select the code, ready for Ctrl+C.
    if (!ok) getSelection()?.selectAllChildren(codeEl);
    if (linkWord) setText(linkWord, ok ? 'Copied' : 'Select it yourself');
    setTimeout(() => { setClass(codeEl, 'copied', false); if (linkWord) setText(linkWord, 'Copy link'); }, 1600);
  }
  let room = null;
  if (roomCode) {
    codeEl = h('b', {
      class: 'room-code', title: roomKind === 'online' ? 'Click to copy the invite link' : 'Click to copy the room code', onclick: copyRoom,
    }, roomCode);
    linkWord = roomKind === 'online' ? h('span', { class: 'cl-word' }, 'Copy link') : null;
    room = h('div', { class: 'hud-room' },
      h('small', null, roomKind === 'local' ? 'TEST ROOM' : 'ROOM CODE'),
      codeEl,
      copyButton(() => roomCode),
      linkWord ? h('button', {
        type: 'button', class: 'btn-copy btn-link', 'aria-label': 'Copy the invite link', title: 'Copy the invite link', onclick: copyRoom,
      }, linkWord, h('span', { class: 'cl-icon', 'aria-hidden': 'true' }, '🔗')) : null);
  }

  const help = h('button', { type: 'button', class: 'btn-help', 'aria-label': 'How to play', title: 'How to play', onclick: () => { setMore(false); onHelp(); } }, '?');
  const audio = sound ? createSoundMenu(sound) : null;
  const book = onHandbook ? h('button', {
    type: 'button', class: 'btn-help btn-book', 'aria-label': 'Employee Handbook', title: 'Employee Handbook: every shopper and building, with its numbers',
    onclick: () => { setMore(false); onHandbook(); },
  }, '📖') : null;
  // Full screen, where the browser allows a page to ask for it (not on iPhones: there, add the
  // game to the Home Screen instead and it opens without the browser's bars).
  const root = document.documentElement;
  const canFull = !!(root.requestFullscreen && document.fullscreenEnabled !== false);
  const full = canFull ? h('button', {
    type: 'button', class: 'btn-help btn-full', 'aria-label': 'Full screen', title: 'Full screen on or off',
    onclick: () => {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    },
  }, '⛶') : null;

  // On a narrow screen the things a player needs less often (speed, room code, sound, help) fold
  // away behind one button. On a wide screen the wrapper takes no part in the layout
  // (display: contents) and the button is hidden, so the bar looks as it always has.
  const more = h('div', { class: 'hud-more', role: 'group', 'aria-label': 'More' }, auto.el, timeBox, room, audio, full, book, help);
  const moreBtn = h('button', {
    type: 'button', class: 'btn-more', 'aria-label': 'More: auto-rebuild, pause and speed, room code, sound, help', title: 'More', 'aria-expanded': 'false',
    onclick: () => setMore(!more.classList.contains('open')),
  }, '☰');
  function setMore(open) {
    setClass(more, 'open', open);
    moreBtn.setAttribute('aria-expanded', String(open));
  }
  // A click anywhere else closes it. (Not stopPropagation: the sound menu listens for the same.)
  addEventListener('click', (e) => { if (!more.contains(e.target) && !moreBtn.contains(e.target)) setMore(false); });

  const el = h('header', { class: 'topbar' }, cash, event, phase, h('div', { class: 'spacer' }), refunds, moreBtn, more);

  // When the bar is longer than the window (a hosted game's room code, a second player's team
  // total, a boss's long title, or a tall window, whose text is bigger), its less important parts
  // give way one step at a time, least important first, until it fits: the .fit-1 to .fit-10 rules
  // in style.css say what each step drops. The window's width alone cannot tell when that is
  // needed (the text grows with the window's height, and the contents change with the phase and
  // the players), so the bar measures itself: only when its words or the window have changed.
  const narrow = matchMedia('(max-width: 1099px), (max-height: 559px)');
  let fitSig = '';
  addEventListener('resize', () => { fitSig = ''; });
  document.fonts?.ready.then(() => { fitSig = ''; });
  const setFit = (n) => { for (let i = 1; i <= FIT_STEPS; i++) setClass(el, `fit-${i}`, i <= n); };
  // Overflowing shows as the bar's contents running past its end, or as a box squeezed narrower
  // than its words (the refunds box may shrink below them, and so may the sales event box, down to
  // its minimum width).
  const boxes = [cash, event, phase, refunds, room].filter(Boolean);
  const fits = () => el.scrollWidth <= el.clientWidth + 1 && boxes.every((b) => b.scrollWidth <= b.clientWidth + 1);
  function fit(sig) {
    if (sig === fitSig) return;
    setFit(0);
    // (Not on a phone or tablet, where the bar wraps and folds away instead; and not before the
    // bar is on the page, when there is nothing to measure.)
    if (!el.isConnected || narrow.matches) { fitSig = el.isConnected ? sig : ''; return; }
    fitSig = sig;
    for (let n = 1; n <= FIT_STEPS && !fits(); n++) setFit(n);
  }

  let wasOffice = null;
  function update(s) {
    const mine = s.players[session.me];
    const budget = budgetLeft(s);
    const isOffice = budget !== null;
    if (isOffice !== wasOffice) {
      wasOffice = isOffice;
      setClass(cash, 'is-budget', isOffice);
      cash.title = isOffice ? BUDGET_TITLE : CASH_TITLE;
    }
    if (isOffice) {
      // Head Office has no cash to spend, only his budget for shoppers.
      setText(cashLbl, s.phase === 'build' ? 'BUDGET LEFT' : 'CARRIES OVER');
      setText(cashVal, money(s.phase === 'build' ? budget : s.office?.bank || 0));
      setText(teamVal, `store ${money(storeCash(s))}`);
    } else {
      setText(cashLbl, 'YOUR CASH');
      setText(cashVal, money(mine ? Math.floor(mine.cash) : 0));
      // With company, also show what the whole team has.
      setText(teamVal, s.players.length > 1 ? `team ${money(storeCash(s))}` : '');
    }
    // An endless game (waves 0) has no last sales event to count towards.
    const endless = isEndless(s);
    // The next sales event brings the boss: the heading says so, and who.
    const bossNext = s.phase === 'build' && !s.training ? bossTier(s.wave + 1) : 0;
    let evTip = '';
    if (s.training) {
      setText(evTitle, 'TRAINING SHIFT');
      setText(evSub, s.phase === 'wave' ? 'doors open' : 'you cannot lose here');
    } else if (s.phase === 'lobby') {
      setText(evTitle, 'NOT OPEN YET');
      setText(evSub, 'waiting for everyone to be ready');
    } else if (s.phase === 'cards') {
      setText(evTitle, 'DEALING THE CARDS');
      setText(evSub, 'nothing can be built yet');
    } else if (s.phase === 'wave') {
      setText(evTitle, `SALES EVENT ${eventOf(s.wave, s.waves)}`);
      setText(evSub, endless ? 'endless' : '');
    } else if (s.phase === 'build') {
      setText(evTitle, bossNext ? 'BOSS EVENT NEXT' : 'BUILD PHASE');
      setText(evSub, bossNext ? `event ${eventOf(s.wave + 1, s.waves)} · ${bossTitle(bossNext)}`
        : `next: sales event ${eventOf(s.wave + 1, s.waves)}${endless ? ' · endless' : ''}`);
      if (bossNext) evTip = `Sales event ${s.wave + 1} brings the boss: the ${bossTitle(bossNext)}. He walks in about ${TUNE.bossAt} seconds after the doors open, and nothing slows him down. Details in the Employee Handbook.`;
    } else {
      setText(evTitle, s.phase === 'won' ? 'STORE SURVIVED' : 'STORE CLOSED');
      setText(evSub, `sales event ${eventOf(s.wave, s.waves)}`);
    }
    if (event.title !== evTip) event.title = evTip;
    setClass(event, 'is-build', s.phase === 'build' || s.phase === 'lobby' || s.phase === 'cards');
    setClass(event, 'is-boss', !!bossNext);
    setClass(event, 'is-over', s.phase === 'won' || s.phase === 'lost');

    const build = s.phase === 'build';
    const boss = build && !s.training ? officePlayer(s) : null;
    setClass(countdown, 'hidden', !build || !!s.training);
    // Head Office has his own READY button in the planner.
    setClass(openBtn, 'hidden', !build || isOffice);
    // In training the doors only open when the lesson has shoppers lined up.
    setClass(openBtn, 'waiting', !!s.training && !s.nextWave);
    setClass(openBtn, 'ready', (!!s.training && !!s.nextWave) || (!!boss && s.office.ready && !s.storeReady));
    // The store has asked and is waiting for Head Office: say so on the button.
    const storeAsked = !!boss && s.storeReady;
    if (storeAsked !== openBtn.classList.contains('asked')) {
      setClass(openBtn, 'asked', storeAsked);
      openBtn.replaceChildren(...(storeAsked
        ? [h('b', null, 'ASKED ✓'), h('small', null, 'waiting for Head Office')]
        : ['OPEN THE DOORS']));
    }
    const doorTip = !boss ? 'Start the next sales event now. Shoppers will not wait for you to finish.'
      : storeAsked ? `The store has asked to open the doors. They open when ${boss.name} (Head Office) presses READY, or when the clock runs out.`
        : s.office.ready ? `${boss.name} (Head Office) is ready. Press to open the doors now.`
          : `Ask to open the doors now. With ${boss.name} running Head Office, they open early only when he is ready too.`;
    if (openBtn.title !== doorTip) openBtn.title = doorTip;
    setClass(remaining, 'hidden', s.phase !== 'wave');
    if (build) {
      if (s.phaseT < 0) {
        setText(cdLabel, 'CLOCK STARTS ON');
        setText(cdVal, 'FIRST BUILD');
      } else {
        setText(cdLabel, 'DOORS OPEN IN');
        setText(cdVal, clock(s.phaseT));
      }
      setClass(countdown, 'urgent', s.phaseT >= 0 && s.phaseT <= 10 * 30);
    } else if (s.phase === 'wave') {
      setText(leftVal, String(s.spawnQ.length + s.shoppers.length));
    }

    setText(refVal, String(s.refunds));
    setText(refMax, String(s.refundLimit));
    const share = Math.max(0, Math.min(1, s.refunds / s.refundLimit));
    setStyle(refFill, 'width', `${(share * 100).toFixed(1)}%`);
    // Yellow when empty, through orange, to sale-sign red when full.
    setStyle(refFill, 'background', `hsl(${Math.round(48 - 48 * share)} 90% ${Math.round(52 - 6 * share)}%)`);
    setClass(refunds, 'danger', share >= 0.75);

    auto.update(s);
    const paused = !!s.pause;
    if (pauseBtn.getAttribute('aria-pressed') !== String(paused)) {
      pauseBtn.setAttribute('aria-pressed', String(paused));
      pauseBtn.setAttribute('aria-label', paused ? 'Resume the game' : 'Pause the game');
      pauseBtn.title = paused ? RESUME_TITLE : PAUSE_TITLE;
      setClass(pauseBtn, 'on', paused);
    }
    // Only in a game that is being played: not in the lobby, and not once it is over.
    const canPause = s.phase === 'cards' || s.phase === 'build' || s.phase === 'wave';
    if (pauseBtn.disabled === canPause) pauseBtn.disabled = !canPause;
    speedBtns.forEach((b, i) => {
      const on = (s.speed || 1) === SPEEDS[i];
      setClass(b, 'on', on);
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
    });
    // Digits count as one: a clock ticking or cash changing need not measure again, unless the
    // number grows a digit.
    fit(`${s.phase}|${isOffice}|${el.textContent.replace(/\d/g, '0')}`);
  }

  return { el, update };
}

/**
 * The speaker button and its menu (0.3.03): the overall Volume, then a slider for each group of
 * sounds (money, shoppers, security and machines, announcements, music, DEB's voice). The speaker
 * mark beside each row mutes it and brings back its last level; letting go of a slider plays a
 * short sample of that group, so the player hears what he has set.
 * The menu's text never changes (the marks and the percentages are drawn in CSS), because the top
 * bar measures its own text to know when to fit itself again (fit() above).
 * @param {Object} sound the sound module (get/set/toggle/preview, unlock)
 */
function createSoundMenu(sound) {
  const rows = [{ key: 'volume', label: 'Volume' }, ...GROUPS];
  const pct = (key) => Math.round((Number(sound.get(key)) || 0) * 100);
  const sync = [];

  function row({ key, label }) {
    const id = `snd-${key}`;
    const slider = h('input', { type: 'range', id, min: '0', max: '100', step: '5', 'aria-label': label });
    const val = h('span', { class: 'snd-val', 'aria-hidden': 'true' });
    const mute = h('button', {
      type: 'button', class: 'snd-mute', 'aria-label': `Mute ${label}`, 'aria-pressed': 'false',
      title: `${label}: off, or back to where it was`,
      onclick: () => {
        sound.unlock();
        sound.toggle(key);
        refresh();
        if (key !== 'volume') sound.preview(key);
      },
    });
    slider.addEventListener('input', () => { sound.unlock(); sound.set(key, Number(slider.value) / 100); refresh(); });
    // Let go (or a key press): one short sample of the group, at its new level.
    slider.addEventListener('change', () => { if (key !== 'volume') sound.preview(key); });
    sync.push(() => {
      const n = pct(key);
      if (slider.value !== String(n)) slider.value = String(n);
      slider.setAttribute('aria-valuetext', `${n}%`);
      val.dataset.v = `${n}%`;
      setClass(el, 'is-off', n === 0);
      mute.setAttribute('aria-pressed', String(n === 0));
    });
    const el = h('div', { class: `snd-row${key === 'volume' ? ' snd-master' : ''}` },
      mute, h('label', { class: 'snd-name', for: id }, label), val, slider);
    return el;
  }

  const reset = h('button', {
    type: 'button', class: 'snd-reset', title: 'Every slider back to how the game came',
    onclick: () => {
      sound.unlock();
      for (const { key } of rows) sound.set(key, DEFAULT_LEVELS[key]);
      refresh();
    },
  }, 'Reset');
  const menu = h('div', { class: 'snd-menu hidden', role: 'group', 'aria-label': 'Sound settings' },
    rows.map(row), h('div', { class: 'snd-foot' }, reset));
  const btn = h('button', {
    type: 'button', class: 'btn-help btn-sound', 'aria-label': 'Sound settings', title: 'Sound settings', 'aria-expanded': 'false',
    onclick: (e) => {
      e.stopPropagation();
      sound.unlock();
      setOpen(menu.classList.contains('hidden'));
    },
  });
  function setOpen(open) {
    setClass(menu, 'hidden', !open);
    btn.setAttribute('aria-expanded', String(open));
    if (!open) return;
    refresh();
    // A dropdown from the top bar must not run off the bottom of the window: it scrolls instead.
    // (In the ☰ menu on a phone it sits in that menu's own scrolling list, so no limit is set.)
    menu.style.maxHeight = '';
    if (getComputedStyle(menu).position === 'absolute') {
      const top = menu.getBoundingClientRect().top;
      menu.style.maxHeight = `${Math.max(160, innerHeight - top - 8)}px`;
    }
  }
  function refresh() {
    for (const f of sync) f();
    const muted = !(sound.get('volume') > 0) || GROUPS.every(({ key }) => !(sound.get(key) > 0));
    const icon = muted ? '🔇' : '🔊';
    if (btn.textContent !== icon) btn.textContent = icon;
  }
  refresh();
  menu.addEventListener('click', (e) => e.stopPropagation());
  addEventListener('click', () => { if (!menu.classList.contains('hidden')) setOpen(false); });
  // Escape closes the menu and gives the keyboard back to the speaker button.
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || menu.classList.contains('hidden')) return;
    const inside = menu.contains(document.activeElement);
    setOpen(false);
    if (inside) btn.focus();
  });
  return h('div', { class: 'hud-sound' }, btn, menu);
}

/**
 * Who is on shift, and what each has in the bank. Click your own job title to change it.
 * Between sales events, a player's own row also has the button to take the Head Office job
 * (run the shoppers) or hand it back.
 */
export function createPlayersPanel(session, { playSound = () => {} } = {}) {
  const list = h('ul', { class: 'players-list' });
  const foot = h('div', { class: 'players-foot' });
  // With a Head Office player the doors open early only when both sides have asked: show who has.
  const storeLight = h('span', { class: 'rl' });
  const officeLight = h('span', { class: 'rl' });
  const lights = h('div', {
    class: 'ready-lights hidden', role: 'status',
    title: 'Before the clock runs out, the doors open only when the store (any store player presses OPEN THE DOORS) and Head Office (READY) have both asked.',
  }, h('small', null, 'OPEN EARLY'), storeLight, officeLight);
  // On a narrow screen the list folds down to this button, so it does not sit on the floor.
  // (Hidden on a wide screen, where the list is always open.)
  const pillCount = h('b');
  const pill = h('button', {
    type: 'button', class: 'players-pill', 'aria-expanded': 'false', 'aria-label': 'Players on shift',
    onclick: () => { const open = !el.classList.contains('open'); setClass(el, 'open', open); pill.setAttribute('aria-expanded', String(open)); },
  }, h('span', { class: 'pp-icon', 'aria-hidden': 'true' }, '👥'), pillCount, h('span', { class: 'pp-caret', 'aria-hidden': 'true' }));
  const el = h('section', { class: 'panel players', 'aria-label': 'Players' }, pill, h('h3', null, 'ON SHIFT'), list, lights, foot);
  let sig = '';
  const cashEls = new Map(); // player id -> the element showing his cash
  let statusEl = null; // what Head Office is doing, on his row
  const GIVE_AMOUNTS = [50, 200, 1000];

  /** Whether this player may be offered the Head Office job right now. */
  function canTakeJob(s, p) {
    if (s.training || s.phase !== 'build' || p.side === 'office') return false;
    if (officePlayer(s)) return false; // someone else has it
    // Somebody has to be left running the store.
    return s.players.some((q) => q !== p && q.on && q.side !== 'office');
  }

  function update(s) {
    const boss = officePlayer(s);
    const me = s.players[session.me];
    const next = JSON.stringify([session.me, s.players.map((p) => [p.name, p.role, p.on, p.color, p.side]),
      boss ? boss.id : -1, me ? canTakeJob(s, me) : false, s.phase === 'build' && !s.training]);
    if (next !== sig) { sig = next; rebuild(s); }
    for (const p of s.players) if (cashEls.has(p.id)) setText(cashEls.get(p.id), money(Math.floor(p.cash)));
    if (statusEl && s.office) {
      setText(statusEl, s.phase === 'build' ? (s.office.ready ? 'ready to open' : 'planning the next wave') : s.phase === 'wave' ? 'sending shoppers' : '');
      setClass(statusEl, 'on', s.phase === 'build' && !!s.office.ready);
    }
    const asking = !!boss && s.phase === 'build' && !s.training;
    setClass(lights, 'hidden', !asking);
    if (asking) {
      setText(storeLight, s.storeReady ? 'STORE ✓' : 'STORE …');
      setClass(storeLight, 'on', s.storeReady);
      setText(officeLight, s.office.ready ? 'HEAD OFFICE ✓' : 'HEAD OFFICE …');
      setClass(officeLight, 'on', !!s.office.ready);
    }
    const online = s.players.filter((p) => p.on).length;
    setText(pillCount, String(online));
    setText(foot, online === 1 ? '1 player online. Says a lot.'
      : boss ? `${online} players online · income is split between the store players`
        : `${online} players online · income is split evenly`);
  }

  function sideButton(s, p) {
    if (p.id !== session.me || s.training || s.phase !== 'build') return null;
    if (p.side === 'office') {
      return h('button', {
        type: 'button', class: 'side-btn back',
        title: 'Hand back the Head Office job and help run the store again. Only between sales events.',
        onclick: () => { playSound('click'); session.send({ c: 'side', side: 'store' }); },
      }, 'Back to the store');
    }
    if (!canTakeJob(s, p)) return null;
    return h('button', {
      type: 'button', class: 'side-btn',
      title: 'Take the Head Office job: stop defending, and instead buy the shoppers for each sales event and choose where and when they come in. You win if the store closes. Only between sales events.',
      onclick: () => { playSound('click'); session.send({ c: 'side', side: 'office' }); },
    }, 'Run the shoppers');
  }

  function rebuild(s) {
    const hadFocus = document.activeElement && list.contains(document.activeElement);
    const focusSide = hadFocus && document.activeElement.classList.contains('side-btn');
    cashEls.clear();
    statusEl = null;
    const iAmOffice = s.players[session.me]?.side === 'office';
    list.replaceChildren(...s.players.map((p) => {
      const mine = p.id === session.me;
      const office = p.side === 'office';
      // Head Office has no money in the store: no cash, and no point giving him any.
      const cashEl = office ? null : h('b', { class: 'pcash' });
      if (cashEl) cashEls.set(p.id, cashEl);
      const tag = office ? h('span', { class: 'ho-tag', title: 'Head Office: runs the shoppers instead of the store, and wins if the store closes.' }, 'HEAD OFFICE') : null;
      if (office && p.on) statusEl = h('span', { class: 'ho-status' });
      // Money is personal, so there has to be a way to hand it over.
      const giveBtn = (amount) => h('button', {
        type: 'button', class: 'give-btn', title: `Give ${p.name} $${amount.toLocaleString('en-US')} of your own money (or all you have, if that is less).`,
        onclick: () => {
          const have = Math.floor(session.state.players[session.me]?.cash || 0);
          const n = Math.min(have, amount);
          if (n > 0) session.send({ c: 'give', to: p.id, n });
        },
      }, `$${amount.toLocaleString('en-US')}`);
      const give = mine || !p.on || office || iAmOffice ? null
        : h('span', { class: 'give-row' }, h('small', null, 'Give'), GIVE_AMOUNTS.map(giveBtn));
      const role = mine
        ? h('button', {
          type: 'button', class: 'role role-btn', title: 'Change your job title. It changes nothing else.',
          onclick: () => {
            const i = ROLES.indexOf(p.role);
            session.send({ c: 'role', role: ROLES[(i + 1) % ROLES.length] });
          },
        }, p.role)
        : h('span', { class: 'role' }, p.role);
      return h('li', { class: `player${p.on ? '' : ' off'}${mine ? ' me' : ''}${office ? ' is-office' : ''}` },
        h('span', { class: 'chip', style: { background: safeColor(p.color) } }),
        h('span', { class: 'pname' }, p.name, mine ? h('em', null, ' (you)') : null, cashEl),
        office ? h('span', { class: 'ho-line' }, tag, statusEl) : null,
        role,
        give,
        sideButton(s, p),
        p.on ? null : h('span', { class: 'gone' }, 'clocked out'));
    }));
    if (hadFocus) list.querySelector(focusSide ? '.side-btn' : '.role-btn')?.focus();
  }

  return { el, update };
}
