// Shared colours, fonts and small drawing helpers for the renderer.
// Everything is drawn in "logical" world pixels: one tile is TILE pixels, the world is 1200 x 640.
// The renderer sets a canvas transform that scales this to the screen.

export const TILE = 40;

/** The dark outline used on everything, for the flat cartoon look. */
export const INK = '#1d2125';

export const C = {
  floor: '#8d9093', floorLine: '#7d8083', floorDot: '#7f8285', joint: '#74777b',
  wall: '#2d343c', wallTop: '#3e4852', wallLip: '#4b5662',
  yellow: '#f2c21b', yellowDark: '#c99a0c', orange: '#ff8c1a', orangeDark: '#d96b0b',
  red: '#d9372b', redDark: '#a5241b', green: '#3fae49', greenDark: '#23772c', blue: '#2f8fe0', blueDark: '#1a5fa0',
  cardboard: '#c8924f', cardboardLight: '#e8c88a', cardboardDark: '#96652d',
  wood: '#d6a467', woodDark: '#9c6b33',
  glass: 'rgba(154,215,240,0.72)', screen: '#bfe6ff',
  steel: '#a3a9b0', steelDark: '#5b6168', steelLight: '#d4d8dc',
  belt: '#34383d', beltDark: '#272a2e', chevron: '#e2b519',
  skin: '#f2c9a0', skinDark: '#d9a77a', white: '#ffffff', paper: '#fbfbf4',
};

export const FONT_FAMILY = '"Segoe UI", "Trebuchet MS", Arial, sans-serif';
const fontCache = new Map();
/** A bold font string of the given size, cached so per-frame text does not build strings. */
export function font(size, weight = 800) {
  const key = size * 1000 + weight;
  let f = fontCache.get(key);
  if (!f) { f = `${weight} ${size}px ${FONT_FAMILY}`; fontCache.set(key, f); }
  return f;
}

/** Adds a rounded rectangle to a new path. */
export function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Fills the current path and outlines it in ink. lw 0 means no outline. */
export function paint(ctx, fill, lw = 2) {
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); }
}

export function box(ctx, x, y, w, h, r, fill, lw = 2) {
  rr(ctx, x, y, w, h, r);
  paint(ctx, fill, lw);
}

export function circle(ctx, x, y, r, fill, lw = 2) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  paint(ctx, fill, lw);
}

/** A stroked line in a colour (not ink unless asked). */
export function line(ctx, x1, y1, x2, y2, color, lw = 2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

/** Centred bold text with a thick dark outline, the cartoon caption style. */
export function label(ctx, str, x, y, size, fill, outline = INK, outlineW = 0) {
  ctx.font = font(size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (outline) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = outlineW || Math.max(2.5, size * 0.28);
    ctx.strokeStyle = outline;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(str, x, y);
}

/** Plain centred text, no outline. */
export function text(ctx, str, x, y, size, fill, weight = 800) {
  ctx.font = font(size, weight);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fill;
  ctx.fillText(str, x, y);
}

/** Fills a rectangle with diagonal yellow and black hazard stripes. */
export function hazard(ctx, x, y, w, h, stripe = 8) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = C.yellow;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#222';
  ctx.beginPath();
  for (let s = -h; s < w + h; s += stripe * 2) {
    ctx.moveTo(x + s, y + h);
    ctx.lineTo(x + s + stripe, y + h);
    ctx.lineTo(x + s + stripe + h, y);
    ctx.lineTo(x + s + h, y);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.strokeRect(x, y, w, h);
}

/** A five-pointed star path centred on (x, y). */
export function starPath(ctx, x, y, r, rot = 0) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = rot + (k * Math.PI) / 5 - Math.PI / 2;
    const rad = k % 2 ? r * 0.45 : r;
    if (k) ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    else ctx.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
}

/** Cheap deterministic hash of two integers to [0, 1), for decoration that must not flicker. */
export function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A colour on a green-yellow-red ramp for a share 0..1 (1 = green). */
export function ramp(f) {
  return f > 0.6 ? '#4ade80' : f > 0.3 ? '#facc15' : '#ef4444';
}

/**
 * Pre-renders a small drawing into an offscreen canvas at the current screen scale, so it can be
 * stamped many times per frame with one drawImage. `draw(ctx)` draws centred on (0, 0) within
 * +-size/2 logical pixels.
 */
export function makeSprite(size, scale, draw) {
  const c = document.createElement('canvas');
  const px = Math.max(1, Math.ceil(size * scale));
  c.width = px;
  c.height = px;
  const g = c.getContext('2d');
  g.setTransform(px / size, 0, 0, px / size, size / 2 * (px / size), size / 2 * (px / size));
  draw(g);
  return { canvas: c, size };
}
