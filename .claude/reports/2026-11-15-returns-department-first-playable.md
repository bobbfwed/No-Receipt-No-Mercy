# Returns Department: first playable version

Date: 2026-11-15

## Needs your attention

- **It has not been played by a human yet.** Everything below was checked by tests, screenshots and simulated mouse and keyboard events. Please play a solo game for ten minutes and tell me what feels wrong.
- **To play with friends in other houses, the files must be on a web address.** The simplest is GitHub Pages once the repository is on GitHub; `README.md` has the steps. Until then you can try multiplayer alone at `http://localhost:5173/tools/two-player.html`.
- **Online play was tested on one machine only.** Two browser windows connected through the internet broker and stayed in step. Whether each friend's home network allows a direct connection can only be found out by trying. If someone cannot connect, tell me and I will add a relay fallback.
- **Online play depends on a free public service (PeerJS)** to introduce the browsers to each other. If it is down, online games cannot start. I chose it so you need no server or account; say so if you would rather not depend on it.
- **Difficulty is a first guess,** tuned with scripted players, not people. All the numbers are in `src/sim/constants.js`.
- **Decisions I made without asking** are listed in `PLAN.md` (stack, hosting, how dads work, roles being cosmetic for now). Overrule any of them.
- **Branch.** This work is on a new branch, `returns-department`. `main` still holds only the first commit; `concepts` holds the gallery. Nothing was pushed.

## Outline

### 1. The game is playable from start to finish
Open the dev server (`node tools/serve.mjs`, then http://localhost:5173/) and press Play solo. You build with the mouse and number keys, open the doors, survive 20 waves or lose at 40 refunds.
- Factory: belts, Unpacker, Press, Packer, Shipping Chute, Crate Stack. Dragging lays a belt line that follows the drag.
- Security: Pepper Sprinkler, Forklift Turret, Wet Floor Sign, Free Samples.
- Shoppers: Bargain Hunter, Coupon Clipper, Dad, Karen, Mobility Scooter, each drawn differently and behaving differently.
- Shared cash, a build pause between waves, game speed 1x to 3x.

### 2. Dads are in, and they are the main threat
A dad line is a single file of men who walk fast, ignore free samples and goods on belts, and **step straight over conveyor belts**. Only machines, crates and towers stop a dad. His patience drains every second he is in the store, so you beat him by wasting his time; he ignores wet floor signs and sometimes slips on them. A dad who gets through leaves a five-star review ("In and out in four minutes. Nobody spoke to me. Perfect."). In the scripted games, dads were the most common shopper to get through against a belt-only maze.

### 3. The game insults the players
DEB, the HR chatbot, comments on wave starts, dad lines, shoplifting, refunds, players undoing their own work or tearing out someone else's, and refused commands, using the players' names. Customers leave reviews. After every wave a performance review stamps each player (ADEQUATE, LIABILITY, WHY IS HE HERE) and names an employee of the wave, which is never one of you. All lines are in `src/content/lines.js`; add or change jokes there.

### 4. Multiplayer works on one machine
One player hosts in his browser; others join with a five-letter room code or an invite link. Friends can join mid-game, and a dropped player gets his slot back by name. Up to six players.

### 5. What was checked, and how
- **Tests:** `node --test` gives 30 passed, 0 failed. They cover the rules (placement, belts, machines, towers, each shopper behaviour, dads over belts, win and lose), that the game is deterministic, and the multiplayer sessions (join, commands, refusals, staying in step, dropping and rejoining, the six-player limit).
- **Screens checked by screenshot:** menu, invite-link menu, solo start, mid-wave, late wave with every shopper type, performance review, game over, at 1280x720 and 1600x900. No error banners.
- **Mouse and keyboard:** a test page played a solo game with simulated events: it built a working production line by dragging, placed security, was correctly refused a forklift it could not afford, removed a crate with right-click, rotated a belt with R, and opened the doors. The result matched.
- **Two players between tabs:** host and joined player side by side showed the same game.
- **Two players through the internet broker:** same result, with no page errors.
- **Difficulty:** scripted players. Building nothing loses in wave 3. A fixed good layout with no further spending loses in wave 10, mostly to dads. A player who buys a sensible list and then stops loses in wave 17. One who keeps buying wins with 10 to 18 of the 40 refunds. A full game is about 30 minutes.

### 6. Not done
- No sound.
- Roles (Floor Manager, Loss Prevention, and so on) are labels only; anyone can build anything.
- Late-game cash piles up because there is nothing expensive left to buy. Tower upgrades are the planned fix.
- One map.
- A game cannot be saved and resumed.
- The short lines dads say when they give up ("I'll come back Tuesday") are in the drawing code, not yet in the shared lines file.

## How the work was split
I wrote the rules engine, multiplayer, dialogue, tests and tools, and did the integration and checking. Two Opus workers built the graphics (about 359,000 tokens) and the interface (about 222,000 tokens) in parallel against a written contract (`docs/architecture.md`). I reviewed their code and screens, and changed two things: a dragged belt line now ends pointing the way you dragged, and the How to play panel explains dads.

## What changed (files)
- `index.html`, `src/main.js`, `src/style.css`, `src/ui/` - page, menu and interface.
- `src/render/` - canvas drawing.
- `src/sim/` - the rules. `src/net/` - multiplayer. `src/content/` - dialogue.
- `test/` - tests. `tools/` - dev server, screenshot tools, balance bots, test pages.
- `vendor/peerjs.min.js` - third-party network library (PeerJS 1.5.4, MIT licence), downloaded from unpkg.
- `README.md` - how to run and how to play with friends. `PLAN.md` - plan and decisions. `docs/architecture.md` - how the code is organised. `CLAUDE.md` - updated for the chosen game.

## How to verify
1. `node --test` should report 30 passed.
2. `node tools/serve.mjs`, open http://localhost:5173/ , press Play solo, build something, open the doors.
3. Open http://localhost:5173/tools/two-player.html to see two players at once (click in either half to build).
4. `node tools/balance.mjs` prints how the scripted players fared.

## Suggested next steps
1. Play it and send me what is confusing, boring, too easy or too hard.
2. Put it on GitHub Pages and try one session with a friend.
3. Then, in rough order of value: tower upgrades, sound, security that needs supplies from the factory, a boss every fifth wave, a second map.
