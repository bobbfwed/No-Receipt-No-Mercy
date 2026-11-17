// The front door: name, play solo, host, join, and the same-computer test options.
import { MAP_DESIGNS, MAP_SIZES } from '../sim/index.js';
import { VERSION, RELEASE, versionText } from '../version.js';
import { h, loadName, saveName } from './dom.js';
import { createSettings } from './settings.js';
import { whenSaved } from './save.js';
import { openHandbook } from './handbook.js';
import { howToPlay } from './overlays.js';

/**
 * @param {HTMLElement} mount
 * @param {Object} actions  each returns a promise; a rejection's message is shown to the player
 * @param {(name, map) => Promise} actions.solo  map is { design, size }
 * @param {(name, fixedCode, map) => Promise} actions.host
 * @param {(name, code) => Promise} actions.join
 * @param {Object} [o]
 * @param {string} [o.error]  an error to show straight away (from a URL option that failed)
 * @param {string} [o.name]
 */
const MAP_KEY = 'returns-dept.map';
/** The store picked last time, if the browser remembers it. */
function loadMap() {
  try {
    const m = JSON.parse(localStorage.getItem(MAP_KEY) || 'null');
    if (m && MAP_DESIGNS[m.design] && MAP_SIZES[m.size]) return m;
  } catch { /* no storage: use the default */ }
  return null;
}
function saveMap(m) {
  try { localStorage.setItem(MAP_KEY, JSON.stringify(m)); } catch { /* not remembered, no harm */ }
}

export function showMenu(mount, actions, { error = '', name = '', code = '', map = null, ...opts } = {}) {
  document.body.classList.remove('in-game');

  // ---- The store: a design and a size --------------------------------------------------------
  const picked = map || loadMap() || { design: 'warehouse', size: 's' };
  const designIn = h('select', { id: 'map-design' }, Object.entries(MAP_DESIGNS).map(([k, d]) => h('option', { value: k }, d.name)));
  const sizeIn = h('select', { id: 'map-size' }, Object.entries(MAP_SIZES).map(([k, z]) => h('option', { value: k },
    `${z.name} (${z.w}x${z.h}): ${z.players ? `${z.players} player${z.players > 1 ? 's' : ''}` : 'original'}`)));
  designIn.value = picked.design;
  sizeIn.value = picked.size;
  const mapNote = h('p', { class: 'map-note' });
  const chosenMap = () => ({ design: designIn.value, size: sizeIn.value });
  function describeMap() {
    const m = chosenMap(), z = MAP_SIZES[m.size];
    mapNote.textContent = `${MAP_DESIGNS[m.design].desc} ${z.players
      ? `This size suits ${z.players} player${z.players > 1 ? 's' : ''}; each player gets his own shopper entrance.`
      : 'This is the original small store: tight even for one.'}`;
    saveMap(m);
  }
  designIn.addEventListener('change', describeMap);
  sizeIn.addEventListener('change', describeMap);
  describeMap();

  // ---- The game's settings: length, difficulty, starting cash ----------------------------------
  const SET_KEY = 'returns-dept.settings';
  let savedSet = null;
  try { savedSet = JSON.parse(localStorage.getItem(SET_KEY) || 'null'); } catch { /* use the defaults */ }
  const settings = createSettings({
    idPrefix: 'menu', value: { ...(savedSet || {}), ...(opts.settings || {}) },
    onChange: (v) => { try { localStorage.setItem(SET_KEY, JSON.stringify(v)); } catch { /* not remembered */ } },
  });

  const nameIn = h('input', {
    id: 'name', type: 'text', maxlength: '14', autocomplete: 'nickname', spellcheck: 'false',
    placeholder: 'e.g. Dave', value: name || loadName(),
  });
  const codeIn = h('input', {
    id: 'code', type: 'text', maxlength: '5', autocomplete: 'off', spellcheck: 'false',
    placeholder: 'ABCDE', 'aria-label': 'Room code', class: 'code-in', value: code,
  });
  codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  const status = h('p', { class: 'menu-status', role: 'status', 'aria-live': 'polite' });

  const btnTrain = h('button', { type: 'button', class: 'btn-big btn-train' },
    'Training shift', h('small', null, 'Start here: every building, then every awkward customer, hands on. About 20 minutes, or 10 for the first half.'));
  const btnSolo = h('button', { type: 'button', class: 'btn-big btn-yellow' }, 'Play solo');
  const btnHost = h('button', { type: 'button', class: 'btn-big btn-orange' }, 'Host a game');
  const btnJoin = h('button', { type: 'submit', class: 'btn-big btn-red' }, 'Join a game');
  // A game saved in this browser can be carried on.
  const save = opts.save || null;
  const btnResume = save ? h('button', { type: 'button', class: 'btn-big btn-resume' },
    'Resume saved game',
    h('small', null, `Sales event ${save.wave} of ${save.waves} · ${save.store} · ${save.players.join(', ')} · saved ${whenSaved(save.at)}`)) : null;
  const btnForget = save ? h('button', { type: 'button', class: 'btn-forget', title: 'Throw the saved game away' }, 'Delete this save') : null;
  const resumeBox = save ? h('div', { class: 'resume-box' }, btnResume, btnForget,
    save.players.length > 1 ? h('p', { class: 'resume-note' }, 'You will be the host. A new room code appears at the top: send it to the others, and each gets his place and money back by joining under the same name.') : null) : null;
  const all = [btnResume, btnForget, btnTrain, btnSolo, btnHost, btnJoin, nameIn, codeIn, designIn, sizeIn, ...settings.inputs].filter(Boolean);

  function playerName() {
    const n = nameIn.value.trim().slice(0, 14);
    saveName(n);
    return n || 'New Guy';
  }

  function setStatus(text, kind = '') {
    status.textContent = text;
    status.className = `menu-status ${kind}`;
  }

  async function run(fn, busyText) {
    all.forEach((el) => { el.disabled = true; });
    setStatus(busyText, 'busy');
    try {
      await fn();
    } catch (err) {
      all.forEach((el) => { el.disabled = false; });
      setStatus(err && err.message ? err.message : String(err), 'error');
    }
  }

  btnTrain.addEventListener('click', () => run(() => actions.tutorial(playerName()), 'Starting your training...'));
  if (save) {
    btnResume.addEventListener('click', () => run(() => actions.resume(), 'Reopening the store...'));
    btnForget.addEventListener('click', () => { actions.forget(); resumeBox.remove(); setStatus('Saved game deleted.', 'busy'); });
  }
  btnSolo.addEventListener('click', () => run(() => actions.solo(playerName(), chosenMap(), true, settings.get()), 'Clocking in...'));
  btnHost.addEventListener('click', () => run(() => actions.host(playerName(), null, chosenMap(), true, settings.get()),
    'Opening a room on the internet. Please hold, like a real customer...'));
  const joinForm = h('form', { class: 'join-row' }, codeIn, btnJoin);
  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = codeIn.value.trim();
    if (code.length < 5) {
      setStatus('A room code is five letters. Ask the host. Slowly.', 'error');
      codeIn.focus();
      return;
    }
    run(() => actions.join(playerName(), code), `Knocking on room ${code}. Connecting...`);
  });
  // The handbook is reading, not a way into a game, so it sits last and looks quieter than the
  // buttons above it. (It used to head the HOW TO PLAY column, where it read as a title.)
  const btnBook = h('button', { type: 'button', class: 'btn-handbook', onclick: () => openHandbook(null) },
    '📖 Employee Handbook', h('small', null, 'Every shopper, machine and piece of security, with its numbers'));

  const card = h('div', { class: 'menu-card' },
    h('div', { class: 'menu-main' },
      // The version: big, then the release number small, so it is easy to see when the site has updated.
      h('div', { class: 'menu-version', title: `Version ${versionText()}. The small number goes up with every update.`, 'aria-label': `Version ${versionText()}` },
        h('small', null, 'VERSION'), h('b', null, VERSION), h('span', null, `.${String(RELEASE).padStart(2, '0')}`)),
      h('div', { class: 'menu-sign' }, 'RETURNS DEPARTMENT'),
      h('h1', { class: 'menu-title' }, 'NO RECEIPT,', h('br'), 'NO MERCY'),
      h('p', { class: 'menu-tagline' }, 'The customer is always a prick.'),
      h('p', { class: 'menu-pitch' }, 'Build a factory, wall in the returns desk, and stop a horde of refund-hungry shoppers before they bankrupt the store. Co-op, for 1 to 7 disappointments.'),
      h('label', { class: 'field', for: 'name' }, h('span', null, 'Your name (for the disciplinary file)'), nameIn),
      h('fieldset', { class: 'map-pick' },
        h('legend', null, 'The store (you can look at them all and change it before the game starts)'),
        h('label', { for: 'map-design' }, h('span', null, 'Design'), designIn),
        h('label', { for: 'map-size' }, h('span', null, 'Size'), sizeIn),
        mapNote),
      h('fieldset', { class: 'map-pick set-box' },
        h('legend', null, 'The game (can also be changed before it starts)'),
        settings.el),
      resumeBox,
      h('div', { class: 'menu-actions' },
        btnTrain,
        btnSolo,
        btnHost,
        h('div', { class: 'join' }, h('label', { for: 'code', class: 'join-label' }, 'Got a room code?'), joinForm),
        btnBook),
      status),
    h('aside', { class: 'menu-help' }, h('h2', null, 'HOW TO PLAY'), howToPlay()));

  mount.replaceChildren(h('div', { class: 'menu' }, h('div', { class: 'hazard top', 'aria-hidden': 'true' }), card,
    h('div', { class: 'hazard bottom', 'aria-hidden': 'true' })));
  if (error) setStatus(error, 'error');
  else if (code) setStatus(`You have been invited to room ${code}. Enter a name and press Join a game.`, 'busy');
  (!nameIn.value ? nameIn : code ? btnJoin : btnSolo).focus();
}
