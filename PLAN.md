# Returns Department: plan

Chosen concept: 01 Returns Department (see `concepts/index.html`). This file records the plan, the decisions made without asking, and what is done. Keep it up to date as work lands.

## The game
A discount warehouse on Black Friday. Shoppers come in on the left and want a refund at the tills on the right. Players share one pot of cash and split two jobs: the **factory** (belts and machines that make goods and sell them) and **security** (towers that annoy shoppers until they storm out). Belts and machines block shoppers, so the factory is the maze. Twenty waves; forty refunds and the store closes. DEB, the HR chatbot, insults everyone throughout.

**Dads** (owner's request): men who just want to get through the line. They arrive single file, walk fast, ignore every distraction, and step straight over conveyor belts. Their patience drains while they are in the store, so you beat them by wasting their time with real walls, wet floor signs and towers on their route. A dad who gets through leaves a five-star review.

## Decisions made for the owner (change any of these by saying so)
| Decision | Choice | Why |
|---|---|---|
| Language and tools | Plain JavaScript modules, Canvas, no build step, no packages | Nothing to install or compile; hosts as static files; easy for anyone to run |
| Hosting | Any static host; GitHub Pages once the repo is on GitHub | No server of our own to keep alive |
| Multiplayer | The host's browser runs the game; friends connect browser-to-browser (WebRTC) using a five-letter room code | Matches "one person is a temporary host" |
| Connection broker | The free public PeerJS service, used only to introduce browsers to each other | No account or server needed. Risk: if that service is down, online games cannot start. Solo and same-computer play still work |
| Late joining | Friends can join at any time; a dropped player gets his slot back by name | Friends turn up late |
| Roles | Job titles are cosmetic in this version; anyone can build anything | Lets one or two players cover everything. Restricting roles can come later if wanted |
| Dads | As described above | Interpretation of "dads that just want to get through the line as quickly as possible" |
| Sound | Everything is generated in the browser (no audio files); DEB's lines are read aloud by the browser's built-in voice; all three (effects, music, voice) are on by default with a menu to switch them off | No assets to make or license. The voice depends on what the player's computer has installed |
| Extra shoppers | Besides the teenager, mom-and-kid and guide dog the owner described, a Gym Bro who walks through crate stacks | Owner asked for "a couple more"; this one gives crate walls a weakness, as dads do for belts |
| Difficulty | Tuned with scripted players (`node tools/balance.mjs`): a player who stops investing mid-game loses around wave 17; one who keeps investing wins with 10 to 18 refunds | Needs real playtesting; all numbers are in `src/sim/constants.js` |

## Milestones
1. **Rules engine** - done. Belts, four machines, crates, four security items, five shopper types, 20 waves, shared cash, win and lose. Covered by tests.
2. **Multiplayer core** - done. Host and client sessions, three ways to connect (in-memory for tests, between tabs, online). Covered by tests except the real online link, which needs two real browsers.
3. **Dialogue** - done. DEB's lines, customer reviews, end-of-wave performance review.
4. **Graphics** - done. Canvas drawing of the warehouse, every building, five shopper types with states, and effects.
5. **Interface** - done. Menu, host/join with invite link, HUD, build bar, mouse and keyboard building, speech bubble, reviews, performance review, end screens.
6. **Integration and checks** - done on one machine. Checked by screenshot: menu, solo, mid-wave, performance review, game over, two players side by side (between tabs and through the internet broker), and building with simulated mouse and keyboard events.
7. **Training shift (tutorial)** - done. Fifteen hands-on lessons covering every building, the shopper route and dads. A test plays it end to end. The floor also shows the shopper route while building, holding a building explains it in the build bar, and the ? screen lists every building and shopper.
8. **Sound** - done, not yet heard by a person. Synthesized effects, store muzak and DEB's spoken lines, with a speaker menu to switch each off. Measured (audible, not clipping), not listened to.
9. **More shoppers** - done. Teenager (messes slow others), Mom and Kid (runaway child, she sprints after him), Man with Guide Dog (spray makes the dog bolt), Gym Bro (walks through crates). DEB introduces each kind when it first appears. With these in, the scripted player who keeps investing wins with 26 to 32 of 40 refunds (it was 10 to 18), so the late game is tighter.
10. **Playtest with real people** - owner. Needs the files on a web address (see README.md), then two or more people on different networks. Things only a real session can show: whether every friend's home network lets the browsers connect directly, how it feels with real lag, and whether the difficulty is right.

## To do: a player who runs the shoppers (owner's idea, not started)
One player stops defending and plays the other side: each wave he gets a budget, buys shoppers with it and sends them in. At least one other player must be building the factory and security. The aim is a completely different way to play the same game.

**How it would work**
- In the menu or in the game, a player picks the job "Head Office". The game refuses if nobody would be left on the store's side.
- Every shopper kind has a price, worked out from the numbers the game already has (patience, speed, refund, and its trick). Supers cost more. The budget for wave N is roughly what the automatic wave N is worth on that price list, so the automatic waves and a human organiser stay comparable. Early on it is set a little lower, because a person will aim at the weak spot and the computer does not.
- During the build pause he fills a wave: which kinds, how many, which entrance each group uses, and when it arrives (seconds after the doors open). Unspent budget carries over in part. If he does nothing, the automatic wave is used.
- He wins if the store reaches the refund limit; the builders win if they survive all 20 waves. Each refund he causes adds a little to his next budget, so success snowballs slowly, as the builders' factory does.
- Later additions if the basic version is fun: one-off abilities bought from the same budget (a "flash sale" that speeds one group up, a power cut that stops belts for a few seconds), and two organisers splitting the budget.

**What it might look like**
- He sees the same floor as everyone else (these are friends in one voice call; hiding the map would mostly be annoying), with the shopper routes always drawn.
- In place of the build bar he has a shopper bar: one card per kind with its price and trick. Clicking a card adds a group to a timeline at the bottom, one row per entrance, where groups can be dragged earlier or later and resized. A counter shows budget left.
- The builders see only "Head Office is planning..." and, when the doors open, the usual announcement of what is coming.

**How it fits the existing game**
- The rules engine already takes a wave as a list of groups (kind, how many, gap, start time), which is exactly what the tutorial uses. This mode adds an entrance to each group and one new command ("plan this wave") that the host checks against the budget. Nothing else in the rules changes.
- He has no bank account, takes no share of the store's income and does not count toward the number of entrances or the size of the automatic crowd.
- DEB gets a second set of lines: she works for him, and insults both sides.
- Open questions for the owner before building it: should he see the builders' layout while planning; should there be a time limit on planning; and is winning by refund limit enough, or should he also score points per shopper who gets through.

## Ideas for later (not started)
- Tower upgrades, so late-game cash has somewhere to go.
- Security that needs supplies delivered by belt, tying the two jobs closer together.
- More shopper types and a boss every fifth wave (the Regional Manager).
- A second, larger map; choosing a map in the menu.
- Teaching the newer shoppers in the training shift (it currently covers dads only; the others are explained by DEB and the ? screen).
- Saving a game in the host's browser so a session can be resumed.
- Role restrictions as an optional hard mode.
