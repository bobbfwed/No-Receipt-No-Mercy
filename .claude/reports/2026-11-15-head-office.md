# Head Office: one player runs the shoppers

Date: 2026-11-15

## Needs your attention

- **It has never been played by two people.** It was driven end to end on one computer by a test page that presses the real buttons in two linked games. Whether it is fun, and whether the budget is fair, is unknown.
- **The budget is a guess:** 85% of what the automatic wave would cost at the price list, plus half of what he left unspent, plus $5 for every shopper who got a refund in the last wave. A person will aim at the weak spot, so this may still be too generous. The numbers are in `OFFICE` in `src/sim/constants.js`.
- **I answered your three open questions with defaults:** he sees the whole store all the time; planning uses the normal build countdown, and the doors open early only when both sides ask; he wins when the store reaches the refund limit, with no separate score. Say if you want any of them changed.
- **His plan is not hidden from a determined builder:** the interface never shows it to store players, but it travels in the shared game state.
- **Partly on GitHub.** GitHub's `main` has the Head Office rules, tests and dialogue (a push I did not make brought it up to that point). The interface, the three fixes and this report are in local commits that are not pushed.

## Outline

### 1. How it works for the players
- With two or more players, any player can press **Run the shoppers** next to his name in the players list, between sales events. Only one player holds the job at a time, somebody must be left running the store, and he can hand it back.
- In place of the build bar he gets a planner in three parts: his budget; a card for every kind of shopper (price, trick, a star button for the super version, or the sales event it unlocks in); and his plan, one row per group, with how many, which entrance, when it starts arriving, what it costs, and a timeline.
- A kind can be bought from the same sales event the automatic waves first include it; supers likewise.
- If he buys nothing, the usual crowd comes and half his budget carries over.
- READY asks for the doors to open early; they do only when the store has asked too. Changing the plan takes his READY back. The countdown still opens them by itself.
- While the doors are open his panel shows how the wave is doing: got refunds, gave up, still to come, on the floor.
- He cannot build, and takes no share of the store's money. The crowd size and the refund limit count only the players still in the store (the limit keeps counting everyone who has joined).
- The end screen is flipped for him: "HEAD OFFICE WINS" when the store closes.
- DEB announces who took the job, blames him by name for each wave he sends, and nags whichever side is holding up the doors.

### 2. What was checked
- **Tests:** `node --test` reports 84 passed, 0 failed. Ten new tests cover prices, who may take the job, what he may not do, budgets, refused plans, both sides asking for the doors, the bought wave arriving at the right entrances at the right times, falling back to the usual wave, winning, and a client doing all of it over a connection.
- **In the browser:** `tools/office-test.html` plays a two-player game through the real buttons. Photographed: taking the job, an empty plan, a plan on two entrances, the budget running out, each side waiting for the other, a wave in progress on both screens, the next build phase, and both end screens, at 1600x900 and 1280x720. No page errors.
- **Solo and training** look the same as before.

### 3. Three fixes made after the first version was reviewed
- Editing the plan after pressing READY now takes the READY back, so the doors cannot open on a plan he is still changing.
- If the last store player drops out, the Head Office player is put back in the store.
- The game records when the doors opened, so his timeline's "now" marker is right on every screen.

## How the work was split
I wrote the rules, the tests, DEB's lines and the documents, and checked the result. One Opus worker built the planner and the rest of the interface (about 373,000 tokens).

## What changed (files)
- `src/sim/office.js` - new. `commands.js`, `state.js`, `step.js`, `constants.js`, `index.js` - changed.
- `src/ui/planner.js` - new. `game.js`, `hud.js`, `input.js`, `overlays.js`, `src/style.css` - changed.
- `src/content/lines.js`, `director.js`.
- `test/office.test.js` - new; `test/net.test.js`.
- `tools/office-test.html` - new.
- `PLAN.md`, `README.md`, `docs/architecture.md`.

## How to verify
1. Open http://localhost:5173/tools/two-player.html . In the right-hand game (Steve), press Run the shoppers in the players list, buy some shoppers, press READY; in the left-hand game press OPEN THE DOORS.
2. Or watch it play itself: http://localhost:5173/tools/office-test.html?view=both&step=wave&wave=7
3. `node --test` should report 84 passed.

## Suggested next steps
1. Play it with one friend: one of you as Head Office. Say whether the budget feels too big or too small, and whether a wave takes too long to plan.
2. Decide whether Head Office should have one-off abilities (a flash sale, a power cut) or whether buying shoppers is enough.
3. Tell me when you want this pushed.
