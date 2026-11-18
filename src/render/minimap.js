// The minimap: the whole store drawn small on its own canvas, for a corner of the interface.
// Walls, floor, the machines' marked floor tinted in each kind's colour, tills, entrances (light
// when open, dark when shut), buildings coloured by group over their whole footprint
// (factory orange, security blue), shoppers as dots (dads light blue, supers bigger and gold, the
// boss a big pink star), the food court's furniture in its own colours (tables white, stalls red,
// the fountain blue...), the car park's tarmac and what is parked on it (cars in two tones, so a
// row reads as a row of cars; the prick's car gold, the burger van orange, trolley shelters glassy
// blue, islands green), wreckage, and a white frame showing what the main view shows.
//
//   const mini = createMinimap(canvas, session, renderer);
//   mini.draw();                  a few times a second
//   mini.tileAt(clientX, clientY) -> {x, y} tile under a click on the minimap, or null
//                                 (then renderer.centerOn(x + 0.5, y + 0.5))
import { BUILD, ZONES, sizeOf } from '../sim/index.js';
import { INK } from './paint.js';

const COL = {
  wall: [45, 52, 60], floor: [141, 144, 147], till: [217, 55, 43], shut: [70, 76, 84], open: [236, 240, 244],
  factory: [245, 140, 30], security: [60, 150, 255], rubble: [110, 96, 80], food: [190, 178, 154],
  park: [127, 134, 143],
};
/**
 * Furniture by decor character (state.decor). The food court: tables, benches, planters, bins,
 * stalls, fountain. The car park: a car's two halves (body and windscreen end), a trolley
 * shelter's, the prick across two bays, the islands with their lamp posts and pay machines, a
 * trolley and a coned-off pothole in the lanes, and the burger van.
 */
const FURN = {
  t: [242, 238, 228], b: [140, 50, 45], p: [35, 95, 45], n: [60, 70, 75], k: [215, 45, 60], f: [60, 170, 235],
  c: [200, 202, 206], C: [92, 112, 136], r: [150, 196, 218], R: [150, 196, 218], x: [222, 178, 50],
  i: [92, 128, 66], l: [232, 214, 120], m: [60, 98, 168], a: [196, 202, 210], o: [255, 140, 26], v: [235, 120, 40],
};
const CAR_DARK = { c: FURN.c.map((v) => Math.round(v * 0.82)), C: FURN.C.map((v) => Math.round(v * 0.8)) };
const SHOPPER = '#ff4d4d', DAD = '#5cc8ff', SUPER = '#ffd23f', BOSS_COL = '#ff2a6d';

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
    // The food court and the car park: their own floor colours, and their furniture in colours of its own.
    const decor = typeof s.decor === 'string' && s.decor.length === n ? s.decor : '';
    const design = s.map && s.map.design;
    const floor = design === 'food' ? COL.food : design === 'carpark' ? COL.park : COL.floor;
    for (let i = 0; i < n; i++) {
      const ch = tiles[i];
      let c = ch === '#' ? (decor && FURN[decor[i]]) || COL.wall : ch === 'T' ? COL.till : ch === 'D' || ch === 'd' ? (doorCol.get(i) || COL.shut) : floor;
      // Parked cars touch nose to tail; every other row a shade darker keeps them apart.
      if (decor && (decor[i] === 'c' || decor[i] === 'C') && ((i / s.w) | 0) & 1) c = c === FURN.c ? CAR_DARK.c : CAR_DARK.C;
      if (zones && c === floor && ZONE_COL[zones[i]]) c = ZONE_COL[zones[i]];
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
    // The boss: a big red star with a white rim, on top of everything, throbbing.
    const pulse = 1 + 0.25 * Math.sin(performance.now() / 160);
    for (const sh of s.shoppers) {
      if (sh.k !== 'boss') continue;
      const R = Math.max(4.5, k * 1.6) * pulse;
      const cx = mx + sh.x * k, cy = my + sh.y * k;
      ctx.beginPath();
      for (let j = 0; j < 10; j++) {
        const a = (j * Math.PI) / 5 - Math.PI / 2, rad = j % 2 ? R * 0.45 : R;
        if (j) ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        else ctx.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = BOSS_COL;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = INK;
      ctx.stroke();
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
