// The top bar (cash, sales event, doors, refunds, speed, room code) and the players panel.
import { TUNE, ROLES, teamCash } from '../sim/index.js';
import { h, setText, setClass, setStyle, money, clock, safeColor, copyButton } from './dom.js';

/**
 * @param {Object} session
 * @param {Object} o
 * @param {string|null} o.roomCode
 * @param {string|null} o.roomKind 'online' | 'local' | null
 * @param {() => void} o.onHelp
 */
export function createTopBar(session, { roomCode = null, roomKind = null, onHelp, sound = null, playSound = () => {} }) {
  const cashVal = h('b', { class: 'val' });
  const teamVal = h('small', { class: 'team-cash' });
  const cash = h('div', {
    class: 'hud-box hud-cash',
    title: 'Your own money. Everything the store earns or refunds is split evenly between the players; what you build comes out of yours.',
  },
  h('span', { class: 'coin', 'aria-hidden': 'true' }, '$'), h('span', { class: 'lbl' }, 'YOUR CASH'), cashVal, teamVal);

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

  const help = h('button', { type: 'button', class: 'btn-help', 'aria-label': 'How to play', title: 'How to play', onclick: onHelp }, '?');
  const audio = sound ? createSoundMenu(sound) : null;

  const el = h('header', { class: 'topbar' }, cash, event, phase, h('div', { class: 'spacer' }), refunds, speed, room, audio, help);

  function update(s) {
    const mine = s.players[session.me];
    setText(cashVal, money(mine ? Math.floor(mine.cash) : 0));
    // With company, also show what the whole team has.
    setText(teamVal, s.players.length > 1 ? `team ${money(teamCash(s))}` : '');
    const total = TUNE.waves;
    if (s.training) {
      setText(evTitle, 'TRAINING SHIFT');
      setText(evSub, s.phase === 'wave' ? 'doors open' : 'you cannot lose here');
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
    setClass(event, 'is-build', s.phase === 'build');
    setClass(event, 'is-over', s.phase === 'won' || s.phase === 'lost');

    const build = s.phase === 'build';
    setClass(countdown, 'hidden', !build || !!s.training);
    setClass(openBtn, 'hidden', !build);
    // In training the doors only open when the lesson has shoppers lined up.
    setClass(openBtn, 'waiting', !!s.training && !s.nextWave);
    setClass(openBtn, 'ready', !!s.training && !!s.nextWave);
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

/** Who is on shift, and what each has in the bank. Click your own job title to change it. */
export function createPlayersPanel(session) {
  const list = h('ul', { class: 'players-list' });
  const foot = h('div', { class: 'players-foot' });
  const el = h('section', { class: 'panel players', 'aria-label': 'Players' }, h('h3', null, 'ON SHIFT'), list, foot);
  let sig = '';
  const cashEls = new Map(); // player id -> the element showing his cash
  const GIVE = 100;

  function update(s) {
    const next = JSON.stringify([session.me, s.players.map((p) => [p.name, p.role, p.on, p.color])]);
    if (next !== sig) { sig = next; rebuild(s); }
    for (const p of s.players) setText(cashEls.get(p.id), money(Math.floor(p.cash)));
    const online = s.players.filter((p) => p.on).length;
    setText(foot, online === 1 ? '1 player online. Says a lot.' : `${online} players online · income is split evenly`);
  }

  function rebuild(s) {
    const hadFocus = document.activeElement && list.contains(document.activeElement);
    cashEls.clear();
    list.replaceChildren(...s.players.map((p) => {
      const mine = p.id === session.me;
      const cashEl = h('b', { class: 'pcash' });
      cashEls.set(p.id, cashEl);
      // Money is personal, so there has to be a way to hand it over.
      const give = mine || !p.on ? null : h('button', {
        type: 'button', class: 'give-btn', title: `Give ${p.name} $${GIVE} of your own money (hold Shift for $${GIVE * 10}).`,
        onclick: (e) => {
          const have = Math.floor(session.state.players[session.me]?.cash || 0);
          const n = Math.min(have, e.shiftKey ? GIVE * 10 : GIVE);
          if (n > 0) session.send({ c: 'give', to: p.id, n });
        },
      }, `Give $${GIVE}`);
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
        h('span', { class: 'pname' }, p.name, mine ? h('em', null, ' (you)') : null, cashEl),
        role,
        give,
        p.on ? null : h('span', { class: 'gone' }, 'clocked out'));
    }));
    if (hadFocus) list.querySelector('.role-btn')?.focus();
  }

  return { el, update };
}
