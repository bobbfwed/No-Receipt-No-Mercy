// Mouse, keyboard and touch: picking tools, building and removing on the canvas,
// rotating, moving the view around the map, and telling the other players where this player is
// pointing.
//
// Fingers (pointer events with pointerType 'touch') follow their own rules, below the mouse code:
//   - two fingers always move the view (drag) and zoom it (pinch), and never build
//   - one finger with nothing held drags the view; a tap on a building selects it (touch.js then
//     shows what it is working at and offers rotate and remove for it)
//   - one finger with a building held (not The Back's belt), or the Remove tool, places: the
//     preview follows the finger while it is down, and the building is placed (or removed) once,
//     where the finger lifts. Lifted off the floor, or over a button or
//     panel, it does nothing. (The owner's request, 0.3.01: a drag used to build a row.)
//   - a building's preview is lifted above the finger (0.3.03, the owner's request; numbers in
//     lift.js): a tap places on the tapped tile however long the finger rests, but once the finger
//     drags at all the preview rises about one and a half tiles above it, stays up for the rest of
//     that touch, and the building goes there. The
//     Remove tool acts on the tile under the finger, with dashed lines along its row and
//     column (view.aim) because the finger hides it.
//   - a building can be dragged up out of its button in the bar (0.3.03, watchBar below): the lifted
//     preview follows the finger over the floor, and lifting places one. What was held before is
//     held again afterwards. A sideways swipe on the bar still scrolls it.
//   - while a building is being placed, a finger held near an edge of the floor slides the view
//   - with The Back's belt held, a tap lays one and a drag lays a line under the finger, as the mouse does
//   - a second finger on the floor while the first is placing cancels it: nothing more is built
//     when either lifts (belts already laid by a drag stay), and the two fingers move the view
// Nothing is built until the finger has either lifted or (a belt) moved a little, so a second
// finger that lands a moment after the first turns the touch into a pinch before anything is placed.
// touch.js shows a Rotate button and a "second finger cancels" hint while a finger is placing.
// A pen is treated as a finger; only the mouse keeps the mouse's rules.
//
// The shop floor's two tools that are not buildings (0.4, stage 4b; the rules of the gestures are in
// wiretool.js):
//   - Wire (Z): press on a security building and drag the way its Razor Wire should run (the floor
//     previews the wire and the dads' route as they would be); a plain click steps it north, east,
//     south, west, none, skipping directions the rules would refuse; right-click takes it off. A
//     finger does the same: drag from the building, or tap it. Anything that cannot carry wire gets
//     DEB's refusal.
//   - Reinforce (U): click a Crate Stack for one level; press and drag across crates for a level on
//     each crossed, stopping quietly when the money runs out. A finger taps, or drags.
import { BUILD, SHOP_KINDS, doorOf, anchorOf, sizeOf } from '../sim/index.js';
import { startDrag, gridLine } from './drag.js';
import { liftFraction, createPress, liftedSpot, edgeVelocity, barGesture, EDGE } from './lift.js';
import { rebuildStatus } from './rebuild.js';
import { WIRE_KEY, REINFORCE_KEY, dragDir, wireBuilding, clickWireDir, startReinforce } from './wiretool.js';

// The shop floor's kinds. The Back's parts (0.4) have their own bar and keys: BACK_KEYS below.
export const BUILD_KEYS = SHOP_KINDS;
/** The keys along the top row, in the order of the bar: 1 to 9, then 0, -, =. */
const ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
/**
 * The shop floor's hotkeys, in the order of its bar (BUILD's): 1 Crates, then the security from 2.
 * (Until 0.4 the old factory had 1 to 5 and Crates 6; with it gone they were renumbered from 1.)
 */
export const HOTKEYS = BUILD_KEYS.map((k, i) => ROW[i] || '');
/**
 * The Back's build bar in two groups (0.4): what moves things (belts, Splitter, Overpass, Intern,
 * Bin) and what makes them (the five machines and the Rebrander). Every part a player can buy is in
 * one of them, in the order of BUILD.
 */
export const BACK_GROUPS = [
  { id: 'belts', label: 'BELTS', keys: Object.keys(BUILD).filter((k) => BUILD[k].back && !BUILD[k].fixed && !BUILD[k].supply && k !== 'rebrand') },
  { id: 'machines', label: 'MACHINES', keys: Object.keys(BUILD).filter((k) => BUILD[k].back && !BUILD[k].fixed && (BUILD[k].supply || k === 'rebrand')) },
];
export const BACK_KEYS = BACK_GROUPS.flatMap((g) => g.keys);
/** The parts a player can build in The Back (not the map's Returns Drops), keys 1 to 9, 0, - there. */
export const BACK_HOTKEYS = BACK_KEYS.map((k, i) => ROW[i] || '');
/** A buildable kind's hotkey on its own floor, or ''. */
export const hotkeyOf = (k) => (BUILD[k]?.back ? BACK_HOTKEYS[BACK_KEYS.indexOf(k)] : HOTKEYS[BUILD_KEYS.indexOf(k)]) || '';
/** The kind laid in lines by dragging: The Back's belt. */
const isLine = (k) => k === 'conv';
/** Tools that are not buildings: Remove, and on the shop floor Wire and Reinforce (0.4). */
export const TOOL_KEYS = { remove: 'x', wire: WIRE_KEY, reinforce: REINFORCE_KEY };
/** The tools that belong to the shop floor only. */
const SHOP_TOOLS = ['wire', 'reinforce'];

const CURSOR_EVERY_MS = 100; // at most 10 pointer updates a second
const CURSOR_TTL_MS = 3000;
const PAN_PX_PER_SEC = 950; // how fast WASD moves the view, in screen pixels
const PAN_KEYS = {
  w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0],
  ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0],
};
const TAP_SLOP_PX = 10; // a finger that moves less than this is a tap, not a drag
/** A finger, or a pen: both follow the finger's rules (the mouse keeps its own). */
const fingerish = (e) => e.pointerType === 'touch' || e.pointerType === 'pen';

/**
 * @param {Object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {Object} o.renderer  the canvas renderer (tileAt and the camera)
 * @param {Object} o.session
 * @param {() => boolean} [o.onEscape] return true if Escape was used for something else (a dialog)
 * @param {() => void} [o.onChange] called when the tool or direction changes
 */
export function createInput({ canvas, renderer, session, onEscape = () => false, onChange = () => {}, playSound = () => {} }) {
  let tool = null;
  let dir = 0;
  let hover = null;
  let drag = null; // { planner, button }
  let grab = null; // middle-button drag that moves the view: { id, x, y }
  let pointer = null; // last pointer position in tiles (decimals) over the canvas
  let cursorDirty = false;
  let lastCursorSent = 0;
  let lastTick = 0;
  let selected = null; // the building a finger tapped with nothing held: { x, y }
  // Which floor this player is looking at and building on (0.4): 0 the shop, 1 The Back. His
  // screen's own business: it is never in the game state and never goes over the network (only
  // the f: 1 on his commands says where they are meant).
  let floor = 0;
  // The Wire tool's press on a building (0.4): { id, x, y (the tile pressed), rect (its footprint),
  // d (the direction the drag points, or null while it is still on the building), left (the drag
  // has been off the building) }, or null.
  let wdrag = null;
  // The Reinforce tool's press: { id, r (startReinforce), last (the last tile handled) }, or null.
  let rdrag = null;
  // Test pages only (?wireprev=x,y,d): a wire direction shown as if it were being tried.
  let wireFixed = null;
  const held = new Set(); // view-moving keys that are down
  const cursors = new Map(); // player id -> { x, y, t }

  /** What is built on the floor being looked at: the shop's grid or The Back. */
  const grid = () => (floor ? session.state?.back : session.state?.grid);
  const at = (t) => grid()?.[t.y * session.state.w + t.x];
  const hasBuilding = (t) => !!at(t);
  /** The top-left tile of the building on a tile (a big building is selected as a whole). */
  function anchorTile(t) {
    const s = session.state;
    if (!t || !s || !at(t)) return null;
    // (In The Back only a Returns Drop has a sheet, 0.4: nothing else can be selected there.)
    if (floor) return at(t).k === 'drop' ? { x: t.x, y: t.y } : null;
    const i = anchorOf(s, t.y * s.w + t.x);
    return { x: i % s.w, y: (i / s.w) | 0 };
  }
  // Head Office cannot touch the store: no tools, no building, no removing. He keeps the camera.
  const isOffice = () => session.state?.players[session.me]?.side === 'office';

  /** Whether kind or tool k can be held on the floor being looked at. */
  function fits(k) {
    if (k === 'remove') return true;
    if (SHOP_TOOLS.includes(k)) return !floor;
    const def = Object.hasOwn(BUILD, k) ? BUILD[k] : null;
    return !!def && (floor ? !!def.back && !def.fixed : !def.back);
  }

  function setTool(k) {
    const next = k && !isOffice() && fits(k) ? k : null;
    if (next === tool) return;
    tool = next;
    wdrag = null;
    rdrag = null;
    if (tool) selected = null;
    canvas.dataset.tool = tool || '';
    if (tool) playSound('select');
    onChange();
  }

  function send(cmds) {
    let did = null, last = null;
    for (const c of cmds) {
      // In The Back, building, selling and turning say so (0.4).
      if (floor && (c.c === 'place' || c.c === 'remove' || c.c === 'rotate')) c.f = 1;
      // The host answers at once. A client hears nothing back unless it is refused, so assume yes.
      const r = session.send(c);
      if (!r || r.ok) { did = c.c; last = r; }
    }
    if (did === 'place' || did === 'remove') playSound(did);
    // (0.4: everyone else hears these from the event, sound.js; this player at once, as for a build.)
    // (0.4, stage 6: their own sounds, sound.js; until then the rotate ratchet and the place sound.)
    if (did === 'wire') playSound('wireLay');
    if (did === 'reinforce') playSound('reinforce');
    // A Rebuild press that only paid for wrecks that must wait builds nothing yet: its own sound
    // comes with the rebuildHeld event (sound.js). The host knows at once. A joined player hears
    // nothing back, so he plays it only when his own copy of the state says the press can order
    // something: not when everything is already paid for, he is too broke, or nothing is wrecked
    // (the command is sent all the same; the host decides).
    if (did === 'rebuild') {
      if (last ? last.ok && last.n > 0 : rebuildStatus(session.state, session.me)?.can) playSound(did);
    }
  }

  /**
   * Pays to put back everything of this player's that gym bros have wrecked, as far as his cash
   * goes: each goes back at once, or as soon as nothing is in the way (0.3.04).
   */
  function rebuild() {
    if (isOffice()) return;
    send([{ c: 'rebuild' }]);
  }

  /** Pauses the game, or carries on if it is paused (the P key). Only while the game is being played. */
  function togglePause() {
    const s = session.state;
    if (!s || (s.phase !== 'cards' && s.phase !== 'build' && s.phase !== 'wave')) return;
    playSound('click');
    session.send({ c: 'pause', on: !s.pause });
  }

  /** Turns the building or part on tile t a quarter turn clockwise, on the floor being looked at. */
  function turn(t) {
    send([{ c: 'rotate', x: t.x, y: t.y }]);
    playSound('rotate');
  }

  // ---- Wire and Reinforce (0.4) -------------------------------------------------------------------
  /**
   * The Wire tool pressed on tile t (mouse or finger `id`). On a building that can carry wire, a
   * drag starts; on anything else the command goes at once, so DEB says why not.
   */
  function wireDown(id, t) {
    const s = session.state;
    const wb = wireBuilding(s, t.x, t.y);
    if (!wb) { send([{ c: 'wire', x: t.x, y: t.y, d: 3 }]); return false; }
    wdrag = { id, x: t.x, y: t.y, rect: wb.rect, d: null, left: false };
    return true;
  }

  /** The pointer pressing with the Wire tool is at (px, py) in tiles: the direction it means. */
  function wireMove(px, py) {
    if (!wdrag) return;
    const d = dragDir(wdrag.rect, px, py);
    if (d !== null) wdrag.left = true;
    wdrag.d = d;
  }

  /**
   * The Wire tool let go: a drag sets the direction it points; a plain click steps to the next
   * direction the rules allow; a drag that came back onto the building does nothing.
   */
  function wireUp() {
    const w = wdrag;
    wdrag = null;
    if (!w || !session.state) return;
    if (w.d !== null) send([{ c: 'wire', x: w.x, y: w.y, d: w.d }]);
    else if (!w.left) send([{ c: 'wire', x: w.x, y: w.y, d: clickWireDir(session.state, session.me, w.x, w.y) }]);
  }

  /** Right-click with the Wire tool: takes the wire off the building there (quietly on anything else). */
  function wireClear(t) {
    if (wireBuilding(session.state, t.x, t.y)) send([{ c: 'wire', x: t.x, y: t.y, d: -1 }]);
  }

  /** The Reinforce tool pressed on tile t: the first crate is reinforced at once (or refused, with a word). */
  function reinforceDown(id, t) {
    const s = session.state;
    rdrag = { id, r: startReinforce(Math.floor(s.players[session.me]?.cash ?? 0)), last: t };
    const c = rdrag.r.at(s, session.me, t.x, t.y);
    if (c) send([c]);
  }

  /** The pointer reinforcing has moved to tile t: one level on each crate crossed on the way. */
  function reinforceMove(t) {
    if (!rdrag || !t) return;
    const s = session.state;
    for (const n of gridLine(rdrag.last, t)) {
      const c = rdrag.r.at(s, session.me, n.x, n.y);
      if (c) send([c]);
    }
    rdrag.last = t;
  }

  /**
   * Looks at the other floor (0.4): 0 the shop, 1 The Back. Whatever was held is put down (the
   * Back's parts cannot go in the shop and the other way round), and a line being laid, a building
   * dragged from the bar and an open building sheet are dropped. Fingers on the floor carry on
   * moving the view only.
   */
  function setFloor(f) {
    const next = f === 1 ? 1 : 0;
    if (next === floor) return;
    floor = next;
    drag = null;
    tdrag = null;
    wdrag = null;
    rdrag = null;
    dropCarry(true);
    if (gesture && gesture.kind === 'one') gesture.mode = 'pan';
    selected = null;
    setTool(null);
    playSound('click');
    onChange();
  }

  // ---- The view ----------------------------------------------------------------------------------
  /** Where a screen point is on the map, in tiles with decimals. */
  function exactTile(clientX, clientY, t) {
    const cam = renderer.cam;
    if (cam && cam.zoom > 0) {
      const r = canvas.getBoundingClientRect();
      const x = cam.x + (clientX - (r.left + r.width / 2)) / cam.zoom;
      const y = cam.y + (clientY - (r.top + r.height / 2)) / cam.zoom;
      // Trust the renderer's tile; keep the decimals inside it.
      if (t && Math.floor(x) === t.x && Math.floor(y) === t.y) return { x, y };
    }
    return t ? { x: t.x + 0.5, y: t.y + 0.5 } : null;
  }

  /** Moves the view to this player's own entrance. */
  function goHome() {
    const s = session.state;
    if (!s || !renderer.centerOn) return;
    const door = doorOf(s, session.me);
    const i = door[0];
    const x = (i % s.w) + 0.5, y = ((i / s.w) | 0) + 0.5;
    // Look a little way into the store, not at the wall.
    const inX = x < 1 ? 6 : 0, inY = y < 1 ? 4 : y > s.h - 1 ? -4 : 0;
    renderer.centerOn(x + inX, y + inY);
  }

  function onWheel(e) {
    if (!renderer.zoomBy) return;
    e.preventDefault();
    renderer.zoomBy(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), e.clientX, e.clientY);
    hover = renderer.tileAt(e.clientX, e.clientY);
  }

  // ---- Pointer ---------------------------------------------------------------------------------
  function onPointerMove(e) {
    if (fingerish(e)) { onTouchMove(e); return; }
    if (grab && e.pointerId === grab.id) {
      const z = renderer.cam.zoom || 1;
      renderer.pan((grab.x - e.clientX) / z, (grab.y - e.clientY) / z);
      grab.x = e.clientX;
      grab.y = e.clientY;
    }
    const t = renderer.tileAt(e.clientX, e.clientY);
    hover = t;
    const p = exactTile(e.clientX, e.clientY, t);
    if (p && (!pointer || p.x !== pointer.x || p.y !== pointer.y)) { pointer = p; cursorDirty = true; }
    if (drag) send(drag.planner.moveTo(t, dir));
    if (wdrag && e.pointerId === wdrag.id) { const q = exactAt(e.clientX, e.clientY); wireMove(q.x, q.y); }
    if (rdrag && e.pointerId === rdrag.id) reinforceMove(t);
  }

  /** Where a screen point is on the map, in tiles with decimals, on the map or off it. */
  function exactAt(clientX, clientY) {
    const cam = renderer.cam, r = canvas.getBoundingClientRect(), z = cam.zoom || 30;
    return { x: cam.x + (clientX - (r.left + r.width / 2)) / z, y: cam.y + (clientY - (r.top + r.height / 2)) / z };
  }

  function onPointerDown(e) {
    if (fingerish(e)) { onTouchDown(e); return; }
    if (drag || grab || wdrag || rdrag) return;
    if (e.button === 1 && renderer.pan) {
      // Middle button: drag the map.
      e.preventDefault();
      grab = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { canvas.setPointerCapture(e.pointerId); } catch { /* fine without */ }
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    if (isOffice()) return;
    const t = renderer.tileAt(e.clientX, e.clientY);
    hover = t;
    if (!t || !session.state) return;
    // With nothing held, a click on a building opens its sheet (what it works at, its stock,
    // rotate, remove). A click on bare floor closes it.
    if (e.button === 0 && !tool) { e.preventDefault(); selected = anchorTile(t); return; }
    if (tool === 'wire') {
      e.preventDefault();
      if (e.button === 2) { wireClear(t); return; }
      if (wireDown(e.pointerId, t)) { try { canvas.setPointerCapture(e.pointerId); } catch { /* drag still works inside */ } }
      return;
    }
    if (tool === 'reinforce' && e.button === 0) {
      e.preventDefault();
      reinforceDown(e.pointerId, t);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* drag still works inside */ }
      return;
    }
    let mode = null;
    if (e.button === 2 || tool === 'remove') mode = 'remove';
    else if (tool) mode = 'build';
    if (!mode) return;
    e.preventDefault();
    // A building bigger than one tile is placed one at a time: dragging would only pile refusals up.
    if (mode === 'build' && BUILD[tool].size) { send([{ c: 'place', k: tool, x: t.x, y: t.y, d: dir }]); return; }
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not supported: drag still works inside */ }
    // Dragging belt over belts that are already there turns them, so those tiles are not skipped.
    const taken = mode === 'build' && isLine(tool) ? (tile) => { const b = at(tile); return !!b && b.k !== tool; } : hasBuilding;
    const planner = startDrag({ mode, kind: tool, start: t, dir, hasBuilding: taken });
    drag = { planner, button: e.button, id: e.pointerId };
    send(planner.first);
  }

  function finishDrag(e) {
    if (e && fingerish(e)) { onTouchUp(e); return; }
    if (grab && (!e || e.pointerId === undefined || e.pointerId === grab.id)) {
      try { canvas.releasePointerCapture(grab.id); } catch { /* already released */ }
      grab = null;
    }
    // The Wire tool acts when let go (a cancelled pointer, or the window losing focus, sends nothing).
    if (wdrag && (!e || e.pointerId === undefined || e.pointerId === wdrag.id)) {
      const id = wdrag.id;
      if (e && e.type === 'pointerup') wireUp(); else wdrag = null;
      try { canvas.releasePointerCapture(id); } catch { /* already released */ }
    }
    if (rdrag && (!e || e.pointerId === undefined || e.pointerId === rdrag.id)) {
      try { canvas.releasePointerCapture(rdrag.id); } catch { /* already released */ }
      rdrag = null;
    }
    if (!drag || (e && e.pointerId !== undefined && e.pointerId !== drag.id)) return;
    const d = drag;
    drag = null;
    send(d.planner.end(dir));
    try { canvas.releasePointerCapture(d.id); } catch { /* already released */ }
  }

  function onPointerLeave(e) {
    // A finger "leaves" every time it lifts; what it last touched stays marked.
    if (e && fingerish(e)) return;
    if (!drag) hover = null;
  }

  // ---- Touch -------------------------------------------------------------------------------------
  const touches = new Map(); // pointer id -> { x, y } of each finger on the floor
  // What the fingers are doing:
  //   { kind: 'one', id, x0, y0, lx, ly, tile, mode: 'wait' | 'pan' | 'build' | 'place', lifts, liftAt }
  //     'wait': not yet known whether it is a tap or a drag (nothing held, or the belt)
  //     'build': a belt line being laid; 'place': one building, tool action on the lift tile
  //     lifts: a building is being placed, whose preview rises above the finger once it drags;
  //     liftAt: when it started to rise (null while the press is still a tap)
  //   { kind: 'two', dist, mx, my }
  let gesture = null;
  let tdrag = null; // a line being built by one finger: the drag planner
  // A building dragged out of its button in the bar (watchBar), or null:
  //   { id, kind, btn, x0, y0, lx, ly, picked, above }
  //   picked: the finger has left the button upward, and the building follows it; above: the finger
  //   has been up on the floor, clear of its bottom edge (only then does that edge slide the view)
  let carry = null;

  const builds = () => !isOffice() && (tool === 'remove' || !!BUILD[tool]);
  /** What is held acts once, where the finger lifts (everything but the belt; see the top). */
  const placesOne = () => !isOffice() && !!tool && !isLine(tool) && builds();
  /** The building being placed: one dragged from the bar, or else what is held. */
  const placeKind = () => (carry && carry.picked ? carry.kind : tool);

  /** The finger is over the floor itself: on the map, and not under a button or panel. */
  function onFloor(x, y) {
    const t = renderer.tileAt(x, y);
    if (!t) return null;
    const doc = canvas.ownerDocument;
    const top = doc && doc.elementFromPoint ? doc.elementFromPoint(x, y) : canvas;
    return top === canvas ? t : null;
  }

  /**
   * The tile a building of kind k goes on with a finger at (x, y) and its preview lifted by the
   * fraction f (0 under the finger, 1 fully up): the anchor tile of its footprint, centred on the
   * lifted point. Null when that point is not on the floor itself (off the map, above the floor, or
   * under the bar or a panel): nothing is placed there.
   */
  function liftTarget(x, y, k, f) {
    const s = session.state, cam = renderer.cam;
    if (!s || !BUILD[k] || !(cam.zoom > 0)) return null;
    const [w, h] = sizeOf(k, BUILD[k].rot ? dir : 0);
    const spot = liftedSpot(x, y, cam, canvas.getBoundingClientRect(), w, h, s.w, s.h, f);
    if (!onFloor(spot.sx, spot.sy)) return null;
    if (!pointer || spot.x !== pointer.x || spot.y !== pointer.y) { pointer = { x: spot.x, y: spot.y }; cursorDirty = true; }
    return spot.tile;
  }

  /**
   * The finger placing a building with its preview lifted, or null: { x, y, k, f, bottom }, where
   * f is how far the preview has risen and bottom whether the floor's bottom edge slides the view.
   */
  function lifted(now = performance.now()) {
    if (isOffice()) return null;
    if (carry && carry.picked) return { x: carry.lx, y: carry.ly, k: carry.kind, f: 1, bottom: carry.above };
    const g = gesture;
    if (g && g.kind === 'one' && g.mode === 'place' && g.lifts && g.liftAt !== null && BUILD[tool]) {
      return { x: g.lx, y: g.ly, k: tool, f: liftFraction(now - g.liftAt), bottom: true };
    }
    return null;
  }

  /** Points the preview where the finger placing a lifted building would put it. */
  function aimLifted(now) {
    const l = lifted(now);
    if (l) hover = liftTarget(l.x, l.y, l.k, l.f);
    return l;
  }

  /** One finger lifted (or tapped) on tile t with something held that acts once. */
  function placeAt(t) {
    if (!t || !session.state || isOffice()) return;
    hover = t;
    if (tool === 'remove') { send([{ c: 'remove', x: t.x, y: t.y }]); return; }
    send([{ c: 'place', k: tool, x: t.x, y: t.y, d: dir }]);
  }

  function notePointer(x, y, t) {
    const p = exactTile(x, y, t);
    if (p && (!pointer || p.x !== pointer.x || p.y !== pointer.y)) { pointer = p; cursorDirty = true; }
  }

  /** A belt line under one finger (the only thing a finger drags to build). */
  function startTouchBuild(t) {
    // As with the mouse: dragging belt over belts turns them, so those tiles are not skipped.
    const kind = tool;
    const taken = (tile) => { const b = at(tile); return !!b && b.k !== kind; };
    tdrag = startDrag({ mode: 'build', kind, start: t, dir, hasBuilding: taken });
    send(tdrag.first);
  }

  function endTouchBuild() {
    if (!tdrag) return;
    const d = tdrag;
    tdrag = null;
    send(d.end(dir));
  }

  /** One finger tapped a tile without moving, with nothing held or the belt. */
  function touchTap(t) {
    if (!t || !session.state || isOffice()) { selected = null; return; }
    if (isLine(tool)) { hover = t; startTouchBuild(t); endTouchBuild(); return; }
    // Nothing held: select the building there (touch.js offers what can be done with it).
    selected = anchorTile(t);
    hover = selected;
  }

  function startPinch() {
    const [a, b] = [...touches.values()];
    gesture = { kind: 'two', dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  function onTouchDown(e) {
    e.preventDefault();
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch { /* fine without */ }
    // A finger on the floor while another drags a building from the bar cancels that drag, and
    // this finger then only moves the view (it must not place what is held either).
    const cancelled = carry && carry.picked;
    if (carry) dropCarry(true);
    if (touches.size === 1) {
      const t = renderer.tileAt(e.clientX, e.clientY);
      // (0.4: the Wire and Reinforce tools have gestures of their own, 'wire' and 'reinforce'.)
      const own = !isOffice() && SHOP_TOOLS.includes(tool) && !!t && !!session.state;
      const mode = cancelled ? 'pan' : placesOne() ? 'place' : own ? tool : 'wait';
      gesture = {
        kind: 'one', id: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, tile: t,
        mode, lifts: mode === 'place' && !!BUILD[tool], liftAt: null, press: createPress(e.clientX, e.clientY),
      };
      // Show the ghost of what is held under the finger straight away (a building's rises above the
      // finger once it drags).
      if (!cancelled && (builds() || own)) hover = t;
      // A finger on a building with the Wire tool starts a drag at once; anywhere else it waits to
      // see whether it is a tap (DEB says why not) or a drag (it moves the view).
      if (mode === 'wire') {
        const wb = wireBuilding(session.state, t.x, t.y);
        wdrag = wb ? { id: e.pointerId, x: t.x, y: t.y, rect: wb.rect, d: null, left: false } : null;
      }
      notePointer(e.clientX, e.clientY, t);
    } else if (touches.size === 2) {
      // A second finger on the floor cancels what the first was placing (belts a drag has already
      // laid stay; the one still under the finger is not laid), and the two move the view.
      const g = gesture;
      const placing = g && g.kind === 'one' && (g.mode === 'place' || (g.mode !== 'pan' && isLine(tool))
        || (g.mode === 'wire' && !!wdrag) || g.mode === 'reinforce');
      tdrag = null;
      // (A wire not yet set is not set; crates already reinforced by the drag stay reinforced.)
      wdrag = null;
      rdrag = null;
      if (placing) { hover = null; playSound('click'); }
      startPinch();
    }
  }

  function onTouchMove(e) {
    const f = touches.get(e.pointerId);
    if (!f) return;
    f.x = e.clientX; f.y = e.clientY;
    const g = gesture;
    if (!g) return;
    const z = renderer.cam.zoom || 1;
    if (g.kind === 'two') {
      if (touches.size < 2) return;
      const [a, b] = [...touches.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      renderer.pan((g.mx - mx) / z, (g.my - my) / z);
      if (renderer.zoomBy) renderer.zoomBy(dist / g.dist, mx, my);
      g.mx = mx; g.my = my; g.dist = dist;
      return;
    }
    if (e.pointerId !== g.id) return;
    if (g.mode === 'wire') {
      if (wdrag) {
        g.lx = e.clientX; g.ly = e.clientY;
        const q = exactAt(e.clientX, e.clientY);
        wireMove(q.x, q.y);
        return;
      }
      // Not on a building that takes wire: a drag moves the view after all.
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < TAP_SLOP_PX) return;
      g.mode = 'pan';
      hover = null;
    }
    if (g.mode === 'reinforce') {
      const t = renderer.tileAt(e.clientX, e.clientY);
      if (!rdrag) {
        // Nothing until the finger has really moved (a second finger may yet make it a pinch).
        if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < TAP_SLOP_PX || !g.tile) return;
        reinforceDown(g.id, g.tile);
      }
      if (t) { hover = t; notePointer(e.clientX, e.clientY, t); }
      reinforceMove(t);
      g.lx = e.clientX; g.ly = e.clientY;
      return;
    }
    if (g.mode === 'place') {
      g.lx = e.clientX; g.ly = e.clientY;
      // A building's preview rises above the finger once the press is not a quick tap, and then
      // follows it there (tick() eases it up and slides the view at the edges).
      const now = performance.now();
      if (g.lifts && g.press.move(e.clientX, e.clientY) && g.liftAt === null) g.liftAt = now;
      if (g.lifts && g.liftAt !== null) { aimLifted(now); return; }
      // The preview follows the finger; over a button or off the map there is none (nothing
      // would be placed there).
      hover = onFloor(e.clientX, e.clientY);
      notePointer(e.clientX, e.clientY, hover);
      return;
    }
    if (g.mode === 'wait') {
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < TAP_SLOP_PX) return;
      // It is a drag. With the belt it lays a line from where it started; with nothing held it
      // moves the view.
      if (isLine(tool) && builds() && g.tile) { g.mode = 'build'; startTouchBuild(g.tile); } else g.mode = 'pan';
    }
    if (g.mode === 'pan') {
      renderer.pan((g.lx - e.clientX) / z, (g.ly - e.clientY) / z);
    } else if (g.mode === 'build' && tdrag) {
      const t = renderer.tileAt(e.clientX, e.clientY);
      hover = t;
      notePointer(e.clientX, e.clientY, t);
      send(tdrag.moveTo(t, dir));
    }
    g.lx = e.clientX; g.ly = e.clientY;
  }

  function onTouchUp(e) {
    if (!touches.has(e.pointerId)) return;
    touches.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    const g = gesture;
    if (!g) return;
    if (g.kind === 'two') {
      // One finger left of a pinch carries on moving the view, and never builds.
      if (touches.size === 1) {
        const [id, f] = [...touches.entries()][0];
        gesture = { kind: 'one', id, x0: f.x, y0: f.y, lx: f.x, ly: f.y, tile: null, mode: 'pan' };
      } else if (!touches.size) gesture = null;
      return;
    }
    if (e.pointerId !== g.id) return;
    gesture = null;
    if (g.mode === 'place') {
      // Acts once: a lifted building where its preview is, anything else on the tile the finger
      // lifted from, if that is the floor itself. (A second finger may have put the tool down
      // meanwhile, with the bar's DROP button.)
      let t = null;
      if (e.type === 'pointerup' && placesOne()) {
        const up = g.lifts && g.liftAt !== null && BUILD[tool];
        t = up ? liftTarget(e.clientX, e.clientY, tool, liftFraction(performance.now() - g.liftAt)) : onFloor(e.clientX, e.clientY);
      }
      if (t) placeAt(t); else hover = null;
    } else if (g.mode === 'build') endTouchBuild();
    else if (g.mode === 'wait' && e.type === 'pointerup') touchTap(g.tile);
    else if (g.mode === 'wire') {
      // A drag from a building sets its wire; a tap steps it on; a tap on anything else is refused.
      if (wdrag) { if (e.type === 'pointerup') wireUp(); else wdrag = null; } else if (e.type === 'pointerup' && g.tile && !isOffice()) wireDown(g.id, g.tile);
    } else if (g.mode === 'reinforce') {
      // A tap reinforces the crate tapped; a drag has done its work as it went.
      if (!rdrag && e.type === 'pointerup' && g.tile && !isOffice()) reinforceDown(g.id, g.tile);
      rdrag = null;
    }
  }

  // ---- Dragging a building out of the bar (0.3.03) -------------------------------------------------
  // A finger (or pen) pressed on a building's button in the bar and moved mostly upward picks that
  // building up: its lifted preview follows the finger over the floor, and lifting the finger places
  // one there. Nothing about what is held changes, so what was held before is held again after. A
  // mostly sideways move is left to the browser, which scrolls the bar (the bar's CSS allows it
  // sideways pans only, touch-action: pan-x) and then cancels the pointer. A plain tap is the
  // button's click, as always; the click that may follow a drag is swallowed.
  // The click a drag's button may still get once the finger lifts: { btn, until }, or null. A new
  // press on the bar clears it, so a real tap straight after a drop still counts.
  let swallow = null;

  /** Ends a drag from the bar; `cancelled`: a second finger or the browser stopped it. */
  function dropCarry(cancelled) {
    const c = carry;
    if (!c) return;
    carry = null;
    if (!c.picked) return;
    swallow = { btn: c.btn, until: performance.now() + 500 };
    try { c.btn.releasePointerCapture(c.id); } catch { /* already released */ }
    hover = null;
    if (cancelled) playSound('click');
  }

  function onCarryMove(e) {
    const c = carry;
    if (!c || e.pointerId !== c.id) return;
    c.lx = e.clientX; c.ly = e.clientY;
    const floor = canvas.getBoundingClientRect();
    if (!c.picked) {
      const g = barGesture(e.clientX - c.x0, e.clientY - c.y0, e.clientY < floor.bottom);
      if (g === 'scroll') { carry = null; return; }
      if (g !== 'pick' || isOffice() || !BUILD[c.kind]) return;
      c.picked = true;
      selected = null; // a building's sheet would cover the bottom of the floor
      // Keep hearing this finger once it is over the floor (an element under it would otherwise
      // get its moves).
      try { c.btn.setPointerCapture(c.id); } catch { /* the window still hears it */ }
      c.onPick();
      playSound('select');
    }
    if (e.clientY < floor.bottom - EDGE.bandPx) c.above = true;
    aimLifted(performance.now());
  }

  function onCarryUp(e) {
    const c = carry;
    if (!c || e.pointerId !== c.id) return;
    if (!c.picked) { carry = null; return; } // a tap: the button's click does what it always did
    const t = e.type === 'pointerup' && !isOffice() ? liftTarget(e.clientX, e.clientY, c.kind, 1) : null;
    dropCarry(e.type !== 'pointerup');
    // Lifted off the floor, or under the bar or a panel: nothing, quietly.
    if (t) send([{ c: 'place', k: c.kind, x: t.x, y: t.y, d: dir }]);
  }

  /**
   * Lets the buildings in the bar be dragged onto the floor. `el` holds the bar's buttons (each with
   * data-k); `onPick` runs when a building is picked up (the bar hides its tooltip).
   */
  function watchBar(el, { onPick = () => {} } = {}) {
    el.addEventListener('pointerdown', (e) => {
      swallow = null;
      if (!fingerish(e) || carry || touches.size || isOffice()) return;
      const btn = e.target && e.target.closest ? e.target.closest('[data-k]') : null;
      const k = btn && btn.dataset.k;
      // Only buildings: the Rebuild and Remove tools are tapped, as before.
      if (!BUILD[k]) return;
      carry = { id: e.pointerId, kind: k, btn, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, picked: false, above: false, onPick };
    });
    el.addEventListener('click', (e) => {
      const w = swallow;
      if (!w) return;
      swallow = null;
      if (performance.now() < w.until && w.btn.contains(e.target)) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }
  // On the window, so the finger is heard wherever it goes and whatever is under it.
  addEventListener('pointermove', onCarryMove, true);
  addEventListener('pointerup', onCarryUp, true);
  addEventListener('pointercancel', onCarryUp, true);

  // ---- Keyboard --------------------------------------------------------------------------------
  const typing = (e) => {
    const tag = e.target && e.target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;
  };
  const panKey = (e) => (PAN_KEYS[e.key] ? e.key : e.key.length === 1 && PAN_KEYS[e.key.toLowerCase()] ? e.key.toLowerCase() : null);

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (typing(e)) return;
    if (!session.state) return;
    const key = e.key;
    const pk = panKey(e);
    if (pk) { held.add(pk); e.preventDefault(); return; }
    const lower0 = key.length === 1 ? key.toLowerCase() : key;
    // P pauses the whole game for everyone, or carries on (0.3.02). Anyone may, Head Office too.
    if (lower0 === 'p') {
      e.preventDefault();
      if (!e.repeat) togglePause();
      return;
    }
    // Head Office keeps only the camera keys (and Escape for dialogs).
    // Tab looks at the other floor (0.4), for everyone, Head Office too: it only moves the view. It
    // must not move the keyboard focus about the page, as Tab otherwise does.
    if (key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      if (!e.repeat) setFloor(floor ? 0 : 1);
      return;
    }
    if (isOffice() && !['f', 'h', 'Home', 'Escape'].includes(lower0)) return;
    let digit = /^[0-9]$/.test(key) ? key : null;
    if (!digit && /^(Digit|Numpad)[0-9]$/.test(e.code)) digit = e.code.slice(-1);
    if (digit === null && (key === '-' || key === '=')) digit = key;
    if (digit !== null) {
      // In The Back, 1 to 5 are its parts (0.4).
      const keys = floor ? BACK_KEYS : BUILD_KEYS;
      const i = (floor ? BACK_HOTKEYS : HOTKEYS).indexOf(digit);
      if (i >= 0) { setTool(tool === keys[i] ? null : keys[i]); e.preventDefault(); }
      return;
    }
    const lower = key.length === 1 ? key.toLowerCase() : key;
    if (lower === 'x' || key === 'Delete' || key === 'Backspace') {
      setTool(tool === 'remove' ? null : 'remove');
      e.preventDefault();
    } else if (lower === WIRE_KEY || lower === REINFORCE_KEY) {
      // The shop floor's Wire and Reinforce tools (0.4). In The Back they do nothing.
      const k = lower === WIRE_KEY ? 'wire' : 'reinforce';
      e.preventDefault();
      if (!e.repeat) setTool(tool === k ? null : k);
    } else if (lower === 'r') {
      e.preventDefault();
      if (tool && BUILD[tool]) {
        dir = (dir + (e.shiftKey ? 3 : 1)) & 3;
        playSound('rotate');
        onChange();
      } else if (!tool && hover) {
        const b = at(hover);
        if (b && BUILD[b.k]?.rot) turn(hover);
      }
    } else if (lower === 'b') {
      e.preventDefault();
      // (With Shift or without: Shift+B switched auto-rebuild until 0.3.04, and there is none now.)
      rebuild();
    } else if (lower === 'f') {
      e.preventDefault();
      renderer.fit?.();
    } else if (lower === 'h' || key === 'Home') {
      e.preventDefault();
      goHome();
    } else if (key === 'Escape') {
      if (drag) { drag = null; return; }
      if (wdrag || rdrag) { wdrag = null; rdrag = null; return; }
      if (onEscape()) return;
      setTool(null);
    }
  }

  function onKeyUp(e) {
    const pk = PAN_KEYS[e.key] ? e.key : e.key.length === 1 ? e.key.toLowerCase() : null;
    if (pk) held.delete(pk);
  }

  // ---- Other players' pointers -------------------------------------------------------------------
  const offCursor = session.on('cursor', (m) => {
    if (m.pid === session.me || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
    cursors.set(m.pid, { x: m.x, y: m.y, t: performance.now() });
  });

  /** Once per animation frame. */
  function tick(now) {
    const dt = Math.min(0.1, lastTick ? (now - lastTick) / 1000 : 0);
    lastTick = now;
    if (held.size && renderer.pan) {
      let dx = 0, dy = 0;
      for (const k of held) { dx += PAN_KEYS[k][0]; dy += PAN_KEYS[k][1]; }
      if (dx || dy) {
        const step = (PAN_PX_PER_SEC * dt) / (renderer.cam.zoom || 32) / Math.hypot(dx, dy);
        renderer.pan(dx * step, dy * step);
      }
    }
    // A finger placing a lifted building: the preview finishes rising, and near an edge of the floor
    // the view slides that way, with the preview's tile following the floor under a still finger.
    const l = lifted(now);
    if (l && renderer.pan && dt > 0) {
      const v = edgeVelocity(l.x, l.y, canvas.getBoundingClientRect(), { bottom: l.bottom });
      if (v.vx || v.vy) renderer.pan(v.vx * dt, v.vy * dt);
    }
    if (l) aimLifted(now);
    for (const [pid, c] of cursors) if (now - c.t > CURSOR_TTL_MS) cursors.delete(pid);
    if (cursorDirty && pointer && now - lastCursorSent >= CURSOR_EVERY_MS) {
      cursorDirty = false;
      lastCursorSent = now;
      session.sendCursor(Math.round(pointer.x * 100) / 100, Math.round(pointer.y * 100) / 100);
    }
  }

  // ---- The on-screen buttons of a touch screen (touch.js) -------------------------------------------
  /** What the rotate button would turn: the held building's facing, or the selected building. */
  function canRotate() {
    if (isOffice()) return false;
    if (placeKind()) return !!BUILD[placeKind()];
    const b = selected && at(selected);
    return !!(b && BUILD[b.k]?.rot);
  }

  /** The rotate button: as the R key, with the tapped building in place of the one under the mouse. */
  function rotate() {
    if (!canRotate()) return false;
    if (placeKind()) {
      dir = (dir + 1) & 3;
      onChange();
      playSound('rotate');
    } else turn(selected);
    return true;
  }

  /** Selects a tile's building (as a finger tap does), or clears the selection with null. */
  function select(t) {
    selected = anchorTile(t);
    if (!tool) hover = selected;
  }

  /**
   * Where the finger placing something is ({ x, y } in page pixels), or null when no finger is.
   * A placement is one finger down with something held that it will place: any building, the
   * Remove tool, or a building dragged out of the bar. touch.js shows the Rotate
   * button and the cancel hint meanwhile.
   */
  function placing() {
    if (isOffice()) return null;
    if (carry && carry.picked) return { x: carry.lx, y: carry.ly };
    const g = gesture;
    if (!g || g.kind !== 'one') return null;
    const on = g.mode === 'place' || (isLine(tool) && (g.mode === 'build' || (g.mode === 'wait' && !!g.tile)))
      || (g.mode === 'wire' && !!wdrag) || g.mode === 'reinforce';
    return on ? { x: g.lx, y: g.ly } : null;
  }

  /** The wire direction being tried, for the floor's preview: { x, y, d }, or null. */
  const tryWire = { x: 0, y: 0, d: 0 };
  function wirePreview() {
    if (wireFixed) return wireFixed;
    if (!wdrag || wdrag.d === null) return null;
    tryWire.x = wdrag.x; tryWire.y = wdrag.y; tryWire.d = wdrag.d;
    return tryWire;
  }

  // What a plain click with the Wire tool on the building under the mouse would do (the floor labels
  // it), worked out again only when the tile or the layout changes: each direction is a flood fill.
  let nextKey = '', nextDir = null;
  function wireNext() {
    const s = session.state;
    if (tool !== 'wire' || !hover || !s || wdrag) return null;
    const key = `${hover.x},${hover.y},${s.gridVer},${s.phase},${s.pause ? 1 : 0}`;
    if (key !== nextKey) {
      nextKey = key;
      nextDir = wireBuilding(s, hover.x, hover.y) ? clickWireDir(s, session.me, hover.x, hover.y) : null;
    }
    return nextDir;
  }

  const view = { tool: null, dir: 0, hover: null, aim: false, lift: null, cursors, floor: 0, wirePreview: null, wireNext: null };
  const liftAt = { x: 0, y: 0 };
  function getView() {
    view.tool = placeKind();
    view.dir = dir;
    view.hover = hover;
    view.floor = floor;
    view.wirePreview = floor ? null : wirePreview();
    view.wireNext = floor ? null : wireNext();
    // The dashed lines along the tile's row and column, for a finger hiding the tile it acts on;
    // a lifted preview is not under the finger, and gets a thin line down to the finger instead.
    // (Not for a wire being dragged out: the finger is beside the building, not on it.)
    const l = lifted();
    view.aim = !!placing() && !l && tool !== 'wire';
    view.lift = null;
    if (l && hover) {
      const r = canvas.getBoundingClientRect(), cam = renderer.cam;
      liftAt.x = cam.x + (l.x - (r.left + r.width / 2)) / cam.zoom;
      liftAt.y = cam.y + (l.y - (r.top + r.height / 2)) / cam.zoom;
      view.lift = liftAt;
    }
    return view;
  }

  const onContext = (e) => e.preventDefault();
  const onBlur = () => {
    held.clear();
    finishDrag();
    // Fingers lifted while the page was in the background never report it.
    touches.clear();
    gesture = null;
    endTouchBuild();
    dropCarry(true);
    wdrag = null;
    rdrag = null;
  };
  // Stop the middle button turning the pointer into the browser's scroll compass.
  const onMouseDown = (e) => { if (e.button === 1) e.preventDefault(); };
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('contextmenu', onContext);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', onBlur);

  return {
    get tool() { return tool; },
    /** The floor being looked at: 0 the shop, 1 The Back (0.4). */
    get floor() { return floor; },
    setFloor,
    /** Test pages only (?hover=x,y): puts the mouse on a tile, for a screenshot of the preview. */
    setHover(t) { hover = t; },
    /**
     * Test pages only (?wireprev=x,y,d): shows a wire direction as if it were being tried ({ x, y, d },
     * or null to stop), for a screenshot of the preview.
     */
    setWirePreview(p) { wireFixed = p && Number.isInteger(p.x) && Number.isInteger(p.y) && Number.isInteger(p.d) ? { x: p.x, y: p.y, d: p.d } : null; },
    /** A wire direction being tried with the Wire tool ({ x, y, d }), or null. */
    get wirePreview() { return wirePreview(); },
    get dir() { return dir; },
    get hover() { return hover; },
    /** The building a finger tapped with nothing held, or null. */
    get selected() { return selected; },
    /** A finger placing something: where it is, or null (see placing() above). */
    get placing() { return placing(); },
    /** What is being placed: a building dragged from the bar, or else the held tool. */
    get placingKind() { return placeKind(); },
    /** A building is being dragged out of the bar (it has left its button). */
    get carrying() { return !!(carry && carry.picked); },
    watchBar,
    setTool,
    rebuild,
    togglePause,
    goHome,
    rotate,
    canRotate,
    select,
    tick,
    view: getView,
    destroy() {
      offCursor();
      removeEventListener('keydown', onKeyDown);
      removeEventListener('keyup', onKeyUp);
      removeEventListener('blur', onBlur);
      removeEventListener('pointermove', onCarryMove, true);
      removeEventListener('pointerup', onCarryUp, true);
      removeEventListener('pointercancel', onCarryUp, true);
    },
  };
}
