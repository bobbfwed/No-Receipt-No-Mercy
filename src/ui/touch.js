// Touch screens: what a phone or tablet needs in place of the keyboard, the right mouse button and
// hover. The finger gestures on the floor themselves are in input.js; this file has the buttons.
//   - a small pad on the floor: show the whole map, go to my entrance
//   - two buttons at the end of the build bar: rotate, put the tool down
//   - the building sheet, which opens when a building is tapped or clicked with nothing held: the
//     numbers it works at now, (0.4) a security building's stock of supplies from The Back, rotate
//     and remove; in The Back, the same sheet for a Returns Drop: how much junk it sends and the
//     MORE JUNK button (the dropUp command)
//   - while a finger is down placing something: a big Rotate button (for a building that turns)
//     and the hint that a second finger cancels, halfway up the side of the floor away from the
//     finger, where the other hand's thumb reaches and the placing finger is not
// The pad, the bar buttons and the placing aid are only shown on a touch screen (CSS:
// `(pointer: coarse)`); the sheet is for everyone.
import { BUILD, TUNE, levelOf, spentOn, statsOf, tracksOf, carriesWire } from '../sim/index.js';
import { stockRows, dropInfo, trackName, trackNumbers, crateInfo, wireWhyText } from '../content/supplies.js';
import { h, setText, setClass, money } from './dom.js';
import { buildingIcon } from './icons.js';
import { WIRE_CYCLE, wireArrow, wireName, wirePicker } from './wiretool.js';
import { prefs } from './prefs.js';

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
export function createTouchControls({ input, session, renderer, playSound = () => {}, prefs: pf = prefs() }) {
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
  // What it works at now (its stock from The Back counted): one entry per track, and the gym bro
  // hits it survives.
  const sheetNums = h('p', { class: 'ts-nums hidden' });
  // (0.4) A security building's supplies: one row per supply it takes.
  const sheetStock = h('div', { class: 'ts-stock hidden' });
  // (0.4, stage 4b) Razor Wire's direction, for a building that can carry wire: north, east, south,
  // west and none, the current one lit, any the rules would refuse greyed with the reason. Pointing
  // at one (or a finger on it) shows on the floor where that wire would run and how the dads would
  // walk then (wirePreview). Built once and updated in place, so a pointer resting on a button
  // keeps its preview while the sheet's other numbers change.
  let wireAt = null; // the building's tile, while its sheet shows the picker
  let wireHover = null; // the direction pointed at, or null
  let pickerKey = '', picker = null;
  const wireNote = h('small', { class: 'ts-wnote' });
  const wireBtns = WIRE_CYCLE.map((d) => {
    const b = h('button', { type: 'button', class: 'ts-wd', 'aria-pressed': 'false', 'aria-label': `Wire ${wireName(d)}` }, wireArrow(d));
    // While a direction is pointed at, the rest of the sheet fades (.peek) so the floor under it,
    // where the preview is drawn, can be seen: on a phone the sheet covers most of the floor.
    const point = () => { wireHover = d; setClass(sheet, 'peek', true); noteWire(); };
    const away = () => { if (wireHover === d) { wireHover = null; setClass(sheet, 'peek', false); noteWire(); } };
    b.addEventListener('pointerenter', point);
    b.addEventListener('pointerleave', away);
    b.addEventListener('pointercancel', away);
    b.addEventListener('focus', point);
    b.addEventListener('blur', away);
    // A refused direction is still sent: DEB says why, in her own words.
    b.addEventListener('click', () => { if (wireAt) act({ c: 'wire', x: wireAt.x, y: wireAt.y, d }, 'rotate'); });
    return b;
  });
  const sheetWire = h('div', { class: 'ts-wire hidden' },
    h('b', { class: 'ts-wlabel' }, 'WIRE'), h('div', { class: 'ts-wbtns', role: 'group', 'aria-label': 'Razor Wire direction' }, wireBtns), wireNote);
  const sheet = h('section', { class: `touch-sheet hidden${pf.get('sheetMore') ? '' : ' compact'}`, 'aria-label': 'Building' }, sheetHead, sheetNums, sheetNote, sheetStock, sheetWire, sheetBtns);
  let sheetSig = '';
  let measuredSig = '';
  let sheetOpen = false;

  /** The line under the picker: why the direction pointed at is refused, or how to use it. */
  function noteWire() {
    if (!picker) return;
    const p = wireHover === null ? null : picker.find((e) => e.d === wireHover);
    const no = picker.filter((e) => e.why);
    let text;
    if (p && p.why) text = `${p.arrow} ${wireWhyText(p.why)}`;
    else if (p) text = p.d < 0 ? 'No wire: dads walk straight through' : `Wire runs ${p.name}: the floor shows it, and the dads' way round`;
    else if (no.length && no.length < 4) text = `Greyed (${no.map((e) => e.arrow).join(' ')}): ${wireWhyText(no[0].why)}`;
    else if (no.length) text = wireWhyText(no[0].why);
    else text = `The way its Razor Wire runs. ${isCoarse() ? 'Hold a finger on one' : 'Point at one'} to see it on the floor.`;
    setText(wireNote, text);
  }

  /**
   * The picker for the building on tile t, kept up to date: worked out again only when the layout,
   * the phase or the pause changes (each direction is a flood fill in the rules).
   */
  function updatePicker(s, t, b) {
    const show = !!t && !!b && carriesWire(b.k);
    if (!show) {
      if (wireAt) { wireAt = null; wireHover = null; picker = null; pickerKey = ''; setClass(sheetWire, 'hidden', true); setClass(sheet, 'peek', false); }
      return;
    }
    const key = `${t.x},${t.y},${s.gridVer},${s.phase},${s.pause ? 1 : 0},${session.me}`;
    if (key === pickerKey) return;
    pickerKey = key;
    if (!wireAt || wireAt.x !== t.x || wireAt.y !== t.y) { wireAt = { x: t.x, y: t.y }; wireHover = null; }
    setClass(sheetWire, 'hidden', false);
    picker = wirePicker(s, session.me, t.x, t.y) || [];
    picker.forEach((e, n) => {
      const btn = wireBtns[n];
      setClass(btn, 'on', e.on);
      setClass(btn, 'no', !!e.why);
      btn.setAttribute('aria-pressed', String(e.on));
      if (e.why) { btn.setAttribute('aria-disabled', 'true'); btn.title = `${e.name}: ${wireWhyText(e.why)}`; } else { btn.removeAttribute('aria-disabled'); btn.title = e.d < 0 ? 'No wire' : `Wire runs ${e.name}`; }
    });
    noteWire();
  }

  function act(cmd, sound) {
    const r = session.send(cmd);
    if (!r || r.ok) playSound(sound);
  }

  function renderSheet(s, t, b) {
    const def = BUILD[b.k];
    const back = Math.floor(spentOn(b) * TUNE.sellBack);
    const owner = s.players[b.o];
    const st = statsOf(b, s);
    const hits = st.hits, hit = b.hit | 0;
    // Each track's numbers as it works now ("Damage: hit 9.4"), durability last (crates and the old
    // factory have only that).
    const nums = [...tracksOf(b.k).filter((tr) => tr !== 'dur'), 'dur'].map((tr) =>
      [trackName(b.k, tr), trackNumbers(b.k, tr, st).map(([label, v]) => `${label} ${v}`).join(', ')]);
    const stock = stockRows(b, s);
    const lv = levelOf(b);
    // A Crate Stack's reinforcement (0.4): its level and the next one's price, for this player's cash.
    const mine = s.players[session.me];
    const crate = def.reinforce ? crateInfo(b, Math.floor(mine ? mine.cash : 0), s) : null;
    const sig = JSON.stringify([t.x, t.y, b.k, b.d, hit, b.off > 0, back, nums, owner ? owner.name : '', s.players.length,
      stock.map((r) => [r.tier, r.units, r.gives]), crate]);
    if (sig === sheetSig) return;
    sheetSig = sig;
    // (replaceChildren would write a null out as the word "null")
    sheetHead.replaceChildren(...[
      h('span', { class: 'ts-icon', html: buildingIcon(b.k) }),
      h('b', null, def.name),
      lv > 1 ? h('span', { class: 'ts-lv' }, `level ${lv}`) : null,
      crate && crate.r > 0 ? h('span', { class: 'ts-lv' }, `level ${crate.r} of ${crate.max}`) : null,
      owner && s.players.length > 1 ? h('span', { class: 'ts-owner' }, `${owner.name}'s`) : null,
      // On a phone (0.4): the stock in one line of dots, the rows themselves behind DETAILS.
      stockSummary(stock),
      detailsBtn(),
      h('button', { type: 'button', class: 'ts-x', 'aria-label': 'Close', onclick: () => input.select(null) }, '×'),
    ].filter(Boolean));
    sheetNums.replaceChildren(...nums.map(([name, v]) => h('span', null, h('b', null, `${name}: `), v)));
    setClass(sheetNums, 'hidden', false);
    const btns = [];
    if (crate) {
      // One more gym bro hit a sales event, for cash (the `reinforce` command; anyone may, and pays).
      btns.push(h('button', {
        type: 'button', class: `ts-btn ts-more${crate.why ? ' poor' : ''}`, disabled: !!crate.why,
        title: `Takes ${crate.hits} gym bro hit${crate.hits === 1 ? '' : 's'} a sales event now; one more for each level.`,
        onclick: () => act({ c: 'reinforce', x: t.x, y: t.y }, 'place'),
      }, h('b', null, 'REINFORCE'), h('small', { class: 'ts-cost' }, crate.why || `${money(crate.cost)} · level ${crate.r + 1}`)));
    }
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
    setText(sheetNote, notes.join(' '));
    setClass(sheetNote, 'hidden', !notes.length);
    renderStock(stock);
  }

  /**
   * A phone's sheet is compact (0.4, the owner: with its stock rows and wire picker it covered most
   * of the floor): the heading, the stock as a row of dots with their units, the wire picker and
   * the buttons. DETAILS opens the numbers and the stock rows, and the choice is remembered. On a
   * big screen the style sheet always shows everything and hides the button.
   */
  function detailsBtn() {
    const more = !!pf.get('sheetMore');
    return h('button', {
      type: 'button', class: 'ts-details', 'aria-expanded': String(more), title: 'The numbers it works at, and its stock',
      onclick: () => { pf.set('sheetMore', !pf.get('sheetMore')); setCompact(); },
    }, more ? 'LESS ▴' : 'DETAILS ▾');
  }
  function setCompact() {
    const more = !!pf.get('sheetMore');
    setClass(sheet, 'compact', !more);
    const b = sheetHead.querySelector('.ts-details');
    if (b) { b.setAttribute('aria-expanded', String(more)); setText(b, more ? 'LESS ▴' : 'DETAILS ▾'); }
    measuredSig = ''; // its height changes
  }
  /** The stock as dots: one per supply, in its colour (dark when empty), with its units. */
  function stockSummary(rows) {
    if (!rows.length) return null;
    return h('span', { class: 'ts-sum', 'aria-label': rows.map((r) => `${r.name} ${r.units} of ${r.cap}`).join(', ') },
      ...rows.map((r) => h('span', { class: `ts-sumi${r.units ? '' : ' empty'}`, title: `${r.name}: ${r.units} of ${r.cap}${r.tierName ? `, ${r.tierName}` : ''}` },
        h('i', { style: { background: r.color } }), String(r.units))));
  }

  /**
   * The stock rows (0.4): the supply's name and tier, a gauge of units against the cap (one block a
   * unit), and what it is giving the building now, or EMPTY.
   */
  function renderStock(rows) {
    setClass(sheetStock, 'hidden', !rows.length);
    sheetStock.replaceChildren(...rows.map((r) => h('div', { class: `ts-srow${r.units ? '' : ' empty'}` },
      h('span', { class: 'ts-sdot', style: { background: r.color } }),
      h('b', { class: 'ts-sname' }, r.name),
      h('small', { class: 'ts-stier' }, r.tierName || 'none'),
      h('span', { class: 'ts-gauge', 'aria-label': `${r.units} of ${r.cap}` },
        ...Array.from({ length: r.cap }, (_, n) => h('i', n < r.units ? { style: { background: r.color } } : null))),
      h('small', { class: 'ts-sgives' }, r.gives))));
  }

  /** The sheet for a Returns Drop in The Back (0.4): its junk a minute and the MORE JUNK button. */
  function renderDrop(s, t, p) {
    const mine = s.players[session.me];
    const cash = Math.floor(mine ? mine.cash : 0);
    const d = dropInfo(p, cash, s);
    const sig = JSON.stringify(['drop', t.x, t.y, d]);
    if (sig === sheetSig) return;
    sheetSig = sig;
    sheetHead.replaceChildren(
      h('span', { class: 'ts-icon', html: buildingIcon('drop') }),
      h('b', null, 'Returns Drop'),
      h('span', { class: 'ts-lv' }, `level ${d.lv} of ${d.max}`),
      h('button', { type: 'button', class: 'ts-x', 'aria-label': 'Close', onclick: () => input.select(null) }, '×'));
    setText(sheetNote, `${d.perMin} junk a minute comes down it.${d.next ? ` One more level: ${d.next} a minute.` : ' It is as fast as it goes.'}`);
    setClass(sheetNote, 'hidden', false);
    sheetNote.classList.add('ts-plain');
    setClass(sheetNums, 'hidden', true);
    renderStock([]);
    const why = d.why;
    sheetBtns.replaceChildren(h('button', {
      type: 'button', class: `ts-btn ts-more${why ? ' poor' : ''}`, disabled: !!why,
      title: 'Pay to have junk sent down faster. Anyone can, for the whole store.',
      onclick: () => act({ c: 'dropUp', x: t.x, y: t.y }, 'click'),
    }, h('b', null, 'MORE JUNK'), h('small', { class: 'ts-cost' }, why || money(d.cost))));
  }

  let lastTool, lastDir, lastRot;
  function update(s) {
    // The sheet: only for a building tapped with nothing held.
    const t = input.selected;
    // In The Back (0.4) only a Returns Drop has a sheet.
    const back = input.floor === 1;
    const b = t && !input.tool ? (back ? s.back?.[t.y * s.w + t.x] : s.grid[t.y * s.w + t.x]) : 0;
    const office = s.players[session.me]?.side === 'office';
    const show = !!b && (!back || b.k === 'drop') && !office && s.phase !== 'won' && s.phase !== 'lost' && s.phase !== 'lobby';
    if (!show && t && !b) input.select(null); // it was removed (or never was)
    if (show) {
      if (back) renderDrop(s, t, b);
      else { sheetNote.classList.remove('ts-plain'); renderSheet(s, t, b); }
    }
    updatePicker(s, show && !back ? t : null, show && !back ? b : null);
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
    updateAid();
  }

  return {
    pad, bar, sheet, aid, update,
    get sheetOpen() { return sheetOpen; },
    /** The building whose sheet is open ({ x, y }, its anchor tile), or null: for view.selected. */
    get selected() { return sheetOpen ? input.selected : null; },
    /** A wire direction pointed at in the sheet's picker ({ x, y, d }), or null: for view.wirePreview. */
    get wirePreview() { return sheetOpen && wireAt && wireHover !== null ? { x: wireAt.x, y: wireAt.y, d: wireHover } : null; },
  };
}
