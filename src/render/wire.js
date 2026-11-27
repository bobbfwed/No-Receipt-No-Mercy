// Razor Wire on the shop floor (0.4, stage 4b): drawing only. Where the wire is comes from
// wireplan.js (worked out from the layout and cached against gridVer); this file paints it.
//
//   const art = createWireArt();
//   art.setScale(r)                      when the zoom crosses a resolution step (sprites repainted)
//   art.draw(ctx, s, vis, F)             every wire on screen: planned wire as a faint dashed coil,
//                                        live wire as a dark steel coil with barbs, purple tags and
//                                        glints, over the floor and the buildings it crosses
//   art.drawPreview(ctx, s, prev, pid)   a wire direction being tried ({ x, y, d }): green where it
//                                        may go, red where the rules would refuse it
//
// The look follows the Razor Wire item in back.js (a dark barbed coil with a purple tag). Each tile
// of wire is one sprite, a run of four loops along the wire, painted once per resolution step for
// each way the wire can run, so a long fence costs one drawImage a tile. The loops are spaced so a
// run of tiles reads as one unbroken coil. On the building itself only the side the wire leaves from
// is wound, so the building can still be seen.
import { canWire, wireTiles, sizeOf, BUILD, DIRS } from '../sim/index.js';
import { TILE, INK, rr, label, makeSprite, hash2 } from './paint.js';
import { wireLayout } from './wireplan.js';

const T = TILE, TAU = Math.PI * 2;
/** A wire tile's sprite box: a tile and a margin for the loops that reach over its edges. */
const BOX = 56;
const HALF = BOX / 2;
/** Loops along one tile, and their size (see the top: they join up across tiles). */
const LOOPS = [-15, -5, 5, 15];
const RX = 9, RY = 15, TILT = 0.32;

/** Steel colours, as the Razor Wire item's, a shade darker on the floor. */
const STEEL = '#5f666e', STEEL_HI = '#e3e7eb';
const TAG = '#a855f7';

/** One tile of coil running east-west, centred on (0, 0), in a style. */
function coil(g, style) {
  g.lineCap = 'round';
  if (style === 'live' || style === 'tag') {
    // A dark band under it, so the wire reads on the pale floor as well as the dark, with a thin
    // purple edge (the supply's colour) along both sides.
    g.fillStyle = 'rgba(24,10,36,0.42)';
    g.fillRect(-20, -17, 40, 34);
    g.fillStyle = 'rgba(168,85,247,0.55)';
    g.fillRect(-20, -17, 40, 1.6);
    g.fillRect(-20, 15.4, 40, 1.6);
    // The back half of each loop first, darker, then the front half over it: a coil, not a chain.
    for (const x of LOOPS) {
      g.beginPath(); g.ellipse(x, 0, RX, RY, TILT, Math.PI, TAU);
      g.strokeStyle = INK; g.lineWidth = 3.4; g.stroke();
      g.strokeStyle = '#3a3f45'; g.lineWidth = 1.6; g.stroke();
    }
    for (const x of LOOPS) {
      g.beginPath(); g.ellipse(x, 0, RX, RY, TILT, 0, Math.PI);
      g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
      g.strokeStyle = STEEL; g.lineWidth = 2.2; g.stroke();
      // A glint along the front of each loop.
      g.beginPath(); g.ellipse(x, 0, RX, RY, TILT, 0.5, 1.3);
      g.strokeStyle = STEEL_HI; g.lineWidth = 1.2; g.stroke();
    }
    // Barbs: small crossed blades at the top and bottom of every loop.
    g.beginPath();
    for (const x of LOOPS) {
      for (const [bx, by] of [[x + 4, -RY + 1.5], [x - 4, RY - 1.5]]) {
        g.moveTo(bx - 2.3, by - 2.3); g.lineTo(bx + 2.3, by + 2.3);
        g.moveTo(bx + 2.3, by - 2.3); g.lineTo(bx - 2.3, by + 2.3);
      }
    }
    g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke();
    g.strokeStyle = '#c4cad0'; g.lineWidth = 1; g.stroke();
    if (style === 'tag') {
      // The purple tag the supply wears, clipped on now and then.
      rr(g, -1, 11, 8, 6, 1.2);
      g.fillStyle = TAG; g.fill();
      g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
    }
    return;
  }
  // Planned wire, or a direction being tried: dashed outlines of the same loops.
  const col = style === 'ok' ? '#86efac' : style === 'bad' ? '#fca5a5' : '#d8b4fe';
  if (style === 'ok' || style === 'bad') {
    g.fillStyle = style === 'ok' ? 'rgba(74,222,128,0.16)' : 'rgba(239,68,68,0.2)';
    g.fillRect(-20, -20, 40, 40);
  }
  g.setLineDash([3.5, 3]);
  for (const x of LOOPS) {
    g.beginPath(); g.ellipse(x, 0, RX, RY, TILT, 0, TAU);
    g.strokeStyle = 'rgba(15,10,25,0.6)'; g.lineWidth = 3; g.stroke();
    g.strokeStyle = col; g.lineWidth = 1.5; g.stroke();
  }
  g.setLineDash([]);
}

/** The sprites at one scale: by style, [east-west, north-south]. */
function sprites(scale) {
  const out = {};
  for (const style of ['live', 'tag', 'plan', 'ok', 'bad']) {
    out[style] = [0, 1].map((v) => makeSprite(BOX, scale, (g) => { if (v) g.rotate(Math.PI / 2); coil(g, style); }));
  }
  return out;
}

export function createWireArt() {
  let scale = 0, spr = null;
  const sp = () => (spr ||= sprites(scale || 1));

  /** One tile of wire running along direction d (0-3), centred on tile i. */
  function tile(ctx, s, i, d, style) {
    const c = sp()[style][d & 1].canvas;
    ctx.drawImage(c, (i % s.w) * T + T / 2 - HALF, ((i / s.w) | 0) * T + T / 2 - HALF, BOX, BOX);
  }

  /**
   * The wire wound along the side of a building it leaves from (footprint x, y, w, h in tiles),
   * squeezed flat against that edge.
   */
  function edge(ctx, f, d, style) {
    const along = d & 1 ? 0 : 1; // a wire running east-west leaves from a north-south edge
    const c = sp()[style][along].canvas;
    const [dx, dy] = DIRS[d];
    if (along === 0) {
      const ey = (dy > 0 ? f.y + f.h : f.y) * T;
      for (let k = 0; k < f.w; k++) ctx.drawImage(c, (f.x + k) * T + T / 2 - HALF, ey - 9, BOX, 18);
    } else {
      const ex = (dx > 0 ? f.x + f.w : f.x) * T;
      for (let k = 0; k < f.h; k++) ctx.drawImage(c, ex - 9, (f.y + k) * T + T / 2 - HALF, 18, BOX);
    }
  }

  const onScreen = (s, i, vis) => {
    const x = i % s.w, y = (i / s.w) | 0;
    return x >= vis.x0 && x < vis.x1 && y >= vis.y0 && y < vis.y1;
  };
  const boxOnScreen = (f, vis) => f.x + f.w >= vis.x0 && f.x <= vis.x1 && f.y + f.h >= vis.y0 && f.y <= vis.y1;

  /** Every wire on screen: planned first, then live over it. F.time makes the glints twinkle. */
  function draw(ctx, s, vis, F) {
    const list = wireLayout(s);
    if (!list.length) return;
    for (const w of list) {
      if (w.live) continue;
      ctx.globalAlpha = 0.8;
      for (const i of w.strip) if (onScreen(s, i, vis)) tile(ctx, s, i, w.d, 'plan');
      if (boxOnScreen(w, vis)) edge(ctx, w, w.d, 'plan');
      ctx.globalAlpha = 1;
    }
    for (const w of list) {
      if (!w.live) continue;
      for (const i of w.strip) if (onScreen(s, i, vis)) tile(ctx, s, i, w.d, hash2(i, 5) < 0.3 ? 'tag' : 'live');
      if (boxOnScreen(w, vis)) edge(ctx, w, w.d, 'live');
      // A glint running along the blades now and then, so live wire never looks dead.
      const t = F ? F.time : 0;
      for (const i of w.strip) {
        if (!onScreen(s, i, vis)) continue;
        const ph = (t * 0.7 + hash2(i, 9)) % 1;
        if (ph > 0.18) continue;
        const a = Math.sin((ph / 0.18) * Math.PI);
        const x = (i % s.w) * T + T / 2 + (hash2(i, 11) - 0.5) * 26, y = ((i / s.w) | 0) * T + T / 2 + (hash2(i, 13) - 0.5) * 18;
        glint(ctx, x, y, 2.5 + a * 3.5, a);
      }
    }
  }

  /** A four-pointed sparkle. */
  function glint(ctx, x, y, r, a) {
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(x - r, y); ctx.lineTo(x - r * 0.2, y - r * 0.2); ctx.lineTo(x, y - r); ctx.lineTo(x + r * 0.2, y - r * 0.2);
    ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.2, y + r * 0.2); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.2, y + r * 0.2);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // The preview's tiles and whether the rules allow it, worked out once per preview and layout.
  let pKey = '', pTiles = null, pOk = true, pFoot = null;
  /**
   * A wire direction being tried (prev: { x, y, d }) for player pid: the tiles it would cover, green
   * if the rules allow it and red if not, the side it leaves from, and an arrow to its far end.
   */
  function drawPreview(ctx, s, prev, pid) {
    if (!prev) return;
    const key = `${s.gridVer},${s.phase},${s.pause ? 1 : 0},${prev.x},${prev.y},${prev.d}`;
    if (key !== pKey) {
      pKey = key;
      pTiles = wireTiles(s, prev.x, prev.y, prev.d);
      pOk = canWire(s, pid, prev.x, prev.y, prev.d) === null;
      pFoot = null;
      if (pTiles.length) {
        const ai = pTiles[0], b = s.grid[ai];
        const [w, h] = sizeOf(b.k, BUILD[b.k].rot ? b.d | 0 : 0);
        pFoot = { x: ai % s.w, y: (ai / s.w) | 0, w, h, n: w * h };
      }
    }
    if (!pFoot) return;
    const f = pFoot, style = pOk ? 'ok' : 'bad';
    rr(ctx, f.x * T + 2, f.y * T + 2, f.w * T - 4, f.h * T - 4, 6);
    ctx.lineWidth = 3;
    ctx.strokeStyle = pOk ? '#22c55e' : '#ef4444';
    ctx.stroke();
    const d = prev.d;
    if (!(d >= 0 && d <= 3)) {
      label(ctx, 'NO WIRE', (f.x + f.w / 2) * T, f.y * T - 10, 11, '#ffffff', INK, 3.5);
      return;
    }
    for (let k = f.n; k < pTiles.length; k++) tile(ctx, s, pTiles[k], d, style);
    edge(ctx, f, d, style);
    // An arrow down the middle of the strip, out to its far end.
    const [dx, dy] = DIRS[d];
    const cx = (f.x + f.w / 2) * T, cy = (f.y + f.h / 2) * T;
    const sx = cx + dx * (f.w / 2) * T, sy = cy + dy * (f.h / 2) * T;
    let far = 0;
    for (let k = f.n; k < pTiles.length; k++) {
      const i = pTiles[k], tx = (i % s.w) + 0.5 - (f.x + f.w / 2), ty = ((i / s.w) | 0) + 0.5 - (f.y + f.h / 2);
      far = Math.max(far, (tx * dx + ty * dy) - (dx ? f.w / 2 : f.h / 2) + 0.5);
    }
    if (far <= 0) return;
    const ex = sx + dx * far * T, ey = sy + dy * far * T;
    ctx.beginPath();
    ctx.moveTo(sx, sy); ctx.lineTo(ex, ey);
    ctx.moveTo(ex - dx * 10 - dy * 7, ey - dy * 10 - dx * 7); ctx.lineTo(ex, ey); ctx.lineTo(ex - dx * 10 + dy * 7, ey - dy * 10 + dx * 7);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = pOk ? '#bbf7d0' : '#fecaca'; ctx.lineWidth = 2.5; ctx.stroke();
  }

  return {
    setScale(r) { if (r !== scale) { scale = r; spr = null; } },
    draw,
    drawPreview,
  };
}
