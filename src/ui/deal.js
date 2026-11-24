// The deal (0.3.01): when every player is ready, the game's five cards fly in one at a time over the
// dimmed floor, each held large in the middle long enough to read, then shrink and slide up into
// their slots in the strip at the top of the floor (src/ui/hand.js) as the next one arrives.
//
// Everything here follows the state (phase 'cards' and its clock: dealView in cardart.js), never a
// timer of its own started when a message arrives: every player sees the same card at the same
// moment, and a player who joins or reloads mid-deal lands in the right place. The movement itself
// is the browser's (Web Animations), wound to the moment the state says and nudged back if it
// drifts. Each side lands with its own effect and sound (bad: a red flash, a shake and cracks;
// good: a burst of gold coins; odd: a wobble and a purple swirl). With reduced motion the cards
// fade in and slide without spinning, shaking or wobbling.
import { cardsShown } from '../sim/index.js';
import { h, setText, setClass } from './dom.js';
import { cardEl } from './hand.js';
import { dealView, slotsFilled, faceOf, FLY, SLIDE } from './cardart.js';

/** Where each card flies in from: [x in vw, y in vh, turns of spin in degrees], card by card. */
const FROM = [[75, -65, -540], [-75, -60, 540], [80, 55, -450], [-80, 50, 450], [0, -95, 720]];
/** What the line under the heading says while a card of each side is in the middle. */
const SIDE_SUB = {
  bad: "This one's going to hurt.",
  good: "Don't get used to it.",
  odd: "Even HR doesn't know what this one does.",
};
/**
 * Cracks across a bad card's picture when it lands (inline SVG over its window, stretched to fit): a
 * white line with a dark edge, from a corner, splitting as it goes. Two versions, card by card.
 */
const crackPath = (d) => `<path d="${d}" fill="none" stroke="#111" stroke-width="2.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`
  + `<path d="${d}" fill="none" stroke="#fff" stroke-width="1.1" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
const CRACKS = [
  'M100 4L82 18 86 27 70 36 74 47 58 55M82 18l-10 2M70 36l8 10M74 47l-14-3M0 92l14-6 6 4 12-9 2-8M20 90l4 8',
  'M0 8l16 10 2 10 14 6 2 12 12 6M18 28l-10 6M32 34l10-6M100 70L86 74 84 84 70 88 66 100M86 74l6 8M70 88l-6-6',
].map((d) => `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">${crackPath(d)}</svg>`);
/** How far (ms) the animation may drift from the state before it is put back. */
const DRIFT_MS = 250;

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {Object} session
 * @param {Object} o
 * @param {Object} o.strip the strip of slots (createHandStrip), which the cards slide into
 * @param {(name: string, opts?: Object) => void} [o.playSound]
 * @returns {{el: HTMLElement, update: (s: Object) => number}} update returns how many slots show
 *   their card (all of them, Infinity, when no deal is on)
 */
export function createDeal(session, { strip, playSound = () => {} }) {
  const head = h('h2', { class: 'deal-head' });
  const sub = h('p', { class: 'deal-sub' });
  const flash = h('div', { class: 'deal-flash', 'aria-hidden': 'true' });
  const table = h('div', { class: 'deal-table' });
  const count = h('span', { class: 'deal-count' });
  const skip = h('button', {
    type: 'button', class: 'btn-big btn-yellow deal-skip',
    onclick: () => {
      const me = session.state && session.state.players[session.me];
      playSound('click');
      session.send({ c: 'skipCards', on: !(me && me.skip) });
    },
  }, 'Skip');
  const el = h('section', { class: 'deal hidden', role: 'dialog', 'aria-label': 'The deal of the cards' },
    flash, h('div', { class: 'deal-top', 'aria-live': 'polite' }, head, sub), table, h('div', { class: 'deal-foot' }, skip, count));

  // (A game screen torn down mid-deal, by a host hand-over, may have left this on the page.)
  document.body.classList.remove('dealing');
  /** The big cards on the table: i -> { el, card, anim, landed, leaving } */
  const live = new Map();
  let on = false, filled = 0, topPx = -1, startedSound = false;

  /** A card arrives: it flies in from off screen with a spin and lands in the middle. */
  function enter(c, fresh) {
    const f = faceOf(c.id);
    const side = f ? f.side : 'odd';
    const card = cardEl(c.id, { size: 'big', dress: session.state?.holiday, n: c.i, of: session.state?.cards?.length || 5 });
    const wrap = h('div', { class: `deal-card is-${side}` },
      h('div', { class: 'deal-swirl', 'aria-hidden': 'true' }),
      h('div', { class: 'deal-burst', 'aria-hidden': 'true' }, Array.from({ length: 20 }, (_, k) => {
        const coin = h('i');
        coin.style.setProperty('--a', `${k * 18 + c.i * 7}deg`);
        coin.style.setProperty('--d', `${18 + (k % 4) * 4}rem`);
        return coin;
      })),
      card);
    // (Across the picture's window, like broken glass, clear of the words.)
    if (side === 'bad') card.querySelector('.cc-art')?.append(h('span', { class: 'deal-cracks', 'aria-hidden': 'true', html: CRACKS[c.i % CRACKS.length] }));
    table.append(wrap);
    const [x, y, r] = FROM[c.i % FROM.length];
    const keys = reduced()
      ? [{ opacity: 0, transform: 'translateY(1.5rem) scale(0.96)' }, { opacity: 1, transform: 'none' }]
      : [
        { transform: `translate(${x}vw, ${y}vh) rotate(${r}deg) scale(0.3)` },
        { transform: `translate(0, 0) rotate(${-Math.sign(r) * 4}deg) scale(1.06)`, offset: 0.78 },
        { transform: 'none' },
      ];
    const anim = wrap.animate(keys, { duration: FLY * 1000, easing: 'cubic-bezier(0.2, 0.75, 0.35, 1)', fill: 'both' });
    anim.currentTime = c.since * 1000;
    const b = { el: wrap, card, anim, side, landed: false, leaving: false, start: performance.now() - c.since * 1000 };
    live.set(c.i, b);
    // Only a card seen arriving makes its noise (not one already there when this player joined).
    if (fresh) playSound('cardIn', { side, i: c.i });
    return b;
  }

  /** It lands: the side's effect (the classes start CSS animations; reduced motion turns them off). */
  function land(b, fresh) {
    b.landed = true;
    b.el.classList.add('landed');
    if (!fresh) { b.el.classList.add('settled'); return; }
    flash.className = `deal-flash is-${b.side}`;
    void flash.offsetWidth; // restart the flash
    flash.classList.add('go');
  }

  /** It shrinks and slides up into its slot. */
  function leave(b, c) {
    b.leaving = true;
    const slot = strip.slot(c.i);
    const a = b.el.getBoundingClientRect();
    let to = 'translateY(-60vh) scale(0.2)';
    if (slot && a.width) {
      const t = slot.getBoundingClientRect();
      const dx = t.left + t.width / 2 - (a.left + a.width / 2);
      const dy = t.top + t.height / 2 - (a.top + a.height / 2);
      to = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${(t.width / a.width).toFixed(3)})`;
    }
    b.anim.cancel();
    b.el.classList.add('leaving');
    b.anim = b.el.animate([{ transform: 'none' }, { transform: to }], { duration: SLIDE * 1000, easing: 'cubic-bezier(0.55, 0, 0.75, 0.2)', fill: 'forwards' });
    b.anim.currentTime = c.since * 1000;
  }

  /** Keeps a running animation where the state says it should be (a tab in the background, a stall). */
  function sync(anim, since) {
    const want = since * 1000;
    if (anim && Math.abs((anim.currentTime ?? 0) - want) > DRIFT_MS) anim.currentTime = want;
  }

  function clear() {
    for (const b of live.values()) b.el.remove();
    live.clear();
  }

  function update(s) {
    const v = dealView(s);
    const now = !!v && v.dealing;
    if (now !== on) {
      on = now;
      setClass(el, 'hidden', !on);
      document.body.classList.toggle('dealing', on);
      if (!on) { clear(); topPx = -1; startedSound = false; }
    }
    if (!on) return Infinity;
    // The cards sit below the strip of slots, whatever height the top bar has on this screen.
    const r = strip.el.firstChild.getBoundingClientRect();
    const top = Math.round(r.bottom);
    if (top !== topPx && r.height) { topPx = top; el.style.setProperty('--deal-top', `${top}px`); }
    if (!startedSound) { startedSound = true; if (v.secs < 1) playSound('cardDeal'); }

    for (const c of v.cards) {
      let b = live.get(c.i);
      if (c.place === 'centre') {
        if (!b) b = enter(c, c.since < 0.35);
        else sync(b.anim, c.since);
        if (!b.landed && c.since >= FLY) land(b, c.since - FLY < 0.4);
      } else if (c.place === 'slot' && b) {
        if (c.since >= SLIDE) { b.el.remove(); live.delete(c.i); continue; }
        if (!b.leaving) leave(b, c);
        else sync(b.anim, c.since);
      }
    }

    // A card has just dropped into its slot: a click, and for the last one the hand's fanfare.
    const n = slotsFilled(v);
    if (n > filled) {
      const last = v.cards[n - 1];
      if (last && last.since < SLIDE + 0.4) playSound(n === v.cards.length ? 'cardHand' : 'cardSlot', { i: n - 1 });
    }
    filled = n;

    // The words over the table.
    if (v.done) {
      setText(head, "THAT'S YOUR HAND");
      setText(sub, 'Now go and lose with it. Tap the cards up top to read them again.');
    } else {
      setText(head, 'HEAD OFFICE HAS DEALT YOU A HAND');
      const c = v.centre >= 0 ? faceOf(v.cards[v.centre].id) : null;
      setText(sub, c ? `Card ${v.centre + 1} of ${v.cards.length}. ${SIDE_SUB[c.side]}` : `${v.cards.length} cards. Two to screw you, two to help, one nobody asked for.`);
    }
    // Skip: everyone connected has to want it (one press, solo).
    const store = s.players.filter((p) => p.on && p.side !== 'office');
    const want = store.filter((p) => p.skip).length;
    const me = s.players[session.me];
    setText(skip, me && me.skip ? (store.length > 1 ? 'Waiting... (cancel)' : 'Skipping') : v.done ? 'Get on with it' : 'Skip');
    setClass(skip, 'is-on', !!(me && me.skip));
    setText(count, store.length > 1 ? `${want} of ${store.length} want to skip` : '');
    setClass(el, 'is-done', v.done);
    // (cardsShown is the rules' own count; the screen reader hears each card's name as it lands.)
    el.setAttribute('aria-description', `${cardsShown(s)} of ${v.cards.length} cards dealt`);
    return n;
  }

  return { el, update };
}
