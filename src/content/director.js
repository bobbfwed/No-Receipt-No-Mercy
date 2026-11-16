// The director turns simulation events into jokes: what DEB the HR chatbot says, which customer
// reviews pop up, and the end-of-wave performance review. It runs on the host only, and its
// output is sent to every player, so everyone sees the same insult at the same time.
import { TICK_HZ, TUNE, BUILD, SUPERS, MAP_SIZES, teamCash, officePlayer } from '../sim/index.js';
import {
  LINES, INTRO, SUPER_INTRO, ESCAPE_REVIEWS, LEFT_REVIEWS, STAMPS, EMPLOYEES_OF_THE_WAVE, fill,
} from './lines.js';

const DEB = 'DEB (HR)';

/**
 * @param {() => number} [random] source of randomness, replaceable in tests
 */
export function createDirector(random = Math.random) {
  const recent = new Map(); // bank -> index used last, to avoid repeating a line twice running
  let lastSay = -1e9; // tick of DEB's last optional remark
  let lastReview = -1e9;
  let escapes = []; // ticks of recent refunds
  let sold = false;
  let warned = -1; // wave whose "ten seconds" warning has been given
  const lastPlaced = new Map(); // "x,y" -> { tick, by }
  const met = new Set(); // kinds of shopper DEB has already introduced
  const metSuper = new Set(); // and the super versions

  function pick(bank) {
    let i = (random() * bank.length) | 0;
    if (bank.length > 1 && recent.get(bank) === i) i = (i + 1) % bank.length;
    recent.set(bank, i);
    return bank[i];
  }
  const nameOf = (state, pid) => state.players[pid]?.name || 'Someone';
  function anyone(state) {
    const on = state.players.filter((p) => p.on);
    return on.length ? on[(random() * on.length) | 0].name : 'Someone';
  }

  /** DEB speaks. Optional remarks are dropped if she spoke in the last few seconds. */
  function say(out, state, bank, vars, { must = false, gap = 6, mood = 'flat' } = {}) {
    if (!must && state.tick - lastSay < gap * TICK_HZ) return;
    lastSay = state.tick;
    out.push({ t: 'say', who: DEB, mood, text: fill(pick(bank), { p: anyone(state), ...vars }) });
  }

  function review(out, state, bank, kind, gap) {
    if (!bank || state.tick - lastReview < gap * TICK_HZ) return;
    lastReview = state.tick;
    const [stars, text] = pick(bank);
    out.push({ t: 'review', stars, kind, text: fill(text, { p: anyone(state) }) });
  }

  function report(out, state, e) {
    // Head Office is not reviewed: he does not work here any more.
    const players = state.players.filter((p) => p.on && p.side !== 'office');
    // Rank by a rough contribution score so the stamps go to the right people.
    const score = (p) => p.w.earned + p.w.stopped * 12 + p.w.annoy * 0.2;
    const ranked = [...players].sort((a, b) => score(b) - score(a));
    const rows = players.map((p) => {
      const place = ranked.indexOf(p);
      const tier = players.length === 1 ? ['top', 'middle', 'bottom'][(random() * 3) | 0]
        : place === 0 ? 'top' : place === ranked.length - 1 ? 'bottom' : 'middle';
      return {
        pid: p.id, name: p.name, role: p.role, color: p.color,
        shipped: p.w.shipped, earned: p.w.earned, stopped: p.w.stopped, spent: p.w.spent,
        stamp: pick(STAMPS[tier]),
      };
    });
    const worst = ranked[ranked.length - 1];
    let bank = LINES.report, who = anyone(state);
    if (state.ws.escaped === 0 && state.ws.stopped > 0) bank = LINES.reportPerfect;
    else if (worst && random() < 0.5) {
      if (worst.w.stopped === 0 && worst.w.shipped > 0) { bank = LINES.reportNoStops; who = worst.name; }
      else if (worst.w.shipped === 0 && worst.w.stopped > 0) { bank = LINES.reportNoShips; who = worst.name; }
    }
    out.push({
      t: 'report', wave: e.wave, bonus: e.bonus, rows,
      employee: pick(EMPLOYEES_OF_THE_WAVE),
      deb: fill(pick(bank), { p: who }),
      totals: { ...state.ws, cash: teamCash(state), refunds: state.refunds, refundLimit: state.refundLimit },
    });
  }

  return {
    /**
     * @param {Array<Object>} events simulation events from step() or applyCommand(), plus
     *   'joined' and 'quit' from the session
     * @param {Object} state the game state after those events
     * @returns {Array<Object>} messages to announce: 'say', 'review' and 'report'
     */
    handle(events, state) {
      const out = [];
      for (const e of events) {
        switch (e.e) {
          case 'waveStart':
            escapes = [];
            if (state.training) break; // the tutorial does its own talking
            {
              // The first time a kind of shopper turns up, explain its trick instead of the usual quip.
              let introduced = false;
              for (const k of e.kinds || []) {
                if (met.has(k)) continue;
                met.add(k);
                if (INTRO[k]) { out.push({ t: 'say', who: DEB, mood: 'flat', text: INTRO[k] }); lastSay = state.tick; introduced = true; }
              }
              // The same for the super version of a kind.
              for (const k of e.supers || []) {
                if (metSuper.has(k)) continue;
                metSuper.add(k);
                if (SUPER_INTRO[k]) {
                  out.push({ t: 'say', who: DEB, mood: 'angry', text: fill(SUPER_INTRO[k], { p: anyone(state) }) });
                  lastSay = state.tick;
                  introduced = true;
                }
              }
              const boss = officePlayer(state);
              if (boss && e.office) say(out, state, LINES.officeWave, { p: boss.name, n: e.total }, { must: true, mood: 'smug' });
              else if (boss) say(out, state, LINES.officeNoPlan, { p: boss.name }, { must: true });
              else if (!introduced) say(out, state, LINES.waveStart, { w: e.wave }, { must: true });
            }
            if (e.dads > 0) say(out, state, LINES.dadLine, { n: e.dads }, { must: true, mood: 'smug' });
            break;
          case 'kid':
            say(out, state, LINES.kid, {}, { gap: 20 });
            break;
          case 'smash':
            // Whoever owned it hears about it by name.
            if (e.k === 'crate') say(out, state, LINES.smash, {}, { gap: 10, mood: 'angry' });
            else say(out, state, LINES.smashOther, { k: BUILD[e.k].name, p: nameOf(state, e.owner) }, { gap: 8, mood: 'angry' });
            break;
          case 'upgraded': {
            const vars = { p: nameOf(state, e.by), k: BUILD[e.k].name, n: e.lv };
            if (e.lv >= TUNE.maxLevel) say(out, state, LINES.maxed, vars, { must: true, mood: 'smug' });
            else if (random() < 0.2) say(out, state, LINES.upgraded, vars, { gap: 15, mood: 'smug' });
            break;
          }
          case 'nobelt':
            say(out, state, LINES.noBelt, { p: nameOf(state, e.owner), k: BUILD[e.k].name }, { gap: 30, mood: 'angry' });
            break;
          case 'rebuilt':
            if (e.n >= 3) say(out, state, LINES.rebuilt, { p: nameOf(state, e.by), n: e.n }, { gap: 25, mood: 'smug' });
            break;
          case 'side':
            say(out, state, e.side === 'office' ? LINES.officeTaken : LINES.officeLeft, { p: nameOf(state, e.by) }, { must: true, mood: 'smug' });
            break;
          case 'ready': {
            // One side is waiting for the other: name the one holding things up.
            const boss = officePlayer(state);
            if (!boss) break;
            if (e.side === 'store') say(out, state, LINES.officeWaiting, { p: boss.name }, { gap: 8 });
            else say(out, state, LINES.storeWaiting, { p: boss.name }, { gap: 8 });
            break;
          }
          case 'gave':
            say(out, state, LINES.gave, { p: nameOf(state, e.by), q: nameOf(state, e.to), n: e.n }, { gap: 10, mood: 'smug' });
            break;
          case 'mess':
            say(out, state, LINES.mess, {}, { gap: 45 });
            break;
          case 'bolt':
            say(out, state, LINES.bolt, {}, { gap: 20, mood: 'angry' });
            break;
          case 'escape':
            escapes.push(state.tick);
            escapes = escapes.filter((t) => state.tick - t < 6 * TICK_HZ);
            if (escapes.length >= 5) {
              say(out, state, LINES.manyEscapes, { n: escapes.length }, { gap: 9, mood: 'angry' });
              if (state.tick === lastSay) escapes = [];
            }
            // Dads get their smug five-star review in more often than anyone else.
            review(out, state, ESCAPE_REVIEWS[e.k], e.k, e.k === 'dad' ? 1 : 4);
            break;
          case 'left':
            if (random() < 0.35) review(out, state, LEFT_REVIEWS[e.k], e.k, 6);
            break;
          case 'grab':
            say(out, state, LINES.grab, {}, { gap: 14 });
            break;
          case 'slip':
            say(out, state, LINES.slip, {}, { gap: 10, mood: 'smug' });
            break;
          case 'sale':
            if (!sold) { sold = true; say(out, state, LINES.firstSale, {}, { must: true }); }
            break;
          case 'placed': {
            lastPlaced.set(`${e.x},${e.y}`, { tick: state.tick, by: e.by });
            const bank = LINES.placed[e.k];
            if (bank && random() < 0.12) say(out, state, bank, { p: nameOf(state, e.by) }, { gap: 12 });
            break;
          }
          case 'removed': {
            const was = lastPlaced.get(`${e.x},${e.y}`);
            if (e.owner !== e.by && state.players[e.owner]?.on) {
              say(out, state, LINES.removedOther, { p: nameOf(state, e.by) }, { gap: 8, mood: 'angry' });
            } else if (was && state.tick - was.tick < 8 * TICK_HZ && random() < 0.5) {
              say(out, state, LINES.removed, { p: nameOf(state, e.by) }, { gap: 10 });
            }
            break;
          }
          case 'waveEnd':
            if (!e.training) report(out, state, e);
            break;
          case 'won':
            say(out, state, LINES.won, {}, { must: true, mood: 'smug' });
            break;
          case 'lost':
            say(out, state, LINES.lost, {}, { must: true, mood: 'angry' });
            break;
          case 'joined': {
            say(out, state, LINES.joined, { p: nameOf(state, e.by) }, { must: true });
            // More players than the map was sized for: say so once per arrival.
            const fits = MAP_SIZES[state.map.size]?.players || 1;
            const here = state.players.filter((p) => p.on).length;
            if (here > fits && here > 1 && !state.training) say(out, state, LINES.cramped, { n: fits, m: here }, { must: true });
            break;
          }
          case 'quit':
            say(out, state, LINES.quit, { p: nameOf(state, e.by) }, { must: true });
            break;
          default:
        }
      }
      return out;
    },

    /**
     * Call about once a second. Gives the "ten seconds" warning before the doors open.
     * @returns {Array<Object>} messages to announce
     */
    idle(state) {
      const out = [];
      if (state.phase === 'build' && state.phaseT > 0 && state.phaseT <= 10 * TICK_HZ && warned !== state.wave) {
        warned = state.wave;
        say(out, state, LINES.buildEnding, {}, { must: true });
      }
      return out;
    },
  };
}
