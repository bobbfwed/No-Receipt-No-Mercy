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
| Factory balance (owner's feedback after playing) | Press $220 (was $120), Packer $450 (was $200). Item prices unchanged: Box $2, Gadget $7, Gift Set $16 | Owner: too much money too early; choosing between factory and security should hurt |
| Marked floor (owner's rule) | Each map paints four kinds of floor: Loading Bay, Press Shop, Gift Wrap, Shipping. Unpackers, Presses, Packers and Chutes only go on their own kind. The patches are 4 tiles wide and 2 or 3 tall, in sections ten tiles apart, stacked top to bottom in that order; every other section is upside down, so lines run down one and up the next. Patches never touch. Belts, crates and security go anywhere | Owner: a factory with no belts worked, so belts must be needed to move goods between areas. An earlier attempt (machines only pass goods to belts, plus a bonus for distance) was replaced by this at the owner's request |
| Security balance (owner's feedback after playing) | A sprinkler hits at most four shoppers at once (the four nearest the tills) and each upgrade multiplies its damage by 1.25 (was 1.45). Shopper patience grows faster: 3.7 times the base by wave 10, 9.6 times by wave 20 (was 3.3 and 8.2) | Owner: high-level sprinklers were killing everything in the first few tiles by wave 9 |
| Difficulty | Tuned with scripted players (`node tools/balance.mjs`) on the one-player map: a player who builds a sound layout and then stops spending loses at wave 10; one who keeps buying forklifts and upgrades loses between waves 10 and 13 (before the owner's balance feedback these were 13 and 19, and the owner was winning easily by wave 10) | The owner found the late game too easy. The scripted player is a poor economist and spreads its upgrades thinly, so a person should do better than it, but whether a person can actually win now is untested. All numbers are in `src/sim/constants.js` |
| Map sizes | Seven sizes. The original 30 x 16 is kept as "Corner Shop"; the size for one player is half as big again (36 x 20), and each further size is half as big again as the last, up to 99 x 55 for six | Owner's rule. The area grows by half each step, not the width |
| Map designs | Open Warehouse, Flat-Pack Showroom (walled rooms joined by two-tile doorways), Supermarket Aisles (rows of shelving and a wide main aisle) | Owner asked for different designs, with walled rooms as the example |
| Entrances | Six possible entrances on every map: three on the left wall, two on top, one on the bottom, all toward the left. They open in this order as players join: left middle, top, bottom, left upper, left lower, top further along. Entrances that are still shut are drawn, and the maze may not wall them in | Owner asked for one per player, mostly on one side, some top and bottom. Fixed positions mean a player joining late never moves anyone's entrance |
| More players | Each extra player adds half a solo game's worth of shoppers and 10 to the refund limit, and every player gets the full end-of-wave bonus | So a bigger group is busier without the money per head dropping. Untested with real groups |
| Money | Each player has $500 of his own (a late joiner gets $60 more per wave already played). Income and refunds are split between the players who are connected. Selling a building pays whoever bought it. A player can give another $100 at a time from the players list | Owner's rule; the give button is my addition, so a factory player can fund a security player |
| Upgrades | Replaced in 0.2 by separate tracks for every building: see "Version 0.2" below. (Before: security only, one level at a time, up to level 10.) | Owner asked for upgrades that get exponentially more expensive, then in 0.2 for separate tracks and factory upgrades |
| Super shoppers | Every kind has one, from wave 6 (hunter) to wave 14 (guide dog), a growing share of each group. All take a double refund | Owner's rule: at least twice as strong, Karen four times the patience, mom three times the chase speed |
| Gym bros | Wreck every crate stack beside their route, and 15% of the time something else. Since 0.2 a hit wears a building down instead (durability), and Rebuild (B) puts back what was wrecked at half price with its upgrades: see "Version 0.2" below | Owner wanted more wrecking and of more things. The level rule and the button are mine, to stop it being a chore or wiping out a $10,000 tower |
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

## Head Office: a player who runs the shoppers (owner's idea; first version built, not yet played by people)
The plan below is as written before building. What was built, and where it differs:
- A player takes the job from the players list between waves (not from the menu), and can hand it back. One player at a time.
- Prices come from patience x speed x a weight for the kind's trick (`OFFICE` in `src/sim/constants.js`). A kind can be bought from the wave the automatic waves first include it; supers likewise.
- Budget each wave: 85% of what the automatic wave is worth, plus half of what he left unspent, plus $5 per shopper who got a refund last wave.
- A group is a kind, a number, super or not, an entrance and a start time. The gap between arrivals is fixed per kind.
- Decided without asking (the three open questions): he sees the whole store all the time; planning uses the normal build countdown, and the doors open early only when both sides ask; he wins when the store hits the refund limit, with no separate score.
- His entrance stays open after he changes sides (entrances never close), so he has one more door to use.
- Changing the plan takes back his "ready". If the last store player drops out, he is put back in the store.
- Not built: one-off abilities, two organisers, hiding his plan from the builders (it is in the shared game state, though the interface does not show it to them).

### The plan as first written
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

## Phones, tablets and chat (owner's request, built; not tried on a real phone)
- Every screen has a phone and tablet layout and the floor is fully usable by touch (see README.md for the gestures). Checked in an emulator at five screen sizes with a page of simulated finger touches; desktop screens were compared before and after and did not change.
- Checked on a real Android phone (Galaxy S24 Ultra, Chrome 156) with `tools/phone.mjs`: drag to move the view, pinch zoom, the page not zooming or refreshing, building by tap, belts by drag, the tapped-building sheet, the full-screen button, chat staying above the keyboard and sending with the keyboard's Send key, the leave confirmation, and Chrome reporting the game installable. Portrait only.
- Still unconfirmed: anything on an iPhone, landscape on a real phone, how the gestures feel to a finger (the checks sent touches through Chrome, not a hand), sound starting on the first tap, and installing from the live site.
- Known rough edges: a phone held sideways leaves only about a third of the screen height for the floor; the Head Office planner is cramped on a phone.
- Chat: Enter or the Chat button; one line of up to 200 characters; floods are cut off.

## Employee Handbook and README lists (owner's request, built 2026-11-16)
- In the game: the "Employee Handbook" (book button on the menu, in the top bar and on the ? screen). Three tabs. Known offenders: each shopper with its picture, numbers, what the super version changes, and a table of patience and head-count through the sales events. Factory: each machine with prices, output and how long it takes to pay for itself. Security: a row per upgrade level with cost, total spent, hit, range and damage a second. In a game it uses that game's difficulty, length and player count.
- On GitHub: README.md shows the version, each store design with a picture, and each shopper with a picture and description. These parts are written by `node tools/readme.mjs` from the game's data, and a test fails if they fall behind, so the version there is always the one last committed.
- The numbers come from one place (`src/content/facts.js`) and are checked against the simulation by test.

## Sound variety (built overnight 2026-11-15, not heard by a person)
The owner found the same sound repeated for fifty shoppers annoying. Every frequent sound now has three versions and varies in pitch, length and timbre each time; each of the nine shoppers has its own way of storming out, and supers are bigger with a prop (a slammed door, a referee's whistle, two dogs). When many happen at once they are spaced, thinned and turned down, and a mass walkout or a run of sales merges into one sound. New sounds: upgrades (rising with the level), wrecking each kind of building, rebuilding, the crawling mom, giving money, the game beginning, both sides asking for the doors, taking or leaving Head Office, and chat. The measuring page passes (86 sounds, 17 crowd cases), but nobody has listened. The helper's own doubts, most doubtful first: the muttered voices may sound like a kazoo rather than words; the teenager's "uuugh" and the hunter's raspberry; a late-wave storm may now feel too sparse; the super scooter's and super dad's beeps are plain; the dad's and gym bro's grunts are the two most alike.

## Training shift, part 2 (built overnight 2026-11-15)
Seven more lessons, "The difficult customers": teenagers, Karens, the shoppers who cannot be slowed (guide dog and scooter), mom and kid (first watching her crawl, then finishing her before the kid gets out), and gym bros with the Rebuild button. 23 lessons in all, about 20 minutes; a "Jump to part 2" button skips the buildings. Every claim a lesson makes is checked by test on eight random seeds, and the helper who wrote them checked 150. Weak spots it reported: the teenager lesson is watch-only; the scooter lesson needs a super scooter to make its point; the gym bro is finished at the door, so the player does not see him wreck much.

## Less data, a grace period, a place for a relay (built overnight 2026-11-15)
- The host no longer sends the whole game several times a second. It sends ten small messages a second (the commands players gave and a checksum); every player's browser replays them. Measured on a busy three-player game: about 130 KB a second per player before, about 2.8 KB after (47 times less). A full copy goes out only when someone joins or leaves, when a checksum does not match, or every ten seconds as a safety net. Large messages are split so they can never exceed what a connection carries; the old scheme probably dropped online players once the game state passed 16 KB.
- Players other than the host see the game about a tenth of a second behind him (measured: 67 to 133 ms in one browser, plus the network's own delay online). It was about a quarter of a second in the first version; the owner asked for 100 to 150 ms, so the host now sends thirty small messages a second instead of ten, which costs about 3.4 KB a second per player instead of 2.8 (still about 38 times less than before the rework).
- A dropped player keeps his money for 90 seconds of real time, the same at any game speed (owner's rule), before it is shared out.
- `src/net/relay.js` is ready for a relay's address, username and password. Empty until the owner has an account.
- Checked with a Firefox host and an Edge player through the real internet broker: 422 checksum comparisons over about 50 seconds with sprinklers and a forklift firing, no mismatches. Also checked Edge to Edge. Not checked: phones as players under the new scheme, and long games.

## Save and resume (built)
The host's browser saves the game every few seconds; the menu offers to resume it. One save per browser, kept on that device only. After a host hand-over the new host's browser holds the save. Resuming opens a new room; the others rejoin by name and get their places and money back, with no time limit. A save made by an older version of the rules is ignored if it does not look right, which is a blunt check: a rule change that keeps the same shape could still load a save that then behaves oddly.

## Settings, seven players, entrances (owner's requests, built)
- The host chooses, on the menu and again in the lobby: 10, 15, 20 or 30 sales events; Easy, Normal, Hard or Brutal (shopper patience x0.68 / 0.9 / 1.17 / 1.49 and income x1.38 / 1.1 / 0.94 / 0.77 since 0.2; before that x0.75 / 1 / 1.3 / 1.65 and x1.25 / 1 / 0.85 / 0.7); and starting cash of $300, $500, $800 or $1,200 each. The multipliers are my guess and untested. Waves past 20 use the same growth formulas, which have not been looked at that far out.
- Up to seven players. The seventh entrance is on the bottom wall, and there is a seventh map size (121 x 67) following the same half-as-big-again rule.
- Entrances in the top and bottom walls are now a fifth and two fifths of the way along (were about 30% and 55%).

## Money when players come and go (owner's rules)
- A player who leaves once the game is under way hands his money to the players who stay, split evenly. If he comes back he has none and earns his share from then on. (This also covers a host who leaves: his money is shared out when the next player takes over.) Leaving in the lobby changes nothing.
- A brand-new player joining mid-game gets $500 plus $60 for each sales event already played.
- Players can give each other $50, $200 or $1,000 at a time from the players list.

## Moms who will not stay down (owner's rule)
A mom whose patience runs out while her child is loose does not leave. She drops and crawls to him at about half walking speed; nothing can hurt her, and security keeps shooting at her and wastes it. When she reaches him she stands up with 35% of her patience back. With the child in the cart she is stopped like anyone else. The child runs 5 to 14 tiles (was 3 to 9), and she chases at 2.375 times walking speed (was 1.9). Changed again in 0.2 (see "Version 0.2"): once per mom, twice for the Soccer Mom; she crawls faster; the child runs 6 to 17 tiles.

## Leaving and host hand-over (owner's request, built)
- Once a game has started, or anyone else is in it, the browser asks for confirmation before the page is closed, refreshed or left.
- (Since 2026-11-15 a leaving host keeps his money for the same grace period as anyone else.) If the host leaves, the first remaining player in the list becomes the host, using his own copy of the game; the others reconnect to him under the same room code, and the old host can rejoin with the original link. Checked with three players in one browser (test rooms) and by test. Not yet checked over the internet, where the room code takes a few seconds to be released and the hand-over can take up to a minute.
- Limits: the new host's copy can be a fraction of a second behind the old host's, so the last moment before the hand-over may be replayed. Two players with the same name cannot be told apart when they reconnect. If the new host also leaves during the hand-over, the game is lost.

## Showroom doorways (found by the owner, improved, not played)
The owner suspected the showroom would clog: belts between the marked floor areas have to go through the doorways, belts cannot cross each other, and the rule against walling off the tills refuses the last tile of a doorway. `tools/line-check.mjs` lays lines by the shortest free route (it does not plan ahead, so a person can do better) and counts how many fit:
- Open Warehouse and Supermarket Aisles: two lines in every section, on every size.
- Showroom with the original doorways (one per wall, two tiles wide): the first line of a section nearly always fitted; the second often did not.
- Showroom now (doorways three tiles wide, two on walls nine tiles or longer): every first line fits on every size; of the second lines, all fit on four sizes and some fail on three (60 of 66 lines in total; the largest size manages 12 of 18).
So the showroom is still the tight map, by design, but a first line everywhere is certain and a second is usually possible. Four-tile doorways were tried and did no better. Nobody has played the showroom.

## Lobby (owner's request, built)
Games started from the menu (solo, host) begin in a lobby: the store is drawn whole, the host can change its design and size and every player sees it change, and the game starts when every connected player has pressed Ready. Changing the store un-readies everyone. A player who drops out does not hold it up. A friend who joins after the start skips the lobby and plays at once.

## Known problem: two players on the same wifi may not connect online
Found by the owner on 2026-11-15: joining failed from the host's own wifi and worked from another network. Reproduced on 2026-11-15 with a computer hosting and an Android phone joining on the same network: the join found the room and then timed out. Two browsers on one network have to reach each other by their local addresses (which browsers hide, and some networks do not pass) or through a relay server. The game only has the free relays the PeerJS project runs, and on the day they did not answer (`tools/net-check.html` shows this). Players in different houses are not affected unless one is behind a strict router, VPN or office firewall. The fix is a relay of our own: an account with a TURN provider (several have a free allowance), with its address and password added to `ICE_SERVERS` in `src/net/transports.js`. The password would be readable by anyone, as the game is a public static site.

Also not done: the host sends the whole game state in one message; on the largest maps with very big crowds that could exceed what a browser connection carries in one message. Splitting large updates would remove the risk.

## Version 0.2 (owner's requests after two long solo games, built 2026-11-16, not yet played by a person)
The owner reached sales event 13 on Normal on his first game and won 20 events on Easy on his second, and asked for the following. Everything here is built and covered by tests; none of it has been played by a person, and the balance in particular is a first guess.

**Difficulty.** Every level is 10% easier: shopper patience x0.9 and income x1.1 on top of what each level had (the owner chose this over changing Easy alone).

**DEB talks less and repeats less.**
- About three times as many lines in every bank (`src/content/lines.js`). Lines carry weights: common, uncommon (about a third as likely) and rare (about a tenth).
- A line that has been used is 8 times less likely to come up again in the same game.
- Each kind of remark gets less likely and further apart every time DEB has made it. Things that matter (a wave starting, a new kind of shopper, the refund limit getting close, a player arriving or leaving, winning and losing) are always said.
- Lines for the owner's friends: Bobb, Phantasm and Tusker have about 35 lines each. They are used only when a player with exactly that name is connected (the owner's choice): a third of the times a line would name him, and in 45% of the breaks between waves DEB has a go at one of them unprompted. Everyone in the game hears the same line.
- Added without being asked: DEB warns when refunds reach 75% and 90% of the limit, and gives a leaving friend one send-off line.

**Upgrades in separate tracks.** Every building has up to four tracks, bought one level at a time, each on its own: Damage (or the building's main effect), Speed, Range and Durability. Up to 8 levels a track; each level costs 1.6 times the last.
- Sprinkler: damage x1.25 a level (first level 60% of the building's price), speed x1.1 (60%), range +0.15 tiles (40%), durability +1 hit (30%). Forklift: damage x1.3, speed x1.12, range +0.3 tiles, same shares.
- Factory machines: speed only, x1.25 a level, 5 levels, and expensive on purpose: the first level is $400 for an Unpacker, $600 for a Press, $900 for a Packer, and each level costs 1.8 times the last. A belt carries 4 items a second, so a machine at the top level is still never held up by its belt.
- Belts, crates and chutes: durability only.
- Click a building (or tap it) to open a sheet with a button per track. The U key buys the next level of the first track, as before.
- **Worth knowing:** the owner asked for the split upgrades to be cheaper than the old single upgrade, and they are. Bought sensibly (damage first), a dollar of upgrade now buys about twice the damage it did. With the easier difficulty on top, the scripted players reach sales event 14 or 15 on Normal where they used to lose at 9. See "Balance after 0.2".

**Durability and rebuilding.** A gym bro's hit no longer wrecks a building outright or knocks a level off. Each building survives a number of hits per sales event (1 as built; 2 for a Barcode Laser or TV Salesman; +1 per durability level) and the count starts again when the event ends. A wrecked building can be bought back at half of everything spent on it, upgrades included. If the B key (rebuild all) finds too little money, the building comes back at half price with as many of its upgrades as the money covers at half price; the rest are lost.
- Side effect: a gym bro now stops and hits a durable crate stack until it goes, so a durable crate wall holds him up. This was not asked for; it follows from the rule.

**Security.**
- Forklift range 6 tiles (was 5.5).
- **Barcode Laser** ($700, 3 x 1, press R to turn it before placing): every 4.5 seconds it fires a beam 10 tiles long straight out of its front end, through walls, buildings and shoppers, and hits everyone within 0.6 tiles of the line for 60. The owner chose a fixed line over aiming. Range upgrades lengthen the beam by a tile.
- **TV Salesman** ($450, 2 x 2, reach 4.5 tiles): each shopper who comes in reach is pitched to once (then not again for 9 seconds). He either stops and watches for 2.5 seconds, hurries past at 1.4 times his speed for 4 seconds, or ignores it. Chances to stop / hurry: Dad 20% / 30%, Mobility Scooter 80% / 0%, Karen 40% / 0%, Bargain Hunter 35% / 10%, Teenager 5% / 25%, Stray Dog 10% / 50%, Man with Guide Dog none. 70% of runaway children stop to watch the television. Pitch upgrades lengthen the stop and move the chances the player's way.

**Shoppers.**
- Moms: the child runs away once (twice for the Soccer Mom), 20% further (6 to 17 tiles), never closer than 2 tiles of walking to a till, and always somewhere she can reach. She will not take her refund without him. A mom who goes down crawls at 70% of walking speed (was 55%), and when she gets up she has lost her cart and carries the child, which shows he has had his run. The Soccer Mom keeps her cart until the second time.
- **Day Drinker** (from sales event 5): speed keeps changing; at corners of the route he may fall over for 4 seconds, and everyone crossing that tile moves at about a third of their speed.
- **Stray Dog** (from 7): fast and weak; pees on security it passes (not wet floor signs), switching it off for 6 seconds.
- **Exhibitionist** (from 8): opens her bathrobe every 6 seconds or so; dads and teenagers within 2.5 tiles stop and stare for 2 seconds. She helps the players.
- **Cosplayer** (from 9): patience 150 (Karen has 170), speed 1.25 (nobody else has it). Shots from sprinklers, forklifts and barcode lasers aimed at anyone within 0.9 tiles of him hit him instead. Several costumes, chosen per shopper.
- Each has a super version (Bottomless Bruncher from 12, Great Dane 13, Nudist Nan 14, Full Mech Suit 15).

**Other.** Marked floor no longer touches a wall: one tile clear, two in front of a shopper entrance. Entrances no longer carry a player's name.

**Balance after 0.2** (`node tools/balance.mjs`, Normal, one-player map, three kinds of scripted player; the number is the sales event they lose in, of 20):
| Seed | Before 0.2 | After 0.2 |
|---|---|---|
| 11 | 7 / 7 / 7 | 10 / 14 / 15 |
| 5 | 9 / 9 / 9 | 10 / 15 / 14 |
| 23 | 9 / 9 / 9 | 10 / 15 / 14 |

The owner got to 13 on Normal before these changes, so a person should now get further than that, which is the direction he asked for. Whether Normal is now too easy needs a game or two.

**Found by the owner playing 0.2.01, fixed in 0.2.03:**
- The view jumped whenever a building was picked. The description card for the held building sat inside the build bar, and with fifteen buttons it no longer fitted on a wide screen, so the bar's height changed with every building and the floor was resized. The card now floats above the bar on every screen and can be folded to its heading.
- Opening the doors early lost the money the factory would have made in the rest of the build time, so it was always a mistake. Now the remaining time is played through at once (the owner's suggestion), which leaves the store exactly as if the players had waited; a notice says how much was paid.

**Asked for by the owner after playing, built in 0.2.04:** a shopper the TV Salesman stops no longer freezes where he is. He walks over to the stand first and watches from beside it, so it is plain what stopped him. He heads straight for it, one tile at a time, and if belts, crates or walls are in the way he watches from as near as he can get (a dad steps onto a belt, as dads do). He gives up if the stand is sold, wrecked or switched off on the way, and after 4 seconds of walking he watches from wherever he is. The watching time (2.5 seconds) starts when he arrives, so the salesman now holds a shopper for longer than before: the walk there, the watching, and the walk back to the route. That makes the salesman stronger and has not been balanced. Runaway children still stop where they are to watch the television.

**The owner's answers after the build (2026-11-16):**
- Balance: leave it as it is until he has played. If Normal proves too easy, the two levers offered were dearer Damage and Speed upgrades, or undoing the 10% easing.
- Gym bros and durable crates: keep it. A crate stack with durability upgrades holds a gym bro up.
- The Exhibitionist: no censor bars. She and Nudist Nan are drawn cartoon-naked ("go further" was his choice over black bars or pixelation).

## Version 0.2.06: boss, endless mode, Food Court, flow arrows (owner's requests of 2026-11-16, built the same day, not yet played by a person)
Decided by Claude while the owner was away; every one is easy to change.

- **Barcode Laser.** The owner asked for the Rail Gun to get a name that fits the game. It is now the Barcode Laser: a supermarket scanner turned up far too high, firing a red beam through everyone in the queue. Nothing about how it works changed. Inside the code and in saved games it is still `railgun`.
- **A boss every fifth sales event.** One boss walks in 12 seconds after the doors open. His title climbs each visit: Regional Manager (event 5), Area Director (10), Vice President of Returns (15), The CEO (20 and every fifth event after, in an endless game).
  - Nothing slows or stops him: not wet floors, samples, the TV Salesman, the exhibitionist or a fallen drunk. He walks at 0.8 tiles a second.
  - Every 7 seconds he gives a pep talk: every other shopper within 3.5 tiles gets 20% of his patience back.
  - If he reaches a till he counts as 5 refunds and takes $150 times his tier. If the players wear him out, the store is paid a bounty of $150 times his tier (times the difficulty's income multiplier).
  - The rest of that event's crowd is 75% of its usual size (the owner asked for "slightly fewer").
  - His patience is 4 Bargain Hunters' worth, grown by event like everyone's, and half as much again for each later visit: 267 in event 5, 788 in 10, 1,796 in 15 and 3,465 in 20 on Normal. The first guess of 15 Bargain Hunters was far too much: security shoots whoever is nearest the tills, a slow man at the back is shot last, and he walked through every time. At 4 the scripted players just drive him out in event 5.
  - Balance with scripted players on Normal (the event each loses in) moved by at most one: seed 11: 10 / 15 / 15 (was 10 / 14 / 15); seed 5: 10 / 15 / 14 (unchanged); seed 23: 11 / 15 / 15 (was 10 / 15 / 14).
  - Head Office cannot buy him, and he comes whatever Head Office planned.
- **Endless mode.** A fifth choice of game length, "Endless": no last event, the game ends only at the refund limit. A game that has just been won can also be carried on as endless from the win screen. The best event reached is remembered in the browser. From about event 30 the crowd stops growing (about 1,100 shoppers a player in one event) and only patience grows, so an endless game is always lost in the end; without that cap event 60 would have sent 3,900 shoppers at a solo player and event 100 over 10,000.
- **Food Court.** A fourth store design: single tables in staggered clusters, booths, benches with planters, bins, food stalls and (from the two-player size up) a fountain. Furniture is 6 to 11% of the floor, never touches other furniture or the walls, and keeps clear of the entrances, the tills and the marked floor, so nothing can be sealed off. The line checker fits every production line it tries on every size (the Showroom fits 12 of 18 on the biggest), and the walk to the tills is at most about 10% longer than on the Open Warehouse.
- **Arrows on factory buildings.** Unpackers, Presses and Packers show a large arrow where goods come out; the Shipping Chute shows that things go in.
- **Drawing fixes.** The Great Dane redrawn as a dog, the Stray Dog made readable when zoomed out, the laser drawn properly facing up or down, and a mom's abandoned cart kept in the game state so a player who joins mid-event sees it.

## Ideas for later (not started)
- Fewer gym bros in the middle of the game. The owner lost his first Normal game to them in sales events 12 and 13 (2026-11-16) and asked for this to be kept as a possible change only: the durability upgrades and half-price rebuilding added in 0.2 may make it unnecessary. Revisit after playing 0.2.
- Security that needs supplies delivered by belt, tying the two jobs closer together.
- More shopper types. More kinds of boss (today it is one man with four titles).
- More map designs (a car park), and maps with tills on more than one wall.
- Role restrictions as an optional hard mode.
