// The game's cards on screen (0.3.01): the trading card itself (in three sizes: large in the deal,
// medium in the detail panel, tiny in a slot), the strip of five slots over the top of the floor
// for the whole game, and the panel where all five can be read in full. The deal that fills the
// slots is src/ui/deal.js; what each card shows is decided in src/ui/cardart.js.
import { CARDS, cardParts } from '../sim/index.js';
import { h, setClass } from './dom.js';
import { buildingIcon } from './icons.js';
import { shopperPortrait } from './portrait.js';
import { artOf, faceOf, handOf, SYMBOLS, STAMPS } from './cardart.js';

/** Portrait sizes drawn for each card size (CSS then fits the picture to the window). */
const ART_PX = { big: 150, mid: 110, mini: 44 };
/** Each card's collector number on the bottom line, "07/48", in the order of CARDS. */
const NUMBER = Object.fromEntries(Object.keys(CARDS).map((id, i, all) => [id, `${String(i + 1).padStart(2, '0')}/${all.length}`]));

/** The picture in a card's window. */
function artEl(id, size, dress) {
  const a = artOf(id);
  const box = h('span', { class: 'cc-art', 'aria-hidden': 'true' });
  if (a.shopper) {
    box.append(shopperPortrait(a.shopper, { sup: !!a.sup, size: ART_PX[size], dress: a.shopper === 'boss' ? dress : undefined }));
    box.classList.add('is-shopper');
  } else if (a.building) {
    box.append(h('span', { class: 'cc-icon', html: buildingIcon(a.building) }));
    if (a.badge) {
      const badge = SYMBOLS[a.badge] ? `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">${SYMBOLS[a.badge]}</svg>` : buildingIcon(a.badge);
      box.append(h('span', { class: 'cc-badge', html: badge }));
    }
  } else {
    box.append(h('span', { class: 'cc-icon', html: `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">${SYMBOLS[a.symbol] || SYMBOLS.crowd}</svg>` }));
  }
  return box;
}

/**
 * One trading card.
 * @param {string} id a card id from a hand ('litter', 'hardy:karen')
 * @param {Object} [o]
 * @param {'big'|'mid'|'mini'} [o.size]
 * @param {string} [o.dress] the game's holiday, for a card with the boss on it
 * @param {number} [o.n] its place in the hand (0-4), printed as "1 of 5" on the big and medium ones
 * @param {number} [o.of] how many in the hand
 * @returns {HTMLElement}
 */
export function cardEl(id, { size = 'mid', dress, n = -1, of = 0 } = {}) {
  const f = faceOf(id);
  const side = f ? f.side : 'odd';
  // (A tiny one is a span: it sits inside a button.)
  const el = h(size === 'mini' ? 'span' : 'article', { class: `tcard tcard-${size} is-${side}`, 'data-side': side, 'data-id': String(id) });
  if (size === 'mini') {
    el.append(artEl(id, size, dress), h('span', { class: 'cc-mark', 'aria-hidden': 'true' }, f ? f.mark : '?'));
    return el;
  }
  if (!f) { el.append(h('p', { class: 'cc-rule' }, String(id))); return el; }
  const [card] = cardParts(id);
  el.append(h('div', { class: 'cc-inner' },
    h('div', { class: 'cc-top' },
      h('span', { class: 'cc-stamp' }, f.stamp),
      n >= 0 && of ? h('span', { class: 'cc-n' }, `${n + 1} of ${of}`) : null),
    h('h3', { class: 'cc-name' }, f.name),
    artEl(id, size, dress),
    h('div', { class: 'cc-text' },
      h('p', { class: 'cc-rule' }, f.rule),
      h('p', { class: 'cc-joke' }, f.joke)),
    h('div', { class: 'cc-foot' }, h('span', null, f.foot), h('span', { class: 'cc-no' }, NUMBER[card] || ''))));
  return el;
}

/** A card's name and rule in one line, for a tooltip or a screen reader. */
export function cardLine(id) {
  const f = faceOf(id);
  return f ? `${f.name} (${STAMPS[f.side].toLowerCase()}): ${f.rule}` : String(id);
}

/**
 * The strip of five slots over the top of the floor. It floats (position: absolute), so it never
 * resizes the floor or the top bar. Click or tap it to read the cards (onOpen). During the deal
 * (src/ui/deal.js) the slots fill one by one as each card slides up into its place.
 * @param {Object} o
 * @param {() => void} o.onOpen open the detail panel
 * @returns {{el: HTMLElement, update: (s: Object, filled?: number) => boolean, slot: (i: number) => HTMLElement|null}}
 *   update shows the strip if the game has cards (not in the lobby) and says whether it shows;
 *   `filled` is how many slots show their card (all of them when left out)
 */
export function createHandStrip({ onOpen }) {
  const tip = h('div', { class: 'hs-tip hidden', role: 'tooltip' });
  const slots = h('div', { class: 'hs-slots' });
  const label = h('span', { class: 'hs-label', 'aria-hidden': 'true' }, h('b', null, 'HAND'), h('small', null, 'read'));
  const el = h('button', {
    type: 'button', class: 'hand-strip hidden', 'aria-label': "This game's cards: open them to read",
    onclick: () => { if (!el.classList.contains('is-dealing')) { hideTip(); onOpen(); } },
  }, label, slots);
  // (The tooltip is not inside the button, so its text is not read out as part of the label.)
  const wrap = h('div', { class: 'hand-wrap hidden' }, el, tip);
  let sig = '';
  let hand = [];

  function showTip(i, e) {
    if (e.pointerType === 'touch' || el.classList.contains('is-dealing') || !hand[i]) return;
    const f = faceOf(hand[i]);
    if (!f) return;
    tip.replaceChildren(h('b', { class: `hs-tip-name is-${f.side}` }, f.name, h('small', null, ` ${f.stamp}`)), h('p', null, f.rule));
    tip.classList.remove('hidden');
    const r = slots.children[i].getBoundingClientRect(), w = wrap.getBoundingClientRect();
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.max(-w.left + 8, Math.min(innerWidth - w.left - tw - 8, r.left - w.left + r.width / 2 - tw / 2))}px`;
  }
  function hideTip() { tip.classList.add('hidden'); }

  function update(s, filled = Infinity) {
    hand = handOf(s);
    const on = hand.length > 0 && s.phase !== 'lobby';
    setClass(wrap, 'hidden', !on);
    setClass(el, 'hidden', !on);
    if (!on) { sig = ''; return false; }
    const dealing = s.phase === 'cards';
    setClass(el, 'is-dealing', dealing);
    el.tabIndex = dealing ? -1 : 0;
    const n = Math.min(hand.length, filled);
    const now = `${hand.join(',')}|${n}|${s.holiday || ''}`;
    if (now === sig) return true;
    sig = now;
    slots.replaceChildren(...hand.map((id, i) => {
      const slot = h('span', { class: `hs-slot${i < n ? ' is-full' : ''}`, 'data-i': String(i) },
        i < n ? cardEl(id, { size: 'mini', dress: s.holiday }) : null);
      slot.addEventListener('pointerenter', (e) => showTip(i, e));
      slot.addEventListener('pointerleave', hideTip);
      return slot;
    }));
    el.setAttribute('aria-label', dealing ? 'The cards being dealt' : `This game's cards: ${hand.map((id) => faceOf(id)?.name || id).join(', ')}. Open them to read.`);
    return true;
  }

  /** Moves the strip along the top of the floor (px from its left edge), or back to the middle (null). */
  function place(left) {
    const v = left === null ? '' : `${Math.round(left)}px`;
    if (wrap.style.left === v) return;
    wrap.style.left = v;
    wrap.style.transform = left === null ? '' : 'none';
  }

  return { el: wrap, update, place, slot: (i) => slots.children[i] || null };
}

/**
 * The panel with all the game's cards at a readable size and their full text. Closed by its
 * button, Escape (game.js) or a click outside the panel.
 * @param {Object} state
 * @param {() => void} onClose
 * @returns {HTMLElement}
 */
export function handPanel(state, onClose) {
  const hand = handOf(state);
  const close = h('button', { type: 'button', class: 'btn-big btn-yellow hp-close', onclick: onClose }, 'Got it');
  const el = h('div', { class: 'overlay hand-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': "This game's cards" },
    h('div', { class: 'ov-card hp-card' },
      h('div', { class: 'help-head hp-head' },
        h('h2', null, "THIS GAME'S HAND", h('small', null, 'Two to screw you, two to help, one nobody asked for. They last all game.')),
        close),
      h('div', { class: 'hp-grid' }, hand.map((id, i) => cardEl(id, { size: 'mid', dress: state.holiday, n: i, of: hand.length })))));
  el.addEventListener('click', (e) => { if (e.target === el) onClose(); });
  setTimeout(() => close.focus(), 50);
  return el;
}

/**
 * The hand as a row of tiny cards with a caption, for the end-of-game screen. Click to read them.
 * null in a game without cards.
 */
export function handRow(state, onOpen) {
  const hand = handOf(state);
  if (!hand.length) return null;
  return h('button', { type: 'button', class: 'hand-row', onclick: onOpen, title: 'Read the cards this game was dealt' },
    h('small', null, 'THE HAND YOU WERE DEALT'),
    h('span', { class: 'hs-slots' }, hand.map((id) => h('span', { class: 'hs-slot is-full' }, cardEl(id, { size: 'mini', dress: state.holiday })))));
}
