// The boss bar: a strip across the top of the floor that nobody can miss. Before a boss event it
// says who is coming; once the doors are open it counts down to his arrival; while he is in the
// store it shows his title and his patience; and for a moment afterwards, how it ended.
// It does the same for a Midnight Release (0.3.01, never in a boss event): before one, how many
// Card Traders are coming; once the doors are open, how long until they pile in; and while they
// are in the store, how many of the mob are left.
// It floats over the floor (position: absolute), so it never moves the floor or changes the
// height of either bar.
import { ST, TICK_HZ, bossTier, bossTitle, bossPatience, difficultyOf } from '../sim/index.js';
import { TUNE, releaseNo, releaseSize, shareCount } from '../sim/index.js';
import { bossBounty } from '../content/facts.js';
import { h, setText, setClass, setStyle, money } from './dom.js';

/** How long the result (driven out, or got through) stays up after he has gone, in ms. */
const RESULT_MS = 3500;
/** How long "PEP TALK" shows after one, in ms. */
const PEP_MS = 1600;
/** The "boss next" warning: shown this long when the build phase starts, in ms ... */
const NEXT_MS = 10000;
/** ... and again for the last this many seconds before the doors open. */
const NEXT_END_SECS = 10;
const whole = (n) => Math.ceil(n).toLocaleString('en-US');

/**
 * @param {Object} session
 * @returns {{el: HTMLElement, update: (s) => boolean}} update returns true while the bar shows
 */
export function createBossBar(session) {
  const tag = h('span', { class: 'boss-tag' }, 'BOSS');
  const title = h('b', { class: 'boss-title' });
  const fill = h('i');
  const meter = h('div', { class: 'boss-meter', role: 'presentation' }, fill);
  const num = h('span', { class: 'boss-num' });
  const note = h('span', { class: 'boss-note' });
  const el = h('div', { class: 'boss-bar hidden', role: 'status', 'aria-live': 'off' },
    tag, h('div', { class: 'boss-main' }, h('div', { class: 'boss-line' }, title, num), meter), note);

  let pepUntil = 0, pepN = 0;
  let result = null; // { until, text, good } after he has gone
  session.on('fx', (events) => {
    for (const e of events) {
      if (e.e === 'pep') { pepUntil = performance.now() + PEP_MS; pepN = e.n | 0; }
      else if (e.e === 'escape' && e.k === 'boss') {
        result = { until: performance.now() + RESULT_MS, good: false, tier: e.tier || 1, text: `GOT THROUGH · ${e.n} refunds · -${money(e.refund || 0)}` };
      } else if (e.e === 'bossOut') {
        result = { until: performance.now() + RESULT_MS, good: true, tier: e.tier || 1, text: `STORMED OUT · +${money(e.bounty || 0)} bounty` };
      }
    }
  });

  let nextKey = -1, nextSeen = 0; // which build phase the "boss next" warning is for, and since when
  let mode = '';
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    el.className = `boss-bar${m ? ` is-${m}` : ' hidden'}`;
    setText(tag, m === 'next' ? 'BOSS NEXT' : 'BOSS');
  }

  function update(s) {
    const now = performance.now();
    if (!s || s.training || s.phase === 'lobby' || s.phase === 'won' || s.phase === 'lost') { setMode(''); return false; }
    const pay = difficultyOf(s).pay, hpMul = difficultyOf(s).hp;
    let boss = null;
    for (const m of s.shoppers) if (m.k === 'boss') { boss = m; break; }

    if (boss && boss.st !== ST.LEAVE) {
      setMode('in');
      const tier = boss.tr || 1;
      setText(title, bossTitle(tier).toUpperCase());
      const share = Math.max(0, Math.min(1, boss.hp / boss.mhp));
      setStyle(fill, 'width', `${(share * 100).toFixed(1)}%`);
      setText(num, `${whole(boss.hp)} / ${whole(boss.mhp)}`);
      const pep = now < pepUntil;
      setClass(el, 'pep', pep);
      setText(note, pep ? (pepN ? `PEP TALK! ${pepN} cheered up` : 'PEP TALK!') : `bounty +${money(bossBounty(tier, pay))}`);
      return true;
    }
    // Leaving after his patience ran out (he is still walking to the door), or just gone.
    if (result && now < result.until) {
      setMode(result.good ? 'out' : 'through');
      setText(title, bossTitle(result.tier).toUpperCase());
      setStyle(fill, 'width', result.good ? '0%' : '100%');
      setText(num, '');
      setText(note, result.text);
      return true;
    }
    result = null;
    // A Midnight Release instead (never in the same event as the boss).
    if (release(s, now)) return true;
    // He is on his way: the doors are open and he has not walked in yet.
    if (s.phase === 'wave') {
      const q = s.spawnQ.find((x) => x[1] === 'boss');
      if (!q) { setMode(''); return false; }
      setMode('coming');
      const tier = bossTier(s.wave) || 1;
      setText(title, bossTitle(tier).toUpperCase());
      setStyle(fill, 'width', '100%');
      setText(num, `patience ${whole(bossPatience(s.wave, hpMul))}`);
      setText(note, `walks in in ${Math.max(0, Math.ceil((q[0] - s.tick) / TICK_HZ))} s`);
      return true;
    }
    // Between sales events: the next one brings him. The warning shows for a while when the build
    // phase starts and again as the clock runs out, not all the way through: it covers the top
    // of the floor, where people are building. (The top bar says so the whole time.)
    const next = s.phase === 'build' ? bossTier(s.wave + 1) : 0;
    if (next) {
      if (nextKey !== s.wave) { nextKey = s.wave; nextSeen = now; }
      const ending = s.phaseT >= 0 && s.phaseT <= NEXT_END_SECS * TICK_HZ;
      if (now - nextSeen < NEXT_MS || ending) {
        setMode('next');
        setText(tag, 'BOSS NEXT');
        setText(title, bossTitle(next).toUpperCase());
        setStyle(fill, 'width', '100%');
        setText(num, `patience ${whole(bossPatience(s.wave + 1, hpMul))}`);
        setText(note, `bounty +${money(bossBounty(next, pay))}`);
        return true;
      }
    }
    setMode('');
    return false;
  }

  /**
   * The Midnight Release on the bar: the build pause before one (shown when the pause starts and
   * again as the clock runs out, like the boss's warning), the countdown once the doors are open,
   * and how many of the mob are still in the store. Returns true if it is showing.
   */
  function release(s, now) {
    const at = (m, label, head, n, text, share) => {
      setMode(m);
      setText(tag, label);
      setText(title, head);
      setStyle(fill, 'width', `${(Math.max(0, Math.min(1, share)) * 100).toFixed(1)}%`);
      setText(num, n);
      setText(note, text);
      return true;
    };
    if (s.phase === 'wave' && releaseNo(s.wave)) {
      const size = releaseSize(s.wave, shareCount(s));
      // (The first of the mob in the queue carries its size: see beginWave.)
      const q = s.spawnQ.find((x) => x[4] > 0);
      if (q) return at('release-coming', 'MIDNIGHT', 'MIDNIGHT RELEASE', `${q[4]} card traders`, `in ${Math.max(0, Math.ceil((q[0] - s.tick) / TICK_HZ))} s`, 1);
      let left = 0;
      for (const m of s.shoppers) if (m.k === 'trader' && m.st !== ST.LEAVE) left++;
      for (const x of s.spawnQ) if (x[1] === 'trader') left++;
      if (!left) return false;
      return at('release-in', 'MOB', 'MIDNIGHT RELEASE', `${left} / ${size} left`, 'card traders in the store', left / Math.max(1, size));
    }
    const next = s.phase === 'build' ? releaseNo(s.wave + 1) : 0;
    if (!next) return false;
    if (relKey !== s.wave) { relKey = s.wave; relSeen = now; }
    const ending = s.phaseT >= 0 && s.phaseT <= NEXT_END_SECS * TICK_HZ;
    if (now - relSeen >= NEXT_MS && !ending) return false;
    return at('release-next', 'NEXT', 'MIDNIGHT RELEASE', `${releaseSize(s.wave + 1, shareCount(s))} card traders`, `one door · ${TUNE.releaseAt} s in`, 1);
  }
  let relKey = -1, relSeen = 0; // which build phase the release warning is for, and since when

  return { el, update };
}
