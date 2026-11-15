// A ready-made warehouse layout. Used by tests, by the balance bot, and by the "?demo" page
// option so the game can be looked at without building anything by hand.
import { applyCommand } from './commands.js';

const E = 0, S = 1, N = 3;

/** Two production lines that form walls with gaps, and security around the gaps. */
export const DEMO_LAYOUT = [
  // Line 1: a wall down column 6, open at the bottom.
  ['unpacker', 6, 1, S], ['belt', 6, 2, S], ['belt', 6, 3, S], ['belt', 6, 4, S], ['belt', 6, 5, S],
  ['press', 6, 6, S], ['belt', 6, 7, S], ['belt', 6, 8, S], ['packer', 6, 9, S], ['belt', 6, 10, S],
  ['chute', 6, 11, 0],
  // Line 2: a wall up column 13, open at the top.
  ['unpacker', 13, 14, N], ['belt', 13, 13, N], ['belt', 13, 12, N], ['belt', 13, 11, N], ['belt', 13, 10, N],
  ['press', 13, 9, N], ['belt', 13, 8, N], ['belt', 13, 7, N], ['packer', 13, 6, N], ['belt', 13, 5, N],
  ['chute', 13, 4, 0],
  // Line 3: a short wall in column 21, open at the bottom.
  ['unpacker', 21, 1, S], ['belt', 21, 2, S], ['belt', 21, 3, S], ['belt', 21, 4, S], ['press', 21, 5, S],
  ['belt', 21, 6, S], ['belt', 21, 7, S], ['belt', 21, 8, S], ['belt', 21, 9, S], ['chute', 21, 10, 0],
  ['crate', 21, 11, 0], ['crate', 21, 12, 0],
  // Security.
  ['sprinkler', 7, 11, 0], ['sprinkler', 5, 13, 0], ['wetfloor', 6, 13, 0], ['forklift', 9, 8, 0],
  ['samples', 9, 13, 0], ['sprinkler', 12, 3, 0], ['sprinkler', 14, 3, 0], ['wetfloor', 13, 2, 0],
  ['forklift', 17, 7, 0], ['sprinkler', 20, 13, 0], ['sprinkler', 22, 13, 0], ['wetfloor', 21, 13, 0],
  ['forklift', 25, 8, 0],
];

/**
 * Builds the demo layout for a player, giving the team enough cash to pay for it.
 * @returns {string[]} problems, empty if everything was placed
 */
export function applyDemoLayout(state, pid = 0) {
  const problems = [];
  state.cash += 5000;
  for (const [k, x, y, d] of DEMO_LAYOUT) {
    const r = applyCommand(state, pid, { c: 'place', k, x, y, d });
    if (!r.ok) problems.push(`${k} at ${x},${y}: ${r.why}`);
  }
  state.cash = Math.max(0, state.cash - 5000) + 300;
  return problems;
}

export { E, S, N };
