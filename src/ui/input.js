// Mouse and keyboard: picking tools, building, upgrading and removing on the canvas, rotating,
// moving the view around the map, and telling the other players where this player is pointing.
import { BUILD, doorOf } from '../sim/index.js';
import { startDrag } from './drag.js';

export const BUILD_KEYS = Object.keys(BUILD);
/** Hotkeys 1-9 then 0, in the order of BUILD. */
export const HOTKEYS = BUILD_KEYS.map((_, i) => (i < 9 ? String(i + 1) : i === 9 ? '0' : ''));
/** Tools that are not buildings. */
const TOOLS = ['remove', 'upgrade'];

const CURSOR_EVERY_MS = 100; // at most 10 pointer updates a second
const CURSOR_TTL_MS = 3000;
const PAN_PX_PER_SEC = 950; // how fast WASD moves the view, in screen pixels
const PAN_KEYS = {
  w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0],
  ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0],
};

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
  const held = new Set(); // view-moving keys that are down
  const cursors = new Map(); // player id -> { x, y, t }

  const grid = () => session.state?.grid;
  const at = (t) => grid()?.[t.y * session.state.w + t.x];
  const hasBuilding = (t) => !!at(t);

  function setTool(k) {
    const next = k && (BUILD[k] || TOOLS.includes(k)) ? k : null;
    if (next === tool) return;
    tool = next;
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
    if (did === 'upgrade' || did === 'rebuild') playSound('place');
  }

  /** Puts back everything of this player's that gym bros have wrecked, as far as his cash goes. */
  function rebuild() {
    send([{ c: 'rebuild' }]);
  }

  /** Upgrades the building on a tile, if there is one that can be. */
  function upgrade(t) {
    const b = t && at(t);
    if (!b) return;
    send([{ c: 'upgrade', x: t.x, y: t.y }]);
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
    if (drag || grab) return;
    if (e.button === 1 && renderer.pan) {
      // Middle button: drag the map.
      e.preventDefault();
      grab = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { canvas.setPointerCapture(e.pointerId); } catch { /* fine without */ }
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    const t = renderer.tileAt(e.clientX, e.clientY);
    hover = t;
    if (!t || !session.state) return;
    if (e.button === 0 && tool === 'upgrade') { e.preventDefault(); upgrade(t); return; }
    let mode = null;
    if (e.button === 2 || tool === 'remove') mode = 'remove';
    else if (tool) mode = 'build';
    if (!mode) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not supported: drag still works inside */ }
    const planner = startDrag({ mode, kind: tool, start: t, dir, hasBuilding });
    drag = { planner, button: e.button, id: e.pointerId };
    send(planner.first);
  }

  function finishDrag(e) {
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

  function onPointerLeave() {
    if (!drag) hover = null;
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
    let digit = /^[0-9]$/.test(key) ? key : null;
    if (!digit && /^(Digit|Numpad)[0-9]$/.test(e.code)) digit = e.code.slice(-1);
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
      // With the mouse on a building, upgrade it; otherwise pick up (or put down) the upgrade tool.
      e.preventDefault();
      if (tool !== 'upgrade' && hover && at(hover) && BUILD[at(hover).k].up) upgrade(hover);
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
      rebuild();
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

  const view = { tool: null, dir: 0, hover: null, cursors };
  function getView() {
    view.tool = tool;
    view.dir = dir;
    view.hover = hover;
    return view;
  }

  const onContext = (e) => e.preventDefault();
  const onBlur = () => { held.clear(); finishDrag(); };
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
    setTool,
    rebuild,
    goHome,
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
