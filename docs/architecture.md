# No Receipt, No Mercy: how the code is organised

Read this before changing anything. It is the contract between the parts of the game.

## The game in one paragraph
Shoppers enter a store through its entrances (one per player, mostly on the left) and walk to the tills on the right. Every shopper who reaches a till takes a refund, split evenly between the players; 40 refunds (10 more per extra player) and the store closes. Players build a factory (belts and machines that turn boxes into goods and sell them for cash) and security (towers that wear down shoppers' patience until they storm out). Belts and machines block shoppers, so **the factory is the maze**. There are 20 waves ("sales events") with a build pause between them. Each player has his own cash and pays for what he builds; income is split evenly. Security can be upgraded, every shopper kind has a tougher "super" version in later waves, and the store comes in several designs and sizes.

Dads are the special case the owner asked for. They arrive in a single-file "dad line", walk fast, ignore free samples and goods on belts, and **step over conveyor belts** (only machines, crates and towers stop them). Their patience drains every second they are in the store, so the way to beat a dad is to waste his time: solid walls, wet floor signs (he ignores the sign and may slip) and towers along his route. A dad who gets through leaves a smug five-star review.

## Layers

```
index.html, src/main.js      page, menu, wiring                      (UI)
src/ui/                      HUD, build bar, speech bubbles, review  (UI, plain DOM)
src/render/                  draws the warehouse on a canvas         (rendering)
src/audio/                   sound effects, music, DEB's voice       (all synthesized, no files)
src/tutorial/lessons.js      the training shift's lessons            (no DOM; a test plays them)
src/net/session.js           HostSession / ClientSession             (multiplayer)
src/net/transports.js        how two browsers exchange messages
src/content/                 every joke, and the director that picks them
src/sim/                     the rules; no DOM, no network, no clock
```

Dependencies only point downward. `src/sim` imports nothing from the other folders and must stay runnable in plain Node (the tests do exactly that).

## Simulation (`src/sim`)
- Import from `src/sim/index.js` only.
- The game state is one plain JSON-safe object made by `createGame()`. Its fields are documented in `src/sim/state.js`.
- `step(state)` advances one tick (30 ticks a second) and returns the events of that tick.
- `applyCommand(state, playerId, cmd)` is the only way players change the state. It validates everything.
- `canPlace(state, kind, x, y, playerId)` returns `null` if that player may put a building there, otherwise a reason string. The UI uses it to colour the placement preview. `canUpgrade(state, x, y, playerId)` does the same for upgrades.
- It is deterministic: random numbers come from `rand(state)`, never `Math.random()`. Keep it that way; clients rely on it to predict the game between host updates.
- All tuning numbers and all definitions of buildings, shoppers and items are in `src/sim/constants.js`.

Maps: `src/sim/maps.js` builds the floor plan from a design and a size (`createGame({ map: { design, size } })`; left out, it is the original 30 x 16 warehouse with one entrance, which the tutorial and most tests use). The plan lives in the state: `state.w`, `state.h`, `state.tiles` (one string; the characters are explained in `maps.js`), `state.doors` (the entrances in the order they open) and `state.open` (how many are open: one per player). Entrances that are still shut exist from the start and count as floor for path-finding, so the maze can never wall one in. Nothing may assume a fixed map size.

Marked floor: `state.zones` is a string like `state.tiles`, one character per tile: a key of `ZONES` (`u` Loading Bay, `p` Press Shop, `k` Gift Wrap, `c` Shipping) or a space. A building whose definition has a `zone` may only be placed on that kind of floor (`canPlace` returns `'zone'`). `makeZones()` in `maps.js` lays the patches out so that different kinds never touch, which is what makes belts necessary. An empty string means no marked floor: the bare default map used by most tests. The tutorial turns it on with `createGame({ training: true, zones: true })`.

Money: `state.players[i].cash`. There is no shared pot. `earn()` and `lose()` in `state.js` split income and refunds evenly between the connected players; `teamCash(state)` adds everyone's up for display.

Upgrades: `src/sim/upgrades.js`. A building's level is `b.lv` (absent means 1); `statsOf(b)` gives its numbers at its level and is the only place the simulation or the interface should read a tower's damage or range from.

Super shoppers: a shopper with `sup: 1` plays by `SUPERS[kind]` instead of `SHOPPERS[kind]`; always go through `defOf(shopper)`.

Head Office: `src/sim/office.js`. One player may switch `side` to `'office'` and buy the coming wave from a budget instead of building (`state.office`, the `side` and `plan` commands). His plan is turned into the same list of groups `waveSpec()` produces, with an entrance per group. He is left out of everything that counts store players (`shareCount`, income, the review).

Path maps: there are four (`NORMAL`, `HOP` for dads, `SMASH` for gym bros, `GHOST` for runaway children, who are stopped only by the store's walls), plus `getFieldTo(state, tile)` for a mom running to where her child waits. All are cached until `state.gridVer` changes.

Coordinates: the grid is `state.w` x `state.h` tiles. A tile index is `y * state.w + x`. Shopper positions are in tiles as decimals; the centre of tile (3, 5) is (3.5, 5.5). Directions are 0 east, 1 south, 2 west, 3 north.

## Sessions (`src/net/session.js`)
The host's browser owns the real state. Clients send commands, receive the whole state up to five times a second (less often when the crowd is large, to spare the host's connection), and run `step()` on their copy in between. The user interface talks to a session and never to the simulation's state-changing functions directly:

| Member | Meaning |
|---|---|
| `session.state` | current state; `null` on a client until it has joined |
| `session.me` | this player's id (index into `state.players`) |
| `session.isHost` | true for `HostSession` |
| `session.send(cmd)` | issue a command |
| `session.sendCursor(x, y)` | tell others where you point, in tiles (decimals); throttle to about 10 a second |
| `session.on(type, fn)` | listen for a message; returns an unsubscribe function |
| `session.drainFx()` | simulation events since the last call, for effects. **Only the renderer calls this.** |
| `session.alpha()` | 0..1 progress between ticks; draw shoppers at `x + vx * alpha` |
| `session.start()` / `stop()` | run on a timer |
| `session.fastForward(n)` | host only: run n ticks at once (screenshots, tests) |

Messages delivered through `session.on`: `ready`, `say`, `review`, `report`, `players`, `nope`, `cursor`, `closed`. Their fields are listed at the top of `src/net/session.js`.

Creating sessions:
```js
import { HostSession, ClientSession } from './net/session.js';
import { createDirector } from './content/director.js';
import { hostOnline, joinOnline, hostLocal, joinLocal, makeRoomCode } from './net/transports.js';

// Solo, or the host of a multiplayer game:
const session = new HostSession({ name, director: createDirector() });
const room = await hostOnline(code, (conn) => session.accept(conn));   // omit for solo

// A friend joining:
const conn = await joinOnline(code);          // rejects with a readable Error
const session = new ClientSession(conn, name); // wait for the 'ready' message before drawing
```
`hostLocal` / `joinLocal` do the same between tabs of one browser, for testing without the internet. `hostOnline` / `joinOnline` need `vendor/peerjs.min.js` loaded by a plain `<script>` tag before the modules.

## Renderer (`src/render/renderer.js`)
```js
const renderer = createRenderer(canvas, session);
renderer.resize();                 // after the canvas element changes size
renderer.tileAt(clientX, clientY); // -> {x, y} tile under a mouse position, or null
renderer.draw(view);               // once per animation frame

// The camera belongs to the renderer. Maps can be much bigger than the screen.
renderer.cam;                      // read-only { x, y, zoom }: view centre in tiles, CSS pixels per tile
renderer.pan(dxTiles, dyTiles);
renderer.centerOn(xTiles, yTiles);
renderer.zoomBy(factor, clientX, clientY); // the tile under that point stays put
renderer.fit();                    // show the whole map
renderer.viewRect();               // -> { x0, y0, x1, y1 } tiles on screen
```
The camera never zooms out past the whole map or in past 72 pixels a tile, and never leaves the map by more than a tile. It starts on the whole map if tiles would be at least 24 pixels, otherwise at 30 pixels a tile. `src/ui/input.js` drives it (WASD, wheel, middle-drag, F, H).

`createMinimap(canvas, session, renderer)` in `src/render/minimap.js` returns `{ draw(), tileAt(clientX, clientY) }`: a small picture of the whole store with the visible part outlined. The game screen shows it when the store does not fit on screen.
`view` is supplied by the UI each frame:
```js
{
  tool: 'belt',          // a key of BUILD, or 'remove' or 'upgrade', or null when nothing is selected
  dir: 0,                // facing for the placement preview, 0-3
  hover: { x, y },       // tile under the mouse, or null
  cursors: Map,          // player id -> { x, y } in tiles (decimals): other players' pointers
  route: true,           // draw the route shoppers will walk, and the dads' short cut
  marks: [{ x, y, label }], // tiles to highlight with a pulsing outline and arrow (tutorial)
}
```
The renderer draws the world (any map size and design, only the part in view), the marked floor from `state.zones` (painted into the cached floor; holding a machine makes its patches glow, and a preview off its floor carries a caption such as "PRESS SHOP ONLY"), the placement and upgrade previews (green or red using `canPlace` and `canUpgrade`, plus range circles), upgrade badges, rubble, effects from `session.drainFx()`, and other players' pointers. It does not handle input and does not touch the DOM outside its canvas.

## Content (`src/content`)
- `lines.js` holds every line of dialogue. Add jokes there, not in code.
- `director.js` runs on the host, turns simulation events into `say`, `review` and `report` messages, and rate-limits them.
- `nopeLine(why, name)` gives the line shown to one player when his command is refused.

## Sound (`src/audio`)
`createSound()` in `src/audio/sound.js` makes every sound with the Web Audio API and speaks DEB's lines with the browser's speech synthesis. `src/main.js` loads it with a dynamic import, so the game still runs (silently) if it fails. It listens to the session's `fx`, `say`, `review`, `report` and `players` messages; the interface calls `sound.play(name)` for its own sounds (`select`, `place`, `remove`, `rotate`, `nope`, `click`, `tutorial`). Every effect is one entry in the table in `src/audio/effects.js`. Nobody can check sound by ear in an automated run, so `tools/sound-test.html` renders each effect offline and measures it (silent, clipping, clicks, too long); keep it at ALL PASS and add new sounds to the table.

## Training shift (`src/tutorial`, `src/ui/tutorial.js`)
A game created with `createGame({ training: true })` has no build timer, cannot be lost, and only runs the waves queued with `queueTrainingWave()`. `src/tutorial/lessons.js` holds the lessons as data plus a small engine; each lesson has a `solve()` list of commands, which the tests use to play the whole tutorial and check that every lesson can be completed and shows what its text claims. If you change a building's rules or numbers, run the tests: a lesson that no longer works will fail there. Plain-language explanations of buildings and shoppers live in `src/content/help.js`.

## Tools
- `node --test` runs all tests in `test/`.
- `node tools/serve.mjs [port]` serves the game at `http://localhost:5173/`.
- `tools/shot.ps1` takes a headless-Edge screenshot of a URL (see the comments in the file).
- `node tools/balance.mjs [seed] [size] [design] [-v]` plays whole solo games with scripted players and prints how they went (`-v` lists every wave; `size` may be `all`).
- `node tools/realshot.mjs <url> <out.png> [waitMs]` takes a screenshot after waiting in real time (needed for anything that uses the network, which `shot.ps1` cannot wait for).
- `tools/two-player.html` shows a host and a joined player side by side in one window (`?online=1` links them through the internet broker; `?autostart=1` opens the doors by itself).
- `tools/input-test.html` plays a solo game with simulated mouse and keyboard events and logs each step.
- `tools/tutorial-test.html` plays the first ten lessons of the training shift with simulated mouse and keyboard events (photograph it with `realshot.mjs`, about 70 seconds).
- `tools/poke.html?u=<game options>&do=<actions>` opens the game and clicks, presses or holds keys, turns the wheel or hovers tiles, to reach screens a plain screenshot cannot (actions are listed in the file).
- `tools/sound-test.html` measures every sound and has a play button for each.
- `tools/net-check.html` reports which of the helper servers for online play (`ICE_SERVERS` in `src/net/transports.js`) answer from the computer it is opened on. Use it when two players cannot connect.
- `tools/office-test.html?view=join|host|both&step=...` plays a two-player game in which the joined player takes the Head Office job, buys a wave through the real buttons and plays it; the steps are listed in the file.
- `tools/render-harness.html` shows the renderer alone; its options are listed at the top of the file (`?lineup=1` shows every shopper and its super in every state; `design=`, `size=`, `players=` and `cam=` choose the map and view).
- The game sets `globalThis.__game = { session, renderer, input }` so these test pages can find where a tile is on screen.

## Page options for testing
`index.html` accepts these in the URL:
- `?solo=1` skip the menu and start a solo game. `&name=Dave` sets the name.
- `?tutorial=1` start the training shift. `&step=9` jumps to that lesson (0-based), playing the earlier ones by itself.
- `?demo=1` solo game with the ready-made layout from `src/sim/demo.js`, wave already started.
- `&ff=900` run that many ticks before the first frame (30 ticks = 1 second).
- `&seed=7` fixed random seed.
- `&map=showroom&size=m` the store: a design and a size (keys of `MAP_DESIGNS` and `MAP_SIZES`). Without them a game uses the open warehouse in the one-player size; `?demo=1` and the tutorial use the original small map.
- `?local=host&code=TEST` / `?local=join&code=TEST` host or join between tabs on one computer.
- `?join=ABCDE` an invite link: opens the menu with that room code filled in. The in-game "Copy link" button produces it.
- `?online=host&code=ABCDE` / `?online=join&code=ABCDE` test only: host or join online without the menu.
- `&autostart=1` test only: the host opens the doors whenever a build phase starts.
