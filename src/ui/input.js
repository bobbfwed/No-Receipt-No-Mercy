// Mouse and keyboard: picking tools, building and removing on the canvas, rotating, and telling the
// other players where this player is pointing.
import { BUILD, W, H } from '../sim/index.js';
import { startDrag } from './drag.js';

export const BUILD_KEYS = Object.keys(BUILD);
/** Hotkeys 1-9 then 0, in the order of BUILD. */
export const HOTKEYS = BUILD_KEYS.map((_, i) => (i < 9 ? String(i + 1) : i === 9 ? '0' : ''));

const CURSOR_EVERY_MS = 100; // at most 10 pointer updates a second
const CURSOR_TTL_MS = 3000;

/**
 * @param {Object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {Object} o.renderer  { tileAt }
 * @param {Object} o.session
 * @param {() => boolean} [o.onEscape] return true if Escape was used for something else (a dialog)
 * @param {() => void} [o.onChange] called when the tool or direction changes
 */
export function createInput({ canvas, renderer, session, onEscape = () => false, onChange = () => {} }) {
  let tool = null;
  let dir = 0;
  let hover = null;
  let drag = null; // { planner, button }
  let pointer = null; // last pointer position in tiles (decimals) over the canvas
  let cursorDirty = false;
  let lastCursorSent = 0;
  let calib = null; // { ox, oy, tw, th } client pixels of the grid, for decimal tile positions
  const cursors = new Map(); // player id -> { x, y, t }

  const grid = () => session.state?.grid;
  const hasBuilding = (t) => !!grid()?.[t.y * W + t.x];

  function setTool(k) {
    const next = k && (BUILD[k] || k === 'remove') ? k : null;
    if (next === tool) return;
    tool = next;
    canvas.dataset.tool = tool || '';
    onChange();
  }

  function send(cmds) {
    for (const c of cmds) session.send(c);
  }

  // ---- Where the grid is on screen -------------------------------------------------------------
  // The renderer only gives whole tiles. For the shared pointer we want decimals, so we find the
  // grid's edges once per resize by probing tileAt along the middle of the canvas.
  function calibrate() {
    const r = canvas.getBoundingClientRect();
    calib = null;
    if (r.width < 4 || r.height < 4) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let x0 = null, x1 = null, y0 = null, y1 = null;
    for (let px = Math.floor(r.left); px <= Math.ceil(r.right); px++) {
      if (renderer.tileAt(px + 0.5, cy)) { if (x0 === null) x0 = px; x1 = px; }
    }
    for (let py = Math.floor(r.top); py <= Math.ceil(r.bottom); py++) {
      if (renderer.tileAt(cx, py + 0.5)) { if (y0 === null) y0 = py; y1 = py; }
    }
    if (x0 === null || y0 === null) return;
    calib = { ox: x0, oy: y0, tw: (x1 - x0 + 1) / W, th: (y1 - y0 + 1) / H };
  }

  function exactTile(clientX, clientY, t) {
    if (calib) {
      const x = (clientX - calib.ox) / calib.tw, y = (clientY - calib.oy) / calib.th;
      // Trust the renderer's tile; keep the decimals inside it.
      if (t && Math.floor(x) === t.x && Math.floor(y) === t.y) return { x, y };
      if (!t) return x >= 0 && y >= 0 && x < W && y < H ? { x, y } : null;
    }
    return t ? { x: t.x + 0.5, y: t.y + 0.5 } : null;
  }

  // ---- Pointer ---------------------------------------------------------------------------------
  function onPointerMove(e) {
    const t = renderer.tileAt(e.clientX, e.clientY);
    hover = t;
    const p = exactTile(e.clientX, e.clientY, t);
    if (p && (!pointer || p.x !== pointer.x || p.y !== pointer.y)) { pointer = p; cursorDirty = true; }
    if (drag) send(drag.planner.moveTo(t, dir));
  }

  function onPointerDown(e) {
    if (drag) return;
    if (e.button !== 0 && e.button !== 2) return;
    const t = renderer.tileAt(e.clientX, e.clientY);
    hover = t;
    if (!t || !session.state) return;
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
  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
    if (!session.state) return;
    const key = e.key;
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
    } else if (lower === 'r') {
      e.preventDefault();
      if (tool && tool !== 'remove') {
        dir = (dir + (e.shiftKey ? 3 : 1)) & 3;
        onChange();
      } else if (!tool && hover) {
        const b = grid()?.[hover.y * W + hover.x];
        if (b && BUILD[b.k]?.rot) session.send({ c: 'rotate', x: hover.x, y: hover.y });
      }
    } else if (key === 'Escape') {
      if (drag) { drag = null; return; }
      if (onEscape()) return;
      setTool(null);
    }
  }

  // ---- Other players' pointers -------------------------------------------------------------------
  const offCursor = session.on('cursor', (m) => {
    if (m.pid === session.me || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
    cursors.set(m.pid, { x: m.x, y: m.y, t: performance.now() });
  });

  /** Once per animation frame. */
  function tick(now) {
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
  const onBlur = () => finishDrag();
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('contextmenu', onContext);
  addEventListener('keydown', onKeyDown);
  addEventListener('blur', onBlur);

  return {
    get tool() { return tool; },
    get dir() { return dir; },
    setTool,
    calibrate,
    tick,
    view: getView,
    destroy() {
      offCursor();
      removeEventListener('keydown', onKeyDown);
      removeEventListener('blur', onBlur);
    },
  };
}
