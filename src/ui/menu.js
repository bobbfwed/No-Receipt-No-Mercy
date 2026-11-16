// The front door: name, play solo, host, join, and the same-computer test options.
import { MAP_DESIGNS, MAP_SIZES } from '../sim/index.js';
import { h, loadName, saveName } from './dom.js';
import { howToPlay } from './overlays.js';

/**
 * @param {HTMLElement} mount
 * @param {Object} actions  each returns a promise; a rejection's message is shown to the player
 * @param {(name, map) => Promise} actions.solo  map is { design, size }
 * @param {(name, fixedCode, map) => Promise} actions.host
 * @param {(name, code) => Promise} actions.join
 * @param {(name, code, map) => Promise} actions.hostLocal
 * @param {(name, code) => Promise} actions.joinLocal
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

export function showMenu(mount, actions, { error = '', name = '', code = '', map = null } = {}) {
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

  const nameIn = h('input', {
    id: 'name', type: 'text', maxlength: '14', autocomplete: 'nickname', spellcheck: 'false',
    placeholder: 'e.g. Dave', value: name || loadName(),
  });
  const codeIn = h('input', {
    id: 'code', type: 'text', maxlength: '5', autocomplete: 'off', spellcheck: 'false',
    placeholder: 'ABCDE', 'aria-label': 'Room code', class: 'code-in', value: code,
  });
  const localIn = h('input', {
    id: 'local-code', type: 'text', maxlength: '12', autocomplete: 'off', spellcheck: 'false',
    value: 'TEST', 'aria-label': 'Test room code', class: 'code-in',
  });
  for (const el of [codeIn, localIn]) {
    el.addEventListener('input', () => { el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  }
  const status = h('p', { class: 'menu-status', role: 'status', 'aria-live': 'polite' });

  const btnTrain = h('button', { type: 'button', class: 'btn-big btn-train' },
    'Training shift', h('small', null, 'Start here: learn every building, hands on. About 10 minutes.'));
  const btnSolo = h('button', { type: 'button', class: 'btn-big btn-yellow' }, 'Play solo');
  const btnHost = h('button', { type: 'button', class: 'btn-big btn-orange' }, 'Host a game');
  const btnJoin = h('button', { type: 'submit', class: 'btn-big btn-red' }, 'Join a game');
  const btnLHost = h('button', { type: 'button', class: 'btn-small' }, 'Host in this tab');
  const btnLJoin = h('button', { type: 'button', class: 'btn-small' }, 'Join from this tab');
  const all = [btnTrain, btnSolo, btnHost, btnJoin, btnLHost, btnLJoin, nameIn, codeIn, localIn, designIn, sizeIn];

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
  btnSolo.addEventListener('click', () => run(() => actions.solo(playerName(), chosenMap()), 'Clocking in...'));
  btnHost.addEventListener('click', () => run(() => actions.host(playerName(), null, chosenMap()),
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
  const localCode = () => localIn.value.trim() || 'TEST';
  btnLHost.addEventListener('click', () => run(() => actions.hostLocal(playerName(), localCode(), chosenMap()), 'Opening a test room...'));
  btnLJoin.addEventListener('click', () => run(() => actions.joinLocal(playerName(), localCode()), 'Looking for the other tab...'));

  const card = h('div', { class: 'menu-card' },
    h('div', { class: 'menu-main' },
      h('div', { class: 'menu-sign' }, 'RETURNS DEPARTMENT'),
      h('h1', { class: 'menu-title' }, 'NO RECEIPT,', h('br'), 'NO MERCY'),
      h('p', { class: 'menu-tagline' }, 'The customer is always a prick.'),
      h('p', { class: 'menu-pitch' }, 'Build a factory, wall in the returns desk, and stop a horde of refund-hungry shoppers before they bankrupt the store. Co-op, for 1 to 6 disappointments.'),
      h('label', { class: 'field', for: 'name' }, h('span', null, 'Your name (for the disciplinary file)'), nameIn),
      h('fieldset', { class: 'map-pick' },
        h('legend', null, 'The store (for Play solo and Host a game)'),
        h('label', { for: 'map-design' }, h('span', null, 'Design'), designIn),
        h('label', { for: 'map-size' }, h('span', null, 'Size'), sizeIn),
        mapNote),
      h('div', { class: 'menu-actions' },
        btnTrain,
        btnSolo,
        btnHost,
        h('div', { class: 'join' }, h('label', { for: 'code', class: 'join-label' }, 'Got a room code?'), joinForm)),
      status,
      h('details', { class: 'local-test' },
        h('summary', null, 'Test on this computer'),
        h('p', null, 'Open this page in two tabs of the same browser. Host in one, join from the other. No internet needed. Playing with yourself, basically, which you are used to.'),
        h('div', { class: 'local-row' }, localIn, btnLHost, btnLJoin))),
    h('aside', { class: 'menu-help' }, h('h2', null, 'HOW TO PLAY'), howToPlay()));

  mount.replaceChildren(h('div', { class: 'menu' }, h('div', { class: 'hazard top', 'aria-hidden': 'true' }), card,
    h('div', { class: 'hazard bottom', 'aria-hidden': 'true' })));
  if (error) setStatus(error, 'error');
  else if (code) setStatus(`You have been invited to room ${code}. Enter a name and press Join a game.`, 'busy');
  (!nameIn.value ? nameIn : code ? btnJoin : btnSolo).focus();
}
