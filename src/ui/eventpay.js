// The EVENT PAY panel (0.4, in the place of the INCOME panel of 0.3.03). The factory no longer
// makes money (the owner's decision for 0.4): beating a sales event does. The panel shows what the
// current sales event pays (between events, the next one) and the speed bonus on top: "up to $X"
// until the event's last shopper has come in, then the live figure, draining as the clock runs and
// already scaled by the share of shoppers stopped so far. Both figures come from the rules
// (eventPay and speedBonus, the very functions endWave pays with), so the panel and the money that
// arrives cannot disagree.
//
// On a big screen game.js places it in the left column (under the strip of cards, or under the
// players panel in a game without cards), as wide as the players panel, or beside them when there
// is no room below; hovering or focusing it shows how it works. On a small screen it is a chip in
// the row at the top left, beside the cards ("$465 +$233"); tapping it opens a small card with the
// rest, which stays until the chip is tapped again, something else is tapped, or its close mark is
// pressed. It floats, so it never resizes anything, and a click or tap on it never reaches the
// floor.
import { TUNE, TICK_HZ, shareCount, eventPay, speedBonus, speedPar } from '../sim/index.js';
import { h, setText, setClass, money, clock } from './dom.js';

/** Seconds as the panel shows them: "0:42". */
const mmss = (secs) => clock(Math.round(secs * TICK_HZ));

/**
 * What the panel shows for a game, from the rules alone (no DOM): null when it is hidden (the
 * lobby, the deal, training, a won or lost game), otherwise { n (the sales event), pay, bonus, max,
 * running, took, par, clean, coming (shoppers still to come in), next (true between events) }.
 */
export function payView(s) {
  if (!s || s.training || (s.phase !== 'build' && s.phase !== 'wave')) return null;
  const next = s.phase === 'build';
  const n = next ? s.wave + 1 : s.wave;
  const pay = eventPay(s, n);
  // (Between events the clock is not running and the last event's counts are still in state.ws:
  // the bonus shown is the most the next one can pay.)
  const sb = speedBonus(s, n, pay);
  const running = !next && sb.running;
  return {
    n, pay, next, running, max: sb.max, bonus: running ? sb.bonus : sb.max,
    took: running ? sb.took : 0, par: speedPar(n), clean: running ? sb.clean : 1,
    coming: next ? 0 : s.spawnQ.length,
  };
}

/**
 * @param {Object} session the game's session (session.me is this player)
 * @returns {{el: HTMLElement, update: (s: Object) => boolean, place: (p: {x: number, y: number, w?: number, h?: number}|null) => void}}
 *   update redraws from the game and says whether the panel shows; place puts it on the floor (with
 *   `w`, as the big screen's panel; without, as the small screen's chip, `h` tall; null hides it
 *   until placed again)
 */
export function createPayPanel(session) {
  const when = h('span', { class: 'pay-when' });
  const fig = h('b', { class: 'pay-fig' });
  const each = h('small', { class: 'pay-each' });
  const speed = h('span', { class: 'pay-speed' });
  const sub = h('span', { class: 'pay-sub' });
  const chip = h('span', { class: 'pay-chip', 'aria-hidden': 'true' });
  const panel = h('section', {
    class: 'panel eventpay', tabindex: '0', role: 'group', 'aria-label': 'Event pay', 'aria-describedby': 'eventpay-tip', 'aria-expanded': 'false',
  }, h('h3', null, 'EVENT PAY', when), h('div', { class: 'pay-main' }, fig, each), speed, sub, chip);

  // Under it: on a big screen the tooltip (the whole explanation), on a small one the card.
  const tip = h('div', { class: 'pay-tip hidden', id: 'eventpay-tip' });
  const tipBody = h('div', { role: 'tooltip' });
  const cWhen = h('span', { class: 'pay-when' });
  const cFig = h('b', { class: 'pay-fig' });
  const cEach = h('small', { class: 'pay-each' });
  const cSpeed = h('span', { class: 'pay-speed' });
  const cSub = h('span', { class: 'pay-sub' });
  const cRule = h('p');
  const close = h('button', { type: 'button', class: 'pay-close', 'aria-label': 'Close', onclick: (e) => { e.stopPropagation(); setOpen(false); } }, '×');
  const cardBody = h('div', { class: 'pay-card' },
    h('div', { class: 'pay-card-head' }, h('b', null, 'EVENT PAY', cWhen), close),
    h('div', { class: 'pay-main' }, cFig, cEach), cSpeed, cSub, cRule);
  const el = h('div', { class: 'eventpay-wrap hidden unplaced' }, panel, tip);

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
    const v = payView(s);
    setClass(el, 'hidden', !v);
    if (!v) { if (open || hover) { open = false; hover = false; show(); } return false; }

    const office = s.players[session.me]?.side === 'office';
    const ways = shareCount(s);
    // (Short: a long word here wraps the title and pushes the panel off its place in the column.)
    const whenText = v.next ? 'NEXT' : v.running ? `⏱ ${mmss(v.took)}` : `EVENT ${v.n}`;
    const eachText = office ? ' each store player' : ways > 1 ? ` each, all ${ways} of you` : '';
    const speedText = v.running ? `+${money(v.bonus)} speed bonus` : `+ up to ${money(v.max)} speed bonus`;
    let subText;
    if (v.next) subText = `for beating event ${v.n} · par ${mmss(v.par)}`;
    else if (!v.running) subText = v.coming > 0 ? `clock starts after ${v.coming} more` : 'clock starts now';
    else if (v.bonus <= 0 && v.took >= v.par) subText = `past par (${mmss(v.par)}): no bonus`;
    else subText = `par ${mmss(v.par)} · ${Math.round(v.clean * 100)}% stopped`;
    const draining = v.running && v.bonus < v.max;
    for (const [w, f, e, sp, sb] of [[when, fig, each, speed, sub], [cWhen, cFig, cEach, cSpeed, cSub]]) {
      setText(w, whenText);
      setClass(w, 'ticking', v.running);
      setText(f, money(v.pay));
      setText(e, eachText);
      setText(sp, speedText);
      setClass(sp, 'draining', draining);
      setClass(sp, 'gone', v.running && v.bonus <= 0);
      setText(sb, subText);
    }
    setText(chip, `${money(v.pay)} +${money(v.bonus)}`);
    panel.setAttribute('aria-label', `Event pay for sales event ${v.n}: ${money(v.pay)}${eachText}, and ${v.running ? `a speed bonus of ${money(v.bonus)} so far` : `a speed bonus of up to ${money(v.max)}`}`);

    const rule = `Speed bonus: the clock starts once the event's last shopper is in. Clear the floor within ${TUNE.speedBest} s for the full ${money(v.max)}; it drains to nothing at ${mmss(v.par)}${v.par > TUNE.speedPar ? ' (a boss event: twice the usual par)' : ''}. Scaled by the share of shoppers stopped rather than refunded.`;
    const now = [
      office ? `You are Head Office: this is what each of the store's players gets for beating your shoppers. Make them slow.`
        : ways > 1 ? `Beat the sales event and each of the ${ways} store players on shift gets the whole ${money(v.pay)}, not a share of it.`
          : `Beat the sales event and the whole ${money(v.pay)} is yours.`,
      rule,
      'Opening the doors early just opens them: The Back does nothing in the time you skip.',
    ].join('\n');
    setText(cRule, rule);
    if (now !== tipText) {
      tipText = now;
      tipBody.replaceChildren(h('b', { class: 'pay-tip-head' }, 'EVENT PAY'), ...now.split('\n').map((line) => h('p', null, line)));
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
