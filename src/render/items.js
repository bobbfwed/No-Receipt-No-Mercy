// The cardboard box a Forklift Turret throws: on its forks while loaded, and in flight (effects.js).
// Pre-rendered into a small sprite on resize. (Until 0.4 this also drew the old shop-floor
// factory's goods, of which the box was the first; The Back draws its own items, in back.js.)
import { C, box, text, makeSprite } from './paint.js';

/** Sprite size in logical pixels (the box is about 16 x 14 inside it). */
const SIZE = 24;

const DRAW = {
  box(g) {
    box(g, -8, -6.5, 16, 13, 2, C.cardboard, 2);
    g.fillStyle = C.cardboardLight;
    g.fillRect(-1.8, -5.5, 3.6, 11);
    g.lineWidth = 1;
    g.strokeStyle = C.cardboardDark;
    g.beginPath();
    g.moveTo(-8, -3); g.lineTo(-2, -3); g.moveTo(2, -3); g.lineTo(8, -3);
    g.stroke();
    text(g, '?', -4.6, 1.8, 8, '#5a3510', 900);
    text(g, '?', 4.6, 1.8, 8, '#5a3510', 900);
  },
};

/** Builds the sprites for the current screen scale. */
export function buildItemSprites(scale) {
  const out = {};
  for (const k of Object.keys(DRAW)) out[k] = makeSprite(SIZE, scale, DRAW[k]);
  return out;
}

/** Draws a sprite ('box') centred at (x, y). `size` shrinks it (on the forks, in flight). */
export function drawItem(ctx, sprites, kind, x, y, size = SIZE) {
  const s = sprites[kind];
  if (!s) return;
  ctx.drawImage(s.canvas, x - size / 2, y - size / 2, size, size);
}
