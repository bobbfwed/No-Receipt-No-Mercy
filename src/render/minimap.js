// The minimap: the whole store drawn small on its own canvas, for a corner of the interface.
// Walls, floor, the machines' marked floor tinted in each kind's colour, tills, entrances (light
// when open, dark when shut), buildings coloured by group over their whole footprint
// (factory orange, security blue), shoppers as dots (dads light blue, supers bigger and gold),
// wreckage, and a white frame showing what the main view shows.
//
//   const mini = createMinimap(canvas, session, renderer);
//   mini.draw();                  a few times a second
//   mini.tileAt(clientX, clientY) -> {x, y} tile under a click on the minimap, or null
//                                 (then renderer.centerOn(x + 0.5, y + 0.5))
import { BUILD, ZONES, sizeOf } from '../sim/index.js';
import { INK } from './paint.js';

const COL = {
  wall: [45, 52, 60], floor: [141, 144, 147], till: [217, 55, 43], shut: [70, 76, 84], open: [236, 240, 244],
  factory: [245, 140, 30], security: [60, 150, 255], rubble: [110, 96, 80],
};
const SHOPPER = '#ff4d4d', DAD = '#5cc8ff', SUPER = '#ffd23f';

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** Marked floor for the machines: the floor grey well mixed with each kind's colour. */
const ZONE_COL = {};
for (const [ch, z] of Object.entries(ZONES)) {
  ZONE_COL[ch] = rgb(z.color).map((v, j) => Math.round(v * 0.6 + COL.floor[j] * 0.4));
}

/**
 * @param {HTMLCanvasElement} canvas the minimap's own canvas (sized by the page with CSS)
 * @param {Object} session
 * @param {Object} renderer the main renderer, for its view rectangle
 */
export function createMinimap(canvas, session, renderer) {
  const ctx = canvas.getContext('2d');
  // One pixel per tile; drawn scaled up without smoothing.
  const img = document.createElement('canvas');
  const ig = img.getContext('2d');
  let data = null;
  // Where the map sits on the minimap, in CSS pixels: offset and pixels per tile.
  let mx = 0, my = 0, k = 1, mw = 0, mh = 0;
  let cssW = 1, cssH = 1;

  function layout(s) {
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, rect.width || canvas.clientWidth || 200);
    cssH = Math.max(1, rect.height || canvas.clientHeight || 110);
    const dpr = globalThis.devicePixelRatio || 1;
    const W = Math.max(1, Math.round(cssW * dpr)), H = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    mw = s.w; mh = s.h;
    k = Math.min(cssW / mw, cssH / mh);
    mx = (cssW - mw * k) / 2;
    my = (cssH - mh * k) / 2;
  }

  function paintTiles(s) {
    if (img.width !== s.w || img.height !== s.h || !data) {
      img.width = s.w; img.height = s.h;
      data = ig.createImageData(s.w, s.h);
    }
    const px = data.data, tiles = s.tiles, grid = s.grid, n = s.w * s.h;
    // Open entrances light, shut ones dark (an entrance is nobody's, so no player colours).
    const doorCol = new Map();
    (s.doors || []).forEach((door, d) => {
      const c = d < s.open ? COL.open : COL.shut;
      for (const i of door) doorCol.set(i, c);
    });
    const zones = s.zones && s.zones.length === n ? s.zones : '';
    for (let i = 0; i < n; i++) {
      const ch = tiles[i];
      let c = ch === '#' ? COL.wall : ch === 'T' ? COL.till : ch === 'D' || ch === 'd' ? (doorCol.get(i) || COL.shut) : COL.floor;
      if (zones && c === COL.floor && ZONE_COL[zones[i]]) c = ZONE_COL[zones[i]];
      const b = grid[i];
      if (b && BUILD[b.k]) c = BUILD[b.k].group === 'security' ? COL.security : COL.factory;
      const o = i * 4;
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
    }
    if (s.rubble) {
      // A big building's rubble covers its whole footprint.
      for (const r of s.rubble) {
        const i = Array.isArray(r) ? r[0] : r.i, k = Array.isArray(r) ? r[1] : r.k;
        if (!(i >= 0 && i < n) || !BUILD[k]) continue;
        const [fw, fh] = sizeOf(k, BUILD[k].rot ? (Array.isArray(r) ? r[2] : r.d) | 0 : 0);
        for (let dy = 0; dy < fh; dy++) {
          for (let dx = 0; dx < fw; dx++) {
            const j = i + dy * s.w + dx;
            if (j >= n || grid[j]) continue;
            const o = j * 4; px[o] = COL.rubble[0]; px[o + 1] = COL.rubble[1]; px[o + 2] = COL.rubble[2];
          }
        }
      }
    }
    ig.putImageData(data, 0, 0);
  }

  function draw() {
    const s = session.state;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!s) return;
    layout(s);
    paintTiles(s);
    const dk = canvas.width / cssW;
    ctx.setTransform(dk, 0, 0, dk, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, mx, my, mw * k, mh * k);
    ctx.imageSmoothingEnabled = true;
    // Shoppers: normal ones as small dots, then dads, then supers on top.
    const r = Math.max(1.2, k * 0.45);
    for (let pass = 0; pass < 3; pass++) {
      ctx.beginPath();
      for (const sh of s.shoppers) {
        const sup = !!sh.sup, dad = sh.k === 'dad';
        if ((pass === 2) !== sup || (pass === 1) !== (dad && !sup)) continue;
        const rr = sup ? r * 1.7 : r;
        ctx.rect(mx + sh.x * k - rr, my + sh.y * k - rr, rr * 2, rr * 2);
      }
      ctx.fillStyle = pass === 2 ? SUPER : pass === 1 ? DAD : SHOPPER;
      ctx.fill();
      if (pass === 2) { ctx.lineWidth = 1; ctx.strokeStyle = INK; ctx.stroke(); }
    }
    // The main view.
    const v = renderer.viewRect();
    const x0 = Math.max(0, v.x0), y0 = Math.max(0, v.y0), x1 = Math.min(mw, v.x1), y1 = Math.min(mh, v.y1);
    if (x1 > x0 && y1 > y0) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeRect(mx + x0 * k, my + y0 * k, (x1 - x0) * k, (y1 - y0) * k);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeRect(mx + x0 * k, my + y0 * k, (x1 - x0) * k, (y1 - y0) * k);
    }
  }

  function tileAt(clientX, clientY) {
    const s = session.state;
    if (!s) return null;
    layout(s);
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (cssW / Math.max(1, rect.width));
    const py = (clientY - rect.top) * (cssH / Math.max(1, rect.height));
    if (px < 0 || py < 0 || px > cssW || py > cssH) return null;
    // A click in the margin beside the map counts as the nearest edge tile.
    const x = Math.max(0, Math.min(mw - 1, Math.floor((px - mx) / k)));
    const y = Math.max(0, Math.min(mh - 1, Math.floor((py - my) / k)));
    return { x, y };
  }

  return { draw, tileAt };
}
