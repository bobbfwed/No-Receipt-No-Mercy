// The training shift's arrow (0.3.03): a big bouncing arrow on the one thing the lesson wants
// pressed next, on a desktop and on a phone. src/tutorial/target.js decides WHAT that is; this
// file finds it on screen every frame and draws the arrow beside it (or, for a building a finger
// drags from the bar, a dot that does the drag from its button to its tile, again and again).
//
// placeArrow() and edgeArrow() are pure (no DOM), so a test can check where the arrow goes.
// The arrow never takes a click or a tap (pointer-events: none), never covers its target or the
// lesson panel's text, and never leaves the screen.
import { targetKey } from '../tutorial/target.js';
import { liftPx } from './lift.js';
import { BUILD, sizeOf } from '../sim/index.js';

/** The arrow's size in CSS pixels: shaft and head along `len`, `wide` across, `gap` from the target. */
export const ARROW = { len: 64, wide: 44, gap: 6, bounce: 12 };
export const ARROW_SMALL = { len: 52, wide: 36, gap: 5, bounce: 10 };
/** Where the arrow may sit, in order of preference: the side of the target it stands on. The
 * corners (0.3.03 follow-up) are for a target boxed in on its straight sides, such as DROP with the
 * HOME button above it and Rotate beside it. */
export const SIDES = ['above', 'below', 'left', 'right', 'aboveleft', 'aboveright', 'belowleft', 'belowright'];
const R2 = Math.SQRT1_2;
/** The way an arrow standing on each side points (at the target), and that direction's name. */
const POINTS = {
  above: [0, 1, 'down'], below: [0, -1, 'up'], left: [1, 0, 'right'], right: [-1, 0, 'left'],
  aboveleft: [R2, R2, 'downright'], aboveright: [-R2, R2, 'downleft'], belowleft: [R2, -R2, 'upright'], belowright: [-R2, -R2, 'upleft'],
};
const VEC = Object.fromEntries(Object.values(POINTS).map(([vx, vy, name]) => [name, [vx, vy]]));

const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const outside = (box, bd) => box.w * box.h - area(box, bd);

/**
 * The arrow's outline as circles along its axis, from the tip back to the end of its bounce: the
 * head widens to `wide`, the shaft is about two fifths of that. Used to tell exactly what it
 * covers (a box round a slanted arrow would cover far more than the arrow does).
 */
function circlesOf(x, y, vx, vy, { len, wide, bounce }) {
  const out = [];
  const headLen = len * 0.48;
  for (let t = 2; t <= len + bounce; t += 6) {
    const r = (t < headLen ? Math.max(3, (wide / 2) * (t / headLen)) : wide * 0.21) + 1.5;
    out.push({ x: x - vx * t, y: y - vy * t, r });
  }
  return out;
}
const circleHits = (c, a) => {
  const dx = Math.max(a.x - c.x, 0, c.x - (a.x + a.w)), dy = Math.max(a.y - c.y, 0, c.y - (a.y + a.h));
  return dx * dx + dy * dy < c.r * c.r;
};

/**
 * Where the arrow goes for a target that is on screen.
 * @param {{x,y,w,h}} target  the thing to point at (CSS px, page coordinates)
 * @param {{x,y,w,h}} bounds  where the arrow must stay (the window, or the floor for a tile)
 * @param {Array<{x,y,w,h}>} [avoid] what it must not cover (the lesson panel's text, a sheet,
 *   the buttons next to the target)
 * @param {string[]} [sides]  preferred sides, best first (see SIDES)
 * @param {Object} [size]     ARROW or ARROW_SMALL
 * @returns {{ x: number, y: number, dir: string, side: string, box: {x,y,w,h}, edge: false, fits: boolean }}
 *   (x, y) is the arrow's tip; `dir` the way it points; `box` all it covers while bouncing
 */
export function placeArrow(target, bounds, avoid = [], sides = SIDES, size = ARROW) {
  const { wide, gap } = size;
  const cx = target.x + target.w / 2, cy = target.y + target.h / 2;
  let best = null;
  for (const side of sides) {
    const [vx, vy, dir] = POINTS[side];
    // The tip: where a line from the target's centre, away from the arrow's way, leaves the
    // target, then `gap` further out. A slanted arrow points into the target's nearest corner.
    const ux = -vx, uy = -vy;
    let x, y;
    if (vx && vy) {
      x = (ux < 0 ? target.x : target.x + target.w) + ux * gap;
      y = (uy < 0 ? target.y : target.y + target.h) + uy * gap;
    } else {
      const reach = Math.min(ux ? target.w / 2 / Math.abs(ux) : Infinity, uy ? target.h / 2 / Math.abs(uy) : Infinity);
      x = cx + ux * (reach + gap); y = cy + uy * (reach + gap);
    }
    // A straight arrow slides along the target's edge to stay on screen, as long as its tip still
    // points at the target.
    if (!vx) {
      const lo = Math.max(bounds.x + wide / 2, target.x + 2), hi = Math.min(bounds.x + bounds.w - wide / 2, target.x + target.w - 2);
      if (lo <= hi) x = Math.min(hi, Math.max(lo, x));
    } else if (!vy) {
      const lo = Math.max(bounds.y + wide / 2, target.y + 2), hi = Math.min(bounds.y + bounds.h - wide / 2, target.y + target.h - 2);
      if (lo <= hi) y = Math.min(hi, Math.max(lo, y));
    }
    const box = boxOf(x, y, dir, size);
    // How bad it is: off screen counts double, covering what must stay readable counts once.
    const circles = circlesOf(x, y, vx, vy, size);
    // (An avoided box may say how much it matters, `weight`: a card's edge less than a button.)
    const covers = avoid.reduce((n, a) => n + circles.filter((c) => circleHits(c, a)).length * 40 * (a.weight ?? 1), 0);
    const bad = outside(box, bounds) * 2 + covers;
    const spot = { x, y, dir, side, box, edge: false, fits: bad === 0 };
    // (A straight arrow reads more plainly than a slanted one: when neither is clear, the slanted
    // one must be clearly better to win.)
    if (vx && vy && bad > 0) spot.bad2 = bad + 100;
    if (bad === 0) return spot;
    const score = spot.bad2 ?? bad;
    delete spot.bad2;
    if (!best || score < best.bad) best = { ...spot, bad: score };
  }
  // Nowhere is perfect: the least bad, pushed back on screen.
  const { bad, ...spot } = best;
  return keepIn(spot, bounds, size);
}

/** All the arrow covers, tip at (x, y), pointing `dir`, including its bounce away from the tip. */
export function boxOf(x, y, dir, { len, wide, bounce }) {
  const far = len + bounce;
  if (dir === 'down') return { x: x - wide / 2, y: y - far, w: wide, h: far };
  if (dir === 'up') return { x: x - wide / 2, y, w: wide, h: far };
  if (dir === 'right') return { x: x - far, y: y - wide / 2, w: far, h: wide };
  if (dir === 'left') return { x, y: y - wide / 2, w: far, h: wide };
  // A slanted arrow: the box round its corners.
  const [vx, vy] = VEC[dir];
  const ex = x - vx * far, ey = y - vy * far, half = (wide / 2) * R2;
  const x0 = Math.min(x, ex) - half, x1 = Math.max(x, ex) + half, y0 = Math.min(y, ey) - half, y1 = Math.max(y, ey) + half;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Moves an arrow (and its tip) so its box is inside `bounds` where it can be. */
function keepIn(spot, bounds, size) {
  const b = spot.box;
  const dx = b.w > bounds.w ? bounds.x + (bounds.w - b.w) / 2 - b.x : Math.min(0, bounds.x + bounds.w - (b.x + b.w)) + Math.max(0, bounds.x - b.x);
  const dy = b.h > bounds.h ? bounds.y + (bounds.h - b.h) / 2 - b.y : Math.min(0, bounds.y + bounds.h - (b.y + b.h)) + Math.max(0, bounds.y - b.y);
  return { ...spot, x: spot.x + dx, y: spot.y + dy, box: boxOf(spot.x + dx, spot.y + dy, spot.dir, size) };
}

/**
 * For a target outside `bounds` (a tile scrolled off the floor, a button scrolled out of the bar):
 * the arrow stands just inside the nearest edge and points out toward it.
 * @param {{x,y}} point  the target's centre
 * @param {{x,y,w,h}} bounds
 * @param {Object} [size]
 * @param {Array<{x,y,w,h}>} [avoid] what it should slide along the edge to keep clear of
 * @returns {{ x, y, dir, side: 'edge', box, edge: true, fits: boolean }}
 */
export function edgeArrow(point, bounds, size = ARROW, avoid = []) {
  const cx = bounds.x + bounds.w / 2, cy = bounds.y + bounds.h / 2;
  const dx = point.x - cx, dy = point.y - cy;
  // Which edge the line from the middle to the target leaves through.
  const sx = dx === 0 ? Infinity : (bounds.w / 2) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (bounds.h / 2) / Math.abs(dy);
  const dir = sx < sy ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  const pad = 4;
  const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  const across = dir === 'right' || dir === 'left';
  const lo = (across ? bounds.y : bounds.x) + size.wide / 2 + pad;
  const hi = (across ? bounds.y + bounds.h : bounds.x + bounds.w) - size.wide / 2 - pad;
  const at = (v) => (across
    ? { x: dir === 'right' ? bounds.x + bounds.w - pad : bounds.x + pad, y: v }
    : { x: v, y: dir === 'down' ? bounds.y + bounds.h - pad : bounds.y + pad });
  const want = clamp(across ? point.y : point.x, lo, hi);
  // As near the target's line as it can be, slid along the edge clear of what must stay readable.
  const clear = (v) => { const p = at(v); const box = boxOf(p.x, p.y, dir, size); return avoid.every((a) => area(box, a) === 0); };
  let v = want;
  if (!clear(v)) {
    for (let d = 8; d <= Math.max(0, hi - lo); d += 8) {
      if (want - d >= lo && clear(want - d)) { v = want - d; break; }
      if (want + d <= hi && clear(want + d)) { v = want + d; break; }
    }
  }
  const { x, y } = at(v);
  return { x, y, dir, side: 'edge', box: boxOf(x, y, dir, size), edge: true, fits: clear(v) };
}

/** True when the point is inside the rectangle shrunk by `inset` on every side. */
export const inside = (p, r, inset = 0) => p.x >= r.x + inset && p.x <= r.x + r.w - inset && p.y >= r.y + inset && p.y <= r.y + r.h - inset;

// ---- On screen --------------------------------------------------------------------------------

/** Sides for an arrow beside a button in a card or a cluster: any, straight ones first. */
const ANY = ['above', 'below', 'left', 'right', 'aboveleft', 'aboveright', 'belowleft', 'belowright'];
/** Where each named control of target.js CONTROLS is, the sides the arrow prefers, and what opens
 * it when it is hidden (a shrunk lesson panel; the ☰ menu on a phone). */
export const CONTROL_SPOTS = {
  next: { sel: '.tutorial .tut-next', sides: ['below', 'right', 'left', 'above'], opener: '.tutorial .tut-min' },
  play: { sel: '.tutorial .tut-play', sides: ['below', 'right', 'left', 'above'], opener: '.tutorial .tut-min' },
  doors: { sel: '.topbar .btn-doors', sides: ['below', 'left', 'right', 'above'], opener: '.topbar .btn-more' },
  // DROP is boxed in: HOME above it, Rotate beside it, the edge of the screen on the other sides.
  drop: { sel: '.buildbar .tc-drop', sides: ['above', 'aboveleft', 'left', 'belowleft'] },
  // (The sheet's buttons carry no names of their own: Rotate is the one that is neither an upgrade nor Remove.)
  dmg: { sel: '.touch-sheet .ts-dmg', sides: ANY },
  spin: { sel: '.touch-sheet .ts-btn:not(.ts-up):not(.ts-remove)', sides: ANY },
  remove: { sel: '.touch-sheet .ts-remove', sides: ANY },
};
/** Groups of buttons whose other buttons the arrow keeps clear of when it points at one of them. */
const GROUPS = '.touch-sheet, .tut-foot, .bb-touch, .touch-pad, .hud-phase, .bb-btns';

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};
const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
const shown = (el) => !!el && el.isConnected && el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0;
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** How long a new target must last before the arrow moves to it: a tool held for a moment (a tap
 * that starts a drag from the bar, say) must not send it back and forth. */
const SETTLE_MS = 140;
const POP_MS = 320;
const DRAG_MS = 2000; // one run of the drag animation, pause included
/** How far above a marked tile, in tiles, its own small arrow (and caption) reach. */
const MARK_ARROW_TILES = 0.9, MARK_CAPTION_TILES = 1.45;

/**
 * @param {Object} o
 * @param {HTMLElement} o.root       the game screen (the arrow is added to it)
 * @param {HTMLCanvasElement} o.canvas  the floor
 * @param {Object} o.renderer       for the camera (tile to screen)
 * @param {Object} o.input          the tool held, and whether a finger is placing something
 * @param {() => ({x,y}|null)} o.selected  the building whose sheet is open
 * @param {(ui) => Object} o.target  the lesson's target (training panel's arrow())
 * @param {() => boolean} o.touch   a touch screen
 * @param {() => Array} [o.marks]   the lesson's floor marks (their captions are kept clear)
 * @param {HTMLElement} [o.card]    the held tool's card, kept off the marked tiles
 */
export function createPointer({ root, canvas, renderer, input, selected, target, touch, marks = () => [], card = null }) {
  const el = document.createElement('div');
  el.className = 'tut-arrow hidden';
  el.setAttribute('aria-hidden', 'true');
  const arrow = svg('svg', { class: 'ta-arrow', viewBox: '-4 -4 52 72' });
  // Drawn pointing down, tip at (22, 64): a hazard-yellow arrow with a thick dark outline.
  arrow.append(
    svg('path', { class: 'ta-shadow', d: 'M13 2 H31 V33 H43 L22 64 L1 33 H13 Z', transform: 'translate(0 3)' }),
    svg('path', { class: 'ta-body', d: 'M13 2 H31 V33 H43 L22 64 L1 33 H13 Z' }),
    svg('path', { class: 'ta-shine', d: 'M17 6 V31' }));
  el.append(arrow);
  // The drag cue is a layer of its own, under the lesson panel, DEB, the notices and the bar
  // (style.css: .tut-cue), so its long trail never runs over words: the part that matters, the
  // finger dot and the building above it near the tile, is out on the floor.
  const cue = document.createElement('div');
  cue.className = 'tut-cue hidden';
  cue.setAttribute('aria-hidden', 'true');
  const gesture = svg('svg', { class: 'ta-gesture' });
  const trailBack = svg('path', { class: 'ta-trail-back' });
  const trail = svg('path', { class: 'ta-trail' });
  const head = svg('path', { class: 'ta-head' });
  const ghost = svg('rect', { class: 'ta-ghost', rx: 4 });
  const ring = svg('circle', { class: 'ta-ring', r: 18 });
  const dot = svg('circle', { class: 'ta-dot', r: 12 });
  gesture.append(trailBack, trail, head, ghost, ring, dot);
  cue.append(gesture);
  root.append(cue, el);

  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  let shownKey = 'none', pendingKey = 'none', pendingSince = 0, poppedAt = -1e9, current = null, busyAt = -1e9;
  let mode = ''; // 'arrow', 'gesture' or '' (hidden)

  function setMode(m) {
    if (m === mode) return;
    mode = m;
    el.classList.toggle('hidden', m !== 'arrow');
    cue.classList.toggle('hidden', m !== 'gesture');
  }

  /** A modal screen is up (help, handbook, the cards, a review, the end screen), or the game is paused. */
  const covered = () => !!document.querySelector('.overlay, .pr-modal') || root.classList.contains('is-paused')
    || document.body.classList.contains('dealing');

  const floorRect = () => rectOf(canvas);
  function tileRect(x, y) {
    const r = canvas.getBoundingClientRect(), cam = renderer.cam, z = cam.zoom || 30;
    return { x: r.left + r.width / 2 + (x - cam.x) * z, y: r.top + r.height / 2 + (y - cam.y) * z, w: z, h: z };
  }
  const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const windowRect = () => ({ x: 0, y: 0, w: innerWidth, h: innerHeight });
  const size = () => (innerWidth < 700 || innerHeight < 560 ? ARROW_SMALL : ARROW);

  /** What must stay readable or pressable: the lesson panel's text and buttons, an open building
   * sheet unless the target is in it, the other buttons of the target's group (the next upgrade
   * and the close X in a sheet, Rotate beside DROP), the camera pad, the held tool's card, and,
   * for the floor, DEB's speech bubble. */
  function avoidFor(targetEl) {
    const out = [];
    const add = (e, weight = 1) => { if (shown(e) && !(targetEl && (e === targetEl || e.contains(targetEl)))) out.push({ ...rectOf(e), weight }); };
    const panel = root.querySelector('.tutorial');
    if (shown(panel)) for (const part of panel.querySelectorAll('.tut-main, .tut-foot')) add(part);
    const sheet = root.querySelector('.touch-sheet');
    if (!(targetEl && sheet && sheet.contains(targetEl))) add(sheet);
    const group = targetEl && targetEl.closest ? targetEl.closest(GROUPS) : null;
    if (group) for (const b of group.querySelectorAll('button')) if (b !== targetEl) add(b);
    for (const b of root.querySelectorAll('.touch-pad button, .bb-touch button')) if (!group || !group.contains(b)) add(b);
    // Less important: the edge of the held tool's card, and the build bar's buttons under a sheet.
    if (card && !card.classList.contains('hidden')) add(card, 0.25);
    if (!group || !group.matches('.bb-btns')) for (const b of root.querySelectorAll('.buildbar .bb-btn')) add(b, 0.3);
    if (!targetEl) add(root.querySelector('.deb-body'));
    return out;
  }

  /** A build-bar button: beside it, or at the bar's edge when the phone's bar has scrolled it away. */
  function spotForButton(k) {
    const btn = root.querySelector(`.buildbar .bb-btn[data-k="${k}"]`);
    if (!shown(btn)) return null;
    const r = rectOf(btn);
    const scroller = btn.closest('.bb-scroll');
    if (scroller && scroller.scrollWidth > scroller.clientWidth + 1) {
      const sr = rectOf(scroller);
      const c = centre(r);
      if (c.x < sr.x || c.x > sr.x + sr.w) return { spot: edgeArrow(c, sr, size()), el: btn };
    }
    return { spot: placeArrow(r, windowRect(), avoidFor(btn), ['above', 'aboveleft', 'aboveright', 'left', 'right'], size()), el: btn, rect: r };
  }

  /** A floor tile: beside it on the floor, or at the floor's edge when it is out of view. */
  function spotForTile(x, y) {
    const r = tileRect(x, y), f = floorRect();
    const c = centre(r);
    if (!inside(c, f, 2)) return { spot: edgeArrow(c, f, size(), avoidFor(null)) };
    // The floor mark's own small arrow and caption stand above the tile (render/guides.js draws
    // them when there are 3 marks or fewer): the big arrow stands above those, not on them.
    const ms = marks() || [];
    const m = ms.length <= 3 ? ms.find((mk) => mk.x === x && mk.y === y) : null;
    const lead = m ? (m.label ? MARK_CAPTION_TILES : MARK_ARROW_TILES) * r.h : 0;
    const keep = { x: r.x, y: r.y - lead, w: r.w, h: r.h + lead };
    return { spot: placeArrow(keep, f, avoidFor(null), SIDES, size()), rect: r };
  }

  function spotForControl(name) {
    const info = CONTROL_SPOTS[name];
    if (!info) return null;
    let btn = root.querySelector(info.sel) || document.querySelector(info.sel);
    // Hidden away (a shrunk panel, a closed ☰ menu): point at what opens it.
    if (!shown(btn)) btn = info.opener ? root.querySelector(info.opener) : null;
    if (!shown(btn)) return null;
    return { spot: placeArrow(rectOf(btn), windowRect(), avoidFor(btn), info.sides, size()), el: btn };
  }

  /** The drag a finger makes from a bar button to a tile (or along a line of tiles). */
  function gestureFor(t) {
    if (t.kind === 'swipe') {
      const a = tileRect(t.from.x, t.from.y), b = tileRect(t.to.x, t.to.y), f = floorRect();
      if (!inside(centre(a), f, 2) || !inside(centre(b), f, 2)) return null;
      return { from: centre(a), to: centre(b), ghost: null };
    }
    const btn = root.querySelector(`.buildbar .bb-btn[data-k="${t.k}"]`);
    if (!shown(btn)) return null;
    const scroller = btn.closest('.bb-scroll');
    const br = rectOf(btn);
    if (scroller && scroller.scrollWidth > scroller.clientWidth + 1) {
      const sr = rectOf(scroller), c = centre(br);
      if (c.x < sr.x || c.x > sr.x + sr.w) return null;
    }
    // A building bigger than one tile is dragged by its middle: input.js centres its footprint on
    // the lifted point (liftedAnchor in lift.js), so the drag ends over the middle of all its tiles,
    // as it lies when it lands (the way the bar's rotate button has it turned).
    const [w, h] = sizeOf(t.k, BUILD[t.k] && BUILD[t.k].rot ? input.dir | 0 : 0);
    const one = tileRect(t.x, t.y);
    const tr = { x: one.x, y: one.y, w: one.w * w, h: one.h * h };
    if (!inside(centre(tr), floorRect(), 2)) return null;
    // The finger ends below the building by as much as input.js lifts a dragged building (lift.js);
    // the building is drawn on its tiles, above the finger.
    const lift = liftPx(renderer.cam.zoom);
    return { from: centre(br), to: { x: tr.x + tr.w / 2, y: tr.y + tr.h / 2 + lift }, ghost: tr, lift };
  }

  /**
   * The held tool's card must never sit over a tile the lesson has marked (on a phone it covers
   * the bottom of the floor): it moves to the top of the floor while it would, and if it would
   * cover a mark there too it folds down to its heading.
   */
  let cardTop = false, cardFold = false;
  function keepCardClear() {
    if (!card) return;
    const ms = marks() || [];
    let top = false, fold = false, up = 0;
    if (ms.length && shown(card)) {
      const tiles = ms.map((m) => tileRect(m.x, m.y));
      // Measure where the card is without this rule moving it, so the decision does not flicker.
      const had = [card.classList.contains('tut-top'), card.classList.contains('tut-fold')];
      card.classList.remove('tut-top', 'tut-fold');
      const r = rectOf(card);
      card.classList.toggle('tut-top', had[0]);
      card.classList.toggle('tut-fold', had[1]);
      if (tiles.some((t) => meets(t, r))) {
        const f = floorRect(), bar = card.parentElement.getBoundingClientRect();
        // Its bottom edge goes this far above the bar: its top just under the top of the floor.
        up = bar.top - (f.y + 8) - r.h;
        top = up > 0;
        fold = !top || tiles.some((t) => meets(t, { ...r, y: f.y + 8 }));
      }
    }
    if (top) card.style.setProperty('--tut-top', `${Math.round(up)}px`);
    if (top !== cardTop || fold !== cardFold) {
      cardTop = top; cardFold = fold;
      card.classList.toggle('tut-top', top);
      card.classList.toggle('tut-fold', fold);
    }
  }

  function drawArrow(spot, now) {
    const [vx, vy] = VEC[spot.dir];
    const sz = size();
    const sinceMove = now - poppedAt;
    let off = 0, scale = 1, opacity = 1;
    if (reduced.matches) {
      // No bounce: a slow fade in and out instead.
      opacity = 0.6 + 0.4 * (0.5 + 0.5 * Math.cos((now / 1600) * Math.PI * 2));
    } else {
      off = sz.bounce * Math.abs(Math.sin((now / 700) * Math.PI));
      if (sinceMove < POP_MS) { const k = sinceMove / POP_MS; scale = 1 + 0.45 * (1 - k) * (1 - k); opacity = Math.min(1, k * 3); }
    }
    // The drawing points down (0 degrees); turn it to its way.
    const angle = (Math.atan2(vy, vx) * 180) / Math.PI - 90;
    const x = spot.x - vx * off, y = spot.y - vy * off;
    // The drawing's tip is at (22, 64) of a 44 x 64 arrow; scale it to this size around the tip.
    const k = sz.len / 64;
    arrow.style.width = `${52 * k}px`;
    arrow.style.height = `${72 * k}px`;
    arrow.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg) scale(${scale}) translate(${-26 * k}px, ${-68 * k}px)`;
    arrow.style.opacity = String(opacity);
  }

  function drawGesture(g, now) {
    const { from, to } = g;
    const d = `M${from.x} ${from.y} L${to.x} ${to.y}`;
    trailBack.setAttribute('d', d);
    trail.setAttribute('d', d);
    // An arrowhead at the end of the trail, pointing the way the finger goes.
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const hs = 13;
    const p = (a, r) => `${to.x + Math.cos(a) * r} ${to.y + Math.sin(a) * r}`;
    head.setAttribute('d', `M${p(ang, 2)} L${p(ang + 2.5, hs)} L${p(ang - 2.5, hs)} Z`);
    // One run: the finger presses the button (0 to 0.1), drags (to 0.6), holds over the tile (to
    // 0.72) and lifts (fading, to 0.82); then it comes back to the button (fading in) for the next.
    // With reduced motion it does not travel: it stays at the end of the trail, fading slowly.
    const t = reduced.matches ? 0.65 : ((now - poppedAt) % DRAG_MS) / DRAG_MS;
    const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
    const back = t >= 0.82;
    const u = back || t < 0.1 ? 0 : t < 0.6 ? ease((t - 0.1) / 0.5) : 1;
    const x = from.x + (to.x - from.x) * u, y = from.y + (to.y - from.y) * u;
    const pressed = t >= 0.1 && t < 0.72;
    const fade = reduced.matches ? 0.6 + 0.4 * (0.5 + 0.5 * Math.cos((now / 1600) * Math.PI * 2))
      : t < 0.72 ? 1 : t < 0.82 ? 1 - (t - 0.72) / 0.1 : (t - 0.82) / 0.18;
    dot.setAttribute('cx', x); dot.setAttribute('cy', y);
    dot.setAttribute('r', pressed ? 13 : t < 0.1 ? 10 + 3 * (t / 0.1) : 10);
    dot.style.opacity = String(fade);
    ring.setAttribute('cx', x); ring.setAttribute('cy', y);
    ring.style.opacity = String(pressed ? 0.85 : 0);
    // The building the finger carries, drawn where it will land: above the finger.
    if (g.ghost) {
      ghost.setAttribute('x', x - g.ghost.w / 2); ghost.setAttribute('y', y - g.lift - g.ghost.h / 2);
      ghost.setAttribute('width', g.ghost.w); ghost.setAttribute('height', g.ghost.h);
      ghost.style.opacity = String(u > 0 ? fade : 0);
    } else ghost.style.opacity = '0';
  }

  return {
    el,
    cue,
    /** Once per animation frame. */
    update(now) {
      keepCardClear();
      if (covered()) { setMode(''); return; }
      // A finger is really placing something (dragging a building from the bar, or pressing the
      // floor with one held): the game's own preview shows it, so the cue and the arrow step
      // aside, and come back as they were if the finger lifts without finishing the step.
      if (input.placing || input.carrying) { busyAt = now; setMode(''); return; }
      const t = target({ tool: input.tool, selected: selected(), touch: touch() });
      const key = targetKey(t);
      if (t.kind === 'none') { setMode(''); shownKey = 'none'; pendingKey = 'none'; current = null; return; }
      if (key !== shownKey) {
        if (key !== pendingKey) { pendingKey = key; pendingSince = now; }
        // (Not straight after a finger placed something: what it did is done, and the old cue must not
        // flash up again for a moment before the new target.)
        if (now - pendingSince < SETTLE_MS && shownKey !== 'none' && now - busyAt > 300) {
          // Keep pointing at the old one for a moment (if it is still there to point at).
        } else { shownKey = key; current = t; poppedAt = now; }
      } else pendingKey = key;
      const c = current;
      if (!c) { setMode(''); return; }
      if (c.kind === 'drag' || c.kind === 'swipe') {
        const g = gestureFor(c);
        if (g) { setMode('gesture'); drawGesture(g, now); return; }
      }
      const found = c.kind === 'button' || c.kind === 'drag' ? spotForButton(c.k)
        : c.kind === 'tile' ? spotForTile(c.x, c.y)
          : c.kind === 'swipe' ? spotForTile(c.from.x, c.from.y)
            : c.kind === 'control' ? spotForControl(c.name) : null;
      if (!found) { setMode(''); return; }
      setMode('arrow');
      drawArrow(found.spot, now);
    },
    destroy() { el.remove(); cue.remove(); },
  };
}
