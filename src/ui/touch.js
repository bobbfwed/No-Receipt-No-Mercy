// Touch screens: what a phone or tablet needs in place of the keyboard, the right mouse button and
// hover. The finger gestures on the floor themselves are in input.js; this file has the buttons.
//   - a small pad on the floor: show the whole map, go to my entrance
//   - two buttons at the end of the build bar: rotate, put the tool down
//   - the building sheet, which opens when a building is tapped or clicked with nothing held (or
//     with the Upgrade tool): one button for each kind of upgrade it has, rotate, remove
//   - while a finger is down placing something: a big Rotate button (for a building that turns)
//     and the hint that a second finger cancels, halfway up the side of the floor away from the
//     finger, where the other hand's thumb reaches and the placing finger is not
// The pad, the bar buttons and the placing aid are only shown on a touch screen (CSS:
// `(pointer: coarse)`); the sheet is for everyone.
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

/**
 * A button that acts the moment a finger lands on it. A tap made by a second finger while the
 * first is down on the floor may never become a click (the browser can take two fingers for a
 * gesture of its own), and the Rotate button is pressed exactly then. The click that follows a
 * finger press is swallowed; a mouse or the keyboard still clicks it as usual.
 */
function pressNow(el, fn) {
  let pressed = 0;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || el.disabled) return;
    e.preventDefault();
    pressed = performance.now();
    fn();
  });
  el.addEventListener('click', () => {
    if (pressed && performance.now() - pressed < 1500) { pressed = 0; return; }
    fn();
  });
}

const ARROWS = ['→', '↓', '←', '↑'];
/** The words beside the Rotate button while a finger is placing something. */
export const CANCEL_HINT = 'Tap the floor with another finger to cancel';

/**
 * @param {Object} o
 * @param {Object} o.input    the input controller
 * @param {Object} o.session
 * @param {Object} o.renderer
 * @param {(name: string) => void} [o.playSound]
 * @returns {{ pad: HTMLElement, bar: HTMLElement, sheet: HTMLElement, aid: HTMLElement, update(s): void, readonly sheetOpen: boolean }}
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
  const rotate = btn('tc-rotate', 'Rotate', '⟳', null, null);
  pressNow(rotate, () => input.rotate());
  rotate.append(rotArrow);
  const drop = btn('tc-drop', 'Put the tool down', '✋', 'DROP', () => { playSound('click'); input.setTool(null); input.select(null); });
  const bar = h('div', { class: 'bb-touch touch-only', role: 'group', 'aria-label': 'Held tool' }, rotate, drop);

  // ---- On the floor while a finger is placing: Rotate, and how to cancel ----
  // A button, not the floor: tapping it with another finger turns the building and does not
  // cancel the placement. The hint lets touches through (pointer-events: none in style.css), so a
  // second finger landing on it still lands on the floor and cancels.
  const turnArrow = h('span', { class: 'tc-dir' });
  const turn = btn('tc-turn', 'Rotate', '⟳', 'ROTATE', null);
  pressNow(turn, () => input.rotate());
  turn.append(turnArrow);
  const hint = h('p', { class: 'pa-hint' }, CANCEL_HINT);
  const aid = h('div', { class: 'place-aid touch-only hidden', role: 'group', 'aria-label': 'Placing' }, turn, hint);
  let aidUp = false, aidLeft = false, aidRot = null, aidDir = -1;
  function updateAid() {
    const p = input.placing;
    const show = !!p && isCoarse();
    if (show !== aidUp) { aidUp = show; setClass(aid, 'hidden', !show); }
    if (!show) return;
    // Halfway up the side of the floor away from the finger. It changes sides only once the
    // finger is well into its half, so it does not flick back and forth near the middle.
    const box = aid.parentElement ? aid.parentElement.getBoundingClientRect() : { left: 0, width: innerWidth };
    const f = (p.x - box.left) / Math.max(1, box.width);
    const left = f > 0.6 ? true : f < 0.4 ? false : aidLeft;
    if (left !== aidLeft || !aid.dataset.side) { aidLeft = left; aid.dataset.side = left ? 'left' : 'right'; }
    const canTurn = !!BUILD[input.placingKind]?.rot;
    if (canTurn !== aidRot) { aidRot = canTurn; setClass(turn, 'hidden', !canTurn); }
    if (canTurn && input.dir !== aidDir) { aidDir = input.dir; setText(turnArrow, ARROWS[input.dir]); }
  }

  // ---- The sheet for a tapped building ----
  const sheetHead = h('div', { class: 'ts-head' });
  const sheetBtns = h('div', { class: 'ts-btns' });
  const sheetNote = h('p', { class: 'ts-note' });
  const sheet = h('section', { class: 'touch-sheet hidden', 'aria-label': 'Building' }, sheetHead, sheetNote, sheetBtns);
  let sheetSig = '';
  let measuredSig = '';
  let sheetOpen = false;

  // The upgrade button the mouse is over, or that has keyboard focus (0.3.02): the renderer shows
  // what a Range upgrade would reach while it is Range (view.track; see src/render/reach.js).
  // Listened for on the container, because the sheet replaces its buttons whenever what it shows
  // changes (right after an upgrade is bought, say) and a replaced button never says the mouse has
  // left it: the last answer stands until an event says otherwise, so with the mouse still on Range
  // after buying a level, the floor shows the level after that. A finger has no hover: pressing
  // Range just buys it, and the reach on the floor grows.
  // (A button he cannot afford is disabled, and browsers may not report the mouse over a disabled
  // button, so the floor may not show its next reach; a maxed Range has none to show anyway.)
  let pointTrack;
  const trackOf = (el) => (el && el.closest ? el.closest('[data-track]')?.dataset.track : undefined);
  sheetBtns.addEventListener('pointerover', (e) => { if (e.pointerType !== 'touch') pointTrack = trackOf(e.target); });
  sheetBtns.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'touch') return;
    if (!sheetBtns.contains(e.relatedTarget)) pointTrack = undefined;
  });
  sheetBtns.addEventListener('focusin', (e) => { pointTrack = trackOf(e.target); });
  sheetBtns.addEventListener('focusout', (e) => {
    // (A button taken away as the sheet redraws loses its focus too; that is not the player moving on.)
    if (!e.target.isConnected) return;
    if (!sheetBtns.contains(e.relatedTarget)) pointTrack = undefined;
  });

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
      'data-track': tr.track,
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
      if (!show) { sheetSig = ''; pointTrack = undefined; }
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
    updateAid();
  }

  return {
    pad, bar, sheet, aid, update,
    get sheetOpen() { return sheetOpen; },
    /** The building whose sheet is open ({ x, y }, its anchor tile), or null: for view.selected. */
    get selected() { return sheetOpen ? input.selected : null; },
    /** The upgrade track pointed at in the sheet ('rng', ...), or undefined: for view.track. */
    get track() { return sheetOpen ? pointTrack : undefined; },
  };
}
