# Salesman fix, equal factory machines, harder waves after 30 (releases 0.2.13 to 0.2.15)
> Note added later: the per-commit release numbers in this report (0.2.13 to 0.2.17) were collapsed. Everything here ships as release 0.2.13.

## Needs your attention
- **Nothing is pushed.** Three commits sit on local `main`; push when you are ready (the patch version bump before a push is still yours to ask for).
- **The Gift Set now sells for $15 instead of $18 (Normal).** The Packer was the slow machine (3 s an item against 2.5 s for the others). It now runs at 2.5 s, so the Gift Set's value was cut by the same share to keep a full line earning the same money per second. Say so if you would rather keep $18 and let the factory earn about 20% more.
- **Nobody has played the new late game.** The balance bots lose around event 16 (Normal) and never reach event 31, so the waves after 30 are checked by tests and arithmetic only. Expect to tune the two growth numbers after a real session.
- Two list items are not done and remain in `CLAUDE.md`: returning everyone to the lobby after a multiplayer game, and more factory upgrades.

## What was done
1. **Waves after 30 now compound.** From event 31 on, shopper patience grows 5.5% per event and head count 2% per event, on top of the old curve. Against the old game that is about 2.1x harder at event 40, 4.3x at event 50, and 8.5x the patience with 2.2x the shoppers at event 70. Events 1 to 30 are unchanged. Rewards do not grow. The boss's patience grows too, and so does a dad's drain (it already followed the patience curve). Numbers: `surgeFrom`, `surgeHp`, `surgeCrowd` in `src/sim/constants.js`.
2. **The TV Salesman can no longer hold a shopper forever.** The written chance applies to a salesman's first pitch to a shopper; each later pitch by the same salesman is half as likely to stop him. A second salesman further on still gets his full first chance. Only the chance to stop halves; the chance to hurry a shopper past is unchanged, since that never holds anyone. Number: `pitchRepeat`. The Handbook card has a new line about it.
3. **All three factory machines work at the same pace and upgrade the same way.** 2.5 s an item, and one shared speed track (x1.25 speed, x1.8 price per level, five levels). Each machine keeps its own first-level upgrade price ($100 / $300 / $540). Belts are not the limit: a maxed machine makes about 1.2 items a second and a belt carries 4.

## Test results
- `node --test`: 273 pass, 0 fail (rerun by me after the last commit).
- `node tools/balance.mjs`, seed 11, after the machine change: bots reach events 11 / 16 / 16, the same as release 0.2.12.

## Files changed
`src/sim/constants.js`, `src/sim/step.js`, `src/sim/state.js`, `src/sim/index.js`, `src/ui/handbook.js`, `src/content/help.js`, `src/content/lines.js`, `src/tutorial/lessons.js`, `src/version.js`, four test files, `README.md`, `PLAN.md`, `CLAUDE.md` (three finished items removed; the first commit also took in your uncommitted edits to it).

Commits: `415e7a4` (salesman, 0.2.13), `0efa98e` (machines, 0.2.14), `03af17e` (late waves, 0.2.15).

## How to verify
Run `node tools/serve.mjs`, open `http://localhost:5173/`, check the menu shows release .15, and play an endless game past event 30. Watch a shopper at a salesman's stand: he should leave after a few pitches.

## Suggested next steps
Play to event 40 to 50 and tell me whether the climb is too steep or too gentle; then the lobby return and the extra factory upgrades.

Workers: one general-purpose worker on Opus did all three items (about 125,000 tokens, 6 minutes). The conductor (Fable) wrote the scope and checked the simulation diff and the tests.
