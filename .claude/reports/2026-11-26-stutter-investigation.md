# Stutter around events 11-16 (v0.3.03, two players over the internet): investigation

Date: 2026-11-26. Investigation only: no game file was changed or committed. Measured on the
owner's PC (Windows 11, RTX 3080, Edge headless with the real GPU, Node 24) while another worker
was also using the machine, so single worst-case timings from Node carry some noise; every
conclusion below rests on repeated or deterministic measurements.

Where things are:
- Worktree with the played version: `C:/Apps/nrnm-perf-03` (branch `perf-check`, from tag
  `v0.3.03`). The harness is `tools/perf/` there; this report is committed there too.
- Worktree with 0.4 as committed (`7429ffb`, detached): `C:/Apps/nrnm-perf-04`. The same tools
  were copied into its `tools/perf/` (not committed there); the two files that needed 0.4 changes
  are kept in `tools/perf/v04/` of the 0.3.03 worktree.

## The answer in short

It was most likely **not** the processor of either machine, and the simulation can be ruled out.
Two things fit the report; I could reproduce both, but I cannot tell from here which of the two
players saw what.

1. **Internet delivery to the joined player (most likely, if the phone was the joined player or
   was hosting on a mobile connection).** The joined player's game runs only about 100 ms (3
   steps) behind the host. The link is a reliable, ordered channel, so one late or lost packet holds
   up every message behind it. Any hold-up longer than about 100 ms freezes the joined player's
   picture, and then it plays faster to catch up: "stutter and lag". In a pretend link like a phone
   on typical 4G or busy wifi (50 ms, 40 ms jitter, 1% loss) the joined player's picture froze
   **14.6 times a minute for about 200 ms each (5% of the time)**; on a poor signal, 40 times a
   minute, up to 0.63 s. A PC on home broadband with no loss: never. The full copy of the game sent
   every 10 seconds grows with the crowd (20 KB at event 8, 43 KB at event 16) and, on a slow
   uplink, adds a freeze every 10 seconds (1 Mbps: 83 ms at event 8, 250-400 ms at event 16).
   Only the joined player is affected; the host never waits for the network.
2. **Pictures painted the first time they are needed (the only measured cost that peaks in
   events 11-16 and fades later).** The super versions of most shoppers first appear between
   events 11 and 16 (super teen at 11; super drinker, trader and gym bro at 12; dog and scooter at
   13; blind man, flasher and pregnant lady at 14; cosplayer at 15). Each super pose is painted the
   first time it is seen, as three canvases with 24 image copies for the gold glow. Canvases made
   per event: **314, 178, 320, 251, 221 in events 12-16, against 31-161 after event 16**. On this PC
   that costs nothing visible (every frame under 2.5 ms of drawing); with the processor slowed 4x as
   a stand-in for a phone, single frames reach 7-25 ms, and **zooming across a size step repaints
   every sprite at once: a 131 ms frame and a 50 ms frame, 565 canvases** (on the PC: 19 ms). A real
   phone's graphics may be slower than this stand-in; I could not measure one (no phone attached).

Ruled out with numbers: the simulation (0.12-0.29 ms a step; no step that is slow by its nature),
turning the game into text for a full copy (under 1 ms), host and client falling out of step
(**0 checksum mismatches in 84,244 checks** over a whole two-player game), a phone too slow to keep
up (a phone 10 times slower than this PC still keeps up at 5x speed), sound, and saving.

Also found, not tied to events 11-16: **the first end-of-event review in a session freezes both
screens for about 0.4 s** (graphics work for the review card, measured on this PC's real GPU);
later reviews cost about 50-70 ms. On 0.4 it is about 0.18 s.

Everything above still applies to the 0.4 head, except that the first review's freeze is smaller.

## What was measured, and how

All commands run from `C:/Apps/nrnm-perf-03` (or the 0.4 worktree for 0.4).

### The game that was measured
`node tools/perf/game2p.mjs` plays a whole two-player game with scripted players
(`tools/perf/teambot.mjs`: the "keen" bot of `tools/balance.mjs`, each purchase made by whichever
player has more cash) on the Superstore (44 x 24, the size recommended for two players), Open
Warehouse, seed 11, a dealt hand of cards (shrinkflation, restocking, doorbuster, firecode,
rentacop), auto-rebuild on for both, 30-event game. The scripted team is weaker than real players,
so the refund limit is raised as needed to keep the game going to event 21 (the crowd matters
here, not the result). It saves the state at the moment of each chosen event with the most
shoppers on the floor:

| state | shoppers on the floor | buildings | full copy |
|---|---|---|---|
| e08 | 43 | 116 | 20.4 KB |
| e11 | 50 | 159 | 24.9 KB |
| e13 | 90 | 177 | 35.2 KB |
| e16 | 122 | 176 | 42.7 KB |
| e20 (a boss event, smaller crowd) | 108 | 176 | 40.2 KB |
| stress (e16 with every shopper copied 4x) | 488 | 176 | |

Peak shoppers per event in that game: 43 (8), 50 (11), 77 (12), 90 (13), 105 (14), 59 (15),
122 (16), 155 (17), 164 (18), 178 (19), 108 (20), 212 (21). The crowd keeps growing after event 16,
so a cost that only grows with the crowd would get worse later, not better.

### a. Simulation
`node tools/perf/simbench.mjs` (5 runs of 20 s of play from each state):

| state | ms a step (mean) | 99th pct | first step on a fresh copy | worst frame at 1x / 3x / 5x | per second at 1x / 5x | checksum | one path map |
|---|---|---|---|---|---|---|---|
| e08 | 0.123 | 0.65 | 0.44 | 2.3 / 3.6 / 4.0 | 3.7 / 18 ms | 0.018 | 0.032 |
| e11 | 0.187 | 0.62 | 0.47 | 2.0 / 2.5 / 3.7 | 5.6 / 28 ms | 0.023 | 0.033 |
| e13 | 0.224 | 0.64 | 0.55 | 2.4 / 2.9 / 3.4 | 6.7 / 34 ms | 0.029 | 0.033 |
| e16 | 0.280 | 0.79 | 0.90 | 4.6 / 8.0 / 9.6 | 8.4 / 42 ms | 0.042 | 0.033 |
| e20 | 0.258 | 0.73 | 0.62 | 1.7 / 2.1 / 3.1 | 7.8 / 39 ms | 0.032 | 0.033 |
| stress | 0.867 | 1.68 | 1.81 | 2.6 / 4.1 / 5.4 | 26 / 130 ms | 0.063 | 0.034 |

Every step of the whole game was timed too (`tools/perf/out/game-ticks.json`): mean 0.04-0.46 ms
per step by event. The worst single steps (up to 62 ms) moved from run to run, also landed in build
pauses with no shoppers, and did not come back when the same steps were profiled
(`--profile=59855-59870`): this busy machine's noise or garbage collection, not the game. Path maps
cost 0.03 ms each; a placement check (`canPlace` for a crate) 0.08-0.12 ms; the director under
0.002 ms a step. Nothing in the simulation explains a stutter.

### b. Networking
Full copies, `node tools/perf/netbench.mjs --sizes`:

| state | JSON | parts at 15 KB | on the wire | host: stringify / whole send path | client: parse / whole receive path |
|---|---|---|---|---|---|
| e08 | 20.4 KB | 2 | 23.3 KB | 0.08 / 0.32 ms | 0.08 / 0.11 ms |
| e11 | 24.9 KB | 2 | 28.6 KB | 0.10 / 0.32 ms | 0.11 / 0.14 ms |
| e13 | 35.2 KB | 3 | 40.4 KB | 0.15 / 0.49 ms | 0.15 / 0.20 ms |
| e16 | 42.7 KB | 4 | 49.0 KB | 0.20 / 0.70 ms | 0.18 / 0.27 ms |
| e20 | 40.2 KB | 4 | 46.1 KB | 0.20 / 0.64 ms | 0.19 / 0.23 ms |

(The shoppers are most of it: 28 KB of the 43 at e16.) The host's "whole send path" is what
`transports.js` and PeerJS do: stringify, cut into parts (each re-stringified until it fits),
stringify each part, and PeerJS stringifies each again. Under 1 ms on the PC, a few ms on a slow
phone: not a stutter.

Traffic host to joined player: advance messages 2.5 KB/s (30 a second, at every speed), routine
copies 1.3-2.5 KB/s (one every 10 s), about 5.5 KB/s in all at event 16. Full copies are sent on a
join, a leave, every 10 s, on a checksum mismatch, and when the client is more than 3 s behind.

What the code does with a copy: the host brings everyone up to the current step, then sends the
copy; it costs the host's frame under 1 ms. The client queues it behind the advance messages and
adopts it when its replay reaches that step, so a routine copy causes no jump on screen. Because the
path maps are cached per state object, the first step after a copy works them out again (0.4-0.9 ms
on the PC). A client more than 1 s behind when a copy arrives skips straight to it (a jump); more
than 3 s behind, it asks for one.

The session simulation: `tools/perf/netbench.mjs` joins a real `HostSession` and `ClientSession`
through a pretend link in pretend time (one-way delay, jitter, bandwidth; a lost packet is sent
again after 250 ms and, the channel being ordered, everything behind it waits), with the scripted
team playing both players (player 1's commands go over the link). A slow phone is modelled as
simulation steps costing `--slow` times this PC's and drawing taking a fixed time per frame (from
the render measurements below), so it is not disturbed by this machine's noise. "Freeze" means
the joined player's picture did not move for longer than two steps (67 ms).
`node tools/perf/netscenarios.mjs --from=e16 --secs=300` (300 s of play from event 16):

| scenario | freezes / min | typical / 95th pct / longest | still | other |
|---|---|---|---|---|
| ideal link | 0 | - | 0% | |
| home broadband both ends (30 ms, 15 ms jitter, 20 Mbps) | 0 | - | 0% | |
| phone joined, good 4G/wifi (50 ms, 40 ms jitter, 0.5% loss) | 7.6 | 200 / 250 / 250 ms | 2.6% | |
| phone joined, typical mobile (1% loss) | 14.6 | 200 / 233 / 250 ms | 4.8% | |
| phone joined, poor signal (3% loss, 80 ms jitter, 1.5 Mbps) | 40 | 200 / 317 / 633 ms | 12.7% | |
| host uplink 1 Mbps, no loss | 4.2 | 217 / 350 / 400 ms | 1.5% | at each routine copy |
| host uplink 2 Mbps, no loss | 1.6 | 117 / 150 / 150 ms | 0.3% | at each routine copy |
| weak phone joined (10x slower steps, 15 ms + 0.05 ms a shopper to draw), 1x / 3x | 0 | - | 0% | |
| same weak phone at 5x | 8.6 | 73 / 78 / 79 ms | 1% | frames 41 ms (95th pct) |
| very weak phone (30x slower, 60 ms + 0.2 ms a shopper) at 5x | 261 | 97 / 843 / 7,321 ms | | 18 copies asked for, 19 jumps |
| host's timer runs every 100 ms (a busy phone host) | 0 | | 0% | |
| host's timer every 250 ms | 5.6 | 83 ms | 0.8% | |
| host's tab hidden (browsers run its timer about once a second) | 59.6 | 483 / 500 / 500 ms | 48% | |
| client's `Math.hypot` differs in the last bit (another browser engine) | 0 | | 0% | 0 mismatches |

So the feedback loop asked about (a phone that cannot keep up, falls 3 s behind, asks for a copy,
jumps, and again) exists, but only for a phone about 30 times slower than this PC playing at 5x;
a realistic phone keeps up at every speed. With a 1 Mbps uplink, the stall at each routine copy
grows with the crowd (same link, e08: 83 ms; e16: 250 ms in 120 s runs).

### c. Checksums
A whole two-player game through host and client sessions (`node tools/perf/netbench.mjs
--from=new --link=home --until=21`, 2,808 s of play to event 22): **84,244 checks, 0 mismatches,
280 full copies, all routine, 0 asked for, 0 jumps**. The same with the client's `Math.hypot`
nudged in the last bit for one result in eight (`--ulp=1`, standing in for Safari's engine on an
iPhone): also 0 mismatches. As a check that the probe works, nudging it by one part in a million
gives 5 mismatches in 200 s. (Two earlier mismatch counts came from the harness changing the
host's state by hand; they are fixed and not counted.) So in a normal game host and client never
fall out of step, and the routine copy every 10 s is never needed.

### d. Drawing
`node tools/perf/render.mjs` draws the real renderer on each state in headless Edge on this PC's GPU,
600 frames, game running. Desktop: 1920 x 1080, whole store. "Phone": 844 x 390 at 3 pixels per
CSS pixel (a 2532 x 1170 canvas), touch, the processor slowed 4x (DevTools throttling, the usual
stand-in for a mid-range phone; it slows JavaScript, not the graphics chip), 30 px a tile at the
game's own starting view, with the small map.

| state | desktop: draw mean / 95th / max | first second max | phone: draw mean / 95th / max | first second max | canvases made, first second (phone) |
|---|---|---|---|---|---|
| e16 | 1.6 / 2.7 / 4.3 ms | 57 ms | 6.3 / 9.1 / 15.9 ms | 182 ms | 540 |

Whole game drawn (`node tools/perf/replay.mjs --device=desktop` and `--device=phone`: the same
scripted game, 3 steps per frame in events, every frame drawn, sprite caches cold at the start like
a new session). Per event, drawing time (ms) and canvases made:

| event | first seen | desktop mean / max | phone mean / p99 / max | canvases (desktop / phone) |
|---|---|---|---|---|
| 6 | S:hunter, gym bro, blind | 0.6 / 1.8 | 3.7 / 24.8 / 32.4 | 159 / 123 |
| 7 | S:dad, dog, scooter, trader | 0.7 / 2.8 | 2.7 / 7.5 / 13.1 | 203 / 184 |
| 9 | cosplayer, S:mom | 0.8 / 2.5 | 2.8 / 6.3 / 7.7 | 220 / 200 |
| 10 | S:karen | 0.6 / 1.5 | 2.1 / 4.6 / 7.6 | 194 / 184 |
| 11 | S:teen | 0.9 / 7.7 | 2.2 / 4.8 / 9.0 | 141 / 135 |
| 12 | S:drinker, S:trader, S:gymbro | 0.9 / 2.6 | 2.4 / 7.3 / 11.4 | 314 / 310 |
| 13 | S:dog, S:scooter | 0.8 / 2.0 | 2.6 / 6.7 / 9.3 | 178 / 193 |
| 14 | S:blind, S:flasher, S:preggo | 1.4 / 5.1 | 3.2 / 7.6 / 11.5 | 320 / 307 |
| 15 | S:cosplay | 1.0 / 3.2 | 3.0 / 7.4 / 25.1 | 251 / 236 |
| 16 | | 1.1 / 3.1 | 3.5 / 7.8 / 12.3 | 221 / 249 |
| 17 | | 1.4 / 3.8 | 4.4 / 13.5 / 19.9 | 161 / 144 |
| 18 | | 1.3 / 3.7 | 3.4 / 11.8 / 14.2 | 89 / 65 |
| 19 | | 1.4 / 4.0 | 4.6 / 16.5 / 22.8 | 109 / 103 |
| 21 | | 2.4 / 5.8 | 5.9 / 12.9 / 15.7 | 31 / 31 |

A second desktop run also recorded the time between frames: after the first second it never went
above 19 ms in any event, so the canvas drawing causes no graphics stalls on this PC either.
Drawing grows steadily with the crowd and is small; what peaks in events 12-16 is the painting of
new sprites. Per canvas that is about 0.4 ms on the slowed "phone" (565 canvases added 240 ms over
60 frames after a zoom step).

Zoom: `node tools/perf/render.mjs --states=e16 --extra=rezoom=200` zooms in 1.5x at frame 200,
which crosses one of the renderer's sprite resolution steps (every factor of 1.41): every cached
sprite is thrown away and repainted. Desktop: 641 canvases, worst frame 18.7 ms. Slowed phone: 565
canvases, worst frames **131 and 50 ms**. A pinch on a phone crosses several steps.

By file on the slowed phone (live test below, 300 s from event 11, joined player, CPU profile): of
about 116 s busy, 48 s was the browser's own work (style, layout, paint), then `ui/dom.js` 14 s
(of which `money()`, the dollar formatter using `toLocaleString`, 10.1 s), `render/buildings.js`
12 s, `ui/game.js` 6.7 s (`narrow()` 4.0 s: reading the window size, which forces layout after the
interface has been changed in the same frame; and `getBoundingClientRect` in `placeStrip`),
`render/renderer.js` 5.2 s, `render/paint.js` 5.0 s, the simulation 3.3 s, `render/shoppers.js`
2.9 s, sound synthesis 2.5 s, floor 1.8 s, top bar 1.6 s, effects 1.6 s, session 1.6 s, garbage
collection 1.3 s (about 1%: no garbage collection problem). On the host (desktop, not slowed) about
37 s busy in 300 s. Steady costs, not stutter, but on a phone they use up headroom.

### e. The real game screen, two players (`tools/perf/live.mjs`)
`node tools/perf/live.mjs --state=e11 --secs=300 --throttle=4` opens the real game screen
(`startGame`: renderer, top bar, build bar, DEB, reviews, small map, sound, saving) twice in
headless Edge, each page in its own window: a host at 1920 x 1080 and a joined "phone" (as above,
slowed 4x), linked through the same-computer transport, resuming the saved two-player state; the
scripted team plays both seats. Frame times between drawn frames, long tasks, sync counters:

| run | page | frames / fps | frames over 100 ms after start-up | sync |
|---|---|---|---|---|
| e11, 300 s (events 11-13) | host | 17,307 / 58 | 383 ms at the end of event 11; 94 ms; 192 ms in event 12 | |
| | joined phone | 17,291 / 58 | 367 ms at the end of event 11; 100, 94 ms; 175 ms in event 12 | 9,021 checks, 0 mismatches, 30 copies, 0 jumps |
| e16, 200 s | host | 11,288 / 57 | 386 ms at the end of event 16 | |
| | joined phone | 11,170 / 56 | 386 ms at the end of event 16, 123 ms | 6,016 checks, 0 mismatches |

The freezes happen at the same game moment on both pages, so they are not the network. At the
first end of an event each page's main thread was nearly idle; a trace of the whole browser
(`--traceAt=112 --traceSecs=7`) shows the graphics process busy rasterising the host page for
101 + 186 + 103 ms in a row (`RasterDecoderImpl::DoEndRasterCHROMIUM`), and both pages share that
process here. Hiding the review card (`--hide=.pr-wrap`) shrinks the freeze to 230-250 ms;
without sound it is unchanged (372 ms), so it is not sound. It happens at the first end of an event
in a session; the second (end of event 12) cost 52-70 ms. In a real game the first review is at
event 1, so this is a once-a-session freeze, not the 11-16 stutter. The 175-192 ms freeze in
event 12 was also on both pages at once and was not pinned down. Speech synthesis was checked
separately and does not delay frames.

### Things I could not measure
- A real phone (none attached; `adb devices` was empty), so phone graphics are a stand-in: the
  processor slowed 4x on this PC's RTX 3080. Canvas creation and texture uploads on a phone's
  graphics chip, and Safari's engine on an iPhone, are not covered.
- A real internet link. The link model is mine: it has delay, jitter, bandwidth, and loss with an
  ordered channel, but not the congestion control of WebRTC's data channel. Real data channels
  usually recover a lost packet faster than 250 ms (fast retransmit, about one round trip), which
  would shorten the freezes, but they also send a burst of several 15 KB parts slowly at first
  (slow start), which would lengthen the freeze at each routine copy.
- Which player hosted and who saw the stutter.

## Ranked causes

| # | cause | who sees it | single most telling number | 11-16 pattern | reproduced | still in 0.4 |
|---|---|---|---|---|---|---|
| 1 | Late or lost packets freeze the joined player (100 ms buffer, ordered channel) | joined player only; the host if the phone hosted over mobile | 14.6 freezes a minute of ~200 ms on a typical mobile link | no (steady) | yes, in simulation | yes: 16 / min, the same |
| 2 | First-sight sprite painting (super shoppers) and zoom-step repaint | each player's own screen, phone far more than PC | 565 canvases repainted, 131 ms frame on the slowed phone after one zoom step; events 12-16 paint 2-10x as many canvases as later events | **yes** | partly: counts yes; long frames only at a zoom step on the slowed phone | yes (sprite cache unchanged): first-second max 211 ms on the slowed phone at e16 |
| 3 | Routine full copy every 10 s queued on a slow uplink | joined player | 250-400 ms freeze every 10 s at event 16 on 1 Mbps (83 ms at event 8) | grows with the crowd | yes, in simulation | yes, slightly larger copies (53.7 KB at e16, 5 parts) |
| 4 | Host tab in the background (timers about once a second) | joined player | picture still 48% of the time, 0.5 s at a time | no | yes, in simulation | yes |
| 5 | First end-of-event review: graphics work | both | 0.38-0.42 s on this PC, first time only | no (event 1) | yes, real browser | smaller: 0.18 s |
| - | Simulation, JSON, checksum drift, slow-phone feedback loop, sound, saving | | 0.28 ms a step at e16; 0 mismatches in 84,244 checks | | ruled out | same (0.29 ms a step) |

PC host versus phone client: if the PC hosted, its own screen should have been smooth apart from
the once-a-session review freeze (its frames took 2-4 ms), and what the phone saw was most likely
causes 1, 2 and 3. If the phone hosted, the PC as joined player would see cause 1 from the phone's
mobile uplink, cause 3 if that uplink was slow, and cause 4 whenever the phone's browser was in
the background; the phone itself would see cause 2.

## Proposed fixes, in order of value

1. **A bigger, adaptive jitter buffer for the joined player** (`src/net/session.js`,
   `WANT_BEHIND` and the rate logic in `ClientSession.update`). Measured by changing it in the
   test worktree only (then reverted): at 9 steps (300 ms) the typical-mobile case went from
   14.6 freezes a minute to **0**, the poor-signal case from 40 to **2.2**, the 1 Mbps uplink from
   4.2 to 0.8; at 6 steps (200 ms), 10.4 and 18.8. Better: measure the arrival jitter of advance
   messages and aim for its 95th percentile plus a step, between 3 and about 12 steps, so a good
   link keeps today's 100 ms. Risk: low; the joined player sees the game up to 0.3 s later on a bad
   link (his own commands still go at once). The existing net tests need their expectations of
   "about 3 steps behind" updated.
2. **Stop sending a full copy every 10 s, or send it where it cannot block** (`session.js`
   `FULL_EVERY_SECS`; `transports.js`). The checksum never failed in a whole game, so the routine
   copy is pure cost. At 60 s (tested the same way): the 1 Mbps uplink went from 4.2 freezes a
   minute to 0.6, traffic from 5.5 to 3.1 KB/s; the checksum path still sends a copy within a
   second of any drift. Further: send copies on a second data channel, so they never sit in front of
   advance messages (the client already sorts what it receives by step). Risk: low for the interval
   (a drift the checksum cannot see would last up to 60 s), medium for the second channel.
3. **Paint sprites before they are needed, and never all at once** (`src/render/shoppers.js`
   `createShopperSprites`, `src/render/renderer.js` `setStep`). During each build pause, paint the
   poses of every kind (and super) the next event brings, a few per frame (`waveSpec` says which);
   on a zoom step keep drawing the old sprites scaled until the new ones are painted, a budget of a
   few milliseconds per frame, instead of clearing every cache at once. Expected gain: the 131 ms
   and 50 ms frames after a zoom step and the first-sight painting in events 12-16 disappear on a
   phone. Risk: low (drawing only); slightly blurry sprites for a few frames after a zoom.
4. **Interface overhead on phones** (`src/ui/dom.js` `money`, `src/ui/game.js` `narrow` and
   `placeStrip`). Format money with one cached `Intl.NumberFormat` and only when the number
   changes; read the window size and panel rectangles once per frame before changing anything.
   Expected gain: about 10% of the phone's busy main-thread time (money alone was 10.1 s of 116 s).
   Risk: very low.
5. **The review card's first appearance** (`src/ui/review.js`, `.pr-modal` in `src/style.css`: a
   3rem blurred shadow and a pop-in animation). Build it once, hidden, early in the game so the
   graphics work happens in a quiet moment, or use a plain shadow. Gain: the 0.4 s freeze at the
   first end of an event (0.18 s in 0.4). Risk: very low.
6. **Say when the host's tab is in the background** (`src/main.js` / `src/ui/game.js`,
   `visibilitychange`): tell everyone "the host has the game in the background" (or pause), since
   the browser then runs the host's timer only about once a second. Risk: low.

Not worth doing for this report: anything in the simulation, the checksum, or how copies are
turned into text.

## What still applies to the 0.4 head (`7429ffb`)

The same tools on 0.4 (team bot without bought upgrades, The Back laid with the demo layout):
- Simulation: 0.17-0.29 ms a step at e11-e20 (0.87 ms with 592 shoppers), the same as 0.3.03.
- Full copies are a little bigger with The Back: e16 53.7 KB, 5 parts (0.3.03: 42.7 KB, 4).
- Network: unchanged constants and transport, so causes 1, 3 and 4 are unchanged: typical
  mobile 16 freezes a minute, poor signal 43, 1 Mbps uplink 5.8 (longest 467 ms), hidden host 48%
  still. A whole game: 80,409 checks, 1 mismatch, which came from the harness laying The Back by
  hand on the host at step 5. A 130 s live run on 0.4 showed one checksum mismatch at event 16
  (healed by one copy); I did not find its cause.
- Drawing: e16 desktop 2.5 ms mean, phone 7.4 ms mean, first-second max 52 / 211 ms; the sprite
  cache code is unchanged, so cause 2 applies.
- First end-of-event freeze: 177 ms (0.3.03: about 400 ms). Two freezes of 177 and 160 ms also
  appeared mid-event on both pages, not pinned down.

## The harness (`tools/perf/`, committed on `perf-check`)

| file | what it does |
|---|---|
| `teambot.mjs` | the scripted team (keen bot, any number of players) |
| `game2p.mjs` | plays and times a whole game, saves the busiest moment of chosen events (`--profile=A-B`, `--dump=T`) |
| `simbench.mjs` | simulation cost per state, worst frame per speed, checksum, path map, placement check |
| `netbench.mjs` | full-copy sizes (`--sizes`); host and client sessions over a pretend link (`--link`, `--delay`, `--jitter`, `--mbps`, `--loss`, `--slow`, `--render`, `--speed`, `--hostEvery`, `--ulp`, `--diff`) |
| `netscenarios.mjs` | the scenario table above |
| `render.html`, `render.mjs` | renderer timing on a state, desktop and phone, optional CPU profile by file, `rezoom`, `routeAt` |
| `replay.html`, `replay.mjs` | a whole game drawn, per-event drawing time, canvases made, frame gaps |
| `live.html`, `live.mjs` | the real game screen as host and joined phone, frame gaps, long tasks, profiles, busiest moments, a browser trace (`--traceAt`), `--hide` |
| `cdp.mjs` | the headless Edge driver and profile analysis |
| `v04/` | the two files changed for 0.4 (copy them into the 0.4 tree as `tools/perf/`) |

Results go to `tools/perf/out/` (ignored by git). Regenerate the states first:
`node tools/perf/game2p.mjs`, then any of the others. The browser tools start their own server on
a port of their own (5191 and up), never 5173.

---

## Addendum, same day: the network fixes on `main` (0.4.00)

The investigation above was measured on v0.3.03 and on the 0.4 commit `7429ffb`. The harness now lives
on `main` in `tools/perf/`, adapted to the current 0.4 rules (the old 0.3-only variants are dropped):
- `teambot.mjs` is now the balance bot's maze of Crate Stacks and security (no shop-floor factory any
  more) plus a supply line in The Back from every Returns Drop to the nearest Dumbwaiter
  (`backchain.mjs`), all through ordinary commands.
- `desync.mjs` is new (below). The other tools are as described above; `game2p.mjs` lost its
  auto-rebuild switch (0.4 has none), and `netbench.mjs` / `netscenarios.mjs` take
  `--session=<file URL>` to measure an older copy of `session.js` against the same game.
- The 0.4 states (`node tools/perf/game2p.mjs`, seed 11, Superstore, two players): e08 22 KB, e11
  29 KB (3 parts), e13 39 KB (4), e16 52 KB (5, 148 shoppers), e20 45 KB (4).

### What was changed (`src/net/session.js` only)
1. **Adaptive buffer for the joined player** (`BUFFER`): starts at 3 steps; every time the stream
   runs dry for longer than 1.5 steps (a stop a player can see) the aim moves 2 steps further back,
   up to 9 (300 ms); after 45 s without a stop it comes back one step, down to 3. The change is
   absorbed by the existing rate (the client plays at most 15% slower or somewhat faster while the
   gap is off its aim), never by a jump. Stops while paused, or while the host says its page is
   hidden, do not count.
2. **Routine full copy once a minute** instead of every 10 s. Join, leave, `fastForward`, a checksum
   mismatch and a client more than 3 s behind still send one at once.
3. **The host's page hidden**: `new HostSession({ visibility: document })` (or
   `session.watchVisibility(document)`) makes the host send `away {on}` to everyone when its page is
   hidden or back, and to a player who joins meanwhile; both sides emit `away`. The session never
   touches the page; `main.js` still has to pass `document`, and the interface has to show it
   (interface package).
4. **Checksum and the new dad rules** (commits 102d7df/1af0edb): every entry of a dad's `s.rw` list
   in order, `s.dm`, `s.wg` and `state.wireGen` are now mixed in (each only where present).

### Before and after, link model, 300 s from event 16 on the current code
`node tools/perf/netscenarios.mjs --from=e16 --secs=300 [--session=<the old session.js>]`

| link | picture stops a minute, before -> after | typical / longest stop, before -> after | how far behind (typical / 95th pct), before -> after |
|---|---|---|---|
| home broadband both ends | 0 -> 0 | - | 133 / 133 ms -> 133 / 133 ms |
| phone, good 4G/wifi (0.5% loss) | 7.8 -> 1.2 | 200 / 283 ms -> 100 / 217 ms | 167 / 266 ms -> 300 / 333 ms |
| phone, typical mobile (1% loss) | 15.0 -> 1.8 | 200 / 283 ms -> 100 / 117 ms | 167 / 300 ms -> 300 / 366 ms |
| phone, poor signal (3% loss) | 45.2 -> 1.2 | 183 / 567 ms -> 133 / 383 ms | 266 / 400 ms -> 400 / 466 ms |
| host uplink 1 Mbps, no loss | 5.8 -> 0.6 | 200 / 450 ms -> 200 / 417 ms | 100 / 200 ms -> 167 / 233 ms |
| host uplink 2 Mbps | 2.6 -> 0.2 | 117 / 183 ms -> 167 ms | |
| host tab hidden (timer once a second) | 59.6 -> 59.6, still 48% -> 18% | | (the 'away' message lets the interface say why) |

Traffic host to joined player: 6.2 KB/s -> 3.2 KB/s. The added delay (how far behind the host the
joined player sees the game) is zero on a steady link and about 130 ms on a mobile one.

### The checksum mismatch seen once on 0.4 (task 5): the harness, not the game
The one mismatch in the 130 s two-screen test on 0.4 came from my harness. The 0.4 copy of the team
bot laid the demo layout's Back on its first purchase with `applyDemoBack(state, 0)`, which changes
the host's state directly (drops put in, parts placed through `applyCommand` without going through
the session, cash changed by hand), so nothing of it reached the joined player. In the browser test
that first purchase came after the joined player was already in (the bot waits for two players), so
his copy lacked those parts until the checksum caught it and a copy repaired it. Reproduced in Node
(`HostSession` from the e16 state, a client joined, 3 s of play, then `applyDemoBack` on the host's
state): 0 mismatches before, then exactly 1 mismatch and 1 asked-for copy, as in the browser.

To be sure there is no real cause as well, `tools/perf/desync.mjs` plays host and client (and a
third player who joins in the middle of sales events and leaves again) over the pretend link with
scripted players on BOTH sides that use everything in 0.4: placing, removing and turning on both
floors (belts, Splitters, Overpasses, Interns, the five machines, Rebranders, Bins, whole supply
lines from the drops), `dropUp`, `wire` (also on a building right in the dads' way, with Razor Wire
fed to it, and changed while dads walk), `reinforce`, rebuild orders, `give`, skipping the cards,
pause, speed changes and opening the doors early, with the client's commands arriving whenever the
link delivers them. Both sides also run the real renderer every frame (with a stand-in canvas) with
a random building held over a random tile on either floor, and the rebuild button's status, so the
interface's own questions to the rules happen as in the browser. After every advance message the
client's whole state is compared with the host's at that step. Results: see the PLAN.md entry and
the final numbers below.

Final numbers of the hunt (`node tools/perf/desync.mjs --games=16 --seed=101 --waves=14`, then 6 games
of the Car Park at size l, then 6 of the Back Passage at size s with 80 ms delay and 150 ms jitter):
**28 games, 224 minutes of play, 44,913 commands, 174 players joining and leaving mid-game, 495,337
full state comparisons, 0 differences, 0 checksum mismatches.** Razor Wire was laid or turned
4,500 times or so, charged dads 41 times and ran out 22 times during events. (Two earlier rounds
reported differences that turned out to be the hunt's own bookkeeping: commands applied at a step
after its advance message go out in a second advance message for the same step, so the host's
states are now kept by step and checksum.) So nothing in `src/net` or `src/sim` needed fixing, and
no failing test was handed back. The renderer and the wire previews of stage 4b (which work on a
copy of the state) were run on both sides throughout.

### Tests
`node --test`: 622 tests, all pass (12 new: `test/netbuffer.test.js` has 10 for the buffer, the
once-a-minute copy, a mismatch still repaired within a second, and the host-away message; one new
checksum test in `test/netsync.test.js`; the old "routine copy within ten seconds" test now checks
a minute).

### Risks
- A joined player on a poor link now sees the game up to 0.3 s later than before (aim of 9 steps).
  His own commands still reach the host at once; buildings he places appear a little later on his
  screen.
- Drift the checksum cannot see now lasts up to a minute instead of 10 s. The hunt found none.
- The 'away' message does nothing until `main.js` passes `document` and the interface shows it.
