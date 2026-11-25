// The INCOME panel (0.3.03, the owner's request: "recent income per minute (an average)", under the
// ON SHIFT and HAND windows; then: "Only count income from factory sales. Game time. Everyone's
// money (with a breakdown showing it's split x ways so x per player). On phone: compact, but can
// click on it to see more."). The figure is what the whole store's goods have been selling for
// over the last minute of game time, as dollars a minute, with a line saying how many ways it is
// split right now and what that is apiece. The arithmetic is src/ui/rate.js; the running total it
// reads is state.sales.
//
// On a big screen game.js places it in the left column (under the strip of cards, or under the
// players panel in a game without cards), as wide as the players panel, or beside them when there
// is no room below; hovering or focusing it shows what is counted. On a small screen it is a chip
// in the row at the top left, beside the cards ("+$1,240/min"); tapping it opens a small card with
// the rest, which stays until the chip is tapped again, something else is tapped, or its close
// mark is pressed. It floats, so it never resizes anything, and a click or tap on it never
// reaches the floor.
import { shareCount } from '../sim/index.js';
import { h, setText, setClass, money } from './dom.js';
import { createRate, splitOf, RATE_SECS, RATE_MIN_SECS } from './rate.js';

const TIP_COUNTED = 'What the whole store took for goods reaching a Shipping Chute, averaged over the last minute of play and given per minute. Game time: a paused game and the speed buttons do not change it.';
const TIP_LEFT_OUT = 'Not counted: the bonus at the end of a sales event, the boss\'s bounty, shoppers buying at a stand, restocking fees, and the lump the factory is paid when the doors open early. Refunds are not taken off: this is income, not profit.';
/** The phone card's one sentence. */
const CARD_COUNTED = 'Only goods sold at the Shipping Chutes, per minute of play. No bonuses, early-doors lump, stand sales or fees; refunds not taken off.';

/**
 * @param {Object} session the game's session (session.me is this player)
 * @returns {{el: HTMLElement, update: (s: Object) => boolean, place: (p: {x: number, y: number, w?: number, h?: number}|null) => void}}
 *   update samples the game and redraws, and says whether the panel shows; place puts it on the
 *   floor (with `w`, as the big screen's panel; without, as the small screen's chip, `h` tall;
 *   null hides it until placed again)
 */
export function createIncomePanel(session) {
  const rate = createRate();
  const trend = h('span', { class: 'inc-trend', 'aria-hidden': 'true' });
  const fig = h('b', { class: 'inc-fig' });
  const split = h('span', { class: 'inc-split hidden' });
  const sub = h('span', { class: 'inc-sub' });
  const chip = h('span', { class: 'inc-chip', 'aria-hidden': 'true' });
  const panel = h('section', {
    class: 'panel income', tabindex: '0', role: 'group', 'aria-label': 'Income per minute', 'aria-describedby': 'income-tip', 'aria-expanded': 'false',
  }, h('h3', null, 'INCOME', trend), h('div', { class: 'inc-main' }, fig, h('small', { class: 'inc-per' }, ' / min')), split, sub, chip);

  // Under it: on a big screen the tooltip (the whole explanation), on a small one the card.
  const tip = h('div', { class: 'inc-tip hidden', id: 'income-tip' });
  const tipBody = h('div', { role: 'tooltip' });
  const cTrend = h('span', { class: 'inc-trend', 'aria-hidden': 'true' });
  const cFig = h('b', { class: 'inc-fig' });
  const cSplit = h('span', { class: 'inc-split hidden' });
  const cSub = h('span', { class: 'inc-sub' });
  const close = h('button', { type: 'button', class: 'inc-close', 'aria-label': 'Close', onclick: (e) => { e.stopPropagation(); setOpen(false); } }, '×');
  const cardBody = h('div', { class: 'inc-card' },
    h('div', { class: 'inc-card-head' }, h('b', null, 'INCOME', cTrend), close),
    h('div', { class: 'inc-main' }, cFig, h('small', { class: 'inc-per' }, ' / min')), cSplit, cSub,
    h('p', null, CARD_COUNTED));
  const el = h('div', { class: 'income-wrap hidden unplaced' }, panel, tip);

  let open = false; // tapped or clicked open (the card, or the tooltip pinned)
  let hover = false;
  let tipText = '';
  let mode = ''; // 'chip' or 'side': which body the box under it holds
  const isChip = () => el.classList.contains('is-chip');

  function position() {
    // Under the panel, or over it if there is no room below; never off the side of the screen.
    const w = el.getBoundingClientRect();
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.max(-w.left + 8, Math.min(innerWidth - w.left - tw - 8, 0))}px`;
    const up = w.bottom + tip.offsetHeight + 16 > innerHeight && w.top - tip.offsetHeight - 16 > 0;
    tip.style.top = up ? 'auto' : '';
    tip.style.bottom = up ? 'calc(100% + 0.4rem)' : '';
  }
  function show() {
    const want = isChip() ? 'chip' : 'side';
    if (want !== mode) { mode = want; tip.replaceChildren(want === 'chip' ? cardBody : tipBody); }
    // The card is something to tap (its close mark); the tooltip lets the pointer through.
    setClass(tip, 'is-card', mode === 'chip');
    const on = open || (hover && mode === 'side');
    const was = !tip.classList.contains('hidden');
    setClass(tip, 'hidden', !on);
    setClass(el, 'is-up', on); // over DEB's bubble and the review while it is being read
    setClass(panel, 'is-open', open);
    panel.setAttribute('aria-expanded', String(open));
    if (on && !was) position();
  }
  function setOpen(on) { open = on; show(); }

  panel.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hover = true; show(); } });
  panel.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { hover = false; show(); } });
  panel.addEventListener('focus', () => { hover = true; show(); });
  panel.addEventListener('blur', () => { hover = false; show(); });
  // A tap or a click opens it and keeps it open; another closes it. Nothing under it gets the click.
  panel.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!open); });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); }
    if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
  });
  tip.addEventListener('click', (e) => e.stopPropagation());
  // A tap anywhere else closes it (and goes on to do whatever it was for).
  const outside = (e) => {
    if (!el.isConnected) { document.removeEventListener('pointerdown', outside, true); return; }
    if (open && !el.contains(e.target)) setOpen(false);
  };
  document.addEventListener('pointerdown', outside, true);

  function update(s) {
    const live = !s.training && (s.phase === 'build' || s.phase === 'wave');
    if (live) rate.push(s.tick, s.sales || 0);
    setClass(el, 'hidden', !live);
    if (!live) { if (open || hover) { open = false; hover = false; show(); } return false; }

    const r = rate.read();
    const office = s.players[session.me]?.side === 'office';
    // Between how many it is divided right now: the same count earn() uses.
    const { ways, each } = splitOf(r ? r.store : 0, shareCount(s));
    const perMin = r ? money(Math.round(r.store)) : '—';
    // (Samples are a second apart, so a full window is 59 to 60 seconds.)
    const whole = r && r.secs < RATE_SECS - 1.5 ? `last ${Math.round(r.secs)} s` : 'last minute';
    const splitText = ways < 2 && !office ? ''
      : `split ${ways} way${ways === 1 ? '' : 's'}${office ? " between the store's players" : ''}: ${r ? money(Math.round(each)) : '—'} / min each`;
    const subText = r ? `factory sales, ${whole}` : `too soon to tell (${RATE_MIN_SECS} s)`;
    const t = r ? r.trend : null;
    const arrow = t === 1 ? '▲' : t === -1 ? '▼' : '';
    for (const [f, sp, sb, tr] of [[fig, split, sub, trend], [cFig, cSplit, cSub, cTrend]]) {
      setText(f, perMin);
      setText(sp, splitText);
      setClass(sp, 'hidden', !splitText);
      setText(sb, subText);
      setText(tr, arrow);
      setClass(tr, 'up', t === 1);
      setClass(tr, 'down', t === -1);
    }
    setText(chip, r ? `+${perMin}/min` : '+$—/min');
    panel.setAttribute('aria-label', `Income per minute, the whole store: ${r ? `${perMin} a minute` : 'not known yet'}${splitText ? `, ${splitText}` : ''}${t === 1 ? ', up on the minute before' : t === -1 ? ', down on the minute before' : ''}`);

    const now = [
      office ? `You are Head Office: this is the store's money, split ${ways} way${ways === 1 ? '' : 's'} between its players. Not a cent of it is yours.`
        : ways > 1 ? `The whole store's figure. Sales are split evenly between the ${ways} store players on shift, so each of you gets the "each" figure in his cash.`
          : 'The whole store\'s figure, and with nobody to split it with, all of it lands in your cash. Enjoy that while it lasts.',
      TIP_COUNTED, TIP_LEFT_OUT,
      arrow ? `The ${arrow}: the store took more than 5% ${t === 1 ? 'more' : 'less'} than in the minute before.` : '',
    ].filter(Boolean).join('\n');
    if (now !== tipText) {
      tipText = now;
      tipBody.replaceChildren(h('b', { class: 'inc-tip-head' }, 'INCOME PER MINUTE'), ...now.split('\n').map((line) => h('p', null, line)));
    }
    return true;
  }

  function place(p) {
    const chipNow = !!p && p.w === undefined;
    setClass(el, 'unplaced', !p);
    setClass(el, 'is-side', !!p && !chipNow);
    setClass(el, 'is-chip', chipNow);
    el.style.left = p ? `${Math.round(p.x)}px` : '';
    el.style.top = p ? `${Math.round(p.y)}px` : '';
    el.style.width = p && !chipNow ? `${Math.round(p.w)}px` : '';
    // The chip is as tall as the row it sits in.
    panel.style.minHeight = p && p.h ? `${Math.round(p.h)}px` : '';
    // Switched between a big screen and a small one while open: the other body, in its place.
    if (p && (chipNow ? 'chip' : 'side') !== mode && !tip.classList.contains('hidden')) { mode = ''; show(); position(); }
  }

  return { el, update, place };
}
