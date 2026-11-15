// The top bar (cash, sales event, doors, refunds, speed, room code) and the players panel.
import { TUNE, ROLES } from '../sim/index.js';
import { h, setText, setClass, setStyle, money, clock, safeColor, copyButton } from './dom.js';

/**
 * @param {Object} session
 * @param {Object} o
 * @param {string|null} o.roomCode
 * @param {string|null} o.roomKind 'online' | 'local' | null
 * @param {() => void} o.onHelp
 */
export function createTopBar(session, { roomCode = null, roomKind = null, onHelp }) {
  const cashVal = h('b', { class: 'val' });
  const cash = h('div', { class: 'hud-box hud-cash', title: 'Shared cash. Everyone spends it. Nobody earns it.' },
    h('span', { class: 'coin', 'aria-hidden': 'true' }, '$'), h('span', { class: 'lbl' }, 'CASH'), cashVal);

  const evTitle = h('b', { class: 'ev-title' });
  const evSub = h('small', { class: 'ev-sub' });
  const event = h('div', { class: 'hud-box hud-event' }, evTitle, evSub);

  const cdLabel = h('small');
  const cdVal = h('b');
  const countdown = h('div', { class: 'hud-stat countdown' }, cdLabel, cdVal);
  const openBtn = h('button', {
    type: 'button', class: 'btn-doors',
    title: 'Start the next sales event now. Shoppers will not wait for you to finish.',
    onclick: () => session.send({ c: 'start' }),
  }, 'OPEN THE DOORS');
  const leftVal = h('b');
  const remaining = h('div', { class: 'hud-stat remaining' }, h('small', null, 'SHOPPERS LEFT'), leftVal);
  const phase = h('div', { class: 'hud-phase' }, countdown, openBtn, remaining);

  const refVal = h('b');
  const refFill = h('i');
  const refunds = h('div', { class: 'hud-box hud-refunds', title: `${TUNE.refundLimit} refunds and corporate closes the store.` },
    h('span', { class: 'ref-text' }, 'Refunds ', refVal, ` / ${TUNE.refundLimit}`),
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

  const help = h('button', { type: 'button', class: 'btn-help', 'aria-label': 'How to play', title: 'How to play', onclick: onHelp }, '?');

  const el = h('header', { class: 'topbar' }, cash, event, phase, h('div', { class: 'spacer' }), refunds, speed, room, help);

  function update(s) {
    setText(cashVal, money(s.cash));
    const total = TUNE.waves;
    if (s.phase === 'wave') {
      setText(evTitle, `SALES EVENT ${s.wave} / ${total}`);
      setText(evSub, '');
    } else if (s.phase === 'build') {
      setText(evTitle, 'BUILD PHASE');
      setText(evSub, `next: sales event ${s.wave + 1} / ${total}`);
    } else {
      setText(evTitle, s.phase === 'won' ? 'STORE SURVIVED' : 'STORE CLOSED');
      setText(evSub, `sales event ${s.wave} / ${total}`);
    }
    setClass(event, 'is-build', s.phase === 'build');
    setClass(event, 'is-over', s.phase === 'won' || s.phase === 'lost');

    const build = s.phase === 'build';
    setClass(countdown, 'hidden', !build);
    setClass(openBtn, 'hidden', !build);
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
    const share = Math.max(0, Math.min(1, s.refunds / TUNE.refundLimit));
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

/** Who is on shift. Click your own job title to change it. */
export function createPlayersPanel(session) {
  const list = h('ul', { class: 'players-list' });
  const foot = h('div', { class: 'players-foot' });
  const el = h('section', { class: 'panel players', 'aria-label': 'Players' }, h('h3', null, 'ON SHIFT'), list, foot);
  let sig = '';

  function update(s) {
    const next = JSON.stringify([session.me, s.players.map((p) => [p.name, p.role, p.on, p.color])]);
    if (next === sig) return;
    sig = next;
    const hadFocus = document.activeElement && list.contains(document.activeElement);
    list.replaceChildren(...s.players.map((p) => {
      const mine = p.id === session.me;
      const role = mine
        ? h('button', {
          type: 'button', class: 'role role-btn', title: 'Change your job title. It changes nothing else.',
          onclick: () => {
            const i = ROLES.indexOf(p.role);
            session.send({ c: 'role', role: ROLES[(i + 1) % ROLES.length] });
          },
        }, p.role)
        : h('span', { class: 'role' }, p.role);
      return h('li', { class: `player${p.on ? '' : ' off'}${mine ? ' me' : ''}` },
        h('span', { class: 'chip', style: { background: safeColor(p.color) } }),
        h('span', { class: 'pname' }, p.name, mine ? h('em', null, ' (you)') : null),
        role,
        p.on ? null : h('span', { class: 'gone' }, 'clocked out'));
    }));
    if (hadFocus) list.querySelector('.role-btn')?.focus();
    const online = s.players.filter((p) => p.on).length;
    setText(foot, online === 1 ? '1 player online. Says a lot.' : `${online} players online`);
  }

  return { el, update };
}
