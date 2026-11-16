// The top bar (cash, sales event, doors, refunds, speed, room code) and the players panel.
import { TUNE, ROLES, officePlayer } from '../sim/index.js';
import { h, setText, setClass, setStyle, money, clock, safeColor, copyButton } from './dom.js';

const CASH_TITLE = 'Your own money. Everything the store earns or refunds is split evenly between the players; what you build comes out of yours.';
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
 * @param {(s) => number|null} [o.budgetLeft] Head Office's budget left, or null if this player is not Head Office
 */
export function createTopBar(session, { roomCode = null, roomKind = null, onHelp, sound = null, playSound = () => {}, budgetLeft = () => null }) {
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

  const speedBtns = [1, 2, 3].map((n) => h('button', {
    type: 'button', class: 'btn-speed', 'aria-pressed': 'false',
    title: n === 1 ? 'Normal speed' : `${n}x speed. For people who think they are good at this.`,
    onclick: () => session.send({ c: 'speed', n }),
  }, `${n}x`));
  const speed = h('div', { class: 'hud-speed', role: 'group', 'aria-label': 'Game speed' }, speedBtns);

  const room = roomCode ? h('div', { class: 'hud-room' },
    h('small', null, roomKind === 'local' ? 'TEST ROOM' : 'ROOM CODE'),
    h('b', { class: 'room-code' }, roomCode),
    copyButton(() => roomCode),
    // An invite link opens the menu with the room code already filled in.
    roomKind === 'online' ? copyButton(() => `${location.origin}${location.pathname}?join=${roomCode}`, 'Copy link') : null) : null;

  const help = h('button', { type: 'button', class: 'btn-help', 'aria-label': 'How to play', title: 'How to play', onclick: () => { setMore(false); onHelp(); } }, '?');
  const audio = sound ? createSoundMenu(sound) : null;
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
  const more = h('div', { class: 'hud-more', role: 'group', 'aria-label': 'More' }, speed, room, audio, full, help);
  const moreBtn = h('button', {
    type: 'button', class: 'btn-more', 'aria-label': 'More: speed, room code, sound, help', title: 'More', 'aria-expanded': 'false',
    onclick: () => setMore(!more.classList.contains('open')),
  }, '☰');
  function setMore(open) {
    setClass(more, 'open', open);
    moreBtn.setAttribute('aria-expanded', String(open));
  }
  // A click anywhere else closes it. (Not stopPropagation: the sound menu listens for the same.)
  addEventListener('click', (e) => { if (!more.contains(e.target) && !moreBtn.contains(e.target)) setMore(false); });

  const el = h('header', { class: 'topbar' }, cash, event, phase, h('div', { class: 'spacer' }), refunds, moreBtn, more);

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
    const total = s.waves;
    if (s.training) {
      setText(evTitle, 'TRAINING SHIFT');
      setText(evSub, s.phase === 'wave' ? 'doors open' : 'you cannot lose here');
    } else if (s.phase === 'lobby') {
      setText(evTitle, 'NOT OPEN YET');
      setText(evSub, 'waiting for everyone to be ready');
    } else if (s.phase === 'wave') {
      setText(evTitle, `SALES EVENT ${s.wave} / ${total}`);
      setText(evSub, '');
    } else if (s.phase === 'build') {
      setText(evTitle, 'BUILD PHASE');
      setText(evSub, `next: sales event ${s.wave + 1} / ${total}`);
    } else {
      setText(evTitle, s.phase === 'won' ? 'STORE SURVIVED' : 'STORE CLOSED');
      setText(evSub, `sales event ${s.wave} / ${total}`);
    }
    setClass(event, 'is-build', s.phase === 'build' || s.phase === 'lobby');
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

    speedBtns.forEach((b, i) => {
      const on = (s.speed || 1) === i + 1;
      setClass(b, 'on', on);
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
    });
  }

  return { el, update };
}

/**
 * The speaker button and its small menu: sound effects, music, DEB's voice, and volume.
 * @param {Object} sound the sound module (get/set settings, unlock)
 */
function createSoundMenu(sound) {
  const box = (key, text) => {
    const input = h('input', { type: 'checkbox', checked: !!sound.get(key) });
    input.addEventListener('change', () => { sound.unlock(); sound.set(key, input.checked); refresh(); });
    return h('label', { class: 'snd-row' }, input, h('span', null, text));
  };
  const vol = h('input', { type: 'range', min: '0', max: '100', step: '5', 'aria-label': 'Volume', value: String(Math.round((sound.get('volume') ?? 0.7) * 100)) });
  vol.addEventListener('input', () => { sound.unlock(); sound.set('volume', Number(vol.value) / 100); refresh(); });
  const menu = h('div', { class: 'snd-menu hidden', role: 'group', 'aria-label': 'Sound settings' },
    box('sfx', 'Sound effects'), box('music', 'Store music'), box('voice', "DEB's voice"),
    h('label', { class: 'snd-row snd-vol' }, h('span', null, 'Volume'), vol));
  const btn = h('button', {
    type: 'button', class: 'btn-help btn-sound', 'aria-label': 'Sound settings', title: 'Sound settings', 'aria-expanded': 'false',
    onclick: (e) => {
      e.stopPropagation();
      sound.unlock();
      const open = menu.classList.toggle('hidden') === false;
      btn.setAttribute('aria-expanded', String(open));
    },
  });
  function refresh() {
    const silent = (!sound.get('sfx') && !sound.get('music') && !sound.get('voice')) || sound.get('volume') === 0;
    btn.textContent = silent ? '🔇' : '🔊';
  }
  refresh();
  menu.addEventListener('click', (e) => e.stopPropagation());
  addEventListener('click', () => { menu.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); });
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
