# Returns Department: how the code is organised

Read this before changing anything. It is the contract between the parts of the game.

## The game in one paragraph
Shoppers enter a warehouse by the doors on the left and walk to the tills on the right. Every shopper who reaches a till takes a refund out of the team's shared cash; 40 refunds and the store closes. Players build a factory (belts and machines that turn boxes into goods and sell them for cash) and security (towers that wear down shoppers' patience until they storm out). Belts and machines block shoppers, so **the factory is the maze**. There are 20 waves ("sales events") with a build pause between them.

Dads are the special case the owner asked for. They arrive in a single-file "dad line", walk fast, ignore free samples and goods on belts, and **step over conveyor belts** (only machines, crates and towers stop them). Their patience drains every second they are in the store, so the way to beat a dad is to waste his time: solid walls, wet floor signs (he ignores the sign and may slip) and towers along his route. A dad who gets through leaves a smug five-star review.

## Layers

```
index.html, src/main.js      page, menu, wiring                      (UI)
src/ui/                      HUD, build bar, speech bubbles, review  (UI, plain DOM)
src/render/                  draws the warehouse on a canvas         (rendering)
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
- `canPlace(state, kind, x, y)` returns `null` if a building may go there, otherwise a reason string. The UI uses it to colour the placement preview.
- It is deterministic: random numbers come from `rand(state)`, never `Math.random()`. Keep it that way; clients rely on it to predict the game between host updates.
- All tuning numbers and all definitions of buildings, shoppers and items are in `src/sim/constants.js`.

Coordinates: the grid is 30 x 16 tiles (`W`, `H`). A tile index is `y * W + x`. Shopper positions are in tiles as decimals; the centre of tile (3, 5) is (3.5, 5.5). Directions are 0 east, 1 south, 2 west, 3 north.

## Sessions (`src/net/session.js`)
The host's browser owns the real state. Clients send commands, receive the whole state five times a second, and run `step()` on their copy in between. The user interface talks to a session and never to the simulation's state-changing functions directly:

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
```
`view` is supplied by the UI each frame:
```js
{
  tool: 'belt',          // a key of BUILD, or 'remove', or null when nothing is selected
  dir: 0,                // facing for the placement preview, 0-3
  hover: { x, y },       // tile under the mouse, or null
  cursors: Map,          // player id -> { x, y } in tiles (decimals): other players' pointers
}
```
The renderer draws the world, the placement preview (green or red using `canPlace`, plus the range circle for towers), effects from `session.drainFx()`, and other players' pointers. It does not handle input and does not touch the DOM outside its canvas. The world is 30 x 16 tiles; the renderer scales it to fit the canvas and keeps the aspect ratio.

## Content (`src/content`)
- `lines.js` holds every line of dialogue. Add jokes there, not in code.
- `director.js` runs on the host, turns simulation events into `say`, `review` and `report` messages, and rate-limits them.
- `nopeLine(why, name)` gives the line shown to one player when his command is refused.

## Tools
- `node --test` runs all tests in `test/`.
- `node tools/serve.mjs [port]` serves the game at `http://localhost:5173/`.
- `tools/shot.ps1` takes a headless-Edge screenshot of a URL (see the comments in the file).
- `node tools/balance.mjs` plays whole games with a scripted player and prints how they went.

## Page options for testing
`index.html` accepts these in the URL:
- `?solo=1` skip the menu and start a solo game. `&name=Dave` sets the name.
- `?demo=1` solo game with the ready-made layout from `src/sim/demo.js`, wave already started.
- `&ff=900` run that many ticks before the first frame (30 ticks = 1 second).
- `&seed=7` fixed random seed.
- `?local=host&code=TEST` / `?local=join&code=TEST` host or join between tabs on one computer.
