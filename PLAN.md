# No Receipt, No Mercy: plan

The game's name is "No Receipt, No Mercy", with the tagline "The customer is always a prick." (the owner's choice from the list further down). Chosen concept: 01 Returns Department (see `concepts/index.html`). This file records the plan, the decisions made without asking, and what is done. Keep it up to date as work lands.

## The game
A discount warehouse on Black Friday. Shoppers come in through the entrances (one per player) and want a refund at the tills on the right. Each player has his own cash, the store's income and refunds are split evenly between them, and they split two jobs: the **factory** (belts and machines that make goods and sell them) and **security** (towers that annoy shoppers until they storm out). Belts and machines block shoppers, so the factory is the maze. Twenty waves; forty refunds (ten more per extra player) and the store closes. DEB, the HR chatbot, insults everyone throughout.

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
| Difficulty | Tuned with scripted players (`node tools/balance.mjs`) on the one-player map: a player who builds a sound layout and then stops spending loses at wave 13 with about $13,000 unspent; one who keeps buying forklifts and upgrades loses at wave 19 | The owner found the late game too easy. The scripted player is a poor economist and spreads its upgrades thinly, so a person should do better than it, but whether a person can actually win now is untested. All numbers are in `src/sim/constants.js` |
| Map sizes | Seven sizes. The original 30 x 16 is kept as "Corner Shop"; the size for one player is half as big again (36 x 20), and each further size is half as big again as the last, up to 99 x 55 for six | Owner's rule. The area grows by half each step, not the width |
| Map designs | Open Warehouse, Flat-Pack Showroom (walled rooms joined by two-tile doorways), Supermarket Aisles (rows of shelving and a wide main aisle) | Owner asked for different designs, with walled rooms as the example |
| Entrances | Six possible entrances on every map: three on the left wall, two on top, one on the bottom, all toward the left. They open in this order as players join: left middle, top, bottom, left upper, left lower, top further along. Entrances that are still shut are drawn, and the maze may not wall them in | Owner asked for one per player, mostly on one side, some top and bottom. Fixed positions mean a player joining late never moves anyone's entrance |
| More players | Each extra player adds half a solo game's worth of shoppers and 10 to the refund limit, and every player gets the full end-of-wave bonus | So a bigger group is busier without the money per head dropping. Untested with real groups |
| Money | Each player has $500 of his own (a late joiner gets $60 more per wave already played). Income and refunds are split between the players who are connected. Selling a building pays whoever bought it. A player can give another $100 at a time from the players list | Owner's rule; the give button is my addition, so a factory player can fund a security player |
| Upgrades | Security only (sprinkler, forklift, wet floor sign, free samples), up to level 10. The first upgrade costs the building's price; each one after costs 1.8 times the last. Each level multiplies damage by 1.45 | Owner asked for upgrades that get exponentially more expensive. Factory machines are not upgradeable, because more income was the problem |
| Super shoppers | Every kind has one, from wave 6 (hunter) to wave 14 (guide dog), a growing share of each group. All take a double refund | Owner's rule: at least twice as strong, Karen four times the patience, mom three times the chase speed |
| Gym bros | Wreck every crate stack beside their route, and 15% of the time something else. Upgraded security loses a level instead of being destroyed. A Rebuild button (B) puts back what was wrecked, at full price | Owner wanted more wrecking and of more things. The level rule and the button are mine, to stop it being a chore or wiping out a $10,000 tower |
| Runaway kids | Run toward the tills straight through everything except the store's own walls, then wait at the first open spot that is further along the route than the mom; she runs the maze to them | Owner's rule |

## Milestones
1. **Rules engine** - done. Belts, four machines, crates, four security items, five shopper types, 20 waves, shared cash, win and lose. Covered by tests.
2. **Multiplayer core** - done. Host and client sessions, three ways to connect (in-memory for tests, between tabs, online). Covered by tests except the real online link, which needs two real browsers.
3. **Dialogue** - done. DEB's lines, customer reviews, end-of-wave performance review.
4. **Graphics** - done. Canvas drawing of the warehouse, every building, five shopper types with states, and effects.
5. **Interface** - done. Menu, host/join with invite link, HUD, build bar, mouse and keyboard building, speech bubble, reviews, performance review, end screens.
6. **Integration and checks** - done on one machine. Checked by screenshot: menu, solo, mid-wave, performance review, game over, two players side by side (between tabs and through the internet broker), and building with simulated mouse and keyboard events.
7. **Training shift (tutorial)** - done. Sixteen hands-on lessons covering every building, the shopper route, dads, and upgrades against a super shopper. A test plays it end to end. The floor also shows the shopper route while building, holding a building explains it in the build bar, and the ? screen lists every building and shopper.
8. **Sound** - done, not yet heard by a person. Synthesized effects, store muzak and DEB's spoken lines, with a speaker menu to switch each off. Measured (audible, not clipping), not listened to.
9. **More shoppers** - done. Teenager (messes slow others), Mom and Kid (runaway child, she sprints after him), Man with Guide Dog (spray makes the dog bolt), Gym Bro (walks through crates). DEB introduces each kind when it first appears. With these in, the scripted player who keeps investing wins with 26 to 32 of 40 refunds (it was 10 to 18), so the late game is tighter.
10. **Playtest with real people** - owner. Needs the files on a web address (see README.md), then two or more people on different networks. Things only a real session can show: whether every friend's home network lets the browsers connect directly, how it feels with real lag, and whether the difficulty is right.

11. **Bigger game** - done, not yet played by a person. Map sizes and designs, WASD camera and a small overview map, an entrance and a bank account per player, upgrades, super shoppers, harder late waves, gym bros that wreck things, kids that run through everything. See the decisions table above.

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

## Name ideas (decided: number 2 as the title, number 1 as the tagline)
1. The Customer Is Always a Prick
2. No Receipt, No Mercy
3. Go Refund Yourself
4. Shrinkage
5. Belt Me, Daddy
6. Black Friday, Brown Trousers
7. Clean-Up on Aisle Your Mom
8. Manager? I Barely Know Her
9. Pepper Spray and Pray
10. Store Credit Only, Dickhead

## Ideas for later (not started)
- Security that needs supplies delivered by belt, tying the two jobs closer together.
- More shopper types and a boss every fifth wave (the Regional Manager).
- More map designs (a food court, a car park), and maps with tills on more than one wall.
- Upgrades for factory machines, if the late game needs more income.
- An endless mode after wave 20.
- Teaching the newer shoppers in the training shift (it covers dads and one super shopper; the others are explained by DEB and the ? screen).
- Saving a game in the host's browser so a session can be resumed.
- Role restrictions as an optional hard mode.
