# No Receipt, No Mercy: how the code is organised

Read this before changing anything. It is the contract between the parts of the game.

## The game in one paragraph
Shoppers enter a store through its entrances (one per player, mostly on the left) and walk to the tills on the right (the Car Park has a second bank of tills in the bottom wall). Every shopper who reaches a till takes a refund, split evenly between the players; 20 refunds (5 more per extra player) and the store closes. Players build a factory (belts and machines that turn boxes into goods and sell them for cash) and security (towers that wear down shoppers' patience until they storm out). Belts and machines block shoppers, so **the factory is the maze**. There are 20 waves ("sales events") with a build pause between them. Each player has his own cash and pays for what he builds; income is split evenly. Every building can be upgraded along separate tracks (damage, speed, range, durability), every shopper kind has a tougher "super" version in later waves, and the store comes in several designs and sizes.

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
- `canPlace(state, kind, x, y, playerId, facing)` returns `null` if that player may put a building there, otherwise a reason string (`'fit'` when a building bigger than one tile does not fit). The UI uses it to colour the placement preview. `canUpgrade(state, x, y, playerId, track)` does the same for one upgrade track.
- It is deterministic: random numbers come from `rand(state)`, never `Math.random()`. Keep it that way; clients rely on it to predict the game between host updates.
- All tuning numbers and all definitions of buildings, shoppers and items are in `src/sim/constants.js`.

Maps: `src/sim/maps.js` builds the floor plan from a design and a size (`createGame({ map: { design, size } })`; left out, it is the original 30 x 16 warehouse with one entrance, which the tutorial and most tests use). The plan lives in the state: `state.w`, `state.h`, `state.tiles` (one string; the characters are explained in `maps.js`), `state.doors` (the entrances in the order they open) and `state.open` (how many are open: one per player). Entrances that are still shut exist from the start and count as floor for path-finding, so the maze can never wall one in. Nothing may assume a fixed map size.

Furniture: the Food Court design fills the floor with tables, benches, planters, bins, food stalls and a fountain. Each is an ordinary `'#'` in `state.tiles`, so every rule treats it as solid; `state.decor` is a second string, one character per tile, that says what each solid tile looks like (`DECOR` in `maps.js` names the characters). It is `''` for the designs without furniture and missing in old saves. Only the drawing code reads it (and the director, to leave out jokes about a fountain or a burger van the map does not have).

The Car Park: its parked cars work the same way (`park()` in `maps.js`; the letters are in `DECOR` too). Rows of parking bays run up and down the strips between the marked floor, so the lanes between the rows are where production lines go. A row of cars is a wall, with ways through: one straight across every row at the height of the first entrance (the walkway to the right-hand tills) and others staggered from row to row. It is the only design with two banks of tills. `tillBanks(state)` in `path.js` lists the banks of any store (each run of `'T'` tiles along a wall); shoppers walk to the nearest till whichever bank it is in, so nothing else in the rules needed to know. `canPlace` refuses, with the reason `'bank'`, a building that would cut any bank off from the others (`banksOpen`), so a second bank cannot simply be walled up. The Car Park also opens its entrances in a different order: the two in the bottom wall last. Nothing may assume the tills are in the right-hand wall, or that there is one bank.

Marked floor: `state.zones` is a string like `state.tiles`, one character per tile: a key of `ZONES` (`u` Loading Bay, `p` Press Shop, `k` Gift Wrap, `c` Shipping) or a space. A building whose definition has a `zone` may only be placed on that kind of floor (`canPlace` returns `'zone'`). `makeZones()` in `maps.js` lays the patches out so that different kinds never touch, which is what makes belts necessary. An empty string means no marked floor: the bare default map used by most tests. The tutorial turns it on with `createGame({ training: true, zones: true })`.

Players who drop out: a player who goes offline keeps his money for `TUNE.graceSecs` (90 seconds of real time: `player.gone` counts how long he has been away in ticks at normal speed, so each tick at 3x speed counts for a third). If he is not back by then, `step()` shares it out between the players still connected, and he returns with none. A host who leaves gets the same grace. In the lobby nothing changes hands.

Money: `state.players[i].cash`. There is no shared pot. `earn()` and `lose()` in `state.js` split income and refunds evenly between the connected players; `teamCash(state)` adds everyone's up for display.

Upgrades: `src/sim/upgrades.js`. Each building has up to four upgrade tracks, bought separately: `dmg` (damage, or the building's main effect), `spd` (fires or works faster), `rng` (range) and `dur` (durability). Which tracks a kind has, what a level does and what it costs are in `BUILD[kind].up`. The levels bought are in `b.u`, for example `{ dmg: 2, dur: 1 }` (absent means none). `tracksOf(kind)` lists a kind's tracks, `levelIn(b, track)` and `maxIn(kind, track)` give where it is and how far it goes, `upgradeCost(b, track)` the price of the next level, and `levelOf(b)` the number drawn on the badge (1 plus all levels bought). `statsOf(b)` gives the building's numbers with its upgrades applied and is the only place the simulation or the interface should read damage, range, firing time, a machine's working time or the hits it survives from. The command is `{ c: 'upgrade', x, y, t }` (`t` is the track; left out, the kind's first track). `src/ui/upgradetext.js` turns a track into words ("Damage 2/8, hit 9.4 → 11.7") for the building sheet, the build bar and the handbook.

Buildings bigger than one tile: `BUILD[kind].size` is `[width, height]` when facing east or west; facing north or south swaps them. The building lives on its top-left tile (the anchor); every other tile it covers holds `{ k: sameKind, part: anchorIndex }`. Always go through `anchorOf(state, tileIndex)` to get from any covered tile to the building, `tilesOf(state, anchorIndex)` or `footprint(kind, x, y, facing, width)` for the tiles, and `centreOf(state, anchorIndex)` for where it shoots or reaches from. The Barcode Laser (key `railgun`: it was called the Rail Gun until 0.2.06, and the key was kept so that saved games and commands still work) is 3 x 1 and fires out of its front end along the way it faces; the TV Salesman is 2 x 2.

Wrecked buildings: a gym bro's hit adds one to `b.hit`; a building is wrecked when that reaches `statsOf(b).hits` (1 unless it has durability levels or the kind says more), and every `b.hit` is cleared when the wave ends. A wrecked building leaves an entry in `state.rubble` that remembers its kind, facing, owner, upgrades and what was spent on it. `rebuildDeal(entry, cash)` works out what its owner pays to put it back: half of what was spent, with all its upgrades; if he cannot afford that, half the building's price with as many of the upgrades as he can afford at half price (the rest are lost). The `rebuild` command (the B key) does this for all of a player's rubble, and placing the same kind on its own rubble uses the same deal.

Opening the doors early: the `start` command calls `skipBuild()` in `step.js` before `beginWave()`. It plays the rest of the build timer through in one go (belts, machines, chutes, drying puddles; a build phase has no shoppers), so the store is exactly as if the players had waited, and emits one `early` event with the takings instead of a `sale` event per item. Anything new that runs during a build phase must be run there too.

Security switched off: `b.off` is the number of ticks a building stays out of action after a stray dog pees on it. `step()` counts it down; a building with `b.off` does not fire, stop or pitch.

Shoppers that affect other shoppers: a Day Drinker lying on a tile slows everyone crossing it; a Cosplayer takes the shots aimed at anyone within `TUNE.shield` tiles of him; an Exhibitionist stops shoppers whose definition has `gawks` (dads and teenagers); the TV Salesman rolls once per shopper using `SHOPPERS[kind].pitch = [chance to stop, chance to hurry]`. A shopper who stops first walks over to the stand (`s.sa` is the stand's tile while he does; `walkToStand()` in `step.js`), as near as he can get, and only then goes into `ST.WATCH`. A mom's child may run away once (twice for the Soccer Mom), never nearer than `TUNE.kidTill` tiles of walking from a till, and she will not take her refund without him; after a mom has gone down she has no cart and carries the child.

The boss: every fifth wave (`TUNE.bossEvery`) one boss walks in, as the last group `waveSpec()` returns. His definition is `BOSS` in `constants.js`, deliberately NOT in `SHOPPERS` or `SUPERS`, so nothing that lists the kinds of shopper picks him up by accident; `defOf(shopper)` and `shopperDef('boss')` return it. A boss shopper has `k: 'boss'`, `tr` (his tier: the wave divided by five, which also picks his title with `bossTitle(tier)`) and `pp` (ticks to his next pep talk, which gives shoppers near him some patience back). Nothing slows or stops him. Reaching a till he counts as `TUNE.bossRefunds` refunds (2 of a limit of 20; it was 5 of 40); worn out, he pays the store a bounty. He is not scaled by the patience multiplier (`patienceScaleAt`), and his refund is not multiplied by `perHead()`; his event's crowd is halved by `TUNE.crowdScale` like any other, on top of `TUNE.bossCrowd`. The other groups of a boss wave are `TUNE.bossCrowd` of their usual size. Events: `bossIn`, `pep`, `bossOut`, and `escape` with `n` (the refunds it counted). Head Office cannot buy him and he comes whatever was planned.

Endless games: a game length of 0 (`state.waves === 0`, `isEndless(state)`) has no last wave and is never won. The `endless` command turns a game that has just been won into one. From about wave 30 the number of shoppers in a wave stops growing (`TUNE.maxCrowd` times `TUNE.crowdScale` per player) and only their patience grows. Anything that prints "of N" must ask `isEndless` first.

A mom's abandoned cart: `state.carts` lists `[x, y, sup, face]` for every cart left behind this wave (a mom who goes down for the last time leaves hers), so a player who joins mid-wave sees them. It is emptied when the wave ends.

Super shoppers: a shopper with `sup: 1` plays by `SUPERS[kind]` instead of `SHOPPERS[kind]`; always go through `defOf(shopper)`.

More shoppers early, fewer late (0.2.11, the owner's numbers): before the halving below, every group `waveSpec()` makes is multiplied by `crowdShiftAt(n)` in `step.js`. It reads `TUNE.crowdCurve`, a list of [sales event, share] points joined by straight lines (1.25 in event 1, 1 in event 10, 0.8 in event 20, 0.7 in event 30; the last share from then on), and multiplies by `TUNE.crowdTrim[n]` where an event has one (event 5: 0.95). Only the head count moves; patience, refund cash and prices do not follow it. The handbook and README take their counts from `waveSpec()`, so they follow.

Fewer, tougher shoppers (0.2.09): numbers in `TUNE` scale the flood, and the owner expects to push them further. `TUNE.crowdScale` (0.5) multiplies every group `waveSpec()` makes (to the nearest whole number, a half rounded down, never below one, so every kind is still there; a group arrives over the same length of time, so its gaps grow) and the cap `TUNE.maxCrowd`, from the first sales event. Shoppers get tougher to make up for it, but only as the game goes on: `patienceScaleAt(n)` in `step.js` is 1 up to and including event `TUNE.patienceFrom` (5), rises in a straight line to `TUNE.patienceScale` (2) at event `TUNE.patienceFull` (20), and stays there. It multiplies the patience every shopper walks in with (`patienceFor(state, def)`, the one place it is worked out; difficulty, growth by wave and a super's multiplier apply on top; Head Office's shoppers and the Pregnant Lady's babies too) and a dad's drain. Why phased: while security has time to spare between arrivals (the early events), a shopper's fate depends only on his own patience against what one walk past the towers does to him, so at x1 half the crowd leaks the same share as before, which is neutral against a refund limit also halved. Once security is busy all the time (the late events), what matters is total patience against total damage, and there half the crowd at x2 is neutral. A flat x2 from the first event made the start far harder (PLAN.md, version 0.2.09, has the numbers). Neither applies to the boss (one man, not the flood) or in a training game (the lessons queue their own waves and are played as written). What is counted per shopper follows the crowd, so the economy keeps its proportions: `perHead()` in `constants.js` (1 / crowdScale) multiplies the cash a refund takes, Head Office's prices (`priceOf`), and `OFFICE.perRefund` and every `OFFICE.kinds[k].gap` (these two once, when the game loads). Damage from buildings, slips and anything that is a share of a shopper's own patience (pep talks, a mom getting up) are not scaled. `src/content/facts.js` works out the numbers the same way (`patienceAt`, `toughnessAt`), so the handbook and README match the game event by event.

The Pregnant Lady (`preggo`; super: Octomom) is an ordinary kind, with `pops` (12, or 24) in her definition. When her patience runs out, `hurt()` in `step.js` looks at what took the last of it (`from`, the building's kind): a Barcode Laser (`railgun`) and she storms off like anyone, with a `nopop` event after her `left`; anything else and she pops. A popped lady sends `left` with `why: 'pop'`, then `pop`; she is removed on the shoppers' next move (the same tick, as buildings always do it) and counts as stopped, and `pops` babies are added to `state.shoppers` round where she stood (within `TUNE.popSpread`, on her own tile). Babies follow the boss's pattern: their definition is `BABY` in `constants.js`, deliberately not in `SHOPPERS` or `SUPERS`, so nothing that lists kinds picks them up and Head Office cannot buy them; a baby is `{ k: 'baby' }` with only the ordinary shopper fields (never `sup`), and `defOf()` and `shopperDef('baby')` return `BABY`. If she is finished while standing on a till (buildings act before shoppers move, so it can happen the tick after she steps onto one), nothing pops: she storms off without her refund, as any shopper finished on a till does. They walk the ordinary route (`modeOf` gives `NORMAL`), very fast (each at its own pace, `babyPace(id)`: between `BABY.paceMin` and `BABY.paceMax` of `BABY.speed`, worked out from its id, so a litter strings out without any field in the state or random draw), with very little patience (grown and scaled like anyone's), are slowed by wet floors, messes and a fallen drunk, and ignore free samples, goods on belts, the TV Salesman and an exhibitionist. A baby at a till takes `BABY.refund` ($5, not scaled) and is no refund toward the limit: its `escape` event has `n: 0`, and it is not counted in `state.ws.escaped`. A baby who runs out of patience just leaves (`left`, `why: 'annoyed'`) and is not counted in `ws.stopped` or a player's `stopped`. A sales event is not over while babies are in the store. The director gives babies no reviews and leaves them out of a run of refunds; a popped lady gets DEB's `pop` line instead of a review.

Host hand-over: `state.host` is the player whose browser runs the game. When a joined player's connection to the host closes, `hostLost()` in `src/main.js` runs in every remaining browser. All of them pick the same successor (the first connected player in the list who is not the old host). The successor makes a `HostSession` from its own copy of the state with `takeOver: true` and opens the room again under the same code, retrying until the old host's code is released; the others retry joining it. Players are matched to their old places by name. The game screen is torn down and started again on the new session (`destroy()` on what `startGame` returns).

Saving: `src/ui/save.js` keeps one save in the host browser's `localStorage` (`keepSaved(session)` writes the whole state every few seconds, at each wave's end and when the page closes; `readSave()` gives it back with a summary for the menu, or null if there is none or it does not look right). `actions.resume()` in `src/main.js` makes a `HostSession` from it with `resume: true`, which seats the host by name and treats everyone else as away, money intact, until he rejoins. The state carries its version (`state.v`, `STATE_VERSION` in `state.js`, 4 since 0.2.09); `readSave` accepts this version and the one before, and resuming runs `migrateSave(state)` first, once: a version-3 save (refund limit 40 plus 10 a player) gets today's limit for its players and its refunds scaled by the same ratio, rounded down, so it keeps the share of its limit it had used. Only real games are saved: not training, not the lobby, not finished games, not the URL test options. (A game that was won and then carried on as endless is a game in progress again, and is saved from the moment of the `endless` event.) `src/ui/record.js` keeps, per difficulty, the best sales event reached in an endless game in the same browser storage; the lost screen and the menu show it.

Employee Handbook and README lists: `src/content/facts.js` works out, from the rules, the numbers people are shown: a shopper's patience in any wave, how many turn up, what its super version changes, and a row per level of each upgrade track for every building (`trackRows(kind, track)`). `src/ui/handbook.js` is the in-game handbook (three tabs: Known offenders, Factory, Security; opened from the menu, the book button in the top bar and the ? screen; in a game it uses that game's difficulty and player count). Its tables by sales event go up to the longest game the length drop-down offers (`LONGEST` in `facts.js`, the biggest of `SETTINGS.waves`), whatever the game's own length; an endless game's go further (`sampleWaves`, `bossWaves`). `src/ui/portrait.js` draws a shopper with the renderer's own code (`drawShopper` in `src/render/shoppers.js`; its last argument says what a watching shopper is looking at, and `noBar` leaves the patience bar out). `tools/readme.mjs` writes the version, the store designs and the shoppers into `README.md` between `<!-- gen:... -->` markers and, with `--shots`, retakes the pictures in `docs/img/` (maps from `tools/render-harness.html`, shoppers from `tools/portrait.html`). `test/readme.test.js` fails if the README is out of date and checks the handbook's numbers against the simulation.

Touch wording: lessons and help are written once, for mouse and keyboard. `src/content/touch.js` rewords them for touch screens (`worded(text)`), and a test fails if any lesson or help text still names a key or the mouse afterwards. Add a rule there when a new lesson mentions a key.

Installing: `manifest.webmanifest`, the icons in `icons/` (photographs of `tools/icon.html`) and `sw.js` let phones offer "Install app". `sw.js` deliberately caches nothing, so the newest version always loads.

Boss bar: `src/ui/bossbar.js` is the strip over the top of the floor that announces the next boss during the build phase and shows his title and patience while he is in the store. It floats over the floor and has a fixed height, so it never resizes anything.

Chat: `session.chat(text)` sends a line to everyone and `session.on('chat', fn)` receives `{ pid, name, color, text }`. The host tidies and rate-limits it; it is not part of the game state. `src/ui/chat.js` is the box.

Touch: `src/ui/input.js` treats `pointerType === 'touch'` separately from the mouse. Two fingers always pan and pinch-zoom and never build; one finger with nothing held drags the view; one finger with a tool held builds (tap) or lays a line (drag). Nothing is built until the finger lifts or has moved a little, so a second finger arriving late still makes a pinch. `src/ui/touch.js` adds the on-screen buttons for what the keyboard does and the sheet of actions for a tapped building; they appear only on `(pointer: coarse)` devices. Phone and tablet layouts are one block at the end of `src/style.css`, switched on by screen size; desktop layouts must not change.

Settings: `SETTINGS` in `constants.js` lists what a host may choose: the number of waves, each player's starting cash, and a difficulty (which multiplies shopper patience, including the boss's and the babies', and income: sale prices, the end-of-event bonus and the boss's bounty). Normal is the baseline, x1 and x1 by definition, so every number in `constants.js` is Normal's and the handbook and README show them as they are; the other levels are round numbers relative to it (Easy x0.75 patience and x1.25 income, Hard x1.3 and x0.85, Brutal x1.65 and x0.7). Money is rounded to whole dollars after the multiplier, so a base price can be a decimal (a Gadget's 7.7 pays $8 on Normal); anything shown to a player must be the rounded amount. A training game uses no difficulty: its shoppers get base patience divided by `TUNE.trainingPatienceDivisor` (0.9), the numbers its lessons were written for before 0.2.10 made Normal the baseline. They live in the state (`state.waves`, `state.startCash`, `state.difficulty`), are given to `createGame({ settings })`, and can be changed in the lobby with `{ c: 'settings', ... }`. Read them from the state, never from `TUNE`. `src/ui/settings.js` is the set of three drop-downs the menu and the lobby share.

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
  track: 'rng',          // optional: the upgrade track a preview is about (only 'rng' changes what is drawn)
  hover: { x, y },       // tile under the mouse, or null
  cursors: Map,          // player id -> { x, y } in tiles (decimals): other players' pointers
  route: true,           // draw the route shoppers will walk, and the dads' short cut
  marks: [{ x, y, label }], // tiles to highlight with a pulsing outline and arrow (tutorial)
}
```
The renderer draws the world (any map size and design, only the part in view), the marked floor from `state.zones` (painted into the cached floor; holding a machine makes its patches glow, and a preview off its floor carries a caption such as "PRESS SHOP ONLY"), the placement and upgrade previews (green or red using `canPlace` and `canUpgrade`; the whole footprint of a bigger building; range circles, and for a Barcode Laser the strip its beam covers), upgrade badges (the number is `levelOf`), cracks and bandages on a building gym bros have hit, the puddle on security a dog has switched off, rubble, effects from `session.drainFx()`, and other players' pointers. Entrances carry no names: an entrance belongs to the store, not to the player whose arrival opened it. It does not handle input and does not touch the DOM outside its canvas.

## Content (`src/content`)
- `lines.js` holds every line of dialogue. Add jokes there, not in code. A plain string is a common line; `u('...')` makes it uncommon (about a third as likely) and `r('...')` rare (about a tenth). The rules for adding lines are at the top of the file.
- `director.js` runs on the host, turns simulation events into `say`, `review` and `report` messages, and decides how often DEB speaks. Its output goes to every player, so everyone hears the same line with the same name in it. Each kind of remark is a topic in `TOPICS`: some are always said; the rest get less likely, and further apart, every time DEB has commented on that topic in this game. A line that has been used has its weight divided by `TALK.repeatPenalty` for the rest of the game. All the numbers are in `TALK`.
- The three friends: `FRIENDS` in `lines.js` has lines written for players named Bobb, Phantasm and Tusker (matched by exact name, ignoring capitals). They are used only when a player with that name is connected: a third of the times a line would name him, and now and then unprompted between waves.
- `nopeLine(why, name)` gives the line shown to one player when his command is refused.

## Sound (`src/audio`)
`createSound()` in `src/audio/sound.js` makes every sound with the Web Audio API and speaks DEB's lines with the browser's speech synthesis. `src/main.js` loads it with a dynamic import, so the game still runs (silently) if it fails. It listens to the session's `fx`, `say`, `review`, `report` and `players` messages; the interface calls `sound.play(name)` for its own sounds (`select`, `place`, `remove`, `rotate`, `upgrade`, `rebuild`, `chat`, `nope`, `click`, `tutorial`). Frequent sounds vary on every play (three versions each, with pitch, length and timbre nudged by a random seed), and each kind of shopper has its own voice in `src/audio/shoppers.js`. `src/audio/crowd.js` holds the rules for many sounds at once: spacing, thinning, lowering the level as they pile up, merging a mass walkout or a run of sales into one sound, and a cap on how much is played. It contains no audio code, so the test page runs the same rules. Every effect is one entry in the table in `src/audio/effects.js` (the sounds added in 0.2 are built in `src/audio/newfx.js`, the boss's and endless mode's in `src/audio/boss.js`; `bossOut` carries the sound when a boss is driven out, so `sound.js` drops the `left` that arrives with it). Nobody can check sound by ear in an automated run, so `tools/sound-test.html` renders each effect offline and measures it (silent, clipping, clicks, too long); keep it at ALL PASS and add new sounds to the table.

## Training shift (`src/tutorial`, `src/ui/tutorial.js`)
A game created with `createGame({ training: true })` has no build timer, cannot be lost, and only runs the waves queued with `queueTrainingWave()`. `src/tutorial/lessons.js` holds the lessons as data plus a small engine (part 1 teaches the buildings, part 2 the shoppers with a trick; a lesson can count what shoppers did, such as kid escapes or things wrecked, and can run commands after its wave); each lesson has a `solve()` list of commands, which the tests use to play the whole tutorial and check that every lesson can be completed and shows what its text claims. If you change a building's rules or numbers, run the tests: a lesson that no longer works will fail there. Plain-language explanations of buildings and shoppers live in `src/content/help.js`.

## Tools
- `node --test` runs all tests in `test/`.
- `node tools/serve.mjs [port]` serves the game at `http://localhost:5173/`.
- `tools/shot.ps1` takes a headless-Edge screenshot of a URL (see the comments in the file).
- `node tools/balance.mjs [seed] [size] [design] [-v]` plays whole solo games with scripted players and prints how they went (`-v` lists every wave; `size` may be `all`). The scripted players' layout is made for the open warehouse; on the other designs they lose early, so there it only shows whether a design is far out of line with the rest.
- `node tools/line-check.mjs [design] [size]` tries to build two whole production lines in every section of marked floor on every map and reports how many fit. Run it after changing a map design or the marked floor.
- `node tools/realshot.mjs <url> <out.png> [waitMs]` takes a screenshot after waiting in real time (needed for anything that uses the network, which `shot.ps1` cannot wait for).
- `tools/two-player.html` shows a host and a joined player side by side in one window (`?online=1` links them through the internet broker; `?autostart=1` opens the doors by itself).
- `tools/input-test.html` plays a solo game with simulated mouse and keyboard events and logs each step.
- `tools/tutorial-test-2.html` presses "Jump to part 2" and plays the second half the same way.
- `tools/tutorial-test.html` plays the first ten lessons of the training shift with simulated mouse and keyboard events (photograph it with `realshot.mjs`, about 70 seconds).
- `tools/poke.html?u=<game options>&do=<actions>` opens the game and clicks, presses or holds keys, turns the wheel or hovers tiles, to reach screens a plain screenshot cannot (actions are listed in the file).
- `tools/sound-test.html` measures every sound and has a play button for each.
- `node tools/phone.mjs` runs the touch checks in Chrome on a real Android phone attached by USB (the three `adb` commands it needs are at the top of the file). The touches go through the phone's own Chrome.
- `tools/touch-test.html` plays a game with simulated finger touches and lists 38 checks of the touch rules. Photograph it as a phone with `node tools/realshot.mjs <url> out.png 40000 390 844 --touch --dpr=2` (`--touch` and `--dpr=N` make `realshot.mjs` emulate a touch device).
- `src/net/relay.js` is where the owner's own relay (TURN) server goes; instructions are in the file. It is empty until he has an account with a provider.
- `tools/net-check.html` reports which of the helper servers for online play (`ICE_SERVERS` in `src/net/transports.js`) answer from the computer it is opened on. Use it when two players cannot connect.
- `tools/office-test.html?view=join|host|both&step=...` plays a two-player game in which the joined player takes the Head Office job, buys a wave through the real buttons and plays it; the steps are listed in the file.
- `tools/render-harness.html` shows the renderer alone; its options are listed at the top of the file (`?lineup=1` shows every shopper and its super in every state, with every costume and effect; `?showcase=1` shows the Barcode Laser, the TV Salesman, damaged and switched-off buildings and the newer shoppers in one frozen scene; `design=`, `size=`, `players=` and `cam=` choose the map and view).
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
