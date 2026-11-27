// Rebuilding from the screen: the big REBUILD button that floats over the floor while anything of
// this player's is wrecked or waiting to go back, so nobody has to scroll the build bar on a phone
// to find out (0.2.15). Since 0.3.04 a press orders the rebuild: the money is taken at once and the
// building goes back as soon as nothing is in the way (orderRebuilds and stepRebuilds in
// src/sim/commands.js); there is no auto-rebuild any more.
import { TUNE, BUILD, rebuildDeal, footprint, canPutBack } from '../sim/index.js';
import { h, setClass, setText, money } from './dom.js';
import { buildingIcon } from './icons.js';

/** Why a wreck that has been paid for has not gone back yet, by canPlace's reason. */
const WHY = {
  shopper: 'Some idiot is standing in the hole',
  // (Either a shopper is in the way for now, or it would wall an entrance off until the layout
  // changes: both clear by waiting or by opening another way through.)
  blocked: 'It would wall off the tills. Wait, or open a way through',
  bank: 'It would wall off a bank of tills',
  paused: 'The game is paused. Press play first',
};

/**
 * What this player has wrecked, what he has paid to put back, and what pressing B would do now.
 * Pure: it changes nothing. Only the oldest wreck that is waiting is checked against the route
 * (a path search), and only to say why it waits.
 * @returns {null | {n: number, cost: number, can: boolean, why: string, held: number,
 *   paid: number, full: number, wait: string}} null when he has nothing wrecked and nothing
 *   waiting (or he is Head Office, or the game is not being played).
 *   n: his wrecks nobody has ordered yet; cost: putting all of them back with every upgrade;
 *   can: B would order at least one now; why: if not, what to tell him;
 *   held: wrecks he has paid for that are waiting; paid: the money held for them; full: what they
 *   cost with every upgrade (paid is less while he was short when he pressed); wait: why the oldest
 *   of them has not gone back yet ('' with none waiting).
 */
export function rebuildStatus(s, me) {
  const p = s && s.players[me];
  if (!p || p.side === 'office' || (s.phase !== 'build' && s.phase !== 'wave')) return null;
  let n = 0, cost = 0, can = false, need = Infinity;
  let held = 0, paid = 0, full = 0, first = null;
  for (const r of s.rubble) {
    const x = r.i % s.w, y = (r.i / s.w) | 0;
    const tiles = footprint(s, r.k, x, y, r.d | 0);
    // Built over since: B only tidies it away, so it is not a hole any more.
    if (!tiles || tiles.some((t) => s.grid[t])) continue;
    if (r.by !== undefined) {
      if (r.by !== me) continue;
      held++;
      paid += r.res | 0;
      full += rebuildDeal(r, Infinity).pay;
      first ||= r;
      continue;
    }
    if (r.o !== me) continue;
    n++;
    cost += rebuildDeal(r, Infinity).pay;
    // B orders every wreck he can afford at least the bare building for, oldest first.
    if (rebuildDeal(r, p.cash)) can = true;
    else need = Math.min(need, Math.floor(BUILD[r.k].cost * TUNE.rebuildShare));
  }
  if (!n && !held) return null;
  let wait = '';
  if (first) {
    const no = canPutBack(s, first);
    wait = !no ? 'Going back up any second' : WHY[no] || 'Not right now';
  }
  const why = !n ? 'Already paid for. It goes back when the way is clear' : can ? '' : `Too broke. Need ${money(need)}`;
  return { n, cost, can, why, held, paid, full, wait };
}

/** The words on the big button for a status (rebuildStatus), so a test can read them too. */
export function rebuildWords(st) {
  const plural = (k) => (k === 1 ? '' : 's');
  if (!st.n) {
    const amount = st.paid < st.full ? `PAID ${money(st.paid)} of ${money(st.full)}` : `PAID ${money(st.paid)}`;
    return { look: 'waiting', count: `${amount} · ${st.held} waiting`, sub: st.wait };
  }
  const more = st.held ? `${st.held} more paid for and waiting` : '';
  const sub = !st.can ? st.why : more || 'Your shit is broken. Fix it';
  const label = `Rebuild ${st.n} wreck${plural(st.n)} for ${money(st.cost)}`;
  return { look: st.can ? 'ready' : 'dim', count: `REBUILD ${st.n} · ${money(st.cost)}`, sub, label };
}

/**
 * The big REBUILD button over the floor. Shown while this player has something wrecked or paid
 * for and waiting: lit while B would order something, dimmed with the reason while he is too
 * broke, and dimmed without the nudge, saying what is paid and why it waits, when everything of
 * his is already paid for.
 * @param {Object} session
 * @param {Object} o
 * @param {() => void} o.rebuild does what B does
 * @returns {{el: HTMLElement, update: (s: Object) => void}}
 */
export function createRebuildPop(session, { rebuild }) {
  const count = h('b', { class: 'rp-count' });
  const sub = h('small', { class: 'rp-sub' });
  const btn = h('button', {
    type: 'button', class: 'rp-btn',
    title: 'Pay to put back everything of yours the gym bros wrecked, at half of what you spent on it (key B). The money goes now; each one goes back as soon as nothing is in the way',
    onclick: () => rebuild(),
  },
  h('span', { class: 'hotkey', 'aria-hidden': 'true' }, 'B'),
  h('span', { class: 'rp-icon', html: buildingIcon('rebuild') }),
  h('span', { class: 'rp-text' }, count, sub));
  const el = h('div', { class: 'rebuild-pop hidden', role: 'group', 'aria-label': 'Rebuild' }, btn);
  let key = '', shown = '';
  function update(s) {
    const p = s.players[session.me];
    // Checking why a wreck waits costs a path search, so only when something that matters has
    // changed (and at most every sixth step, about five times a second at normal speed).
    const k = p ? `${s.phase},${s.rubble.length},${Math.floor(p.cash)},${p.side},${Math.floor(s.tick / 6)},${s.gridVer}` : '';
    if (k === key) return;
    key = k;
    const st = rebuildStatus(s, session.me);
    const next = st ? JSON.stringify(st) : '';
    if (next === shown) return;
    shown = next;
    setClass(el, 'hidden', !st);
    if (!st) return;
    const w = rebuildWords(st);
    setText(count, w.count);
    setText(sub, w.sub);
    setClass(btn, 'dim', w.look !== 'ready');
    setClass(btn, 'waiting', w.look === 'waiting');
    btn.setAttribute('aria-label', `${w.label || w.count}${w.sub ? `: ${w.sub}` : ''}`);
  }
  return { el, update };
}
