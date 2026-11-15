// PLACEHOLDER renderer: plain coloured squares, enough to prove the game runs.
// The real renderer replaces this file and keeps the same interface (see docs/architecture.md).
import { W, H, BUILD, canPlace } from '../sim/index.js';

const TILE = 40;
const COLORS = {
  belt: '#444', unpacker: '#2b7bd6', press: '#f97316', packer: '#7dd3fc', chute: '#16a34a', crate: '#a16207',
  sprinkler: '#dc2626', forklift: '#eab308', wetfloor: '#fde047', samples: '#f472b6',
};

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Object} session a HostSession or ClientSession
 */
export function createRenderer(canvas, session) {
  const ctx = canvas.getContext('2d');
  let scale = 1;

  function resize() {
    const dpr = globalThis.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    scale = Math.min(canvas.width / (W * TILE), canvas.height / (H * TILE));
  }

  function tileAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / Math.max(1, rect.width);
    const x = Math.floor(((clientX - rect.left) * dpr) / (TILE * scale));
    const y = Math.floor(((clientY - rect.top) * dpr) / (TILE * scale));
    return x >= 0 && y >= 0 && x < W && y < H ? { x, y } : null;
  }

  function draw(view = {}) {
    const s = session.state;
    session.drainFx();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(0, 0, W * TILE, H * TILE);
    if (!s) return;
    for (let i = 0; i < W * H; i++) {
      const x = (i % W) * TILE, y = ((i / W) | 0) * TILE;
      const t = s.tiles[i];
      if (t !== '.') {
        ctx.fillStyle = t === '#' ? '#374151' : t === 'D' ? '#facc15' : '#ef4444';
        ctx.fillRect(x, y, TILE, TILE);
      }
      const b = s.grid[i];
      if (b) {
        ctx.fillStyle = COLORS[b.k] || '#000';
        ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
      }
    }
    const a = session.alpha();
    for (const sh of s.shoppers) {
      ctx.fillStyle = sh.k === 'dad' ? '#1d4ed8' : '#111827';
      ctx.beginPath();
      ctx.arc((sh.x + sh.vx * a) * TILE, (sh.y + sh.vy * a) * TILE, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    if (view.hover && view.tool && BUILD[view.tool]) {
      ctx.fillStyle = canPlace(s, view.tool, view.hover.x, view.hover.y) ? 'rgba(220,38,38,.5)' : 'rgba(34,197,94,.5)';
      ctx.fillRect(view.hover.x * TILE, view.hover.y * TILE, TILE, TILE);
    }
  }

  return { resize, tileAt, draw };
}
