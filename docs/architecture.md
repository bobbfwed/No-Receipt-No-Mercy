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

Players who drop out: a player who goes offline keeps his money for `TUNE.graceSecs` (90 seconds of real time: `player.gone` counts how long he has been away in ticks at normal speed, so each tick at 3x speed counts for a third). If he is not back by then, `step()` shares it out between the players still connected, and he returns with none. A host who leaves gets the same grace. In the lobby nothing changes hands.

Money: `state.players[i].cash`. There is no shared pot. `earn()` and `lose()` in `state.js` split income and refunds evenly between the connected players; `teamCash(state)` adds everyone's up for display.

Upgrades: `src/sim/upgrades.js`. A building's level is `b.lv` (absent means 1); `statsOf(b)` gives its numbers at its level and is the only place the simulation or the interface should read a tower's damage or range from.

Super shoppers: a shopper with `sup: 1` plays by `SUPERS[kind]` instead of `SHOPPERS[kind]`; always go through `defOf(shopper)`.

Host hand-over: `state.host` is the player whose browser runs the game. When a joined player's connection to the host closes, `hostLost()` in `src/main.js` runs in every remaining browser. All of them pick the same successor (the first connected player in the list who is not the old host). The successor makes a `HostSession` from its own copy of the state with `takeOver: true` and opens the room again under the same code, retrying until the old host's code is released; the others retry joining it. Players are matched to their old places by name. The game screen is torn down and started again on the new session (`destroy()` on what `startGame` returns).

Saving: `src/ui/save.js` keeps one save in the host browser's `localStorage` (`keepSaved(session)` writes the whole state every few seconds, at each wave's end and when the page closes; `readSave()` gives it back with a summary for the menu, or null if there is none or it does not look right). `actions.resume()` in `src/main.js` makes a `HostSession` from it with `resume: true`, which seats the host by name and treats everyone else as away, money intact, until he rejoins. Only real games are saved: not training, not the lobby, not finished games, not the URL test options.

Employee Handbook and README lists: `src/content/facts.js` works out, from the rules, the numbers people are shown: a shopper's patience in any wave, how many turn up, what its super version changes, and a row per upgrade level for each piece of security. `src/ui/handbook.js` is the in-game handbook (three tabs: Known offenders, Factory, Security; opened from the menu, the book button in the top bar and the ? screen; in a game it uses that game's length, difficulty and player count). `src/ui/portrait.js` draws a shopper with the renderer's own code. `tools/readme.mjs` writes the version, the store designs and the shoppers into `README.md` between `<!-- gen:... -->` markers and, with `--shots`, retakes the pictures in `docs/img/` (maps from `tools/render-harness.html`, shoppers from `tools/portrait.html`). `test/readme.test.js` fails if the README is out of date and checks the handbook's numbers against the simulation.

Touch wording: lessons and help are written once, for mouse and keyboard. `src/content/touch.js` rewords them for touch screens (`worded(text)`), and a test fails if any lesson or help text still names a key or the mouse afterwards. Add a rule there when a new lesson mentions a key.

Installing: `manifest.webmanifest`, the icons in `icons/` (photographs of `tools/icon.html`) and `sw.js` let phones offer "Install app". `sw.js` deliberately caches nothing, so the newest version always loads.

Chat: `session.chat(text)` sends a line to everyone and `session.on('chat', fn)` receives `{ pid, name, color, text }`. The host tidies and rate-limits it; it is not part of the game state. `src/ui/chat.js` is the box.

Touch: `src/ui/input.js` treats `pointerType === 'touch'` separately from the mouse. Two fingers always pan and pinch-zoom and never build; one finger with nothing held drags the view; one finger with a tool held builds (tap) or lays a line (drag). Nothing is built until the finger lifts or has moved a little, so a second finger arriving late still makes a pinch. `src/ui/touch.js` adds the on-screen buttons for what the keyboard does and the sheet of actions for a tapped building; they appear only on `(pointer: coarse)` devices. Phone and tablet layouts are one block at the end of `src/style.css`, switched on by screen size; desktop layouts must not change.

Settings: `SETTINGS` in `constants.js` lists what a host may choose: the number of waves, each player's starting cash, and a difficulty (which multiplies shopper patience and income). They live in the state (`state.waves`, `state.startCash`, `state.difficulty`), are given to `createGame({ settings })`, and can be changed in the lobby with `{ c: 'settings', ... }`. Read them from the state, never from `TUNE`. `src/ui/settings.js` is the set of three drop-downs the menu and the lobby share.

Lobby: a game made with `createGame({ lobby: true })` starts in phase `'lobby'`. Nothing runs and nothing can be built; the host (player 0) may send `{ c: 'map', design, size }`, which swaps the store with `setMap()` and clears everyone's `ready`; each player sends `{ c: 'ready', on }`; `step()` moves to `'build'` when every connected player is ready. Games started from the menu use it; the URL test options do not unless `&lobby=1` is given. `src/ui/lobby.js` is the panel.

Head Office: `src/sim/office.js`. One player may switch `side` to `'office'` and buy the coming wave from a budget instead of building (`state.office`, the `side` and `plan` commands). His plan is turned into the same list of groups `waveSpec()` produces, with an entrance per group. He is left out of everything that counts store players (`shareCount`, income, the review).

Path maps: there are four (`NORMAL`, `HOP` for dads, `SMASH` for gym bros, `GHOST` for runaway children, who are stopped only by the store's walls), plus `getFieldTo(state, tile)` for a mom running to where her child waits. All are cached until `state.gridVer` changes.

Coordinates: the grid is `state.w` x `state.h` tiles. A tile index is `y * state.w + x`. Shopper positions are in tiles as decimals; the centre of tile (3, 5) is (3.5, 5.5). Directions are 0 east, 1 south, 2 west, 3 north.

## Sessions (`src/net/session.js`)
The host's browser owns the real state. Clients send commands. The host sends thirty small "advance" messages a second (one per step at normal speed): its step count, the commands it applied (each with the step it took effect at and who gave it), and a checksum. Clients replay them on their own copy, aiming to run three steps (about a tenth of a second) behind the host, and ask for a fresh copy if the checksum differs. A full copy is sent only when a player joins or leaves, after `fastForward`, on a mismatch, when a client falls more than 3 seconds behind, and every 10 seconds as a safety net. Messages over 48 KB (15 KB over the internet, the limit of the PeerJS library) are split and rejoined in `transports.js`. 'say', 'review' and 'report' reach a client when his replay reaches that moment. Never change `session.state` on the host directly while players are connected: go through `send()`. The user interface talks to a session and never to the simulation's state-changing functions directly:

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
`createSound()` in `src/audio/sound.js` makes every sound with the Web Audio API and speaks DEB's lines with the browser's speech synthesis. `src/main.js` loads it with a dynamic import, so the game still runs (silently) if it fails. It listens to the session's `fx`, `say`, `review`, `report` and `players` messages; the interface calls `sound.play(name)` for its own sounds (`select`, `place`, `remove`, `rotate`, `upgrade`, `rebuild`, `chat`, `nope`, `click`, `tutorial`). Frequent sounds vary on every play (three versions each, with pitch, length and timbre nudged by a random seed), and each kind of shopper has its own voice in `src/audio/shoppers.js`. `src/audio/crowd.js` holds the rules for many sounds at once: spacing, thinning, lowering the level as they pile up, merging a mass walkout or a run of sales into one sound, and a cap on how much is played. It contains no audio code, so the test page runs the same rules. Every effect is one entry in the table in `src/audio/effects.js`. Nobody can check sound by ear in an automated run, so `tools/sound-test.html` renders each effect offline and measures it (silent, clipping, clicks, too long); keep it at ALL PASS and add new sounds to the table.

## Training shift (`src/tutorial`, `src/ui/tutorial.js`)
A game created with `createGame({ training: true })` has no build timer, cannot be lost, and only runs the waves queued with `queueTrainingWave()`. `src/tutorial/lessons.js` holds the lessons as data plus a small engine (part 1 teaches the buildings, part 2 the shoppers with a trick; a lesson can count what shoppers did, such as kid escapes or things wrecked, and can run commands after its wave); each lesson has a `solve()` list of commands, which the tests use to play the whole tutorial and check that every lesson can be completed and shows what its text claims. If you change a building's rules or numbers, run the tests: a lesson that no longer works will fail there. Plain-language explanations of buildings and shoppers live in `src/content/help.js`.

## Tools
- `node --test` runs all tests in `test/`.
- `node tools/serve.mjs [port]` serves the game at `http://localhost:5173/`.
- `tools/shot.ps1` takes a headless-Edge screenshot of a URL (see the comments in the file).
- `node tools/balance.mjs [seed] [size] [design] [-v]` plays whole solo games with scripted players and prints how they went (`-v` lists every wave; `size` may be `all`).
- `node tools/line-check.mjs [design] [size]` tries to build two whole production lines in every section of marked floor on every map and reports how many fit. Run it after changing a map design or the marked floor.
- `node tools/realshot.mjs <url> <out.png> [waitMs]` takes a screenshot after waiting in real time (needed for anything that uses the network, which `shot.ps1` cannot wait for).
- `tools/two-player.html` shows a host and a joined player side by side in one window (`?online=1` links them through the internet broker; `?autostart=1` opens the doors by itself).
- `tools/input-test.html` plays a solo game with simulated mouse and keyboard events and logs each step.
- `tools/tutorial-test-2.html` presses "Jump to part 2" and plays the second half the same way.
- `tools/tutorial-test.html` plays the first ten lessons of the training shift with simulated mouse and keyboard events (photograph it with `realshot.mjs`, about 70 seconds).
- `tools/poke.html?u=<game options>&do=<actions>` opens the game and clicks, presses or holds keys, turns the wheel or hovers tiles, to reach screens a plain screenshot cannot (actions are listed in the file).
- `tools/sound-test.html` measures every sound and has a play button for each.
- `node tools/phone.mjs` runs the touch checks in Chrome on a real Android phone attached by USB (the three `adb` commands it needs are at the top of the file). The touches go through the phone's own Chrome.
- `tools/touch-test.html` plays a game with simulated finger touches and lists 33 checks of the touch rules. Photograph it as a phone with `node tools/realshot.mjs <url> out.png 40000 390 844 --touch --dpr=2` (`--touch` and `--dpr=N` make `realshot.mjs` emulate a touch device).
- `src/net/relay.js` is where the owner's own relay (TURN) server goes; instructions are in the file. It is empty until he has an account with a provider.
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
