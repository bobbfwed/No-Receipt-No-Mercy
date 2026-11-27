# No Receipt, No Mercy

*The customer is always a prick.*

<!-- gen:version -->
**Play version 0.4.00 now: https://bobbfwed.github.io/No-Receipt-No-Mercy/** (nothing to install; works in a browser on a computer, a tablet or a phone).
<!-- /gen:version -->

A co-op browser game for 1 to 7 players, set in the returns department of a discount warehouse. Shoppers pour into a discount warehouse wanting refunds. You and your friends each have your own cash (the store's income and refunds are split evenly between you), build a factory of belts and machines to earn more, and build security to make the shoppers give up before they reach the tills. The belts and machines are the maze they walk through. An HR chatbot called DEB insults you the whole time. Adults only.

## The stores
<!-- gen:maps -->
The host picks a design and a size before the game starts. Each player gets his own shopper entrance, and the painted floor shows where each kind of machine may go.

### Open Warehouse
One big empty floor with a few pillars. Every wall in the maze is one you built.

![Open Warehouse](docs/img/map-warehouse.png)

### Flat-Pack Showroom
Walled rooms joined by doorways that everyone, and every belt, has to go through. Good choke points, awkward factories.

![Flat-Pack Showroom](docs/img/map-showroom.png)

### Supermarket Aisles
Rows of shelving with a wide main aisle down the middle. The shelves are free walls; the main aisle is your problem.

![Supermarket Aisles](docs/img/map-aisles.png)

### Food Court
Little tables, sticky booths, kebab stalls and a fountain full of pennies. The crowd weaves through it all; so do your belts.

![Food Court](docs/img/map-food.png)

### Car Park
The sale has spilled outside. Rows of parked cars with the odd empty bay to squeeze through, and tills on two walls: make one way in a slog and the whole crowd takes the other.

![Car Park](docs/img/map-carpark.png)

### The Back Passage
Staff only. Long service corridors with a few gaps in the walls, and every kind of painted floor in a different corridor: your belts squeeze through the same gaps as the crowd. The plot is taller than most, to fit more corridors in.

![The Back Passage](docs/img/map-corridors.png)

### The Strip Mall
A U of dying shops round a car park nobody owns. In on one arm, round the bend, refunds at the bottom of the other: the bend is everyone's problem. The plot is bigger, as the middle is all car park.

![The Strip Mall](docs/img/map-horseshoe.png)

| Size | Most designs | The Back Passage | The Strip Mall | Suits |
|---|---|---|---|---|
| Corner Shop | 30 x 16 | 30 x 19 | 33 x 18 | the original; cramped |
| Outlet | 36 x 20 | 36 x 26 | 40 x 22 | 1 player |
| Superstore | 44 x 24 | 44 x 28 | 48 x 26 | 2 players |
| Megastore | 54 x 30 | 54 x 35 | 60 x 33 | 3 players |
| Hypermarket | 66 x 37 | 66 x 43 | 73 x 41 | 4 players |
| Distribution Centre | 81 x 45 | 81 x 53 | 89 x 50 | 5 players |
| Regional Hub | 99 x 55 | 99 x 65 | 109 x 61 | 6 players |
| Mega Mall | 121 x 67 | 121 x 78 | 134 x 74 | 7 players |
<!-- /gen:maps -->

## The shoppers
<!-- gen:shoppers -->
Patience is what security wears down; when it runs out the shopper storms off and gets no refund. The numbers are for the first sales event at Normal difficulty; patience grows every event. Each picture shows the ordinary shopper and its super version, which turns up later and takes a double refund. The boss, last in the list, walks in with the crowd every 5th sales event. The speed shown is the kind's: each shopper walks anywhere from 10% slower to 10% faster than that, so a crowd strings out instead of arriving in one lump (the boss and the babies keep their own).

| | Shopper |
|---|---|
| <img src="docs/img/shopper-hunter.png" alt="Bargain Hunter and Doorbuster" width="200"> | **Bargain Hunter** · from sales event 1 · patience 36, speed 1.4, refund $20<br>The ordinary shopper. Stops for free samples and grabs goods off belts, and will wander a few tiles out of his way to do it: anything on a belt is fair game except a Mystery Box.<br>**Beat it with:** Anything. Slow them at a gap and spray them. Keep your Gadgets and Gift Sets away from the route, or put a sprinkler where they come to help themselves.<br>**Super: Doorbuster** (from sales event 6). Three times the patience, and quicker. |
| <img src="docs/img/shopper-dad.png" alt="Dad and Dad on a Mission" width="200"> | **Dad** · from sales event 2 · patience 30.6, speed 2.4, refund $50<br>Arrives in a single-file line, walks fast, ignores samples, and steps over conveyor belts.<br>Tough against the Pepper Sprinkler: loses 10% less patience to it. It's only water. He has been pissed on by a newborn at three in the morning; your sprinkler is a light breeze.<br>**Beat it with:** Time: his patience drains by itself. Crates and machines block him. He slips on wet floor signs. Cover his short cut.<br>**Super: Dad on a Mission** (from sales event 7). Two and a half times the patience, faster, never slips, and his patience drains half as fast. |
| <img src="docs/img/shopper-clipper.png" alt="Coupon Clipper and Extreme Couponer" width="200"> | **Coupon Clipper** · from sales event 3 · patience 14.4, speed 1.9, refund $10<br>Fast, weak, and there are a lot of them.<br>Weak to the Barcode Laser: loses 10% more patience to it. The laser scans her coupons, and every last one of them expired in 2019. She takes it personally.<br>**Beat it with:** Sprinklers. Anything that hits a crowd.<br>**Super: Extreme Couponer** (from sales event 8). Two and a half times the patience and much faster. |
| <img src="docs/img/shopper-mom.png" alt="Mom and Kid and Soccer Mom" width="200"> | **Mom and Kid** · from sales event 3 · patience 49.5, speed 1.3, refund $40<br>Her kid escapes the cart and runs ahead, straight through your belts, machines and crates, then waits further along the route. She sprints round the maze to reach him and ignores free samples on the way. If her patience runs out while he is loose, she does not leave: she crawls to him, nothing can hurt her, and security wastes its shots on her. When she reaches him she gets up with a third of her patience back, without her cart, and carries him from then on. He runs away once only, he never runs all the way to the tills, and she will not take her refund without him.<br>**Beat it with:** Finish her while the kid is in the cart. Forklifts and wet floor signs. Samples only work while the kid is in the cart. A TV Salesman stops most runaway kids.<br>**Super: Soccer Mom** (from sales event 9). Twice the patience. Sprints twice as fast after a kid who runs twice as far, and he can run away twice. She keeps her cart until the second time she goes down. |
| <img src="docs/img/shopper-teen.png" alt="Teenager and Teen Influencer" width="200"> | **Teenager** · from sales event 4 · patience 40.5, speed 1.2, refund $24<br>Slow. Spills a slushie every few seconds; the mess slows every other shopper and dads slip on it.<br>Weak to the Pepper Sprinkler: loses 10% more patience to it. His phone gets wet. It is the worst thing that has ever happened to him, and he will be posting about it.<br>**Beat it with:** Let him loiter in range. His messes work for you.<br>**Super: Teen Influencer** (from sales event 11). Twice the patience. Three times the mess, and it stays twice as long. |
| <img src="docs/img/shopper-karen.png" alt="Karen and Karen Supreme" width="200"> | **Karen** · from sales event 5 · patience 153, speed 0.9, refund $80<br>Enormous patience. Security near her works at half speed while she asks for the manager.<br>Weak to the Pepper Sprinkler: loses 10% more patience to it. The hair. Four hundred dollars of highlights, and you just hosed them. Tough against the Barcode Laser: loses 10% less patience to it. She has argued with scanners before. The scanners apologised.<br>**Beat it with:** Long routes and forklifts out of her reach. Do not rely on one cluster of towers.<br>**Super: Karen Supreme** (from sales event 10). Four times the patience. Slows security twice as far away, to a quarter speed. |
| <img src="docs/img/shopper-drinker.png" alt="Day Drinker and Bottomless Bruncher" width="200"> | **Day Drinker** · from sales event 5 · patience 45, speed 1.3, refund $30<br>Weaves along at a speed that keeps changing. At corners of the route he may fall over and lie there for 4 seconds, and everyone else has to squeeze past him at a third of their speed.<br>Weak to the Wet Floor Sign: takes 10% longer to get across one. He can barely stay upright on a dry floor. On a wet one he takes the scenic route, on all fours. Tough against the Pepper Sprinkler: loses 10% less patience to it. He thinks it is raining, and he is delighted about it.<br>**Beat it with:** Corners near your security: when he goes down, the queue behind him stands in the spray.<br>**Super: Bottomless Bruncher** (from sales event 12). Two and a half times the patience. Falls over at half the corners and stays down 6 seconds. |
| <img src="docs/img/shopper-blind.png" alt="Man with Guide Dog and Man with Two Guide Dogs" width="200"> | **Man with Guide Dog** · from sales event 6 · patience 63, speed 1.1, refund $40<br>The guide dog steers him around puddles and messes, and he cannot see free samples. Pepper spray makes the dog bolt, dragging him along fast.<br>Tough against the Barcode Laser: loses 10% less patience to it. He cannot see the red light, so it cannot ruin his day.<br>**Beat it with:** Forklifts. Sprinklers make him faster.<br>**Super: Man with Two Guide Dogs** (from sales event 14). Two and a half times the patience. The dogs bolt from forklift hits too, further and faster. |
| <img src="docs/img/shopper-gymbro.png" alt="Gym Bro and Roid Rager" width="200"> | **Gym Bro** · from sales event 6 · patience 76.5, speed 1.5, refund $60<br>Walks straight through crate stacks, wrecking any in his way and any he passes, and now and then something else beside him: a belt, a machine, a tower. But he only has two hits in him a visit, and needs 10 seconds to get his breath back after each. While he does, and once he is spent, he walks round crates like anyone else.<br>Weak to the Pepper Sprinkler: loses 10% more patience to it. The spray tan runs, and now everyone can see he is actually beige. Tough against the Forklift Turret: loses 10% less patience to it. He benches more than a pallet, and he will tell you so while it hits him.<br>**Beat it with:** Stop him early, before he reaches anything expensive. Every hit he lands counts, even one a Durability upgrade soaks up (the damage is forgotten every sales event), so a durable crate stack where he first meets your maze takes a hit off him for nothing, and makes him walk the long way round. Press B to rebuild what he wrecked at half price.<br>**Super: Roid Rager** (from sales event 12). Two and a half times the patience, and faster. Three hits instead of two, only 5 seconds apart, and he goes for things that are not crates far more often. |
| <img src="docs/img/shopper-scooter.png" alt="Mobility Scooter and Turbo Scooter" width="200"> | **Mobility Scooter** · from sales event 7 · patience 85.5, speed 1.2, refund $40<br>Cannot be slowed by anything.<br>Weak to the Forklift Turret: loses 10% more patience to it. The bigger vehicle always wins, and grandma knows it.<br>**Beat it with:** Raw damage over a long route.<br>**Super: Turbo Scooter** (from sales event 13). Two and a half times the patience and nearly twice the speed. |
| <img src="docs/img/shopper-dog.png" alt="Stray Dog and Great Dane" width="200"> | **Stray Dog** · from sales event 7 · patience 19.8, speed 2.6, refund $10<br>Fast, with little patience. Pees on any security it passes (not wet floor signs), which switches that building off for 6 seconds.<br>Weak to the Pepper Sprinkler: loses 10% more patience to it. Hates baths. Spray him once and he acts like you tried to drown him. Tough against the Forklift Turret: loses 10% less patience to it. Too small to hit properly: the forks keep going right over his head.<br>**Beat it with:** Stop it before it reaches your best security. Spread security out so one dog cannot switch off a whole gap.<br>**Super: Great Dane** (from sales event 13). Two and a half times the patience and faster. Switches security off for 12 seconds, from further away, and more often. |
| <img src="docs/img/shopper-trader.png" alt="Card Trader and Scalper" width="200"> | **Card Trader** · Midnight Release events only (from sales event 7) · patience 30, speed 1.5, refund $16<br>Grown men who collect Mythic Bastards cards. He never comes on his own: at a Midnight Release a mob of a dozen or more pile in through one entrance at once. Each one is weak, but they all reach the tills together. He steals nothing but Mystery Boxes, and he is the only shopper who does: he walks well out of his way to take one off a belt, then stands there ripping it open while every Card Trader near him stops to see what he pulled. Every box he rips is one your Press never gets.<br>Midnight Release events only: sales events 7, 12, 17 and every 5th after (never a boss event). 12, then 16, then 20 of them (4 more each time; more with more players) all come through one entrance within 2 seconds, about 20 seconds after the doors open, and the rest of that event's crowd is 85% of its usual size.<br>Weak to the Pepper Sprinkler: loses 10% more patience to it. Wet cards are not mint. He will cry, actually cry, and the queue will hold a moment of silence.<br>**Beat it with:** Sprinklers, where the mob bunches up. A ripped pack stops a whole knot of them, so a belt of boxes with sprinklers round it is bait: security loves it, the factory does not. Keep your real production lines away from the entrance the mob is coming through.<br>**Super: Scalper** (from sales event 12). Two and a half times the patience, and a double refund. He pushes a hand truck stacked with sealed boxes he bought this morning and will sell online tonight for four times the price. |
| <img src="docs/img/shopper-flasher.png" alt="Exhibitionist and Nudist Nan" width="200"> | **Exhibitionist** · from sales event 8 · patience 54, speed 1, refund $30<br>A woman in a bathrobe who opens it every few seconds. Dads and teenagers within 2.5 tiles stop and stare for 2 seconds.<br>**Beat it with:** She helps you: let her walk with the dad line, in range of something that hurts.<br>**Super: Nudist Nan** (from sales event 14). Two and a half times the patience. No robe at all: stops dads and teenagers within 4 tiles for 3 seconds, every few seconds. |
| <img src="docs/img/shopper-preggo.png" alt="Pregnant Lady and Octomom" width="200"> | **Pregnant Lady** · from sales event 8 · patience 117, speed 0.9, refund $60<br>Very pregnant: slow, with a lot of patience, and she stops for every free sample (she is eating for thirteen). When her patience runs out she does not leave. She pops, and a dozen babies run for the tills from where she stood: very fast, with very little patience, and nothing distracts them. A baby at a till takes $5 but is not a refund toward the limit. If she reaches a till herself she takes one refund and nothing pops.<br>**Beat it with:** Finish her with a Barcode Laser: if its beam takes her last patience, no babies come out. Otherwise wear her down early, so the babies have the whole maze to run, with sprinklers and wet floor signs along it to catch them.<br>**Super: Octomom** (from sales event 14). Two and a half times the patience, and two dozen babies when she pops. A Barcode Laser still stops all of them. |
| <img src="docs/img/shopper-cosplay.png" alt="Cosplayer and Full Mech Suit" width="200"> | **Cosplayer** · from sales event 9 · patience 135, speed 1.3, refund $60<br>A big costume and a lot of patience. Shots from sprinklers, forklifts and barcode lasers that would hit a shopper standing next to him hit him instead.<br>Weak to the Forklift Turret: loses 10% more patience to it. He cannot see out of the helmet, so he never sees the pallet coming. Tough against the Barcode Laser: loses 10% less patience to it. The foam armour is "rated for lasers". He made it himself, and he will explain the build for an hour.<br>**Beat it with:** Wear him down while he is alone, or separate him from the crowd: free samples and salesmen stop the others while he walks on.<br>**Super: Full Mech Suit** (from sales event 15). Two and a half times the patience. Shields shoppers within 1.6 tiles and takes only half of what he soaks up. |
| <img src="docs/img/shopper-boss.png" alt="The boss, Regional Manager" width="200"> | **Regional Manager** (the boss) · every 5th sales event · patience 288, more for each rank, speed 0.7, refund $150 times his rank<br>Head Office sends a manager to find out why refunds are down. He walks in a little after the doors open, slowly, with enormous patience, and nothing slows or stops him: not wet floors, messes, free samples, a drunk on the floor, the TV Salesman or a naked woman. Every few seconds he gives a pep talk, and every shopper near him gets some patience back. He gets a grander title, and more patience, every time he comes back.<br>Every 7 seconds his pep talk gives every shopper within 3.5 tiles 20% of their patience back. If he reaches a till he counts as 2 refunds; if he storms out the store gets a bounty of $165 times his rank.<br>**Beat him with:** Raw damage along a long route. Get him away from the crowd, so his pep talks have nobody to cheer up, and do not let him reach a till: he counts as several refunds at once and takes a huge one. Drive him out and the store gets a bounty.<br>**Ranks:** Regional Manager (event 5), Area Director (event 10), Vice President of Returns (event 15), The CEO (event 20 on). |
<!-- /gen:shoppers -->

The game's own **Employee Handbook** (the book button, on the menu and in the game) has every shopper (and the boss), machine and piece of security with its full numbers: patience event by event, how many turn up, and what each upgrade level costs and does.

## Play on this computer without the internet
The link above is the easy way. To run your own copy instead (for example to try changes), you need Node.js (any recent version) to serve the files.

Double-click `play.bat`. It starts a small local server and opens the game in your browser. Keep its window open while you play; closing it stops the server, and the page will then say "Unable to connect".

Or by hand: run `node tools/serve.mjs`, then open http://localhost:5173/ in Chrome, Edge or Firefox.

- **Training shift** has you place every building and use every tool, hands on, in about ten minutes, against the plainest shopper there is (the Coupon Clipper); then two shoppers with a trick, Dads and the Gym Bro, in about five more ("Jump to part 2" skips straight to those). The other kinds you meet on the job; the Employee Handbook lists them all. Start here.
- **Painted floor:** Unpackers, Presses, Packers and Shipping Chutes each only go on their own named patch of floor (Loading Bay, Press Shop, Gift Wrap, Shipping). The patches are apart, so belts carry the goods between them, and those belts are your maze.
- **The store** on the menu picks the map for Play solo and Host a game: a design (open warehouse, showroom of walled rooms, supermarket aisles, food court, car park) and a size. Each size says how many players it suits; every player gets his own shopper entrance.
- **The game** on the menu sets its length (10, 15, 20 or 30 sales events, or **Endless**), the difficulty and each player's starting cash. An endless game has no last sales event: it goes on until the refunds close the store, and the browser remembers the furthest sales event reached on each difficulty. A game that has been won can also be carried on as an endless one with **Keep going (endless)** on the win screen.
- **The boss** walks in every fifth sales event, a little after the doors open: slow, very patient, and nothing slows or stops him. His pep talks give the shoppers around him patience back. If he reaches a till he counts as two refunds; drive him out and the store gets a bounty. He comes back with a grander title each time (Regional Manager, Area Director, Vice President of Returns, The CEO). A bar across the top of the floor shows his patience while he is in the store.
- **The Car Park** is the one store with tills on two walls: the usual bank on the right and a second in the bottom wall. Shoppers walk to whichever is nearer, so lengthening one route sends the crowd to the other. Both banks must stay reachable: a building that would wall one off is refused. Its entrances in the bottom wall open last (for a sixth and seventh player), because they are close to the bottom tills.
- **Play solo** starts a real game straight away.
- The speaker button at the top right sets the overall volume and, each with its own slider, money, shoppers, security and machines, announcements, the store music and DEB's voice (the speaker beside a slider turns that one off and back on).
- To try multiplayer alone, open http://localhost:5173/tools/two-player.html : a host and a second player side by side.

## Play online with friends
The game is online multiplayer for up to seven players, wherever they are. Nobody runs a server: one player hosts in his browser and the others connect to him directly over the internet.

1. Everyone opens https://bobbfwed.github.io/No-Receipt-No-Mercy/ . (The site is this repository published with GitHub Pages from the `main` branch; every push to `main` updates it within a minute or two.)
2. The host enters a name and presses **Host a game**. A five-letter room code appears at the top.
3. The host presses **Copy link** and sends it to his friends (or reads them the code). They open the link, enter a name and press **Join a game**.
4. Everyone lands in the lobby, with the store drawn whole on the right. The host can change its design and size there, and the game's settings (how many sales events or endless, the difficulty, and each player's starting cash), and everyone sees it change. The same settings can be chosen on the menu before hosting. Each player presses **READY**; the game starts when all of them have.
5. Friends can also join after the game has started, even mid-wave, and play at once. If someone drops out he can rejoin with the same name and gets his place back.
6. A player whose connection drops keeps his money for 90 seconds (real time, whatever the game speed); if he is back by then nothing is lost, and if not it is shared between the others. If the host leaves, the game carries on: another player's browser takes over as host within a few seconds (up to a minute), and everyone else reconnects by themselves. The player who left can come back with the same link and gets his place back. Only when the last player leaves is the game gone.
7. Once a game is under way, the browser asks before the page is closed, refreshed or left, so a stray Back button does not end it.

**Known limit: two players on the same network.** A player on the same wifi or home network as the host usually cannot join (tested: a phone joining a computer on one network fails, and the same phone on mobile data succeeds). Two browsers on one network can only reach each other through a relay server, and the game does not have a dependable one yet. Until it does, a player in the same house as the host should join over mobile data, or play from a different network. (For whoever runs the site: the fix is a relay account, whose details go in `src/net/relay.js`; the instructions are in that file.) The same message, "could not reach each other", can also mean a strict firewall or VPN. https://bobbfwed.github.io/No-Receipt-No-Mercy/tools/net-check.html shows what a given device's network allows.

The first connection goes through the free public PeerJS service, which only introduces the browsers to each other; the game data then travels directly between you. If that service is down, online games cannot start (solo still works).

## Head Office: one of you plays the shoppers
With two or more players, one can stop defending and run the other side. Between sales events, press **Run the shoppers** next to your name in the players list. Each build phase you then get a budget and buy the coming crowd: which kinds of shopper, how many, which entrance each group uses and when it arrives. Buy nothing and the usual crowd comes. You win if the store reaches its refund limit; the others win if it survives every sales event (in an endless game, the store can only lose). The boss comes in every fifth sales event whatever you buy, free of charge; you cannot buy him. Somebody must always be left running the store.

## Controls
| Key or mouse | Does |
|---|---|
| 1 to 9, 0, - and = | Pick a building (or click it in the bar). - is the Barcode Laser, = the TV Salesman |
| Click | Build |
| Drag | Build a line; belts follow the drag |
| R | Rotate what you are holding, or the building under the mouse when holding nothing. The Barcode Laser fires the way it faces, so turn it before you place it |
| Click a building with nothing picked | Opens its upgrades. Each kind (damage, speed, range, durability) is bought on its own; each level costs more than the last |
| U | Buy the next level of the first upgrade of the building under the mouse (or pick the Upgrade tool and click a building to open its upgrades) |
| B | Rebuild everything of yours that gym bros have wrecked, at half price, upgrades included. The money goes at once; each wreck goes back as soon as nothing is in the way, and every new wreck needs another press |
| Right-click, or X then click | Remove (75% of what was spent on it back) |
| OPEN THE DOORS | Start the next sales event without waiting for the timer. It costs nothing: the factory is paid at once for what it would have sold in the time skipped |
| Esc | Put the tool down |
| P, or the pause button before the speed buttons | Pause the whole store, for everyone; press again (or click the PAUSED sign) to carry on. Any player can do either. Nothing can be built, sold or upgraded while paused, because the build pause runs on a timer |
| W A S D, or arrow keys | Move the view around the map |
| Mouse wheel | Zoom. Middle-button drag also moves the view |
| F | Show the whole map |
| H | Go to your own entrance |
| Click the small map | Jump there (it appears when the store does not fit on screen) |
| Give $50 / $200 / $1,000 (players list) | Hand a colleague some of your cash |

## Carrying a game on another day
The host's browser saves the game by itself every few seconds while it is under way. Next time the host opens the game on the same device and browser, the menu offers **Resume saved game**, showing the sales event, the store, who was playing and when it was saved. Resuming makes him the host again. If others were in the game, a new room code appears: he sends it to them, and each gets his place and his money back by joining under the same name. There is one save per browser; a finished game clears it (a won game carried on as an endless one is saved again), and **Delete this save** throws it away. It is not saved online, so it cannot be resumed from a different device.

## On a phone or tablet
The game works by touch, in either orientation (a tablet, or a phone held sideways, is more comfortable).

| Touch | Does |
|---|---|
| Drag a building up out of the bar onto the floor | It rides just above your finger; lift to build one where it shows. What you held before stays held |
| Tap a button in the bar | Pick that building or tool; tap it again to put it down. Hold a button to read what it does |
| Tap the floor with a building picked | Build on the tapped tile (however long the finger rests, as long as it does not slide) |
| Slide a finger on the floor with a building picked | The building rises just above your finger so you can see where it goes; lift to build it there (with it off the floor or over a button, nothing is built) |
| Hold the placing finger at the edge of the floor | The view slides that way, slowly |
| A second finger on the floor while placing | Cancels it; the two fingers then move and zoom the view |
| ROTATE button that shows while placing | Turns the building before you lift |
| Drag with Belt picked | Lay a line of belt that follows your finger |
| Tap, or slide and lift, with Remove picked | Remove that one building |
| Drag with nothing picked | Move the view |
| Two fingers | Move the view and pinch to zoom, whatever is picked |
| Tap a building with nothing picked | Opens its actions: a button for each kind of upgrade, rotate, remove |
| Buttons at the end of the bar | Rotate, and put the tool down |
| MAP and HOME on the floor | Show the whole store; go to your entrance |
| The menu button at the top right | Pause and speed, room code and link, sound, help |
| The PAUSED sign | Tap it to carry on |

The tutorial and the help text word their instructions for touch when the game is opened on a touch screen.

**Full screen.** The button at the top right (⛶, inside the menu button on a phone) switches full screen on and off on Android and on computers. To get an app icon that opens the game full screen:
- Android (Chrome): open the game, tap the browser's menu (three dots), then **Install app** or **Add to Home screen**.
- iPhone and iPad (Safari): tap the Share button, then **Add to Home Screen**. iPhones do not allow the full-screen button, so this is the only way there.
- Computer (Chrome or Edge): the install icon at the right of the address bar.

## Chat
With more than one player in the game, press Enter (or the Chat button) to type a line to everyone. It works in the lobby too.

## For developers
- `node --test` runs the tests.
- `PLAN.md` has the plan and the decisions taken so far.
- `docs/architecture.md` explains how the code is organised and the testing tools.
- `CLAUDE.md` has the project rules for AI assistants.

## License
Copyright 2026 Brandon Nimon. The game is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE.md), in every version and every commit of this repository. Anyone may play it, change it, share it and build on it for any noncommercial purpose. Nobody may sell it or use it commercially. Anyone who passes on any part of it must include the license and its "Required Notice" line, which credits the original author. `vendor/peerjs.min.js` is PeerJS, under its own MIT licence (see [LICENSE.md](LICENSE.md)).
