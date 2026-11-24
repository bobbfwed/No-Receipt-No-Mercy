// The three game settings a host chooses: how many sales events, how hard, and how much cash each
// player starts with. Used by the menu (before hosting) and the lobby (before starting).
import { SETTINGS, MAP_SIZES, mapSize } from '../sim/index.js';
import { h } from './dom.js';

/** What "Endless" means, under the length picker when it is chosen. */
export const ENDLESS_NOTE = 'Endless: there is no last sales event. The store stays open until the refunds close it, and your best run is remembered.';

/**
 * @param {Object} o
 * @param {string} o.idPrefix  so the menu's and the lobby's controls have different ids
 * @param {{waves: number, startCash: number, difficulty: string}} o.value what to show first
 * @param {(settings) => void} [o.onChange] called with all three whenever one is changed
 * @param {boolean} [o.disabled] show them but do not let this player change them
 * @returns {{el: HTMLElement, inputs: HTMLElement[], get: () => Object, set: (v) => void}}
 */
export function createSettings({ idPrefix, value, onChange = () => {}, disabled = false }) {
  const pick = (id, options) => h('select', { id: `${idPrefix}-${id}`, disabled, onchange: () => { describe(); onChange(get()); } },
    options.map(([v, text]) => h('option', { value: String(v) }, text)));
  // 0 sales events means endless (see isEndless in src/sim/state.js).
  const wavesIn = pick('waves', SETTINGS.waves.map((n) => [n, n > 0 ? `${n} events` : 'Endless']));
  const diffIn = pick('difficulty', Object.entries(SETTINGS.difficulty).map(([k, d]) => [k, d.name]));
  const cashIn = pick('cash', SETTINGS.startCash.map((n) => [n, `$${n.toLocaleString('en-US')} each`]));
  const note = h('p', { class: 'set-note' });
  const lenNote = h('p', { class: 'set-note set-endless hidden' }, ENDLESS_NOTE);
  const get = () => ({ waves: Number(wavesIn.value), difficulty: diffIn.value, startCash: Number(cashIn.value) });
  function describe() {
    const d = SETTINGS.difficulty[diffIn.value];
    const pct = (m) => `${m > 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;
    note.textContent = d.hp === 1 && d.pay === 1 ? `${d.name}: ${d.note}`
      : `${d.name}: shopper patience ${pct(d.hp)}, income ${pct(d.pay)}. ${d.note}`;
    lenNote.classList.toggle('hidden', Number(wavesIn.value) !== 0);
  }
  function set(v) {
    wavesIn.value = String(v.waves);
    diffIn.value = v.difficulty;
    cashIn.value = String(v.startCash);
    describe();
  }
  set({ ...SETTINGS.defaults, ...value });
  const field = (label, input) => h('label', { for: input.id }, h('span', null, label), input);
  const el = h('div', { class: 'set-pick' }, field('Length', wavesIn), field('Difficulty', diffIn), field('Starting cash', cashIn), lenNote, note);
  return { el, inputs: [wavesIn, diffIn, cashIn], get, set };
}

/**
 * Writes into a size picker (its options' values are keys of MAP_SIZES) each size's name, its
 * width and height in tiles for this design, and who it suits. The tiles depend on the design:
 * the Strip Mall's plot is bigger than the size's usual rectangle (mapSize).
 * @param {HTMLSelectElement} select
 * @param {string} design a key of MAP_DESIGNS
 */
export function labelSizes(select, design) {
  for (const o of select.options) {
    const z = MAP_SIZES[o.value];
    if (!z) continue;
    const { w, h: tall } = mapSize(design, o.value);
    const text = `${z.name} (${w}x${tall}): ${z.players ? `${z.players} player${z.players > 1 ? 's' : ''}` : 'original'}`;
    if (o.textContent !== text) o.textContent = text;
  }
}
