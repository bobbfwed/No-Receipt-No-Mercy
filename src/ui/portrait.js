// A picture of one shopper, drawn with the game's own drawing code, for the Employee Handbook
// (and for the pictures in README.md, which are photographs of tools/portrait.html).
import { ST } from '../sim/index.js';
import { drawShopper, drawKid, createShopperSprites } from '../render/shoppers.js';

/** The drawing code's ready-made pictures, kept per scale (portraits come in a few sizes). */
const spriteSets = new Map();

/**
 * @param {string} k a key of SHOPPERS
 * @param {Object} [o]
 * @param {boolean} [o.sup] the super version
 * @param {number} [o.size] width and height in CSS pixels
 * @returns {HTMLCanvasElement}
 */
export function shopperPortrait(k, { sup = false, size = 72 } = {}) {
  const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.className = `portrait${sup ? ' is-super' : ''}`;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  // The picture is a square box around the figure, in the drawing code's own units: bigger for
  // a super (who is drawn 1.3 times the size, with a crown) and for the two who bring company.
  // The cosplayer's costume is half as tall again as anyone else, and his mech suit bigger still.
  const wide = k === 'mom' || k === 'blind' || k === 'scooter';
  const tall = k === 'cosplay';
  const box = tall ? (sup ? 122 : 84) : (sup ? 82 : 58) + (wide ? 6 : 0);
  const z = (size * dpr) / box;
  const key = Math.round(z * 1000);
  if (!spriteSets.has(key)) { const made = createShopperSprites(); made.setScale(z); spriteSets.set(key, made); }
  const sprites = spriteSets.get(key);
  const g = canvas.getContext('2d');
  g.setTransform(z, 0, 0, z, 0, 0);
  const s = {
    id: 3, k, sup: sup ? 1 : 0, x: 0, y: 0, vx: 0.05, vy: 0, hp: 30, mhp: 30, st: ST.WALK, t: 0, cd: 0,
    kd: k === 'mom' ? 2 : 0, kx: 0, ky: 0, kvx: 0, kvy: 0, bt: 0,
  };
  const F = { time: 0.35, now: 350, alpha: 0 };
  const x = box / 2 - (k === 'mom' ? 12 : k === 'blind' ? 5 : 0);
  const y = box / 2 + (tall ? (sup ? 37 : 18) : sup ? 17 : 10);
  drawShopper(g, s, x, y, 1, F, sprites, { noBar: true });
  // A mom is not herself without the kid she is chasing.
  if (k === 'mom') drawKid(g, s, x + 26, y + 4, -1, F, sprites);
  return canvas;
}
