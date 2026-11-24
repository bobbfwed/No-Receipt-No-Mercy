// Mouse, keyboard and touch: picking tools, building, upgrading and removing on the canvas,
// rotating, moving the view around the map, and telling the other players where this player is
// pointing.
//
// Fingers (pointer events with pointerType 'touch') follow their own rules, below the mouse code:
//   - two fingers always move the view (drag) and zoom it (pinch), and never build
//   - one finger with nothing held drags the view; a tap on a building selects it (touch.js then
//     offers rotate, upgrade and remove for it)
//   - one finger with a building held (not the belt), or the Remove or Upgrade tool, places: the
//     preview follows the finger while it is down, and the building is placed (or removed, or its
//     sheet opened) once, on the tile the finger lifts from. Lifted off the floor, or over a
//     button or panel, it does nothing. (The owner's request, 0.3.01: a drag used to build a row.)
//   - with the belt held, a tap lays one and a drag lays a line, as the mouse does
//   - a second finger on the floor while the first is placing cancels it: nothing more is built
//     when either lifts (belts already laid by a drag stay), and the two fingers move the view
// Nothing is built until the finger has either lifted or (a belt) moved a little, so a second
// finger that lands a moment after the first turns the touch into a pinch before anything is placed.
// touch.js shows a Rotate button and a "second finger cancels" hint while a finger is placing.
import { BUILD, doorOf, anchorOf } from '../sim/index.js';
import { startDrag } from './drag.js';

export const BUILD_KEYS = Object.keys(BUILD);
/** Hotkeys 1-9 then 0, in the order of BUILD. */
// (The first ten keep the keys they have always had; the two newer buildings follow on the same row.)
const KEY_OF = { belt: '1', unpacker: '2', press: '3', packer: '4', chute: '5', crate: '6', sprinkler: '7', forklift: '8', wetfloor: '9', samples: '0', railgun: '-', salesman: '=' };
export const HOTKEYS = BUILD_KEYS.map((k) => KEY_OF[k] || '');
/** Tools that are not buildings. */
const TOOLS = ['remove', 'upgrade'];

const CURSOR_EVERY_MS = 100; // at most 10 pointer updates a second
const CURSOR_TTL_MS = 3000;
const PAN_PX_PER_SEC = 950; // how fast WASD moves the view, in screen pixels
const PAN_KEYS = {
  w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0],
  ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0],
};
const TAP_SLOP_PX = 10; // a finger that moves less than this is a tap, not a drag

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
  const held = new Set(); // view-moving keys that are down
  const cursors = new Map(); // player id -> { x, y, t }

  const grid = () => session.state?.grid;
  const at = (t) => grid()?.[t.y * session.state.w + t.x];
  const hasBuilding = (t) => !!at(t);
  /** The top-left tile of the building on a tile (a big building is selected as a whole). */
  function anchorTile(t) {
    const s = session.state;
    if (!t || !s || !at(t)) return null;
    const i = anchorOf(s, t.y * s.w + t.x);
    return { x: i % s.w, y: (i / s.w) | 0 };
  }
  // Head Office cannot touch the store: no tools, no building, no removing. He keeps the camera.
  const isOffice = () => session.state?.players[session.me]?.side === 'office';

  function setTool(k) {
    const next = k && !isOffice() && (BUILD[k] || TOOLS.includes(k)) ? k : null;
    if (next === tool) return;
    tool = next;
    if (tool && tool !== 'upgrade') selected = null;
    canvas.dataset.tool = tool || '';
    if (tool) playSound('select');
    onChange();
  }

  function send(cmds) {
    let did = null;
    for (const c of cmds) {
      // The host answers at once. A client hears nothing back unless it is refused, so assume yes.
      const r = session.send(c);
      if (!r || r.ok) did = c.c;
    }
    if (did === 'place' || did === 'remove') playSound(did);
    if (did === 'upgrade' || did === 'rebuild') playSound(did);
  }

  /** Puts back everything of this player's that gym bros have wrecked, as far as his cash goes. */
  function rebuild() {
    if (isOffice()) return;
    send([{ c: 'rebuild' }]);
  }

  /** Flips this player's auto-rebuild switch (Shift+B). */
  function toggleAutoRebuild() {
    const me = session.state?.players[session.me];
    if (isOffice() || !me) return;
    playSound('click');
    session.send({ c: 'autoRebuild', on: !me.autoRebuild });
  }

  /** Upgrades the building on a tile, if there is one that can be. */
  function upgrade(t, track) {
    const b = t && at(t);
    if (!b) return;
    send([track ? { c: 'upgrade', x: t.x, y: t.y, t: track } : { c: 'upgrade', x: t.x, y: t.y }]);
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
    if (e.pointerType === 'touch') { onTouchMove(e); return; }
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
  }

  function onPointerDown(e) {
    if (e.pointerType === 'touch') { onTouchDown(e); return; }
    if (drag || grab) return;
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
    // With the Upgrade tool, or with nothing held, a click on a building opens its sheet
    // (what it has, what each upgrade costs, rotate, remove). A click on bare floor closes it.
    if (e.button === 0 && (tool === 'upgrade' || !tool)) { e.preventDefault(); selected = anchorTile(t); return; }
    let mode = null;
    if (e.button === 2 || tool === 'remove') mode = 'remove';
    else if (tool) mode = 'build';
    if (!mode) return;
    e.preventDefault();
    // A building bigger than one tile is placed one at a time: dragging would only pile refusals up.
    if (mode === 'build' && BUILD[tool].size) { send([{ c: 'place', k: tool, x: t.x, y: t.y, d: dir }]); return; }
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not supported: drag still works inside */ }
    // Dragging belt over belts that are already there turns them, so those tiles are not skipped.
    const taken = mode === 'build' && tool === 'belt' ? (tile) => { const b = at(tile); return !!b && b.k !== 'belt'; } : hasBuilding;
    const planner = startDrag({ mode, kind: tool, start: t, dir, hasBuilding: taken });
    drag = { planner, button: e.button, id: e.pointerId };
    send(planner.first);
  }

  function finishDrag(e) {
    if (e && e.pointerType === 'touch') { onTouchUp(e); return; }
    if (grab && (!e || e.pointerId === undefined || e.pointerId === grab.id)) {
      try { canvas.releasePointerCapture(grab.id); } catch { /* already released */ }
      grab = null;
    }
    if (!drag || (e && e.pointerId !== undefined && e.pointerId !== drag.id)) return;
    const d = drag;
    drag = null;
    send(d.planner.end(dir));
    try { canvas.releasePointerCapture(d.id); } catch { /* already released */ }
  }

  function onPointerLeave(e) {
    // A finger "leaves" every time it lifts; what it last touched stays marked.
    if (e && e.pointerType === 'touch') return;
    if (!drag) hover = null;
  }

  // ---- Touch -------------------------------------------------------------------------------------
  const touches = new Map(); // pointer id -> { x, y } of each finger on the floor
  // What the fingers are doing:
  //   { kind: 'one', id, x0, y0, lx, ly, tile, mode: 'wait' | 'pan' | 'build' | 'place' }
  //     'wait': not yet known whether it is a tap or a drag (nothing held, or the belt)
  //     'build': a belt line being laid; 'place': one building, tool action on the lift tile
  //   { kind: 'two', dist, mx, my }
  let gesture = null;
  let tdrag = null; // a line being built by one finger: the drag planner

  const builds = () => !isOffice() && (tool === 'remove' || !!BUILD[tool]);
  /** What is held acts once, where the finger lifts (everything but the belt; see the top). */
  const placesOne = () => !isOffice() && !!tool && tool !== 'belt' && (builds() || tool === 'upgrade');

  /** The finger is over the floor itself: on the map, and not under a button or panel. */
  function onFloor(x, y) {
    const t = renderer.tileAt(x, y);
    if (!t) return null;
    const doc = canvas.ownerDocument;
    const top = doc && doc.elementFromPoint ? doc.elementFromPoint(x, y) : canvas;
    return top === canvas ? t : null;
  }

  /** One finger lifted (or tapped) on tile t with something held that acts once. */
  function placeAt(t) {
    if (!t || !session.state || isOffice()) return;
    hover = t;
    if (tool === 'upgrade') { selected = anchorTile(t); return; }
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
    const taken = (tile) => { const b = at(tile); return !!b && b.k !== 'belt'; };
    tdrag = startDrag({ mode: 'build', kind: 'belt', start: t, dir, hasBuilding: taken });
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
    if (tool === 'belt') { hover = t; startTouchBuild(t); endTouchBuild(); return; }
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
    if (touches.size === 1) {
      const t = renderer.tileAt(e.clientX, e.clientY);
      gesture = { kind: 'one', id: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, tile: t, mode: placesOne() ? 'place' : 'wait' };
      // Show the ghost of what is held under the finger straight away.
      if (builds() || tool === 'upgrade') hover = t;
      notePointer(e.clientX, e.clientY, t);
    } else if (touches.size === 2) {
      // A second finger on the floor cancels what the first was placing (belts a drag has already
      // laid stay; the one still under the finger is not laid), and the two move the view.
      const g = gesture;
      const placing = g && g.kind === 'one' && (g.mode === 'place' || (g.mode !== 'pan' && tool === 'belt'));
      tdrag = null;
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
    if (g.mode === 'place') {
      // The preview follows the finger; over a button or off the map there is none (nothing
      // would be placed there).
      hover = onFloor(e.clientX, e.clientY);
      notePointer(e.clientX, e.clientY, hover);
      g.lx = e.clientX; g.ly = e.clientY;
      return;
    }
    if (g.mode === 'wait') {
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < TAP_SLOP_PX) return;
      // It is a drag. With the belt it lays a line from where it started; with nothing held it
      // moves the view.
      if (tool === 'belt' && builds() && g.tile) { g.mode = 'build'; startTouchBuild(g.tile); } else g.mode = 'pan';
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
      // Acts once, on the tile the finger lifted from, if that is the floor itself.
      // (A second finger may have put the tool down meanwhile, with the bar's DROP button.)
      const t = e.type === 'pointerup' && placesOne() ? onFloor(e.clientX, e.clientY) : null;
      if (t) placeAt(t); else hover = null;
    } else if (g.mode === 'build') endTouchBuild();
    else if (g.mode === 'wait' && e.type === 'pointerup') touchTap(g.tile);
  }

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
    // Head Office keeps only the camera keys (and Escape for dialogs).
    if (isOffice() && !['f', 'h', 'Home', 'Escape'].includes(lower0)) return;
    let digit = /^[0-9]$/.test(key) ? key : null;
    if (!digit && /^(Digit|Numpad)[0-9]$/.test(e.code)) digit = e.code.slice(-1);
    if (digit === null && (key === '-' || key === '=')) digit = key;
    if (digit !== null) {
      const i = HOTKEYS.indexOf(digit);
      if (i >= 0) { setTool(tool === BUILD_KEYS[i] ? null : BUILD_KEYS[i]); e.preventDefault(); }
      return;
    }
    const lower = key.length === 1 ? key.toLowerCase() : key;
    if (lower === 'x' || key === 'Delete' || key === 'Backspace') {
      setTool(tool === 'remove' ? null : 'remove');
      e.preventDefault();
    } else if (lower === 'u') {
      // With the mouse on a building, upgrade it (whatever is held: the training shift hands you
      // the Upgrade tool and then says "press U"); otherwise pick up or put down the upgrade tool.
      e.preventDefault();
      if (hover && at(hover) && BUILD[at(hover).k].up) upgrade(hover);
      else setTool(tool === 'upgrade' ? null : 'upgrade');
    } else if (lower === 'r') {
      e.preventDefault();
      if (tool && BUILD[tool]) {
        dir = (dir + (e.shiftKey ? 3 : 1)) & 3;
        playSound('rotate');
        onChange();
      } else if (!tool && hover) {
        const b = at(hover);
        if (b && BUILD[b.k]?.rot) { session.send({ c: 'rotate', x: hover.x, y: hover.y }); playSound('rotate'); }
      }
    } else if (lower === 'b') {
      e.preventDefault();
      if (e.shiftKey) toggleAutoRebuild(); else rebuild();
    } else if (lower === 'f') {
      e.preventDefault();
      renderer.fit?.();
    } else if (lower === 'h' || key === 'Home') {
      e.preventDefault();
      goHome();
    } else if (key === 'Escape') {
      if (drag) { drag = null; return; }
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
    if (tool) return !!BUILD[tool];
    const b = selected && at(selected);
    return !!(b && BUILD[b.k]?.rot);
  }

  /** The rotate button: as the R key, with the tapped building in place of the one under the mouse. */
  function rotate() {
    if (!canRotate()) return false;
    if (tool) {
      dir = (dir + 1) & 3;
      onChange();
    } else {
      session.send({ c: 'rotate', x: selected.x, y: selected.y });
    }
    playSound('rotate');
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
   * Remove or the Upgrade tool. touch.js shows the Rotate button and the cancel hint meanwhile.
   */
  function placing() {
    const g = gesture;
    if (!g || g.kind !== 'one' || isOffice()) return null;
    const on = g.mode === 'place' || (tool === 'belt' && (g.mode === 'build' || (g.mode === 'wait' && !!g.tile)));
    return on ? { x: g.lx, y: g.ly } : null;
  }

  const view = { tool: null, dir: 0, hover: null, aim: false, cursors };
  function getView() {
    view.tool = tool;
    view.dir = dir;
    view.hover = hover;
    view.aim = !!placing();
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
    get dir() { return dir; },
    get hover() { return hover; },
    /** The building a finger tapped with nothing held, or null. */
    get selected() { return selected; },
    /** A finger placing something: where it is, or null (see placing() above). */
    get placing() { return placing(); },
    setTool,
    rebuild,
    toggleAutoRebuild,
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
    },
  };
}
