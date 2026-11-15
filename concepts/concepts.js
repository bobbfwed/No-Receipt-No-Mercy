// Text for the ten game concepts. index.html displays it; the mock-up artists read the "draw" notes.
// Fields: kind = "core" (tower defense + automation), "wild" (stretches the brief), or
// "bigmap" (core idea on a large isometric map the players scroll around).
window.CONCEPTS = [
  {
    id: 1, slug: "01-returns-department", kind: "core",
    title: "Returns Department",
    tagline: "Black Friday never ends. Neither does your shift.",
    pitch: "You run a discount mega-warehouse on the night the doors open. Shoppers flood in, and the only thing between them and the tills is your factory floor. The belts, presses and packing machines ARE the maze: every machine you place to make goods also decides which way the mob walks.",
    feature: "The factory is the maze. The production player and the defense player build on the same tiles, so a beautifully efficient belt line can be a useless kill zone, and a perfect kill zone can strangle production. You have to negotiate every square.",
    goals: "Survive 20 sales events. Every shopper who reaches the tills takes a refund out of the shared cash; hit zero and you are bankrupt. Score is profit.",
    roles: ["Floor Manager: belts, machines, product recipes", "Loss Prevention: towers such as pepper-spray sprinklers, forklift turrets, wet-floor slow zones", "Purchasing (3+ players): spends the shared cash, orders pallets, unlocks upgrades"],
    voice: "DEB, the HR chatbot, plus live one-star customer reviews of how you are playing.",
    lines: [
      "I've logged that tower placement under 'things Kevin did instead of thinking'.",
      "★☆☆☆☆ 'Walked straight through. Staff were too busy touching each other's conveyor belts.'",
      "Reminder: the stockroom is not for crying. Or the other thing. We have cameras, Mike."
    ],
    palette: "Harsh fluorescent warehouse: concrete grey floor, safety yellow, hi-vis orange, cardboard brown, sale-sign red.",
    screens: [
      { file: "screen1.svg", caption: "The warehouse floor mid-wave: belts and machines form the maze the shoppers walk through.",
        draw: "Top-down view of a warehouse floor on a visible tile grid. Conveyor belts (with boxes riding on them) snake across the floor between machines (press, packer, shrink-wrapper), forming corridors. A dense mob of 25+ angry shoppers with trolleys enters from big doors on the left and winds through the corridors toward a row of tills on the right. Towers along the route: sprinkler heads spraying orange pepper spray, a forklift with a turret, yellow wet-floor signs with a blue slow puddle. HUD: top bar with shared CASH $4,210, 'SALES EVENT 7 / 20', 'Refunds 12 / 50'; left edge player list (Dave - Floor Manager, Steve - Loss Prevention, Kev - Purchasing) each with a colour; bottom build bar with 8 machine/tower icons and prices. A chat-bot bubble bottom-right labelled DEB (HR) saying exactly: \"I've logged that tower placement under 'things Kevin did instead of thinking'.\" A small one-star review toast top-right: \"★☆☆☆☆ Walked straight through.\"" },
      { file: "screen2.svg", caption: "The end-of-wave performance review, where the game names and shames.",
        draw: "A full-screen end-of-wave panel styled as a corporate HR form titled 'PERFORMANCE REVIEW - SALES EVENT 7', over a dimmed warehouse background. Three rows, one per player (Dave, Steve, Kev), each with a little ID-badge portrait, role, and stat bars: Goods shipped, Shoppers stopped, Cash wasted. Each row has a rubber-stamp verdict in red: 'ADEQUATE', 'LIABILITY', 'WHY IS HE HERE'. A box 'EMPLOYEE OF THE WAVE' showing an empty picture frame and the word 'Nobody'. A DEB (HR) comment box saying exactly: \"Reminder: the stockroom is not for crying. Or the other thing. We have cameras, Mike.\" Bottom: a big 'CLOCK BACK IN' button and a countdown 'Next sales event in 0:23'." }
    ]
  },
  {
    id: 2, slug: "02-hostile-owners", kind: "core",
    title: "HOA: Hostile Owners Association",
    tagline: "Your lawn is four inches too long. They're coming.",
    pitch: "You own the one house on Pleasant Crescent that never signed the HOA agreement. Under the lawn you dig a mine and build a workshop. On the lawn you hold off the neighbours. The view is a side-on slice: everything below ground is production, everything above it is war.",
    feature: "Dig your own factory. The underground is hand-dug and different every game: deeper means richer ore, but also floods, gas pockets and heat. One freight elevator links the two halves, and it is the bottleneck everybody fights over.",
    goals: "Survive 25 waves until the HOA annual meeting, then beat Linda, the president, in her armoured golf cart. You lose when the house's property value hits zero.",
    roles: ["Mole: digging, tunnel layout, drills and smelters", "Lawn Guy: turrets such as flamethrower sprinklers, gnome mortars, mailbox mines", "Quartermaster (3+ players): runs the elevator queue and decides who gets what first"],
    voice: "Linda, the HOA president, heckling through a megaphone. The enemy does the insulting.",
    lines: [
      "Your bins are visible from the street, Brian. So is your hairline.",
      "We ALL heard what your wife said at the barbecue. 'Three to five minutes.' Generous.",
      "That turret violates bylaw 14. So do those shorts."
    ],
    palette: "Bright suburban top half (sky blue, lawn green, white picket, pastel houses) over a dark earthy underground (browns, ore glints of orange and teal, lamp yellow).",
    screens: [
      { file: "screen1.svg", caption: "Side-on slice: the neighbours attack across the lawn while the mine runs below.",
        draw: "Side-view cross-section. Top third: suburban street, blue sky, pastel houses in the background, the player's house at the right with a 'PROPERTY VALUE' health bar. A column of 15+ angry neighbours marches from the left across the lawn: a dad with a leaf blower, a woman with a golf club, joggers, a man riding a lawnmower. Lawn turrets: a sprinkler shooting flame, a garden gnome mortar, a mailbox mine exploding. A woman with a megaphone (Linda) stands on a golf cart at far left with a speech bubble saying exactly: \"Your bins are visible from the street, Brian. So is your hairline.\" Bottom two thirds: underground cutaway with hand-dug tunnels, a vertical freight elevator shaft from the house down to three levels, drills at ore veins, a smelter glowing, belts carrying ore to the elevator, a queue of crates waiting at the elevator. HUD: top bar with shared resources (Iron 340, Copper 120, Cash $2,150), 'WAVE 11 / 25'; player list (Brian - Mole, Dave - Lawn Guy)." },
      { file: "screen2.svg", caption: "The Mole's view: deeper ore is richer, but the hazards get worse.",
        draw: "Zoomed-in underground view only, showing depth bands labelled on the left edge: '10 m - Dirt', '30 m - Iron', '60 m - Copper', '90 m - The Good Stuff (hot)'. A network of tunnels with a digging machine at a tunnel face, miners' lamps, belts moving ore lumps toward an elevator shaft on the right with a crate queue and a sign 'ELEVATOR: 6 waiting'. Hazards: a flooded tunnel section in blue with a pump, a green gas pocket with a warning triangle, a red-hot zone at the bottom with heat shimmer. A dig-planning overlay: dashed outline of a planned tunnel with a cost tooltip 'Dig 14 tiles - 2:10'. Side panel on the right: machine list (Drill Mk2, Smelter, Pump) with output rates. At the top, a megaphone icon and speech bubble from above ground saying exactly: \"That turret violates bylaw 14. So do those shorts.\"" }
    ]
  },
  {
    id: 3, slug: "03-garys-insides", kind: "core",
    title: "Gary's Insides",
    tagline: "He's 39. He's made choices. You're his immune system.",
    pitch: "The whole map is the inside of Gary, a divorced 39-year-old on a three-day bender. His organs are your factories: the stomach breaks down whatever he ate into materials, the liver refines them, the bone marrow builds defenders. Blood vessels are the conveyor belts. White-cell towers hold the line against whatever Gary just put inside himself.",
    feature: "Gary's Bad Decisions. Between waves the players vote on what Gary does next: gas-station sushi, tequila, texting his ex, 'she seemed nice'. Each choice pays a resource bonus AND decides what the next wave is and which organ takes the beating.",
    goals: "Keep Gary alive from Friday night to Monday morning (24 waves). You lose if two organs fail. Gary's Dignity is also scored. It always ends negative.",
    roles: ["Gut: the digestion chain, turning food into materials", "Bloodworks: routes the vessels and sets the heart rate, which speeds up everything, enemies included", "Immune Commander: towers, antibodies and where to make a stand"],
    voice: "Gary's Brain: lazy, horny and in denial.",
    lines: [
      "Good news, lads: I've found a kebab on the floor.",
      "That burning sensation is PROBABLY nothing. Anyway, wave 9 is entering from... downstairs.",
      "You lost the liver. Again. My dad was right about all of you."
    ],
    palette: "Fleshy cartoon anatomy: pinks, deep reds, purple veins, sickly green and yellow germs, white defender cells.",
    screens: [
      { file: "screen1.svg", caption: "Gary's body as the map: organs are factories, blood vessels are the belts.",
        draw: "A stylised cartoon map of a human torso interior (not gory, more like a silly theme-park map). Organs drawn as factory buildings with little chimneys and labels: STOMACH, LIVER (with a damage bar at 35% and cracks), HEART (centre, with a big BPM dial reading 142), BONE MARROW, KIDNEYS. Thick red and blue vessels connect them like conveyor belts, with small round cells and resource blobs flowing along. Green and yellow germ enemies (25+, different shapes, some with angry faces) march up a vessel from the bottom of the map with an arrow labelled 'WAVE 9 ENTRY'. White-cell towers along the vessels shoot at them. HUD: top bar with resources (Sugar 410, Protein 95, Regret 999), 'WAVE 9 / 24 - SATURDAY 2:40 AM', 'Organs failing 1 / 2'; player list (Dave - Gut, Steve - Bloodworks, Kev - Immune). Top-right: a cartoon brain portrait with a speech bubble saying exactly: \"That burning sensation is PROBABLY nothing. Anyway, wave 9 is entering from... downstairs.\"" },
      { file: "screen2.svg", caption: "Between waves, the players vote on Gary's next bad decision.",
        draw: "A between-waves vote screen titled 'GARY'S NEXT BAD DECISION', with a dimmed body map behind. Three large cards side by side, each with a simple funny illustration, a reward line in green and a consequence line in red: Card 1 'GAS-STATION SUSHI' (+300 Protein / Next wave: Parasites, hits Stomach); Card 2 'FOURTH TEQUILA' (+200 Sugar, towers +20% rage / Next wave: Toxins, hits Liver); Card 3 'TEXT HIS EX' (+150 Regret / Next wave: Stress hormones, hits Heart). Under each card, small player vote chips (Dave, Steve, Kev) showing who voted for what, and a vote timer '0:12'. On the right, a phone screen showing a drafted text message 'u up?' with the send button glowing. Bottom-left: brain portrait with speech bubble saying exactly: \"Good news, lads: I've found a kebab on the floor.\" A small meter 'GARY'S DIGNITY: -47'." }
    ]
  },
  {
    id: 4, slug: "04-farewell-tour", kind: "core",
    title: "Farewell Tour",
    tagline: "A washed-up metal band. A convoy of trucks. An apocalypse of fans.",
    pitch: "You are the road crew for Scrotal Recall, a hair-metal band on its ninth farewell tour, this time across a wasteland. Your base is a convoy: every trailer is either a factory module or a gun deck. The map scrolls as you drive. Stop to strip a ruin for scrap and the mob catches up.",
    feature: "A base on wheels with route choices. Between stages the crew picks the road: short and swarming, or long and thirsty on fuel. Trailers can be reordered, wrecked, or cut loose to save the rest, including the one your mate spent twenty minutes optimising.",
    goals: "Reach the final gig: seven stages, each ending in a stadium 'encore' boss wave. You lose if the tour bus is destroyed or the fuel runs out.",
    roles: ["Roadie: trailer factories for pyrotechnics, amps and fuel", "Security: roof guns and speaker-stack cannons", "Tour Manager (3+ players): route, speed, when to stop, when to run"],
    voice: "Rod Thruster, the band's frontman, over the intercom, along with his rider demands.",
    lines: [
      "I've had groupies last longer than that turret.",
      "Rider update: I need a bowl of ONLY brown M&Ms, and for Dave to stop touching the amps.",
      "You're cutting loose the hot tub trailer? I conceived two of my roadies in that hot tub."
    ],
    palette: "Sunset wasteland: orange and magenta sky, dusty tan road, black and chrome trucks, neon pink and electric blue band colours, flame orange.",
    screens: [
      { file: "screen1.svg", caption: "The convoy under attack: trailers are factory modules with guns on the roof.",
        draw: "Side-scrolling view of a desert highway at sunset with ruined billboards and distant mesas. A convoy drives right: a garish tour bus at the front (painted with a band logo 'SCROTAL RECALL' and flames), towing four trailers. Each trailer is drawn as a cutaway so the inside is visible: trailer 1 a pyrotechnics workshop with machines, trailer 2 an amp factory, trailer 3 a fuel refinery with tanks and pipes, trailer 4 a hot tub. Small belts/pipes link trailers. On the roofs: gun turrets and giant speaker stacks firing visible sound-wave rings. Chasing from the left: a mob of 25+ mutant fans on foot, on motorbikes and in a rusty pickup, waving lighters and band shirts. Trailer 3 is on fire with a health bar. HUD: top bar with shared Scrap 610, Fuel gauge at 38%, 'STAGE 3 / 7 - 14 km TO GIG', progress strip with a little bus icon; player list (Dave - Roadie, Steve - Security, Kev - Tour Manager); a 'CUT LOOSE' button above the last trailer. Intercom bubble with a rock-star portrait (big hair, sunglasses) saying exactly: \"I've had groupies last longer than that turret.\"" },
      { file: "screen2.svg", caption: "Between stages, the crew votes on the road ahead.",
        draw: "A route-choice screen drawn like a battered road map on a table (coffee ring, cigarette burn). A branching path of nodes runs from 'YOU ARE HERE' on the left to 'FINAL GIG: THUNDERDOME ARENA' on the right, with 10-12 nodes. Node types with icons and labels: 'Truck Stop (repair)', 'Ruined Mall (scrap ++, fans +++)', 'Biker Territory (danger)', 'Salt Flats (long, fuel --)', 'Abandoned Brewery (morale)'. Two candidate next routes are highlighted: a short red route labelled 'SHORT: 9 km, swarming' and a long blue route labelled 'LONG: 22 km, low fuel'. Player vote chips (Dave, Steve, Kev) sit on the routes. Right side panel: convoy status listing each trailer with a health bar and a drag handle to reorder. Bottom: intercom bubble with rock-star portrait saying exactly: \"Rider update: I need a bowl of ONLY brown M&Ms, and for Dave to stop touching the amps.\"" }
    ]
  },
  {
    id: 5, slug: "05-peasants", kind: "core",
    title: "Peasants Are a Resource",
    tagline: "Long live the King. Unfortunately.",
    pitch: "A medieval siege under King Gerald the Girthy, who is an idiot. By day you run the kingdom's workshops; by night the horde comes. Only one shared resource really matters: peasants. Every peasant is either working a machine or standing on a wall. Never both.",
    feature: "People are the shared pool. Sawmills, forges and towers all need bodies, and the players drag the same forty peasants between jobs in real time. On top of that come the King's Demands: mid-siege, Gerald orders something stupid, such as a gold statue of himself, nude, during wave 12. Obey for a reward, or refuse and get taxed.",
    goals: "Survive 30 nights until the King's cousin arrives with an army. You lose if the keep falls or you run out of peasants.",
    roles: ["Steward: workshops and production chains", "Marshal: walls, towers and who stands on them", "Reeve (3+ players): assigns peasants, food, and the tavern, which makes more peasants, eventually"],
    voice: "King Gerald, relayed by his exhausted Herald.",
    lines: [
      "HEAR YE: His Majesty has reviewed your defences and has soiled himself. In anger. He wishes that noted.",
      "The King demands a statue. Bigger. No, BIGGER. He says you know why.",
      "Twelve peasants died tonight. The King asks whether any of them were the ugly ones."
    ],
    palette: "Storybook medieval at night: deep navy sky, torch orange, stone grey, timber brown, royal purple and gold for anything to do with the King.",
    screens: [
      { file: "screen1.svg", caption: "Night siege: every tower needs peasants pulled off the workshops.",
        draw: "Angled top-down view of a small walled town at night. Stone walls with 6 towers; each tower shows little peasant figures on top and a badge like '3/4 manned'; one tower is empty with a red '0/4' badge. Outside the walls a horde of 30+ raiders with torches, ladders and a battering ram attacks the gate. Inside the walls: a sawmill, a forge with glowing fire, a fletcher, each with peasants working and carts moving goods along paths; a tavern with hearts floating out of it; a keep in the centre with a fat king silhouette on the balcony. A dotted line shows a group of peasants running from the forge to a wall tower. HUD: top bar 'PEASANTS 40: 23 working / 14 on walls / 3 in the tavern', resources (Wood 220, Iron 85, Arrows 140), 'NIGHT 12 / 30'; player list (Dave - Steward, Steve - Marshal, Kev - Reeve). A parchment scroll bubble with a herald blowing a trumpet saying exactly: \"Twelve peasants died tonight. The King asks whether any of them were the ugly ones.\"" },
      { file: "screen2.svg", caption: "Day planning: drag peasants between jobs, and deal with the King's latest demand.",
        draw: "A daytime planning board on parchment. Columns for jobs: SAWMILL, FORGE, FLETCHER, FARM, WALLS, TAVERN. Each column holds draggable round peasant tokens with tiny faces (several with silly name tags: 'Wat', 'Other Wat', 'Limp Tom'); each column shows output per token, for example 'Forge: 6 iron/min per peasant'. One token is mid-drag between FORGE and WALLS with a hand cursor. Total at top: 'PEASANTS 40'. Overlapping the right side: a royal decree popup with a wax seal titled 'THE KING DEMANDS', an illustration of a gold statue of a fat king with a strategically placed fig leaf under scaffolding, text 'Build statue: 200 Iron, 8 peasants for 2 nights', two buttons 'OBEY (+500 gold)' and 'REFUSE (taxed 30%)', and the herald quote saying exactly: \"The King demands a statue. Bigger. No, BIGGER. He says you know why.\" Bottom: 'DAY 12 - Night falls in 1:45'." }
    ]
  },
  {
    id: 6, slug: "06-meemaws-bbq", kind: "core",
    title: "Meemaw's Roadkill BBQ",
    tagline: "Everything that attacks us is delicious.",
    pitch: "A swamp, a smokehouse, and a family with nothing to lose. Mutant critters pour out of the bayou. Whatever your towers kill gets dragged to the smokehouse and turned into ribs, sausage and hot sauce. And your towers are relatives: they don't need ammo, they need feeding.",
    feature: "The kill-to-kitchen loop. Defense supplies the factory with carcasses, and the factory supplies defense with food: ribs raise fire rate, hot sauce raises damage, moonshine raises range and ruins accuracy. Kill too slowly and the kitchen starves. Cook too slowly and your cousins pass out at their posts.",
    goals: "Win the County Cook-Off: survive 20 waves AND bank 500 plates. You lose if Meemaw's porch is overrun.",
    roles: ["Pitmaster: butcher line, smokers and the sauce still; the belts are meat hooks", "Kin Wrangler: places and upgrades relatives, such as Cousin Dwayne with the nail gun", "Hauler (3+ players): carcass pickup routes on the ATVs"],
    voice: "Meemaw: 84, chain-smoking, foul-mouthed, never leaves the rocking chair.",
    lines: [
      "I've passed kidney stones with better aim than you.",
      "Your granddaddy could do this drunk AND with his pants down. Usually was.",
      "Don't you sass me, boy. I changed your diapers. Weren't much to see then neither."
    ],
    palette: "Humid swamp: murky greens, muddy brown, rusty tin-roof red, smoke grey, hot-sauce red and mustard yellow accents.",
    screens: [
      { file: "screen1.svg", caption: "The swamp map: relatives are the towers, and each one has a hunger bar.",
        draw: "Top-down swamp map. A winding muddy path runs from a dark bayou (top-left, with glowing eyes in the water) to a wooden shack porch (bottom-right) where a tiny old lady sits in a rocking chair. 25+ mutant critters on the path: two-headed gators, giant possums, glowing frogs, a huge catfish with legs. Along the path, relative-towers on little wooden platforms, each with a name label and a hunger bar: 'Cousin Dwayne' with a nail gun, 'Uncle Rooster' with a potato cannon, 'Aunt Darlene' with a shotgun, 'Lil Skeeter' with a slingshot; one relative is slumped asleep with 'Zzz' and an empty hunger bar. An ATV with a trailer drags carcasses toward a smokehouse building with a smoking chimney near the porch. A delivery cart carries plates of ribs back to the towers. HUD: top bar with Carcasses 14, Ribs 32, Hot Sauce 9, Moonshine 6, 'PLATES BANKED 212 / 500', 'WAVE 8 / 20'; player list (Dave - Pitmaster, Steve - Kin Wrangler). Speech bubble from the old lady on the porch saying exactly: \"I've passed kidney stones with better aim than you.\"" },
      { file: "screen2.svg", caption: "Inside the smokehouse: the production line that turns kills into food for the towers.",
        draw: "Interior cutaway of a smokehouse production line, viewed from the front. An overhead rail of meat hooks carries critter carcasses left to right through stations: INTAKE door (ATV unloading), BUTCHER BLOCK with a cleaver arm, a GRINDER feeding a sausage machine with links coming out, three SMOKERS (barrel smokers with temperature gauges, one in the red), a SAUCE STILL with copper coils and bottles of hot sauce, and a PLATING table stacking plates. Arrows and small rate labels between stations ('4/min'). A bottleneck warning icon over the grinder: 'BACKED UP'. Right side panel 'RECIPES': Ribs (+fire rate), Sausage (+health), Hot Sauce (+damage), Moonshine (+range, -aim), each with ingredient icons. HUD strip at top with the same resource counters and 'WAVE 8 / 20'. In a small porch-window inset, the old lady in the rocking chair with a speech bubble saying exactly: \"Your granddaddy could do this drunk AND with his pants down. Usually was.\"" }
    ]
  },
  {
    id: 7, slug: "07-nine-circles", kind: "core",
    title: "Nine Circles, One Fuse Box",
    tagline: "Hell is under attack. Hell is also badly wired.",
    pitch: "Hell is a set of rings, and Heaven's assault teams are fighting their way inward one circle at a time. You are demons in middle management. Torture machines generate Suffering, which is Hell's electricity. It powers the factories AND the towers. There is never enough.",
    feature: "One shared power grid. A third job, the electrician, routes power between the rings at the breaker panel. Run the forges and the towers flat out together and the fuse blows: everything goes dark for ten seconds while the angels walk in. The game announces whose fault it was.",
    goals: "Hold out for 25 waves until Heaven's budget runs out. You lose when the angels reach the ninth circle, which is Lou's office. Each circle lost takes its machines with it.",
    roles: ["Torturer: Suffering generators and forges, the production chains", "Warden: towers on the rings, such as brimstone mortars and lawyer pits", "Sparky: the grid, the breakers, and risky overclocking"],
    voice: "Lou (Satan): a sleazy, over-sharing boss.",
    lines: [
      "Team! Quick one. Who tripped the breaker? It was Steve. It's always Steve. Steve, see me after. Bring lotion.",
      "I'm not angry. I'm aroused, which is worse for everybody.",
      "Angels in the fourth circle. That's my SPA, you useless sacks of sin."
    ],
    palette: "Black and charcoal rock, lava orange and red, electric yellow power lines, cold white-gold angels for contrast.",
    screens: [
      { file: "screen1.svg", caption: "Hell as a ring map: angels push inward while the power grid struggles.",
        draw: "A radial map seen from above: nine concentric rings of dark rock separated by lava, with a small office at the centre labelled 'LOU'S OFFICE'. White-gold angel squads (25+, with halos, wings, some carrying clipboards and spears) descend from the outer edge inward across bridges; the two outermost rings are greyed out and stamped 'LOST'. On the rings: towers (brimstone mortars lobbing fireballs, a pit full of lawyers in suits grabbing angels), torture-machine generators with little lightning icons, forges with chimneys. Bright yellow power lines run between rings; one ring (the fourth) is blacked out with a red 'NO POWER' label and dead towers. HUD: top bar with a big power meter 'GRID LOAD 97%' in the red, Suffering 1,240/min, Brimstone 310, 'WAVE 14 / 25', 'Circles held 7 / 9'; player list (Dave - Torturer, Steve - Sparky, Kev - Warden). A red devil portrait in a cheap suit and tie with a speech bubble saying exactly: \"Angels in the fourth circle. That's my SPA, you useless sacks of sin.\"" },
      { file: "screen2.svg", caption: "The electrician's breaker panel: one shared supply for factories and towers.",
        draw: "A close-up of a grimy industrial fuse box panel filling the screen. Nine chunky breaker switches in a row labelled 'CIRCLE 1' to 'CIRCLE 9', each with a vertical load bar (green/yellow/red) and two small sliders under it: 'FORGES' and 'TOWERS'. Circles 1 and 2 are taped over with 'LOST'. Circle 4's breaker is tripped (switch down, red light, scorch marks). A large analogue dial in the centre 'TOTAL LOAD' with the needle at 97% in the red zone. A big red lever on the right labelled 'OVERCLOCK (+40% output, might explode)'. A brass plaque: 'LAST TRIPPED BY: STEVE (4 times)'. Sticky notes on the panel: 'DO NOT TOUCH - Lou', 'who keeps running the forges during a wave'. A mini-map of the rings in the top-left corner. Devil portrait in the bottom corner with speech bubble saying exactly: \"Team! Quick one. Who tripped the breaker? It was Steve. It's always Steve. Steve, see me after. Bring lotion.\"" }
    ]
  },
  {
    id: 8, slug: "08-worst-contact", kind: "wild",
    title: "Worst Contact",
    tagline: "This time, you are the waves.",
    pitch: "Tower defense in reverse. You are three underpaid aliens sent to conquer one small town: Butte Hole, Montana, population 412. The town has the towers: rednecks on porches, a sheriff, and a suspicious number of gun shops. You grow the horde, kit it out, and steer every wave in person.",
    feature: "You build the waves, not the towers. An automated cloning line on the mothership turns abducted cattle into troops. The players design each wave's mix and route, then one of them drives it live with abilities (tractor beam, probe) while the others keep the vats running.",
    goals: "Conquer all eight districts of Butte Hole before Galactic Command's end-of-quarter deadline. You lose when the clone budget runs dry.",
    roles: ["Vat Boss: automates the cloning line, cow to biomass to troops", "Wave Designer: troop mix, gear and the route through town", "Field Commander: leads the wave live and fires the abilities"],
    voice: "Supreme Commander Zorb, by hologram, permanently disappointed. The Sheriff also heckles over the town PA.",
    lines: [
      "Fourteen probes deployed, zero intelligence gathered. Much like your mother's dating history.",
      "You lost to a man named Cletus, who was reloading with one hand and scratching himself with the other.",
      "The probe goes IN the human, Kevin. We have been over this."
    ],
    palette: "Night-time small town: dark blue-green fields, warm yellow porch lights, alien neon green and purple, saucer silver.",
    screens: [
      { file: "screen1.svg", caption: "Your wave marches through town while the locals defend from their porches.",
        draw: "Top-down night view of a small rural town: a main street, side streets, houses with porches, a church, a water tower, a diner, 'GUN SHOP' signs on three different buildings, pickup trucks. A column of 25+ little green aliens (grunts, a few big brutes, some on hover-scooters) marches along a glowing purple route line drawn through the streets toward a town hall marked with a flag 'DISTRICT 3'. Town defences shoot at them: men in rocking chairs on porches with shotguns (muzzle flashes), a sheriff on a watchtower with a spotlight, a sniper on the water tower, a dog. A flying saucer hovers overhead with a tractor beam lifting a cow. HUD: top bar with Clones left 148, Biomass 520, 'DISTRICT 3 / 8', 'Deadline: 11 days'; ability buttons bottom-centre with cooldowns: 'TRACTOR BEAM', 'PROBE', 'MIND FOG', 'STAMPEDE'; player list (Dave - Vat Boss, Steve - Wave Designer, Kev - Field Commander). A blue hologram portrait of a stern alien commander with a speech bubble saying exactly: \"The probe goes IN the human, Kevin. We have been over this.\"" },
      { file: "screen2.svg", caption: "Aboard the mothership: the cloning line and the wave builder.",
        draw: "Interior of an alien mothership factory deck. Left two-thirds: a production line left to right: a tractor-beam INTAKE dropping cows onto a belt, a 'BIOMASS' processor (a cow goes in, green goo comes out through pipes), a row of six glass cloning VATS with aliens growing inside at different stages (one vat cracked and leaking with a warning icon), a GEAR station fitting helmets and ray guns, and launch PODS. Rate labels on the belts ('6 cows/min', '14 clones/min'). Right third: a 'WAVE BUILDER' panel with 8 slots, some filled with troop icons and counts (Grunt x20, Brute x4, Scooter x6, Probe Team x2), a clone-cost total, a small town map with a route being drawn, and a 'LAUNCH WAVE' button. HUD top bar as in screen 1. Hologram commander portrait with a speech bubble saying exactly: \"Fourteen probes deployed, zero intelligence gathered. Much like your mother's dating history.\"" }
    ]
  },
  {
    id: 9, slug: "09-big-unit", kind: "wild",
    title: "The Big Unit",
    tagline: "One giant robot. Six idiots inside it.",
    pitch: "All the players crew a single ninety-metre war robot defending the city from giant monsters. The view is a cross-section: every room is a station with its own deep job, including the reactor, the ammo foundry in the belly, the legs, the arms and the head. Alone, you sprint between rooms. With friends, each man holds his room and shouts.",
    feature: "One body, many stations. Nothing works without another room: the arms can't fire until the belly foundry makes shells, the foundry can't run unless the reactor has coolant, and the legs decide whether the punch lands at all. Rooms catch fire, flood, and get boarded by parasites.",
    goals: "Stop ten monsters before city damage reaches 100%. You lose if the reactor melts down or the head comes off.",
    roles: ["Engineer: reactor and belly foundry, an automation puzzle of shells and coolant", "Gunner: arms, aiming and ammo choice", "Pilot: legs, positioning and dodging", "Damage Control (4+ players): fires, floods and boarders"],
    voice: "UNIT, the robot's onboard assistant: built by the lowest bidder and very proud of one particular weapon.",
    lines: [
      "Crotch cannon is at full charge. I did not name it. I did request it.",
      "Left leg is on fire. In fairness, you've never known what to do with a leg.",
      "The monster has torn off an arm. Don't worry, you weren't using it well. Ask your wife what I mean."
    ],
    palette: "Rainy night city: dark teal sky, neon signs, gunmetal and safety-orange robot, warm lit rooms inside it, toxic purple monster.",
    screens: [
      { file: "screen1.svg", caption: "The robot in cross-section, mid-fight: every room is a player station.",
        draw: "Side view of a city at night with skyscrapers, rain and neon. On the left stands a giant humanoid robot drawn as a cutaway cross-section so its rooms are visible, like an ant farm: HEAD cockpit with a pilot seat and screens, CHEST reactor glowing blue with coolant pipes, BELLY foundry with small conveyor belts carrying shells, two ARM rooms with loading mechanisms (the left arm room is on fire with a red alert icon), two LEG rooms with pistons, and a large cannon mounted at the hips with a charge bar labelled 'CROTCH CANNON 100%'. Ladders and corridors link the rooms; three small coloured crew figures are in different rooms, each with a name tag (Dave, Steve, Kev). On the right, a huge purple tentacled lizard monster grapples with the robot's right arm, a building crumbling beneath it. HUD: top bar 'CITY DAMAGE 41%', 'MONSTER 4 / 10' with the monster's health bar, Reactor temp gauge, Shells 12, Coolant 60%; room alert list on the left ('LEFT ARM: FIRE', 'LEG 2: LOW PRESSURE'). A speech bubble from a small robot-face icon labelled UNIT saying exactly: \"Crotch cannon is at full charge. I did not name it. I did request it.\"" },
      { file: "screen2.svg", caption: "One station up close: the belly foundry that feeds the weapons.",
        draw: "Close-up interior of the BELLY FOUNDRY room, a cramped industrial space with riveted curved walls. A small automation layout: a scrap hopper feeding a furnace (glowing orange), a casting press stamping shell casings, a belt splitting at a junction into two lines, a powder filler, then two vertical ammo lifts labelled 'TO LEFT ARM' (blocked, red light, 'JAMMED') and 'TO RIGHT ARM' (shells riding up). Blue coolant pipes with valves run along the ceiling from 'REACTOR'; one valve leaks steam. A crew figure (Dave) with a wrench stands at the junction. Build palette at the bottom with parts: Belt, Splitter, Press, Filler, Valve. Right side panel 'ORDERS FROM THE GUNNER': 'Need 20 AP shells', 'Need 5 Big Ones', with progress bars. A small inset in the top-right corner shows the whole robot silhouette with this room highlighted and the left leg flashing red. HUD: Shells 12, Coolant 60%, Reactor temp. Speech bubble from the UNIT robot-face icon saying exactly: \"Left leg is on fire. In fairness, you've never known what to do with a leg.\"" }
    ]
  },
  {
    id: 10, slug: "10-alimony-station", kind: "wild",
    title: "Alimony Station",
    tagline: "A mining outpost run by an AI with your ex-wife's voice.",
    pitch: "Half factory game, half action game. One team runs a broke asteroid outpost: refinery, turrets, shared credits. The other drives rovers out onto the surface in real time, driving, shooting and drilling for the rare ore the base cannot make. The base keeps the rovers alive with supply drops; the rovers keep the base fed.",
    feature: "Two different games joined by one launch cannon. Base players build and automate; field players play an action game. Everything between them goes through the cannon: the base fires crates of ammo, repairs or a turret-in-a-box to wherever the rover calls the shot. Waves hit the base hardest when the rovers are furthest away.",
    goals: "Pay off a 1,000,000-credit debt in 30 days (waves). 40% of everything you earn is deducted as alimony. You lose if the reactor is destroyed or the deadline passes.",
    roles: ["Base Chief: refinery lines, turrets and the launch cannon", "Rover Driver (one or more): drives, drills and fights out on the surface", "Solo: you swap between the two, and the rover parks itself badly while you're away"],
    voice: "K.A.R.E.N., the station AI. Her voice was licensed from the captain's ex-wife.",
    lines: [
      "Supply drop launched. It will arrive early, finish quickly, and disappoint. Sound familiar?",
      "40% of that ore is mine. The other 60% is also mine, I just haven't filed yet.",
      "Oh, you're 'doing your best'. I remember your best."
    ],
    palette: "Cold space: near-black sky with stars, grey-blue rock, industrial white and orange base modules, cyan crystals, magenta alien bugs.",
    screens: [
      { file: "screen1.svg", caption: "Two games at once: the base on the left, the rover out on the surface on the right.",
        draw: "A split screen divided by a vertical line, with a label over each half. LEFT half 'BASE - Dave': top-down view of an asteroid outpost with modules connected by belts: ore crusher, refinery with tanks, a reactor dome with a health bar, turrets around the edge firing at magenta bug aliens (15+) coming over a crater rim, and a large launch cannon in the middle with a crate loaded and an arc trajectory line going off toward the right half. RIGHT half 'ROVER - Steve': closer top-down action view of a six-wheeled rover on rocky ground, drilling a cluster of cyan crystals, headlights on, firing a turret at 8+ bugs chasing it; a flashing target marker on the ground labelled 'SUPPLY DROP 0:04' with a crate descending; a cargo bar 'ORE 7 / 10' and rover health and ammo bars; a compass arrow 'BASE 1.4 km'. HUD: top bar across both halves with Credits 48,200, 'DEBT 812,000', 'DAY 12 / 30'. A small AI portrait (a cold glowing eye icon inside a wedding-ring shape) labelled K.A.R.E.N. with a speech bubble saying exactly: \"Supply drop launched. It will arrive early, finish quickly, and disappoint. Sound familiar?\"" },
      { file: "screen2.svg", caption: "The end-of-day statement, with alimony deducted.",
        draw: "A full-screen end-of-day statement styled like a cold bank statement on a computer terminal, titled 'DAY 12 STATEMENT - ALIMONY STATION'. Line items with amounts in a column: 'Ore sold +18,400', 'Rare crystal sold +9,600', 'Turret ammo -2,100', 'Rover repairs (Steve drove into a crater. Again.) -3,300', 'ALIMONY (40%) -11,200' highlighted in red, 'Emotional damages -500', then 'NET +10,900'. Below it a long progress bar 'DEBT REMAINING: 801,100 / 1,000,000' with a marker 'Deadline: Day 30' and a projected-finish label 'At this rate: Day 86'. Left side: two player stat cards (Dave - Base Chief: 'Crates launched 14, crates that hit the rover 3'; Steve - Rover: 'Ore hauled 62, craters visited 5'). Right side: the K.A.R.E.N. AI portrait (glowing eye inside a wedding-ring shape) with a speech bubble saying exactly: \"40% of that ore is mine. The other 60% is also mine, I just haven't filed yet.\" Bottom: button 'START DAY 13'." }
    ]
  },
  {
    id: 11, slug: "11-dead-men", kind: "bigmap",
    title: "Dead Men Tell Dick Jokes",
    tagline: "One island. Three harbours. You can only look at one of them.",
    pitch: "A big isometric pirate island, roughly ten screens across, that each player scrolls around on his own. Inland are the cane fields, the rum distillery and the cannonball foundry. On the coast, far apart, are three harbours the navy keeps raiding. Nobody can see the whole island at once, so whoever is tuning the distillery has no idea the east harbour is on fire until the parrot tells him.",
    feature: "Distance is the enemy. Rum and cannonballs do not teleport: they travel from the factories to the harbours by mule cart, along roads you build, in real time. A harbour can run dry with a full warehouse sitting four screens away. Each player's screen is his own patch, and the shared minimap, with pings and alarms, is how you keep each other alive.",
    goals: "Survive hurricane season (20 raids) with the Captain's treasure hoard intact. You lose a harbour when its fort falls, and the game when the navy reaches the hoard.",
    roles: ["Distiller: cane fields, distillery and foundry, the production chains inland", "Harbourmaster (one per harbour if you have the players): forts, cannon towers and crews", "Teamster (3+ players): roads, mule carts and who gets the next delivery"],
    voice: "Mr. Pecker, the Captain's parrot. He has outlived four captains and respected none of them.",
    lines: [
      "SQUAWK! East harbour's on fire! Steve's looking at his belts again! SQUAWK!",
      "Polly wants a cracker. Polly also wants a crew that can find its own arse with both hands.",
      "Awk! Big cannon, Dave! Compensating for something? Awk!"
    ],
    palette: "Sunny Caribbean: turquoise sea, pale sand, lush greens, warm timber and thatch, copper stills, navy blue and white enemy ships, red parrot.",
    screens: [
      { file: "screen1.svg", caption: "The Distiller's view, inland: production runs here while a harbour three screens away comes under attack.",
        draw: "ISOMETRIC view (2:1 diamond tile grid, camera looking down at an angle, buildings drawn as 3D blocks with a top and two visible sides) of the inland part of a tropical island. This is only a small window onto a much larger map. Show: rows of green sugar-cane field tiles with workers cutting; a rum distillery building with copper stills, pipes and a line of barrels moving on a small rail/belt; a cannonball foundry with a brick chimney, glowing furnace door and a pile of black cannonballs; a thatched warehouse stacked with barrels; palm trees and jungle around the edges; a dirt road running diagonally off the right edge of the screen with 4 loaded mule carts (barrels, cannonballs) heading away, and a wooden signpost 'EAST HARBOUR - 3 screens'. HUD: top bar with Rum 420, Cannonballs 96, Gold 1,310, 'RAID 9 / 20'; player list (Dave - Distiller, Steve - East Harbour, Kev - Teamster). A LARGE MINIMAP panel (about 280x200) in the bottom-right corner showing the whole island outline from above with three harbours labelled NORTH, EAST, SOUTH, thin road lines from the centre to each, a white rectangle marked 'YOU' over the island's centre, three coloured player dots, and 5 red ship icons closing on the east coast with a flashing red ring. A red alert banner on the right screen edge with an arrow pointing right: 'EAST HARBOUR: 4 cannonballs left'. A red parrot portrait with a speech bubble saying exactly: \"SQUAWK! East harbour's on fire! Steve's looking at his belts again! SQUAWK!\"" },
      { file: "screen2.svg", caption: "The same island, the east harbour: the fight happens here, waiting on the next mule cart.",
        draw: "ISOMETRIC view (same 2:1 diamond style as screen 1, buildings as 3D blocks) of a harbour on the island's east coast. Show: a curved sandy bay with turquoise water; a stone fort with crenellated walls and 4 cannons firing (smoke puffs, cannonballs in flight with dotted arcs); 2 wooden cannon towers on a pier, each with pirate crew figures and a small rum/morale bar; in the water 6 navy sailing ships (blue hulls, white sails), one sinking, and 5 rowboats; 20+ navy marines in blue coats wading ashore and charging up the beach; a burning hut. A dirt road enters from the left edge with one mule cart arriving, next to a supply depot crate pile with a red warning badge 'CANNONBALLS 4'. HUD: same top bar (Rum 420, Cannonballs 96, Gold 1,310, 'RAID 9 / 20'); a fort health bar 'EAST FORT 58%'; a build bar at the bottom with Cannon, Tower, Barricade, Powder Keg and prices. The same LARGE MINIMAP in the bottom-right, now with the white 'YOU' rectangle over the east coast, the other two player dots elsewhere, and a dotted line showing the cart route from the island centre labelled 'next cart: 0:40'. Red parrot portrait with a speech bubble saying exactly: \"Awk! Big cannon, Dave! Compensating for something? Awk!\"" }
    ]
  },
  {
    id: 12, slug: "12-zeus", kind: "bigmap",
    title: "Zeus Is Not Helping",
    tagline: "The forges are at the top of the mountain. The war is at the bottom.",
    pitch: "A huge isometric mountain in tiers. Near the summit are the god-forges, where you automate bronze, spears and ambrosia. At the foot, a long scroll away, are the city walls and three mountain passes the Titans keep climbing. Players move around the mountain independently, so the forge crew and the wall crew are looking at completely different parts of it. On the peak sits Zeus: drunk, horny and technically on your side.",
    feature: "Gravity logistics on a tall map. Goods slide downhill to the walls by chute in seconds, but anything going up (ore, repairs, offerings) rides slow rope lifts, so where you build on the mountain matters as much as what you build. And any player can pray for a lightning strike: Zeus hits roughly where you pointed, and wants something for it afterwards.",
    goals: "Hold the city through 18 assaults until the other gods sober up. You lose if the Titans breach the city or climb as far as the forges.",
    roles: ["Smith: the forge tiers, production chains and what goes down which chute", "Strategos: walls, ballistas and troops at the three passes", "Priest (3+ players): lifts, offerings, Zeus's favour, and where the lightning lands"],
    voice: "Zeus, from a couch on the summit. Hera occasionally cuts in to remind everyone what he's like.",
    lines: [
      "I'd smite them myself, but I'm seeing a swan about a thing.",
      "You call that a wall? I've seduced mortals through thicker.",
      "Lightning's ready. Aim's not great, I've had a few. Maybe stand somewhere else."
    ],
    palette: "Greek myth: white marble, terracotta roofs, bronze and gold, olive green terraces, deep blue sky and soft clouds, storm purple for Zeus, grey-brown stone Titans.",
    screens: [
      { file: "screen1.svg", caption: "The Smith's view near the summit: forges up here, chutes carrying weapons down the mountain.",
        draw: "ISOMETRIC view (2:1 diamond tile grid, camera looking down at an angle, buildings as 3D blocks with a top and two visible sides) of the upper tiers of a mountain, drawn as stepped rock terraces. This is only a window onto a much taller map. Show: at the top-left a small white marble temple on the peak with a big bearded god (Zeus: white toga, gold laurel wreath, wine cup) lounging on a couch on a storm cloud; on the terraces below, a bronze foundry with a glowing lava channel, 3 automated hammer-and-anvil machines, belts carrying bronze ingots and spearheads between them, an ambrosia press with gold liquid in amphorae, and workers in tunics; a large stone CHUTE (slide) running off the bottom edge of the screen with crates sliding down it and a sign 'TO THE WALLS - 8 sec'; a slow rope LIFT on the right bringing ore baskets up, with a queue of baskets and a sign 'LIFT: 2 min'; clouds drifting below the terraces to show height. HUD: top bar with Bronze 260, Ambrosia 40, Favour 12, 'ASSAULT 6 / 18'; player list (Dave - Smith, Steve - Strategos, Kev - Priest). A LARGE MINIMAP panel (about 220x300, tall) in the bottom-right showing the whole mountain as a tall triangle in four labelled bands from top to bottom: SUMMIT, FORGES, TERRACES, CITY WALLS, with chute lines running down, a white rectangle marked 'YOU' over FORGES, three coloured player dots, and red enemy icons massed at the bottom-left with a flashing ring. A red alert banner at the bottom edge with a down arrow: 'WEST PASS: Titans at the gate'. A Zeus portrait with a speech bubble saying exactly: \"I'd smite them myself, but I'm seeing a swan about a thing.\"" },
      { file: "screen2.svg", caption: "The foot of the same mountain: the walls, the Titans, and a lightning strike that missed.",
        draw: "ISOMETRIC view (same 2:1 diamond style as screen 1) of the foot of the mountain. Show: a Greek city wall of pale stone running diagonally across the screen with 4 ballista towers firing bolts, hoplite soldiers with round shields and spears in formation behind a gate, terracotta-roofed houses behind the wall; a rocky pass between two cliffs on the left through which 20+ enemies advance: big grey stone Titans, a few one-eyed cyclopes with clubs, one giant climbing the wall; the bottom end of the stone CHUTE coming down from the top edge of the screen and spilling crates of spears into a depot beside the wall, label 'from the forges'; a huge yellow lightning bolt from the top of the screen striking one of the players' own ballista towers by mistake, which is scorched and smoking, with a small sign from the sky reading 'my bad'. HUD: same top bar (Bronze 260, Ambrosia 40, Favour 12, 'ASSAULT 6 / 18'); 'WEST GATE 64%' health bar; a big button 'PRAY FOR LIGHTNING - 10 Favour' with a target cursor on the battlefield; build bar with Ballista, Wall, Oil Pot and prices. The same tall MINIMAP in the bottom-right, now with the white 'YOU' rectangle over CITY WALLS at the bottom and the other player dots higher up. Zeus portrait with a speech bubble saying exactly: \"Lightning's ready. Aim's not great, I've had a few. Maybe stand somewhere else.\"" }
    ]
  }
];
