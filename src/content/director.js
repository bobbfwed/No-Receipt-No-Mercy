// The director turns simulation events into jokes: what DEB the HR chatbot says, which customer
// reviews pop up, and the end-of-wave performance review. It runs on the host only, and its
// output is sent to every player, so everyone sees the same insult at the same time.
import { TICK_HZ, TUNE } from '../sim/index.js';
import {
  LINES, ESCAPE_REVIEWS, LEFT_REVIEWS, STAMPS, EMPLOYEES_OF_THE_WAVE, fill,
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
    const players = state.players.filter((p) => p.on);
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
      totals: { ...state.ws, cash: state.cash, refunds: state.refunds, refundLimit: TUNE.refundLimit },
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
            say(out, state, LINES.waveStart, { w: e.wave }, { must: true });
            if (e.dads > 0) say(out, state, LINES.dadLine, { n: e.dads }, { must: true, mood: 'smug' });
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
            report(out, state, e);
            break;
          case 'won':
            say(out, state, LINES.won, {}, { must: true, mood: 'smug' });
            break;
          case 'lost':
            say(out, state, LINES.lost, {}, { must: true, mood: 'angry' });
            break;
          case 'joined':
            say(out, state, LINES.joined, { p: nameOf(state, e.by) }, { must: true });
            break;
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
