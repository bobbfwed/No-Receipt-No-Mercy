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
| Difficulty | Tuned with scripted players (`node tools/balance.mjs`): a player who stops investing mid-game loses around wave 17; one who keeps investing wins with 10 to 18 refunds | Needs real playtesting; all numbers are in `src/sim/constants.js` |

## Milestones
1. **Rules engine** - done. Belts, four machines, crates, four security items, five shopper types, 20 waves, shared cash, win and lose. Covered by tests.
2. **Multiplayer core** - done. Host and client sessions, three ways to connect (in-memory for tests, between tabs, online). Covered by tests except the real online link, which needs two real browsers.
3. **Dialogue** - done. DEB's lines, customer reviews, end-of-wave performance review.
4. **Graphics** - done. Canvas drawing of the warehouse, every building, five shopper types with states, and effects.
5. **Interface** - done. Menu, host/join with invite link, HUD, build bar, mouse and keyboard building, speech bubble, reviews, performance review, end screens.
6. **Integration and checks** - done on one machine. Checked by screenshot: menu, solo, mid-wave, performance review, game over, two players side by side (between tabs and through the internet broker), and building with simulated mouse and keyboard events.
7. **Playtest with real people** - owner. Needs the files on a web address (see README.md), then two or more people on different networks. Things only a real session can show: whether every friend's home network lets the browsers connect directly, how it feels with real lag, and whether the difficulty is right.

## Ideas for later (not started)
- Tower upgrades, so late-game cash has somewhere to go.
- Security that needs supplies delivered by belt, tying the two jobs closer together.
- More shopper types and a boss every fifth wave (the Regional Manager).
- A second, larger map; choosing a map in the menu.
- Sound.
- Saving a game in the host's browser so a session can be resumed.
- Role restrictions as an optional hard mode.
