// Upgrades. Security can be upgraded again and again; each level costs more than the last
// (TUNE.upGrowth times more), so a full floor still leaves something to spend money on.
import { BUILD, TUNE } from './constants.js';

/** A building's level: 1 when first built. */
export const levelOf = (b) => (b && b.lv) || 1;

/**
 * What the next level of a building costs, or 0 if it cannot be upgraded (wrong kind, or at
 * the top level).
 */
export function upgradeCost(b) {
  const def = b && BUILD[b.k];
  if (!def || !def.up || levelOf(b) >= TUNE.maxLevel) return 0;
  return Math.round(def.cost * TUNE.upFirst * TUNE.upGrowth ** (levelOf(b) - 1));
}

/** Everything spent on a building so far: its price and its upgrades. */
export function spentOn(b) {
  const def = BUILD[b.k];
  let sum = def.cost;
  for (let lv = 1; lv < levelOf(b); lv++) sum += Math.round(def.cost * TUNE.upFirst * TUNE.upGrowth ** (lv - 1));
  return sum;
}

/**
 * A building's numbers at a level (its own level if none is given). Only the numbers its kind
 * has are meaningful:
 *   dmg, range, cd   towers
 *   range, secs      free samples (how long a sample stops a shopper)
 *   slow, slip, slipDmg  wet floor sign (speed multiplier, chance a dad slips, patience he loses)
 */
export function statsOf(b, level = levelOf(b)) {
  const def = BUILD[b.k], up = def.up || {}, n = level - 1;
  return {
    dmg: (def.dmg || 0) * (up.dmg || 1) ** n,
    range: (def.range || 0) + (up.range || 0) * n,
    cd: def.cd || 0,
    secs: TUNE.sampleSecs * (up.secs || 1) ** n,
    slow: TUNE.wetSlow * (up.slow || 1) ** n,
    slip: Math.min(0.95, TUNE.slipChance + (up.slip || 0) * n),
    slipDmg: TUNE.slipDmg * 1.45 ** n,
  };
}
