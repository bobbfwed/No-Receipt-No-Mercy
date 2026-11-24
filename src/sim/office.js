// Head Office: a player who stops defending the store and runs the shoppers instead. Each build
// phase he gets a budget, buys groups of shoppers with it, and chooses which entrance each group
// uses and when it arrives. At least one other player must be running the store.
//
// The state keeps it in `state.office`: null when nobody has the job, otherwise
//   { pid, budget, bank, plan, ready }
//   pid     the player
//   budget  what he may spend on the coming wave
//   bank    what he carries over from the last wave (already counted in budget)
//   plan    the groups he has bought, as [{ k, n, sup, door, at }]:
//           kind, how many, 1 if they are all supers, which entrance (index into state.doors),
//           and how many seconds after the doors open the first one arrives
//   ready   he has said the doors may open early
// If he has bought nothing when the doors open, the usual automatic wave comes instead.
// The boss (every fifth wave) cannot be bought: he is not in SHOPPERS, so a plan naming him is
// refused as 'bad', and he walks in on top of whatever was bought. Nor can a Pregnant Lady's babies
// ('baby', also not in SHOPPERS): he gets them by buying her. Card Traders are in SHOPPERS but not
// in OFFICE.kinds, so he cannot buy them either; a Midnight Release's mob comes on top of his plan.
import { SHOPPERS, SUPERS, OFFICE, perHead } from './constants.js';
import { shareCount } from './state.js';
import { waveSpec } from './step.js';

/**
 * What one shopper costs Head Office. Tougher, faster and trickier shoppers cost more. The price
 * is per head, so it is multiplied by perHead(): with half the crowd, each shopper costs twice as
 * much, and his budget (a share of what the automatic wave is worth) buys half as many.
 */
export function priceOf(k, sup = 0) {
  const def = sup ? SUPERS[k] : SHOPPERS[k];
  // (The old price, rounded, then scaled: so a super stays at least twice the ordinary one.)
  const each = Math.max(1, Math.round((def.hp * def.speed * OFFICE.kinds[k].weight) / OFFICE.patiencePerDollar));
  return Math.round(each * perHead());
}

/**
 * What the automatic wave n would cost at those prices. The boss is left out: he has no price,
 * since Head Office can neither buy him nor keep him out (he comes every fifth wave regardless;
 * see beginWave). The smaller crowd of a boss wave does make that wave's budget smaller.
 */
export function waveValue(n, players = 1) {
  let sum = 0;
  for (const g of waveSpec(n, players)) {
    // (Nor the Midnight Release's mob: he cannot buy Card Traders, and they come regardless.)
    if (g.k === 'boss' || g.mob) continue;
    sum += (g.n - g.sup) * priceOf(g.k, 0) + g.sup * priceOf(g.k, 1);
  }
  return sum;
}

/** The player running the shoppers right now, or null (nobody has the job, or he has dropped out). */
export function officePlayer(state) {
  const o = state.office;
  const p = o ? state.players[o.pid] : null;
  return p && p.on && p.side === 'office' ? p : null;
}

/** True if this kind (or its super) can be bought for wave n. */
export function canBuy(k, sup, n) {
  const kind = Object.hasOwn(OFFICE.kinds, k) ? OFFICE.kinds[k] : null;
  if (!kind || n < kind.from) return false;
  return !sup || n >= SHOPPERS[k].sup.from;
}

export function planCost(groups) {
  let sum = 0;
  for (const g of groups) sum += g.n * priceOf(g.k, g.sup);
  return sum;
}

/**
 * Checks a plan for the coming wave.
 * @returns {string|null} null if it is fine, otherwise the reason: 'bad' it is malformed,
 *   'locked' it uses a kind that has not arrived yet, 'door' an entrance that is not open,
 *   'budget' it costs too much.
 */
export function checkPlan(state, groups) {
  if (!Array.isArray(groups) || groups.length > OFFICE.maxGroups) return 'bad';
  const wave = state.wave + 1;
  for (const g of groups) {
    // (Only real kinds: not the boss, not a baby, not a name that happens to be on every object.)
    if (!g || typeof g !== 'object' || typeof g.k !== 'string' || !Object.hasOwn(SHOPPERS, g.k)) return 'bad';
    if (!Number.isInteger(g.n) || g.n < 1 || g.n > OFFICE.maxSize) return 'bad';
    if (!(g.at >= 0 && g.at <= OFFICE.maxAt)) return 'bad';
    if (!Number.isInteger(g.door) || g.door < 0) return 'bad';
    if (g.door >= state.open) return 'door';
    if (!canBuy(g.k, g.sup ? 1 : 0, wave)) return 'locked';
  }
  if (planCost(groups) > state.office.budget) return 'budget';
  return null;
}

/** A clean copy of a plan, keeping only the fields the game uses. */
export const tidyPlan = (groups) => groups.map((g) => ({ k: g.k, n: g.n, sup: g.sup ? 1 : 0, door: g.door, at: Math.round(g.at * 10) / 10 }));

/**
 * Works out the budget for the coming wave: a share of what the automatic wave is worth, plus
 * what he carried over, plus a little for every shopper who got a refund last time.
 */
export function refreshBudget(state) {
  const o = state.office;
  if (!o) return;
  const worth = waveValue(state.wave + 1, shareCount(state));
  o.budget = Math.round(worth * OFFICE.share + o.bank + OFFICE.perRefund * state.ws.escaped);
  // A plan made for the last budget may no longer fit (or use an entrance that is gone).
  if (o.plan.length && checkPlan(state, o.plan)) o.plan = [];
}

/**
 * The wave Head Office has bought, in the shape waveSpec() returns (plus an entrance per group),
 * or null if the automatic wave should run. Settles his account for the wave.
 */
export function takeOfficeWave(state) {
  const o = state.office;
  if (!o) return null;
  o.ready = false;
  if (!officePlayer(state) || !o.plan.length || checkPlan(state, o.plan)) {
    // He planned nothing (or is gone): the usual crowd comes, and his whole budget carries over
    // at the usual rate.
    o.bank = Math.round(o.budget * OFFICE.carry);
    o.plan = [];
    return null;
  }
  o.bank = Math.round((o.budget - planCost(o.plan)) * OFFICE.carry);
  const groups = o.plan.map((g) => ({ k: g.k, n: g.n, sup: g.sup ? g.n : 0, door: g.door, at: g.at, gap: OFFICE.kinds[g.k].gap }));
  o.plan = [];
  return groups;
}
