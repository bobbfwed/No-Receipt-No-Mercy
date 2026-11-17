// Touch screens: what a phone or tablet needs in place of the keyboard, the right mouse button and
// hover. The finger gestures on the floor themselves are in input.js; this file has the buttons.
//   - a small pad on the floor: show the whole map, go to my entrance
//   - two buttons at the end of the build bar: rotate, put the tool down
//   - the building sheet, which opens when a building is tapped or clicked with nothing held (or
//     with the Upgrade tool): one button for each kind of upgrade it has, rotate, remove
// The pad and the bar buttons are only shown on a touch screen (CSS: `(pointer: coarse)`); the
// sheet is for everyone.
import { BUILD, TUNE, levelOf, spentOn, statsOf } from '../sim/index.js';
import { tracksInfo } from './upgradetext.js';
import { h, setText, setClass, money } from './dom.js';
import { buildingIcon } from './icons.js';

const coarse = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : { matches: false };
/** True on a device whose main pointer is a finger. */
export const isCoarse = () => coarse.matches;

// Whether the last thing the player did was touch the screen (rather than use a mouse or keys).
// Buttons get focus when tapped on some phones, and focus would otherwise pop up hover tooltips.
let lastTouch = false;
if (typeof addEventListener === 'function') {
  addEventListener('pointerdown', (e) => { lastTouch = e.pointerType === 'touch'; }, true);
  addEventListener('keydown', () => { lastTouch = false; }, true);
}
export const touchedLast = () => lastTouch;

const LONG_PRESS_MS = 450;

/**
 * A long press with a finger: `start` runs after a moment held still, `end` when the finger lifts.
 * The tap that a long press ends with does not count as a click.
 */
export function longPress(el, start, end = () => {}) {
  let timer = null, fired = false, x = 0, y = 0;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    fired = false;
    x = e.clientX; y = e.clientY;
    clear();
    timer = setTimeout(() => { timer = null; fired = true; start(); }, LONG_PRESS_MS);
  });
  el.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - x, e.clientY - y) > 12) clear(); });
  const up = () => { clear(); if (fired) end(); };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', () => { clear(); if (fired) { fired = false; end(); } });
  el.addEventListener('click', (e) => { if (fired) { fired = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  // A long press would otherwise open the browser's own menu.
  el.addEventListener('contextmenu', (e) => { if (lastTouch) e.preventDefault(); });
}

const ARROWS = ['→', '↓', '←', '↑'];

/**
 * @param {Object} o
 * @param {Object} o.input    the input controller
 * @param {Object} o.session
 * @param {Object} o.renderer
 * @param {(name: string) => void} [o.playSound]
 * @returns {{ pad: HTMLElement, bar: HTMLElement, sheet: HTMLElement, update(s): void, readonly sheetOpen: boolean }}
 */
export function createTouchControls({ input, session, renderer, playSound = () => {} }) {
  const btn = (cls, label, icon, text, onclick) => h('button', {
    type: 'button', class: `tc-btn ${cls}`, 'aria-label': label, title: label, onclick,
  }, h('span', { class: 'tc-icon', 'aria-hidden': 'true' }, icon), text ? h('span', { class: 'tc-text' }, text) : null);

  // ---- On the floor: the camera ----
  const pad = h('div', { class: 'touch-pad touch-only', role: 'group', 'aria-label': 'View' },
    btn('tc-fit', 'Show the whole map', '⤢', 'MAP', () => { playSound('click'); renderer.fit(); }),
    btn('tc-home', 'Go to my entrance', '⌂', 'HOME', () => { playSound('click'); input.goHome(); }));

  // ---- In the build bar: rotate and put down ----
  const rotArrow = h('span', { class: 'tc-dir' });
  const rotate = btn('tc-rotate', 'Rotate', '⟳', null, () => { input.rotate(); });
  rotate.append(rotArrow);
  const drop = btn('tc-drop', 'Put the tool down', '✋', 'DROP', () => { playSound('click'); input.setTool(null); input.select(null); });
  const bar = h('div', { class: 'bb-touch touch-only', role: 'group', 'aria-label': 'Held tool' }, rotate, drop);

  // ---- The sheet for a tapped building ----
  const sheetHead = h('div', { class: 'ts-head' });
  const sheetBtns = h('div', { class: 'ts-btns' });
  const sheetNote = h('p', { class: 'ts-note' });
  const sheet = h('section', { class: 'touch-sheet hidden', 'aria-label': 'Building' }, sheetHead, sheetNote, sheetBtns);
  let sheetSig = '';
  let measuredSig = '';
  let sheetOpen = false;

  function act(cmd, sound) {
    const r = session.send(cmd);
    if (!r || r.ok) playSound(sound);
  }

  function renderSheet(s, t, b) {
    const def = BUILD[b.k];
    const mine = s.players[session.me];
    const cash = Math.floor(mine ? mine.cash : 0);
    const back = Math.floor(spentOn(b) * TUNE.sellBack);
    const owner = s.players[b.o];
    const tracks = tracksInfo(b);
    const hits = statsOf(b).hits, hit = b.hit | 0;
    const sig = JSON.stringify([t.x, t.y, b.k, b.u, b.d, hit, b.off > 0, back, tracks.map((tr) => cash >= tr.cost), owner ? owner.name : '', s.players.length]);
    if (sig === sheetSig) return;
    sheetSig = sig;
    // (replaceChildren would write a null out as the word "null")
    sheetHead.replaceChildren(...[
      h('span', { class: 'ts-icon', html: buildingIcon(b.k) }),
      h('b', null, def.name),
      levelOf(b) > 1 ? h('span', { class: 'ts-lv' }, `${levelOf(b) - 1} upgrade${levelOf(b) > 2 ? 's' : ''}`) : null,
      owner && s.players.length > 1 ? h('span', { class: 'ts-owner' }, `${owner.name}'s`) : null,
      h('button', { type: 'button', class: 'ts-x', 'aria-label': 'Close', onclick: () => input.select(null) }, '×'),
    ].filter(Boolean));
    const btns = tracks.map((tr) => h('button', {
      type: 'button', class: `ts-btn ts-up ts-${tr.track}${tr.cost && cash < tr.cost ? ' poor' : ''}`, disabled: !tr.cost || cash < tr.cost,
      title: `${tr.name}: ${tr.gain}`,
      onclick: () => act({ c: 'upgrade', x: t.x, y: t.y, t: tr.track }, 'upgrade'),
    },
    h('b', null, `${tr.name} ${tr.lv}/${tr.max}`),
    h('small', { class: 'ts-gain' }, tr.gain),
    h('small', { class: 'ts-cost' }, tr.cost ? money(tr.cost) : 'max')));
    if (def.rot) {
      btns.push(h('button', { type: 'button', class: 'ts-btn', onclick: () => act({ c: 'rotate', x: t.x, y: t.y }, 'rotate') },
        h('b', null, '⟳ Rotate'), h('small', null, `faces ${ARROWS[b.d & 3]}`)));
    }
    btns.push(h('button', { type: 'button', class: 'ts-btn ts-remove', onclick: () => { act({ c: 'remove', x: t.x, y: t.y }, 'remove'); input.select(null); } },
      h('b', null, '✕ Remove'), h('small', null, `+${money(back)} back`)));
    sheetBtns.replaceChildren(...btns);
    const notes = [];
    if (b.off > 0) notes.push('Switched off: a dog peed on it. It comes back in a few seconds.');
    if (hit > 0) notes.push(`Hit ${hit} time${hit > 1 ? 's' : ''} by gym bros this sales event; ${Math.max(0, hits - hit)} more and it is wrecked.`);
    const short = tracks.filter((tr) => tr.cost && cash < tr.cost);
    if (short.length && short.length === tracks.filter((tr) => tr.cost).length) notes.push(`You are ${money(Math.min(...short.map((tr) => tr.cost)) - cash)} short of the cheapest upgrade.`);
    setText(sheetNote, notes.join(' '));
    setClass(sheetNote, 'hidden', !notes.length);
  }

  let lastTool, lastDir, lastRot;
  function update(s) {
    // The sheet: only for a building tapped with nothing held.
    const t = input.selected;
    const b = t && (!input.tool || input.tool === 'upgrade') ? s.grid[t.y * s.w + t.x] : 0;
    const office = s.players[session.me]?.side === 'office';
    const show = !!b && !office && s.phase !== 'won' && s.phase !== 'lost' && s.phase !== 'lobby';
    if (!show && t && !b) input.select(null); // it was removed (or never was)
    if (show) renderSheet(s, t, b);
    if (show !== sheetOpen) {
      sheetOpen = show;
      setClass(sheet, 'hidden', !show);
      if (!show) sheetSig = '';
    }
    // DEB's bubble sits in the same corner: tell the page how tall the sheet is so the bubble
    // can stand on top of it instead of behind it (see ".deb" beside ".touch-sheet" in style.css).
    if (show && sheetSig !== measuredSig) {
      measuredSig = sheetSig;
      sheet.parentElement?.style.setProperty('--sheet-h', `${sheet.offsetHeight}px`);
    }
    // The bar buttons follow what is held.
    const canRot = input.canRotate();
    if (input.tool !== lastTool || input.dir !== lastDir || canRot !== lastRot) {
      lastTool = input.tool; lastDir = input.dir; lastRot = canRot;
      rotate.disabled = !canRot;
      setText(rotArrow, input.tool && BUILD[input.tool] ? ARROWS[input.dir] : '');
      drop.disabled = !input.tool;
    }
  }

  return { pad, bar, sheet, update, get sheetOpen() { return sheetOpen; } };
}
