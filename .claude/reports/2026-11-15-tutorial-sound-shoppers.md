# Tutorial, sound, and four new shoppers

Date: 2026-11-15

## Needs your attention

- **Reload the page** (Ctrl+F5) to get the new version. The server from earlier is still running at http://localhost:5173/ ; if the page will not load, double-click `play.bat`.
- **Nobody has heard the sound.** Every effect was measured (audible, not clipping, no clicks), but whether it sounds good needs your ears. The worker's own doubts: the dog bark may sound like a squeaky toy, the teenager's sigh like wind, and the crate smash may be too quiet. To hear each sound by itself, open http://localhost:5173/tools/sound-test.html and use the play buttons.
- **DEB now speaks her lines aloud** using your computer's built-in voice, and she is crude. All sound is on by default. The speaker button at the top right has separate switches for effects, music and her voice.
- **I added a fourth new shopper you did not specify: the Gym Bro,** who walks through crate stacks and destroys them. You asked for "a couple more" besides the ones you described; say if you would rather not have him.
- **The game is harder with the new shoppers.** The scripted player who keeps investing still wins, but with 26 to 32 of the 40 allowed refunds, where it was 10 to 18.
- **The tutorial teaches dads but not the four new shoppers.** DEB explains each new kind the first time it appears, and the ? screen lists them all.

## Outline

### 1. A training shift teaches every building, hands on
"Training shift" is now the first button on the menu. It is a real game that cannot be lost, with free money, in 15 lessons:
1. What the game is.
2. to 6. Building a production line one piece at a time: Unpacker, belts (by dragging), Shipping Chute, then swapping in a Press and a Packer, waiting each time for the goods to sell so you see the money change.
7. to 9. The route shoppers walk, closing gaps with crates, and why the last gap can never be closed.
10. to 12. Security at the gap: a Pepper Sprinkler against Coupon Clippers, a Wet Floor Sign and a second sprinkler against Bargain Hunters, then Free Samples against a crowd. You open the doors yourself each time.
13. and 14. Dads: four walk straight over your belts, then you stop the next five with a Forklift Turret and wet floor signs.
15. What changes in a real game.

Each lesson highlights the build-bar button to press and the tiles to build on, shows a hint if something is wrong (for example a belt pointing the wrong way), and moves on by itself when the task is done. You can skip a step or go back.

### 2. The game explains itself outside the tutorial too
- While you are building, the floor shows a yellow dashed line: the route shoppers will walk. If dads have a short cut over your belts it is drawn in blue.
- Picking a building shows what it does and how to use it in the build bar.
- The ? screen now lists every building and every kind of shopper, with what works against each.

### 3. Sound
- Effects for sales, sprays, forklift shots, refunds, shoppers storming off, slips, wave start and end, winning and losing, building, removing, rotating and refused actions.
- Quiet store muzak.
- DEB's lines read aloud.
- A speaker menu: effects, music, voice, volume. Settings are remembered.
- Everything is generated in the browser; there are no audio files.

### 4. Four new shoppers
| Shopper | What it does | First appears |
|---|---|---|
| Mom and Kid | Walks normally with the kid in the cart. At random the kid escapes and runs 3 to 9 tiles ahead along the route; she sprints after him, ignoring free samples, until she catches him. He can escape again. | Wave 3 |
| Teenager | Slow. Spills a slushie every few seconds. The mess lasts 12 seconds, halves the speed of other shoppers who cross it, and can make a dad slip. | Wave 4 |
| Man with Guide Dog | The dog steers him around wet floors and messes, and he cannot see free samples. Pepper spray makes the dog bolt, dragging him forward fast, so sprinklers speed him up. | Wave 6 |
| Gym Bro | Walks through crate stacks and destroys them. Machines and belts still stop him. | Wave 8 |

Each has its own drawing, states, effects, sounds and customer reviews. DEB explains each kind in one line the first time it turns up.

### 5. What was checked
- **Tests:** `node --test` gives 44 passed, 0 failed (it was 30). New tests cover training mode, each new shopper's behaviour, and that the game stays in step between host and clients with the new shoppers.
- **The tutorial was played automatically from start to finish** by a test, with eight different random seeds. Each lesson finished and did what its text says: one sprinkler stops all three Coupon Clippers, the sign and two sprinklers stop all four Bargain Hunters, all four dads walk through the belts, and the forklift setup stops at least three of five dads.
- **The tutorial was also played with simulated mouse and keyboard events in the real page,** following its own instructions (pick the tool, press R, click, drag, right-click, press OPEN THE DOORS). It completed the first ten lessons. That run found two problems, both fixed: an info card covered the tiles the lesson pointed at, and one Coupon Clipper slipped past the sprinkler when the lesson said none would.
- **Screens checked by screenshot:** menu with the new button, several tutorial lessons, the info card, the sound menu, the help screen, and a line-up of all nine shoppers in every state.
- **Sound:** measured, as above. A real game ran with sound on with no errors.
- **Difficulty:** scripted players, as above.

## How the work was split
I built the tutorial, the training rules, the route guides, the new shoppers' rules, their dialogue and all the tests, and did the checking. Two Opus workers built the sound (about 222,000 tokens) and drew the new shoppers (about 240,000 tokens), each in its own folder.

## What changed (files)
- `src/tutorial/lessons.js`, `src/ui/tutorial.js` - the training shift.
- `src/render/guides.js` - route lines and highlighted tiles. `src/render/messes.js`, `shoppers.js`, `effects.js` - new drawings.
- `src/audio/` - sound.
- `src/content/help.js` - plain explanations of buildings and shoppers. `src/content/lines.js`, `director.js` - new lines and introductions.
- `src/sim/` - training mode, the four new shoppers, a third route map for gym bros.
- `src/ui/` - menu button, info card, sound menu, help screen.
- `test/tutorial.test.js`, `test/shoppers.test.js` - new tests.
- `tools/tutorial-test.html`, `tools/poke.html`, `tools/sound-test.html` - test pages.
- `PLAN.md`, `README.md`, `docs/architecture.md` - updated.

## How to verify
1. Reload http://localhost:5173/ and press Training shift.
2. `node --test` should report 44 passed.
3. Open http://localhost:5173/tools/sound-test.html to hear each sound.

## Suggested next steps
1. Do the training shift and tell me where it lost you.
2. Tell me which sounds are wrong or annoying; each is a few lines to change.
3. Play a real game to wave 8 or so to meet the new shoppers, and say whether any of them is unfair or dull.
