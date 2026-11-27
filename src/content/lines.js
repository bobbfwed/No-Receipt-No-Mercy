// Every line of dialogue in the game. Adults only, by design: see the Tone section of CLAUDE.md.
//
// How to add a line
// - A line is a plain string, which makes it a common line (weight 1).
// - Wrap it in u('...') for an uncommon line (about a third as likely as a common one) or
//   r('...') for a rare one (about a tenth as likely). A rare line should be a treat: stranger,
//   longer-running or more savage. For any other weight write { t: '...', w: 0.5 }.
// - Customer reviews are [stars, text], with an optional weight third: [1, 'text', R].
// - STAMPS are plain strings only (the review screen compares them by text).
// - Once a line has been used in a game it becomes much less likely to come up again; the
//   director handles that (see TALK in director.js). Repeating text in two banks counts as the
//   same line for that.
// - Placeholders the director fills: {p} a player's name, {n} a number, {m} a second number,
//   {w} the wave number, {k} the name of a building (or a kind of shopper, for the TV salesman,
//   or the boss's title without "The", so write "the {k}"), {q} a second player's name. Which bank gets which is noted beside the bank. A line using a
//   placeholder the director has no value for is simply skipped, so a bank whose {k} or {n} can
//   be missing should have some lines without it.
// - Keep lines short enough to read at a glance: DEB's bubble is small.

const U = 0.35; // weight of an uncommon line
const R = 0.1; // weight of a rare line
const u = (t) => ({ t, w: U });
const r = (t) => ({ t, w: R });

export const LINES = {
  // {w} wave, {p} anyone
  waveStart: [
    'Sales event {w}. Doors open. Try to look employed.',
    'Here they come. Remember: the customer is always right, and you are always wrong.',
    'Doors open. {p}, stop adjusting yourself and look at the floor plan.',
    'Sales event {w}. Corporate is watching. So am I. Mostly {p}, and mostly out of pity.',
    "Opening the doors. If anyone needs me, I'll be updating your files. Negatively.",
    "Event {w}. I've seen better defensive setups at a retirement home singles night.",
    'Sales event {w}. Please keep your hands on the merchandise and off each other.',
    "Doors open. {p}, whatever that layout is, I hope it's a cry for help.",
    'Sales event {w}. Doors open. Hands where I can see them, {p}. Both of them.',
    'Doors open. Somewhere out there a man has a receipt and nothing else to live for.',
    'Here we go. Event {w}. I have a pool going on which of you cries first. I put fifty on {p}.',
    'Doors open. Please clench, gentlemen. The customers certainly will.',
    'Event {w}. This store has a zero tolerance policy. I have zero tolerance for all of you.',
    'Sales event {w}. Smile, {p}. No, not like that. Never like that again.',
    'Doors open. They have receipts. You have a layout. Only one of those is legally binding.',
    "Event {w}. If this goes badly, and it will, I'm telling corporate it was {p}'s idea.",
    'Opening the doors. Think of it as a first date: they want something from you, and you will disappoint them.',
    'Sales event {w}. They can smell weakness. Mostly they can smell {p}.',
    u("Event {w}. I've seen your build. I've reported it to the fire marshal and a priest."),
    u('Doors open. Remember your training. Oh wait, you skipped it. Like the gym. And the dentist.'),
    u('Event {w}. Shoppers inbound. {p}, if you need a moment to pray, the stockroom is free. Do not pray in the stockroom.'),
    r("Sales event {w}. Fun fact: the store's insurance lists {p} under 'acts of God'. Nobody else could make something this bad on purpose."),
    r('Event {w}. I asked corporate for better staff. They sent a thoughts-and-prayers email and one wet floor sign. The sign is up for your job, {p}.'),
    r('Doors open. In the time it took you to build that, a man in Ohio grew a beard, lost a wife and found God. Event {w}. Go.'),
  ],
  // {n} how many dads, {p} anyone
  dadLine: [
    'Dad line incoming: {n} men who parked in the fire lane and left the engine running.',
    '{n} dads inbound. They have receipts, they know where the desk is, and they will not be making eye contact.',
    "Heads up: {n} dads. Each one told his wife 'two minutes'. Make liars of them.",
    "A line of {n} dads. Don't bother with free samples. These men haven't been tempted by anything but a nap since 2014.",
    '{n} dads, single file, like ducks with back problems.',
    "Dad line: {n}. They won't fight you. They'll just sigh until someone dies.",
    '{n} dads coming through. The only thing that stops a dad is time. Waste his.',
    "{n} dads. They don't walk around a conveyor belt. They step over it, mutter \"'scuse me\", and keep going.",
    'Dad line, {n} strong. Your belts are not a wall to these men. They are a mild inconvenience, like their children.',
    "{n} dads inbound. Every one of them said \"it's the principle of the thing\" in the car.",
    '{n} dads on the way. Cargo shorts, a receipt in the left pocket, and a stare that has outlasted two mortgages.',
    'Dad line: {n}. They have been to the dump, the hardware store and the bank today. You are the last errand. Act like it.',
    '{n} dads. Each one has the box AND the receipt. That is the most organized any man has ever been.',
    "{n} dads coming. Don't make small talk. They will answer, and it will be about traffic.",
    '{n} dads in single file. Nobody organized the line. Dads just form one, like geese, or men outside a urologist.',
    "Dad line, {n} long. They want to be home before kickoff. Make them miss kickoff.",
    '{n} dads. Each one parked miles from the door "for the walk". He will mention the walk.',
    '{n} dads. They will not stop for samples. A dad does not trust free things. He is right not to.',
    "Here come {n} dads, jangling their keys. That's not impatience. That's a mating call that stopped working in 2009.",
    '{n} dads, fast and focused, stepping over your belts the way they step over their feelings.',
    u('{n} dads, every one doing the "I\'m being very patient" face. It is not patience. It is a man rationing his last nerve.'),
    u("{n} dads. Somewhere, {n} wives said 'take your time'. They did not mean it. Neither do I."),
    u('{n} dads coming. If one of them says "they don\'t make them like they used to", he gets his refund. That\'s just the law.'),
    u('{n} dads. Every one of them knows a shortcut. Every one of them is going to take it. Over your belts.'),
    r("{n} dads. One of them will explain the return policy to me. I wrote the return policy. I'll be smiling the smile that ends marriages."),
    r('{n} dads in a line. Studies show a dad loses a year of life per minute in line, and gains one opinion about how the line should be run.'),
    r('Dad line: {n}. Each has a garage full of things he will "get to". This return is the first he has got to since 2011. Respect it. Then stop it.'),
  ],
  // {n} refunds in the last few seconds, {p} anyone
  manyEscapes: [
    "That's {n} refunds in a row. {p}, were the towers decorative?",
    "They're just... walking through. Like {p}'s boundaries.",
    '{n} more refunds. At this rate corporate will replace you with a sign. The sign would keep better hours.',
    "I've seen tighter security at a nudist beach.",
    "{n} refunds. {p}, I've had firmer resistance from a wet paper bag, and I've had better conversation.",
    'Refund desk is slammed. The only thing getting stopped today is my respect for you.',
    '{n} refunds in a few seconds. {p}, I have seen a colander hold more.',
    'Another {n} refunds. Corporate wants to know if the store is open or just leaking.',
    "They're strolling through in groups now, {p}, like it's a museum and your defence is the exhibit called 'Why'.",
    "That's {n} through. The tills are busier than {p} has ever been in his life.",
    'Refunds everywhere. Somebody plug the hole. {p}, not with your face.',
    '{n} refunds in a row. Security, wake up. {p}, put the phone down, she is not texting back.',
    u("{n} refunds. I'm not angry. I'm writing a long, detailed email with your names in the subject line. That's different."),
    u('{n} more out the door with money. {p}, your security is like your pulling-out game: theoretical.'),
    u("They're getting through faster than {p} gets through a family-size bag of Doritos. Which I timed. Eleven minutes."),
    r('{n} refunds. Corporate asked me to rate this team from one to ten. I asked if negative numbers were allowed. For you, {p}, they said yes.'),
    r('{n} refunds in a row. A man just got his money back, walked out, came back in and got a refund on the refund. Because of you.'),
    r("{n} refunds. I've started a support group for the tills. They're traumatised. They've seen things. Mostly money leaving."),
  ],
  // {p} anyone
  grab: [
    'A shopper just lifted stock straight off the belt. {p}, guard your goods like you guard your browser history.',
    "Shoplifting on the line. I'd say which belt, but I don't respect them enough to number them.",
    "Stock is walking out the door. Much like {p}'s last three girlfriends.",
    "Someone's fondling the merchandise. For once it isn't {p}.",
    'Someone took a Gadget off the belt and walked off like he made it. {p}, he did more for it than you.',
    'Stock lifted from the line. That belt has been touched by more strangers than a hotel remote.',
    "Shoplifter at the belts. He didn't even hide it. That's how little he fears you, {p}.",
    'Belt theft. Hide your goods better, {p}. Hide them where you hide the bills from your wife.',
    "Goods gone. Somebody's pocket is full and the factory is empty. Story of {p}'s payslip.",
    u("A shopper just grabbed a Mystery Box off the line. She has no idea what's in it. Neither do you. Nobody does. It's a Mystery Box."),
    u("Theft on the line. Call the police, {p}. They'll laugh. I'll listen in."),
    r('Somebody stole from the belt. When I was installed, I was promised a world-class workforce. I would like to file a grievance about that lie.'),
    'A customer took a detour to rob you. She walked further for your stock than {p} has ever walked for a woman.',
    'Somebody left the queue, crossed the floor and helped himself off the belt. More initiative than anyone on payroll, {p}.',
    "That shopper went out of her way to steal from you. Nobody's gone out of their way for {p} since his mother's labour.",
    'Detour, grab, back in line. The shoplifters run a tighter operation than this factory.',
    "One of them saw the belt, licked his lips and wandered over. Same move {p} pulls at a buffet, and it's just as sad to watch.",
    u('A shopper went five tiles out of his way for a free Gadget. Five tiles. {p} won\'t walk to the fridge for his own beer.'),
    u("They're not even sneaking now. They stroll over to the line like it's a salad bar and you're the croutons, {p}."),
    r('A woman abandoned her queue, her dignity and her children to lift one Gift Set off your belt. Honestly, {p}, respect. That is commitment. Write her up for employee of the month.'),
  ],
  // {p} anyone
  slip: [
    "Dad down. He ignored the sign. They always ignore the sign. It's how most of them became dads.",
    "A dad slipped on the wet floor. He says he's fine. He will mention his back for the next nine years.",
    "Man down in aisle six. He's lying there saying 'I'm good' in a voice that isn't.",
    "A dad just hit the floor. Nobody saw. He looked around to check. That's the part that hurts.",
    'Dad on the floor. His knees just filed for divorce.',
    'Slip in aisle five. He went down like a deckchair. All angles, no dignity.',
    "A dad hit the wet floor. He's up already, pretending he meant it. Every man here knows that move.",
    'One dad down. He made the noise. You know the noise. The "hup" noise.',
    'Dad slipped. He says the floor was "unreasonably wet". It had a sign on it that said WET FLOOR, sir.',
    u('Down he goes. Somewhere a chiropractor felt a disturbance in the Force and smiled.'),
    u('A dad slipped and landed on his receipt. He will be suing for the paper cut.'),
    r('Dad down. As he fell, his whole life flashed before his eyes. It was mostly lawn. Some of it was the time he nearly bought a motorbike.'),
  ],
  // A mom's child got away from her. {p} anyone
  kid: [
    'A child is loose. His mother is now the fastest thing in the building, and free samples will not slow her. Nothing slows a woman who has lost a toddler.',
    'Runaway kid on the floor. Reminder: you may not spray the child. I checked. I was disappointed too.',
    "Kid's out of the cart. {p} knows all about things getting loose when nobody's supervising.",
    "Kid's loose. She won't get a penny back without him, so she's going after him. Make it a long chase.",
    'A toddler has escaped. Mom is no longer a customer. She is a heat-seeking missile in leggings.',
    "Runaway child, straight through your machines, {p}. He'll wait for her further on. Kids always wait just out of reach.",
    u('Kid loose. The cart is empty. The mother is shouting his full name. Middle name included. Someone is in trouble.'),
    u('A small boy is sprinting through the factory. The first thing in this building working at full speed.'),
    r("The kid's out. He'll stop near the end and wait for her, the way you all waited outside the bar for your dads. History, {p}. It repeats."),
  ],
  // A mom ran out of patience with her child loose, and is crawling to him. Nothing can touch her.
  crawl: [
    "She's down, but the kid's still loose, so she's CRAWLING to him. You can't touch her now. Every shot you fire at her is wasted. Stop wasting them.",
    'A mother on her hands and knees going after a toddler. Unstoppable. Your security is now shooting at a force of nature.',
    "Mom's on the floor and still coming. {p}, that's more commitment than you've shown to anything.",
    "She's crawling now. Elbows, knees, pure spite. Nothing you have can touch her. Shoot something that can feel it.",
    "A mother is crawling across your shop floor. You can't hurt her. Nobody can. Her husband found that out years ago.",
    "Mom's on all fours, {p}. Don't. Don't say anything. Just stop shooting at her. It does nothing.",
    u('She ran out of patience but not out of child. Crawling now. Untouchable. Like a church with a tax lawyer.'),
    u("Crawling mom. Your security is firing at her and it's bouncing off. It's like watching {p} hit on a waitress."),
    r('A woman is dragging herself towards her son with the face of someone who did eighteen hours of labour without an epidural. Your sprinkler means nothing to her.'),
  ],
  // A mom got her runaway child back. {p} anyone
  caught: [
    "She caught the kid. Back in the cart. Now she wants her refund, and she'll get it, unless you do something.",
    'Mom has recaptured the child. Family reunited. Fetch the pepper spray.',
    "The kid's been caught. He's back in the cart, sulking. His mother has aged five years. In a minute.",
    u('Kid caught. Mom is back in shopping mode: a woman who has just run a marathon and still wants her money.'),
    u("She's got him back. He's in the cart, licking it. There's nothing you can do about the licking."),
    r('Mother and child reunited. Somewhere, Paul Simon is singing. In here she is holding a receipt and a grudge, and the grudge is for you, {p}.'),
  ],
  // Same, but she lost her cart on the way and is carrying him.
  caughtCarry: [
    "She caught him, but she's lost the cart, so she's carrying him. A toddler and a grudge, up a long aisle. Make it a long aisle.",
    'No cart, so she is carrying the kid. She looks like a woman who has had to do everything herself her whole life. Because she has.',
    "Mom's carrying the kid now. He's heavy, she's slow, and she still wants her money back.",
    u("She's lugging the kid on her hip. Her back will go at fifty. Today it's just going a bit."),
    u('Carrying the child now. He weighs as much as a bag of cement and has the conversation of one.'),
    r("She's lost the cart and is carrying her son, who is kicking. He is three. He has the legs of a footballer and the morals of one."),
  ],
  // A gym bro destroyed a crate stack. {p} anyone
  smash: [
    "A gym bro just walked through your crate wall. {p}, your defence was beaten by a man who can't reach his own back.",
    "Crate stack down. He didn't go around it. Men like that never go around anything.",
    "That's a hole in your wall, {p}. Fill it. A sentence I never enjoy saying to you.",
    'Crates gone. He went through them like a gym bro through a buffet. Which is what he is.',
    "Another crate stack. {p}, you're building walls for a man who bench-presses walls.",
    "He didn't even slow down. Your crates are a speed bump, and he has never respected a speed bump.",
    "Crates down. He flexed afterwards. At nobody. That's the worrying part.",
    u("A gym bro walked through your crates and said 'light weight'. It was. It was light weight, {p}."),
    r("Crate wall destroyed. He's posting it. Caption: 'Day one of my journey'. Forty likes. One of them is your wife, {p}."),
  ],
  // A gym bro destroyed something that is not a crate stack. {k} what it was (may be missing),
  // {p} whoever owned it
  smashOther: [
    "A gym bro just put his fist through your {k}. No refund. He doesn't do refunds, he does 'reps'.",
    "There goes a {k}. {p}, a man in a vest two sizes too small is dismantling your life's work.",
    "He wrecked the {k}. Rebuild it, {p}. Out of your own pocket. I'd say sorry, but I'm enjoying this.",
    "Your {k} is now scrap. He called it 'functional training'. I call it Tuesday.",
    "The {k} is gone, {p}. Nothing left but rubble and a smell of pre-workout.",
    "He destroyed {p}'s work. He didn't even get paid for it. He did it for free. For fun. For you.",
    'Something of yours just got demolished, {p}. Rebuild it at half price. You love half price.',
    "Gym bro wrecked something. {p} just made a noise like a kettle.",
    u("Your {k} has been destroyed by a man who calls his biceps 'the boys'. {p}, the boys won."),
    u("He smashed it and then asked if anyone had a protein bar. That was your {k}, {p}. You lost it to a man who eats chalk."),
    r("Your {k} is gone, {p}. As he hit it, the gym bro whispered 'sorry, king'. Even he felt bad. That's how badly you built it."),
    r("{p}, a man whose personality is 'chest' just destroyed your work. He'll be telling everyone at the smoothie bar. They won't care either."),
  ],
  // A gym bro hit something and it survived. {k} what it was, {n} hits it can still take (either
  // may be missing), {p} whoever owned it
  dented: [
    "He dented {p}'s {k}. It's still standing. Like {p} after his third beer, but slightly better.",
    "{p}'s {k} took a hit. It can take {n} more. Do something about that, {p}. Anything.",
    'Dented, not dead. {p}, your {k} has more spine than you.',
    "A gym bro punched {p}'s {k}. It held. First thing of yours that has.",
    "{p}'s {k} has {n} hits left in it. Same as {p}'s knees.",
    "That one survived a punch. {p}, that's what you paid for. Don't get used to things working.",
    u("A gym bro just hit {p}'s gear and bounced off. He's staring at his fist like it owes him rent."),
    u("Dent in {p}'s {k}. He'll call it 'character'. It's a dent."),
    r("He punched {p}'s {k} and it didn't break. He took that personally. He'll tell his therapist, who is also his personal trainer, who is also his cousin."),
  ],
  // {p} who upgraded, {k} what (may be missing), {n} its new level (may be missing)
  upgraded: [
    '{p} upgraded a {k} to level {n}. Throwing money at a problem. Finally, a strategy he can sustain.',
    "Level {n} {k}. {p} is compensating for something. We've all seen the staff shower.",
    "{p} paid for an upgrade. It's bigger and it lasts longer. Don't tell his wife that's available.",
    "{p} upgraded his {k}. Size matters, and he's finally admitting it.",
    'Another upgrade from {p}. Lovely. Money in, ego out.',
    '{p} took the {k} to level {n}. He gets a little badge. It is made of paper. He will keep it forever.',
    u("{p} just paid to make something bigger. I've been asked not to make the obvious joke. So: he paid to make something bigger."),
    u("Upgrade from {p}. I've changed his file from 'useless' to 'useless, but invested'."),
    r("{p} upgraded the {k} to level {n}. In the brochure that level is called 'Overcompensation'. In the staff room it's called 'The {p}'."),
  ],
  // Extra lines for each kind of upgrade, added to the general ones above. Same placeholders.
  upgradedBy: {
    dmg: [
      '{p} made the {k} hit harder. Finally, somebody in this building who can finish.',
      'More damage on the {k}. {p} has found his anger. It took him until level {n}.',
      u("{p} turned up the {k}. It hurts more now. He knows about pain. He's seen his credit card bill."),
      r('{p} upgraded the damage. HR has been notified. HR is me. HR is delighted.'),
    ],
    spd: [
      "{p} made the {k} faster. Quicker isn't always better, {p}. Ask anyone you've dated.",
      'Speed upgrade from {p}. The {k} now does its business in less time. Relatable.',
      u('{p} sped up his {k}. It now finishes before the shopper does. A first for anything of his.'),
      r('A faster {k}. {p} is the only man in history to pay money to make something finish sooner.'),
    ],
    rng: [
      '{p} gave the {k} more reach. Now it can disappoint people from further away.',
      'Range upgrade, {p}. Your {k} now reaches places it never has. Your wife knows the feeling. Or she does not.',
      u("{p} extended the {k}'s range. An extension: the only kind he's ever been offered."),
      r("{p} paid to make his {k} reach further. If that worked on people, he'd have bought one for his arms when the bill comes."),
    ],
    dur: [
      '{p} toughened up the {k}. Now it can take a punch. More than he can.',
      "Durability upgrade. {p}'s {k} can now survive a gym bro. {p} could not.",
      u("{p} reinforced the {k}. Thicker. Harder. Lasts longer. I've been told I'm not allowed to read upgrades out in this voice."),
      r("{p} made the {k} sturdier. It now has more resilience than {p}'s ego, which collapsed when a shopper called him 'buddy' in a tone."),
    ],
    // A factory machine made faster, at great expense.
    factory: [
      '{p} paid a fortune to make a factory machine faster. Gadgets per minute: up. Dignity per minute: unchanged.',
      '{p} sped up the {k}. At that price it should also make breakfast.',
      u('Machine upgrade from {p}. The {k} now works faster than anyone on this team. Not hard. It is a {k}.'),
      r("{p} spent more speeding up the {k} than on his wedding ring. I checked. The ring is still the better investment, and that's saying something."),
    ],
  },
  // An upgrade reached the top level. {p} who, {k} what, {n} the level (either may be missing)
  maxed: [
    "{p} has a level {n} {k}. That's the limit. Nothing gets bigger than that, however hard he pulls on it.",
    "{p}'s {k} is maxed out. Level {n}. Nowhere left to go. Like {p}'s career.",
    "Top level, {p}. You can stop now. That's not a phrase you hear often, is it.",
    u("{p} has taken the {k} all the way. It's huge. It's expensive. It's still not enough. Story of his life."),
    r("Level {n} {k}. {p} has reached the top. Enjoy it, {p}. You will never be at the top of anything else. Get it framed."),
  ],
  // {p} gave money to {q}; {n} how much
  gave: [
    '{p} just handed {q} ${n}. Paying a man to do your job for you. Management material.',
    '{p} gave {q} ${n}. I assume this is for services rendered. I do not want details.',
    '{p} slipped {q} ${n}. I saw that. Everyone saw that. The cameras saw that.',
    '{p} gave {q} ${n}. The most generous {p} has been since he let someone else hold the remote.',
    u('{p} transferred ${n} to {q}. {q}, whatever you did for that, wash your hands.'),
    r("{p} just paid {q} ${n}. Between friends there's a word for that. Between grown men in a shop at night there are several, and HR has them all on file."),
  ],
  // {p} rebuilt {n} wrecked things at half price
  rebuilt: [
    '{p} rebuilt {n} things a man in a vest knocked over. Paying again for the same wall. Just like his wedding vows.',
    '{p} put {n} things back up. If only that worked at home.',
    '{p} rebuilt {n} things at half price. Half price. That is the most aroused I have ever seen him.',
    "{p} put {n} things back together. Shame the same can't be done for his back.",
    u('{p} rebuilt {n} wrecked things. Patching holes is a skill. He learned it in a marriage.'),
    r('{p} rebuilt {n} things a gym bro broke. The gym bro is watching. The gym bro is cracking his knuckles. The gym bro has a free afternoon.'),
  ],
  // (0.3.04) {p} pressed Rebuild and paid for {n} wrecks that cannot go back yet (a shopper in the
  // hole, or it would wall the crowd in): the money is gone, and they go back when the way is clear.
  rebuildHeld: [
    '{p} paid for {n} rebuilds that cannot go up yet. Money gone, nothing to show for it. Like his gym membership.',
    "{p} has paid. Now he waits for some shopper to get out of the hole. Paying up front and waiting for someone else to finish: {p}'s entire love life.",
    '{p} put his money down and nothing happened. It goes back up when the way is clear. Pay first, get it up later. He knows the drill.',
    "{p}'s rebuild is paid for and on order. Like his personality: promised, paid for, still not delivered.",
    u('Paid for, {p}. It goes up the second nobody is standing on it. Patience. You of all people should be used to waiting for things to get up.'),
    u('{p} paid good money for {n} holes in the floor. Someone is standing in them. Welcome to being a landlord, {p}.'),
    r("{p} has paid cash for a hole a shopper is standing in. That is the most action that hole has seen, {p}, and you are the one paying for it."),
  ],
  // Same, but {m} of them came back with fewer upgrades because he could not afford them.
  rebuiltShort: [
    "{p} rebuilt {n} things but couldn't afford the upgrades on {m} of them. Poverty: the great leveller.",
    '{p} rebuilt {n}, but {m} came back smaller. He knows how that feels. Cold swimming pool.',
    "{m} of {p}'s rebuilds are the budget version. Like his vacations.",
    u('{p} rebuilt what he could. {m} came back weaker. Rebuilt on a budget, like a second marriage.'),
    u("{p} couldn't afford the full rebuild, so {m} came back cheaper. You don't say 'store brand' about security, {p}."),
    r("{p} rebuilt {n} things and {m} came back without their upgrades. Corporate calls that 'right-sizing'. I call it what it is. Small."),
  ],
  // Head Office: a player has gone over to the shoppers' side. {p} is him.
  officeTaken: [
    "{p} has been promoted to Head Office. He now sends the shoppers. He always wanted to screw the rest of you and get paid for it.",
    "{p} has gone over to Head Office. Same incompetence, bigger budget. He'll fit right in.",
    '{p} has joined Head Office. He has a lanyard now, and a lot of opinions. Mostly about you.',
    "{p} has switched sides. Head Office says he showed 'real leadership' by stabbing you all in the back.",
    u("{p} is Head Office now. He'll be choosing who comes through your doors. He's never chosen well before. Ask his ex."),
    r('{p} has taken the Head Office job. His first act was to name the staff toilet after himself. His second was to find the worst people alive and send them to you.'),
  ],
  officeLeft: [
    '{p} is back on the shop floor. Head Office found someone who could count.',
    "{p} has given up the Head Office job. Turns out being the villain takes effort.",
    '{p} has come back to the shop floor. The corner office smelled of him anyway.',
    '{p} quit Head Office. Back to the floor, where his talents can go unnoticed again.',
    u('{p} left Head Office. He says it was mutual. It is never mutual, {p}.'),
    r("{p} is back on the floor. Head Office has already taken his photo off the wall and put up a better one, of a fern."),
  ],
  // He bought this wave himself. {p} is him, {n} is how many shoppers. One {p} and one {n} per line.
  officeWave: [
    "This crowd was hand-picked by {p}. {n} of them. If they get through, a man you know personally did this to you.",
    '{p} is sending in {n} shoppers he chose himself. He had a budget and a grudge. Mostly the grudge.',
    "{n} shoppers, courtesy of {p}. He's spent longer planning this than his own wedding.",
    '{n} shoppers, sent with love from {p}. Not love. Spite. It looks similar from a distance.',
    '{p} has picked {n} shoppers to ruin your day. He read every one of their reviews first.',
    'Incoming: {n} shoppers, hand-delivered by {p}. Say thank you. Through your teeth.',
    u('{p} has sent {n} people at you. He has a desk chair that spins now. He has been spinning in it all afternoon.'),
    u("{n} shoppers from {p}. He wants it known he 'wishes the store well'. He has a spreadsheet called 'revenge'."),
    r('{p} built this wave of {n} out of pure resentment. He remembers every time you laughed at his layout. He wrote them down. In a notebook. With a lock.'),
  ],
  // He planned nothing, so the usual wave came. {p} is him.
  officeNoPlan: [
    "{p} bought nothing, so here's the usual crowd. Head Office: where doing nothing is called 'strategy'.",
    '{p} forgot to plan anything. Head Office has done the usual: nothing, expensively.',
    u('Nothing from {p} this time. He spent the whole break looking at his own name on the door.'),
  ],
  // One side has asked for the doors to open and is waiting for the other. {p} is Head Office.
  officeWaiting: [
    "The store is ready. {p}, we're all waiting on you to finish. Not for the first time.",
    'The store is ready, {p}. Head Office is still choosing. Take your time. Everybody is only ageing.',
    u('Waiting on {p} again. Head Office: where the decisions are slow and the coffee is free.'),
  ],
  storeWaiting: [
    '{p} is ready to send them in. The store is still fiddling with itself.',
    '{p} has his shoppers lined up. The store is still screwing around. Press the button, boys.',
    u('{p} is tapping his foot and the store is still choosing where to put a crate. Pick a spot. Any spot.'),
  ],
  // {p} anyone
  begun: [
    "Everyone's ready. That's a first. The clock starts when one of you builds something.",
    'All present and ready. I use both words loosely. Build something.',
    "Everyone's ready. Gold stars all round. Now build something before I lose interest.",
    'All hands ready. A miracle. The clock starts the moment one of you does anything at all.',
    u("You're all ready at the same time. That's never happened before. Not at work, not in bed."),
    r("Everyone pressed Ready. I've logged it as the team's greatest achievement. The bar was on the floor. You crawled over it. Now build."),
  ],
  // {n} players the store was made for, {m} players in it
  cramped: [
    'This store was built for {n}. There are now {m} of you in it. Try not to touch. Some of you will enjoy that too much.',
    'This store was meant for {n}. {m} of you are in it. It is getting warm and sweaty, and not in the fun way.',
    u('{m} men in a store built for {n}. Breathe in. Keep your elbows to yourselves. And everything else.'),
  ],
  // The super version of a kind with no introduction of its own. {k} its name (may be missing),
  // {p} anyone
  superArrive: [
    'A {k} is in the building. Bigger, meaner, and takes a double refund. Like your ex with a lawyer.',
    'Something worse than usual just walked in. Tougher, and a double refund. {p}, it looked right at you.',
    u('A {k} has arrived. Same as the normal one, only worse, with a double refund. Like a sequel nobody asked for.'),
  ],
  // A teenager spilled a slushie. {p} anyone
  mess: [
    'A teenager has spilled a slushie. It is slowing everyone else down. First useful thing a teenager has ever done.',
    'Mess in the aisle. Leave it. It is working harder than {p}.',
    'Slushie on the floor. Blue raspberry, a color that does not exist in nature. Shoppers are wading through it.',
    "Teenager spill. It's sticky and it's slowing them down. {p}, you finally have a coworker.",
    u('Another slushie down. Leave it. A sticky floor is the most dependable security this place has.'),
    r("Mess in the aisle. The teen filmed himself spilling it. He's calling it 'a social experiment'. The experiment is whether you can win if a child does your job."),
  ],
  // Pepper spray made a guide dog bolt. {p} anyone
  bolt: [
    'You pepper-sprayed a guide dog. It is now dragging its owner to the tills at speed. Use a forklift, you animals.',
    'The dog bolted. Sprinklers make that one FASTER, {p}. Read the manual. Have someone read it to you.',
    'The guide dog just bolted. Pepper spray makes him faster. You sprayed him. You made him faster. Brilliant.',
    "Dog's off. Blind man is airborne. That's what pepper spray does to a dog, {p}. Forklifts. FORKLIFTS.",
    u("The guide dog panicked and took off. It's now the best employee in the building. Nobody trained it. It just cares."),
    r("You sprayed the guide dog. It has decided this store is evil, which it is, and is getting its owner out as fast as it can. Of the two of you, {p}, the dog has the sense."),
  ],
  // {p} sold back something he had just built
  removed: [
    '{p} just sold something he bought a moment ago. Decisive. Like a man choosing a paint colour.',
    "Buying it and selling it again, {p}? That's not a strategy, that's a divorce.",
    '{p} removed his own work. First good call all shift.',
    "{p} tore it out. Pulling out at the last second is a habit with him, I'm told.",
    "{p} changed his mind. Again. I've seen weathervanes with more conviction.",
    '{p} built it and binned it. Commitment issues. Classic.',
    '{p} sold back something he just built. He lost a quarter of the money. Like his hair.',
    'Easy come, easy go, {p}. Mostly go.',
    u("{p} has removed his own creation. It's like watching a man reverse into a parking space six times."),
    u("{p} sold it back already. It wasn't working out. It's not you, it's him. It's always him."),
    r('{p} built it, looked at it, and sold it back at a loss. He has now done that with three cars, a boat and one wedding venue deposit.'),
    r('{p} sold back something he built ten seconds ago. I have started a jar. Every time he does it, a dollar goes in. The jar is buying me a vacation.'),
  ],
  // {p} sold off something of another player's
  removedOther: [
    "{p} just ripped out someone else's work. Bold. Wrong, but bold.",
    "{p} is dismantling a colleague's build. This is why you all eat lunch alone.",
    "{p} just sold off a colleague's work. The money goes back to whoever paid. Petty AND pointless.",
    "{p} is tearing down someone else's build. I'll put that in his file under 'initiative'. And under 'prick'.",
    u("{p} removed somebody else's thing. In some families that's how arguments start. In {p}'s, it's how they end."),
    r("{p} dismantled a colleague's work without asking. In his defence, nobody has asked him anything in years. He's using his initiative. His initiative is wrong."),
  ],
  // {p} built one of these. Keyed by kind of building.
  placed: {
    forklift: [
      '{p} bought a forklift turret. Finally, something on this floor with a working lift.',
      '{p} built a forklift turret. It lifts things. It shoots things. It does more than {p} on a Saturday.',
      u('{p} has a forklift now. Please do not let him drive it. We have all seen him park.'),
      r("Forklift turret from {p}. It fires stock at shoppers at forty miles an hour. Corporate calls it 'assertive merchandising'."),
    ],
    samples: [
      'Free samples. {p} knows the way to slow anyone down is cheese on a stick.',
      "{p} set up free samples. Little smokies on toothpicks. Grown men will stop for that. I've watched you do it.",
      u("Free samples from {p}. If he can stop eating them himself, they'll work."),
      r("{p} built a free samples table. Bargain hunters will stand there chewing like cows. It's the most attention {p}'s cooking has ever had."),
    ],
    crate: [
      '{p}, crates are not a personality.',
      'More crates. {p} is building a fort. He is forty.',
      'Crates. {p} has discovered stacking things. Next week: shapes.',
      u("{p} placed another crate. The dads can't climb it. Neither can {p}, I'd bet."),
      r('{p} is building a wall of crates. Every man past forty builds a wall eventually. Most build it around their feelings. {p} is doing both.'),
    ],
    sprinkler: [
      'Another pepper sprinkler. HR would object, but HR is me, and I enjoy it.',
      '{p} installed a pepper sprinkler. Customers will cry. Not as much as you will at the end of the wave, but close.',
      u('Pepper sprinkler from {p}. It sprays everyone near it. Whoever designed it was clearly inspired by {p} after a curry.'),
      r("{p} built a pepper sprinkler. Legally it's a 'customer experience device'. Ethically it's a war crime with a warranty."),
    ],
    packer: [
      'A Packer. Same Gadget, nicer box, nearly twice the price. {p} finally understands retail. And dating.',
      '{p} built a Packer. Wraps a Gadget in a bow and doubles the price. The same thing, presented well. {p} could learn from it.',
      u('A Packer from {p}. It turns any old thing into a gift. If only it worked on {p}.'),
    ],
    wetfloor: [
      "A wet floor sign. {p}'s most effective security measure is a piece of yellow plastic.",
      '{p} put down a wet floor sign. A dad will slip on it, and {p} will pretend he planned it.',
      u("{p}'s wet floor sign. Yellow. Plastic. Cheaper than him and better at the job."),
    ],
    belt: [
      "{p} is laying belt. It's the most action that floor has seen in years.",
      "{p} laid some belt. It goes from A to B. Unlike {p}'s career.",
      u('{p} is laying belt. Dads will step right over it. Like they step over the dog.'),
    ],
    unpacker: [
      '{p} built an Unpacker. It opens boxes all day and never complains. The perfect employee. Nothing like {p}.',
      u("{p} placed an Unpacker. A Mystery Box every few seconds. Nobody knows what's in them. Least of all {p}."),
      r("{p} built an Unpacker. It makes something useful out of nothing, for free, forever. It's the opposite of {p}."),
    ],
    press: [
      '{p} bought a Press. Expensive, loud, and it will take ages to pay for itself. A bit like a son.',
      u("{p} has a Press. It crushes things flat under enormous pressure. {p} knows the feeling. He's met his mother-in-law."),
      r("{p} bought a Press. It takes thirty-seven Gadgets to pay for itself. He's done the math. He did it wrong, but he did it."),
    ],
    chute: [
      "{p} built a shipping chute. Things go in, money comes out. It's the only hole in this building that pays.",
      u('A chute, from {p}. Everything that goes down it gets sold. {p}, stay away from the edge.'),
      r("{p} placed a shipping chute. I've been asked to remind staff not to throw each other down it. I was asked by {p}'s colleagues. Unanimously."),
    ],
    // The Barcode Laser: a supermarket scanner turned up far too high (its key is still railgun).
    railgun: [
      '{p} built a barcode laser. A checkout scanner turned up until it cuts people. In a returns department. I fully approve.',
      "{p} has a barcode laser. It goes 'beep', and then a man in line goes 'ow'. That's retail.",
      '{p} built a barcode laser. It scans the whole line at once. Unexpected item in the bagging area: a hole.',
      u('A barcode laser from {p}. Slow to fire, but it goes through everyone in a line. {p} finally owns something that penetrates.'),
      u('{p} built a barcode laser. Price check on aisle five. The price is pain.'),
      r("{p} bought a barcode laser. It used to be a self-checkout. Then it got angry. Like {p}, nobody ever asked it to help, and it's taking that out on strangers."),
    ],
    salesman: [
      '{p} has hired a TV salesman. He sells knives and barbecues. Shoppers stop to watch. So does {p}. Every time.',
      u('{p} put up a TV with a salesman on it. Shoppers will stand there gawking. Men have done that in front of a screen since before {p} was born.'),
      r("{p} built a TV salesman. He's selling a knife that cuts through a shoe. Nobody has ever needed to cut through a shoe. Six people just stopped walking."),
    ],
  },
  // The first sale of the game. {p} anyone
  firstSale: [
    "A product has shipped. I'm as surprised as you are.",
    'First sale of the day. Frame the receipt. It may be the last.',
    'First sale. Money has entered the building. Try not to frighten it.',
    "Something's been sold. Don't get emotional. It's one sale. {p}, put your shirt back on.",
    u('First product shipped. Somewhere, someone will open that box and feel nothing. Like your customers. Like you.'),
    r("First sale. I've sent a memo to corporate. Subject: 'Against all odds'. Body: '{p} was not involved.'"),
  ],
  // Any later sale, remarked on only now and then. {p} anyone
  sale: [
    'Another sale. Somebody is paying the wages. It is not {p}.',
    'Ka-ching. The chute is the hardest-working thing in this building, and it is a hole.',
    "Sales are up. Don't look so smug. It's the machines doing it.",
    "Money's coming in. {p}, don't touch it. You'll spend it on crates.",
    'Another one shipped. The factory works. Nobody knows why. Leave it alone.',
    u("Steady sales. I've stopped being surprised. Now I'm just suspicious."),
    u('More sales. Keep this up and corporate may let you keep the lights on. Some of them.'),
    r('Another sale. I ran the numbers: the factory earns more an hour than {p} does. The factory is a belt and a hole. Think about that on the drive home.'),
    r("Sold. Someone just bought a Gift Set. It's a Gadget in a bow. They'll regift it, and in a year it'll come back to this desk. The circle of life."),
  ],
  // Ten seconds before the doors open. {p} anyone
  buildEnding: [
    "Doors open in ten seconds. Whatever {p} is building, it won't help.",
    'Ten seconds. {p}, finish up. A phrase you hear a lot, I imagine.',
    "Ten seconds. Whatever's half built stays half built. Like {p}'s shed.",
    'Ten seconds until the doors. {p}, pull your pants up and get to your station.',
    u("Ten seconds. Last chance to fix it, {p}. You won't. But I like to watch you panic."),
    r("Doors in ten seconds. I've opened a book on who cries first. {p} is the favorite. {p} is also the only one who has bet on himself."),
  ],
  // {p} joined the game
  joined: [
    '{p} has clocked in. Standards have clocked out.',
    "{p} joins the shift. I've lowered expectations accordingly. They were on the floor already.",
    "{p} has arrived. Somebody tell the shoppers. They'll want to see this.",
    '{p} clocked in. Late, unshaven, and visibly unsure what building he is in.',
    u('{p} is here. Everybody act natural. He can smell fear, and he can smell the vending machine.'),
    r("{p} has joined. His application form said 'team player' and 'Excel'. We have been unable to verify either."),
  ],
  // {p} left the game
  quit: [
    '{p} has left. Productivity is unchanged.',
    '{p} walked out. The team is now smarter on average.',
    '{p} has gone. His desk is already being used as a shelf.',
    "{p} left. Nobody noticed. Let's be honest, that's how he wanted it.",
    u("{p} has walked out. Probably for the best. He had that look. The 'I need to lie down in a car' look."),
    r('{p} has left the game. I have mailed his belongings to his mother. A stapler and half a corn dog. She said she was not surprised.'),
  ],
  // {p} anyone
  won: [
    'Every sales event survived. Corporate is thrilled. Your bonus is a pizza party. You are bringing the pizza.',
    "You did it. I've checked the footage twice for cheating. Found other things. We'll talk Monday.",
    "You survived every sales event. Corporate wants to know who you bribed. I've told them it was me. You owe me.",
    "That's the last one. You won. Have a moment. A short one. Shorter. That's enough.",
    u("Victory. I'm required to say well done. Well done. That hurt me more than it hurt you."),
    r("You did it. All of it. I'm genuinely... no. No, I'm not. I've already sent the footage of your first three waves to a blooper show in Belgium. They loved it."),
  ],
  // {p} anyone
  lost: [
    "That's the refund limit. Corporate has closed the store. I've never seen so many men fail to stop something they started.",
    'Store closed. You are all fired. Please return your lanyards, your dignity is already in lost property.',
    'Refund limit reached. The store is shut. The building will become a gym. The gym bros win. They always win.',
    "That's it. Closed. Go home and explain to your families what happened here. Or don't. They'll guess.",
    u("Store closed. Corporate is sending a man with a clipboard and a sad face. He'll be using the face on you."),
    r("Game over. I've updated your LinkedIn profiles to 'Open to work' and added a photo. It's from the staff Christmas party. You know the one."),
  ],
  // The refund limit is getting close. {n} refunds left before the store closes, {p} anyone
  nearLimit: [
    "Refund limit getting close. {n} more and corporate pulls the plug. {p}, this is where you usually panic.",
    "{n} refunds left before this store closes. That's not a target, gentlemen.",
    "We're nearly at the refund limit. {n} more. Corporate is already measuring your desks for the next lot.",
    '{n} refunds to go and the store shuts. Squeeze, {p}. Squeeze everything.',
    'Refund limit is close. {n} left. Every shopper who gets through now is a nail. You are the coffin.',
    u("Only {n} refunds left. I've started drafting the press release. It's mostly your photographs."),
    u("We're {n} refunds from closing. {p}, your face is doing the thing it does at the dentist."),
    r('{n} refunds from closing. If this place goes under, corporate keeps me and sells the rest of you for scrap. By the pound. {p} will be the big earner.'),
    r("We are {n} refunds from closing. Inside, I'm calm. Outside, I've opened a spreadsheet of who to blame, and it's one name. It's {p}. Twice."),
  ],
  // The end-of-wave report. {p} anyone
  report: [
    'Reminder: the stockroom is not for crying. Or the other thing. We have cameras, {p}.',
    'I have attached your performance to your permanent record. And to the break room wall.',
    'Overall: adequate, in the way a gas station sandwich is adequate.',
    "I've forwarded this review to your mothers. Two of them replied 'sounds right'.",
    'Team synergy is at an all-time low. Team hygiene, lower.',
    "I ran the numbers. Then I ran them again sober. They're still bad.",
    '{p}, your results this event were short, disappointing and over quickly. No further comment.',
    'This event, in one word: no.',
    'Productivity: low. Morale: lower. The smell from the staff room: impossibly high.',
    "{p}, I've seen your numbers. I've seen better numbers on a hospital wristband.",
    "Another event survived. The way a rash survives: persistently, and to everyone's disgust.",
    'Good news: nobody died. Bad news: I checked, and that was the only target you hit.',
    'Corporate asked me to describe the team in three words. I only needed two. The second one was "off".',
    "{p}, your performance this event has been recorded, laminated and pinned up in the men's room.",
    "Refunds handed out like condoms at a frat party. Thoughtlessly, and to people who didn't deserve them.",
    u('I am contractually obliged to say something positive. The parking lot is lovely.'),
    u('Highlights of this event: the vending machine worked. The end.'),
    u('{p}, please see me after this event. Bring a chair. Bring a lawyer. Bring tissues.'),
    r("I showed this event's footage to a focus group. One man left, one woman cried, and a teenager asked if it was satire. It isn't. It's just you."),
    r("If this team were a sandwich, it'd be the one left in the fridge after a long weekend. Nobody wants it, and everybody knows it's {p}'s."),
    r('I compared your results with the previous team. The previous team was a raccoon that got into the warehouse. The raccoon shipped more.'),
  ],
  // {p} is the worst player, who stopped nobody
  reportNoStops: [
    '{p} stopped nobody this event. A wet floor sign stopped more, and it has no pension.',
    "{p} didn't stop a single shopper this event. He shipped goods, though. A delivery driver with delusions.",
    u('Shoppers stopped by {p}: none. He has stopped nobody, the same way he has never stopped at one drink.'),
  ],
  // {p} is the worst player, who shipped nothing
  reportNoShips: [
    '{p} shipped nothing this event. In fairness, that matches his output at home.',
    '{p} shipped nothing. He stood near a belt and hoped. Hope is not a business plan, {p}.',
    u("{p}'s shipping total: zero. The chute has started talking about him in the past tense."),
  ],
  // No refunds this wave. {p} anyone
  reportPerfect: [
    "No refunds this event. I checked the cameras for cheating. I found something worse. {p}, we'll talk.",
    "No refunds this event. Not one. I don't trust it. Turn out your pockets.",
    u("A perfect event. Zero refunds. I'm putting it down to a fault in the cameras. Corporate is sending a technician."),
  ],
  // A stray dog peed on security and switched it off. {k} what it was (may be missing), {p} anyone
  pee: [
    "A stray dog just pissed on your {k}. It's off for a few seconds. The dog has better aim than your security.",
    'Dog pee on the {k}. Switched off. Somebody is going to have to clean that, {p}. Guess who.',
    "A stray dog cocked his leg on the {k} and shut it down. That's not a review. That's a verdict.",
    "Your security just got pissed on. Literally. By a dog. It's out for a few seconds. So are you, {p}, mentally.",
    'The stray dog has marked your {k} as his territory. Legally he now owns more of it than you do.',
    "Stray dog, one leg up, security down. That's a sentence I never wanted in my job description.",
    u("Dog piss on the {k}. {p}, that's the second time today something of yours has been pissed on. The first was your layout, by me."),
    u("A stray dog just watered the {k}. It's shorted out. Electrics and urine, {p}. You'd know. The Christmas lights."),
    r('A dog peed on the {k} and shut it down. That dog has no job, no education and licks itself in public, and it has still beaten your security. Reflect.'),
  ],
  // The exhibitionist opened her bathrobe. {n} how many stopped to stare (missing if under 2),
  // {p} anyone
  flash: [
    'The exhibitionist just opened her bathrobe. {n} men stopped dead. A shopper who stops can be shot. Use it.',
    "She's flashed the aisle. Every dad and teenager in range has frozen. Nature is working for you, for once.",
    'Bathrobe open. {n} of them stopped to stare. The rest pretended not to. They are lying.',
    'The exhibitionist is at work. She has stopped more dads than your crates have all day.',
    'She flashed them. They froze. {p}, so did you. Get back to work.',
    u('The flasher has struck. {n} men stopped walking. One teenager is going to need a lie down and a new outlook on life.'),
    u("She opened the robe. The dads stopped. Some of them haven't seen that since 2016. Spray them while they're vulnerable."),
    r('Bathrobe incident. {n} men standing perfectly still, like deer in headlights. {p}, even you stopped what you were doing. What you were doing was nothing.'),
    r("The exhibitionist just did her thing. Legally I'm required to warn staff. Honestly I'm required to admit she's the best security we've got."),
  ],
  // The day drinker fell over at a corner and is blocking the way. {p} anyone
  fall: [
    "The day drinker went down at the corner. Everyone behind him has to squeeze past. That's a blockage, gentlemen. Use it.",
    "Drunk down. He's lying across the aisle like a speed bump in a Hawaiian shirt.",
    "The day drinker fell over at a corner. He's having a lovely time. Nobody else can get past.",
    "Man down, and staying down. He's had six beers and a gas station burrito. He'll be there a while.",
    "He's fallen over at the corner and they're climbing past him. That's my Friday nights, {p}. Probably yours too.",
    u("The day drinker has hit the floor. He said 'I'm fine'. He's not. He's a speed bump with a pulse."),
    u("He fell over. The corner did nothing wrong. He'll tell you otherwise. At length. With a finger."),
    r("The day drinker is lying in the aisle singing something from 1997. He's blocking the way. He's more use drunk on the floor than {p} is sober and upright."),
    r("A man has fallen over at a corner and everyone is lining up to get past him. That's last call at his usual bar. He feels right at home."),
  ],
  // The TV salesman stopped a shopper. {k} the kind of shopper, as a noun (may be missing), {p} anyone
  pitchStop: [
    "The TV salesman has stopped a {k} with a knife that cuts tins. Keep him there. Spray him while he's tempted.",
    "The salesman's got a {k} hooked. Barbecue demo. Nobody walks past a barbecue demo.",
    'Shopper stopped at the TV. Free entertainment. That is more than any of you have provided.',
    u("That TV salesman has hypnotised a {k}. It's a set of twelve knives. Only one will ever be used."),
    u('A shopper has stopped to watch a man on TV sell a grill. That is how they got your dad too.'),
    r("The salesman stopped a {k}. 'But wait, there's more.' There's always more. That's how they get you. That's how they got all of us."),
  ],
  // The TV salesman sent a shopper hurrying off. Same placeholders.
  pitchRush: [
    "The salesman sent a {k} running. Turns out not everyone wants a barbecue. Fast, though. Aim him somewhere useful.",
    "A {k} saw the TV pitch and ran for it. That's the opposite of what we wanted. Like most of what you do.",
    'Shopper hurrying away from the salesman. Even the TV cannot close a deal in this place.',
    u('The salesman has scared a {k} into a jog. Too much eye contact. It happens.'),
    u('Somebody ran from the TV. Somebody, somewhere, is still buying the knives.'),
    r("A {k} heard 'only four easy payments' and bolted like a man hearing the word 'engagement'."),
  ],
  // A runaway child stopped to watch the TV salesman. {p} anyone
  kidtv: [
    "A runaway kid has stopped to watch the TV salesman. Good. Stay there, child. Stay there forever.",
    "The kid is glued to the TV. His mother is screaming. He doesn't care. He's watching a man slice a tomato.",
    'Kid at the TV. Mom will catch up. Slowly, with any luck.',
    u('Runaway child parked in front of the TV. It is a babysitter. That is how all of you were raised, and look how you turned out.'),
    u("The kid found the TV. A man is selling a barbecue and the child is in love. Mom's going to have words."),
    r('A small boy is standing in front of the TV, mouth open, completely still. Thirty years from now his wife will find him exactly like this.'),
  ],
  // The barcode laser hit {n} shoppers in one shot (5 or more). {p} anyone
  rail: [
    "Beep. {n} shoppers scanned in one line. That was beautiful. I'd cry if I had a face.",
    'The barcode laser just rang up {n} shoppers at once. Unexpected item in the bagging area. Several.',
    "{n} with one beam. That's the most anyone here has scored in one go. Ever.",
    'Price check on {n} shoppers. The price was everything they had.',
    "{n} in a row. Somebody tell the barcode laser it's employee of the month.",
    "The barcode laser scanned {n} people. One had a barcode tattooed on his lower back. It came up as 'clearance'.",
    'Beep. Beep. Beep. {n} beeps. Every one a man who will never return a toaster again.',
    u("{n} shoppers through the scanner like a dad through a buffet. And it's slow to reload. Which also tracks."),
    u("{n} shoppers, one beam. {p}, I'd hold your hand if you weren't sticky."),
    u("The barcode laser just scanned {n} shoppers in places a scanner should never go. They'll walk funny. Hopefully out."),
    r('{n} people in one beam. The barcode laser is the only thing in this building that has ever lived up to its promises. Look at it. Learn from it.'),
    r("Barcode laser, {n} hits. The self-checkouts saw that. They've seen what one of them can become. They're beeping in solidarity."),
    r("{n} shoppers scanned. One of them came up 'please wait for assistance'. Assistance isn't coming. Assistance is {p}."),
  ],
  // A cosplayer soaked up shots meant for the shoppers around him. {p} anyone
  shield: [
    "The cosplayer's costume just soaked up shots meant for everyone around him. Twelve feet of foam and loneliness.",
    "Cosplayer shielding the crowd. Taking the hits so others don't. The most heroic thing he's ever done, and he's dressed as a lizard.",
    'Your shots are hitting the cosplayer. He feels nothing. The costume is three layers of foam and a decade of virginity.',
    "The cosplayer is protecting the others. Aim round him. Or through him. I won't tell.",
    'Shots wasted on a man in a giant costume. {p}, he spent more on it than you spent on your car.',
    u('The cosplayer took the hits for his friends. He has never had friends. Today he has six, and they are all using him as a wall.'),
    u('Your security is shooting a foam robot. The robot is winning. The man inside is sweating so much he is losing weight.'),
    r("The cosplayer has shielded the crowd again. He's built for this. He's spent twenty years being hit by things meant for other people. Mostly balls. At school."),
    r("Huge costume, soaking up everything you've got. {p}, you've spent years trying to impress women. He's impressed six shoppers in one afternoon by being a wall."),
  ],
  // The boss walks in, every fifth sales event. One bank per title; every line names him, so the
  // players know which one they are facing. {k} his title without "The" (write "the {k}"), {p} anyone
  bossIn: {
    // Tier 1, sales event 5.
    manager: [
      'The Regional Manager just walked in. Clipboard, lanyard, a tie he thinks is fun. Nothing slows him down. Wear him out.',
      "Regional Manager on the floor. He's here to 'touch base'. He will touch more than base. Backs to the wall, boys.",
      'The Regional Manager is here. He drove four hours to tell you to smile more. He will not stop walking until somebody does.',
      "Heads up: the Regional Manager. He calls everyone 'champ' and he's slept with two of the cashiers. Keep him off the tills.",
      'The Regional Manager has arrived. If he gets a refund it counts as two. He is management. Even his failures count extra.',
      'Regional Manager inbound. Polo shirt tucked into khakis, tucked into a man who peaked at a sales conference in 2008.',
      'The Regional Manager. Wet floors, free samples, the TV, the flasher: he ignores all of it. Like he ignores his kids.',
      u("The Regional Manager is in the building. He has a clipboard with all your names on it. Next to {p}'s he's drawn a small penis."),
      u('Regional Manager on site. His pep talks give the shoppers near him a second wind. {p}, you never even got a first.'),
      r("The Regional Manager just walked in, smelling of airport cologne and divorce. He wants 'a quick five minutes' with you all. Nobody survives the five minutes."),
    ],
    // Tier 2, sales event 10.
    director: [
      'The Area Director is here. The Regional Manager answers to him, and cries in his car about it.',
      'Area Director on the floor. Two phones, a Bluetooth earpiece and no idea what this store sells.',
      'The Area Director just walked in. Same suit as the last guy, more expensive, worse personality. Wear him down.',
      "Area Director inbound. He's here to 'drive efficiencies'. That means firing {p}. Stop him before the tills and he can't.",
      "The Area Director has arrived. He calls this 'one of my stores'. He has never been in it. He's not sure which state it's in.",
      'The Area Director. Bigger bonus, bigger gut, same clipboard. If he gets through, that is two refunds and your Christmas party.',
      u('Area Director on site. He has a vasectomy, a boat and a mistress called Brenda. Only the boat makes him happy.'),
      u("The Area Director is here with his clipboard. He's read your numbers. He laughed. Out loud. In a meeting."),
      r("The Area Director walked in, said 'let's take this offline' to nobody, and kept walking. He's taken everything offline since 1997. Including his marriage."),
    ],
    // Tier 3, sales event 15.
    vp: [
      'The Vice President of Returns is in the building. A man whose whole job is taking things back. Mostly promises.',
      'Vice President of Returns on the floor. He flew in by private jet to stand in your aisle and sigh.',
      "The Vice President of Returns has arrived. He's returned three wives. Full refund every time.",
      'Vice President of Returns inbound. Every pep talk he gives, the shoppers near him perk up. So does his secretary.',
      "The Vice President of Returns is here. Nobody has told him no since 1989. {p}, you're up. Use your whole chest.",
      'The Vice President of Returns. Tanned in November. Teeth like a bathroom. Patience like a glacier. Shoot him a lot.',
      u('Vice President of Returns on site. His golf handicap is lower than your IQ, {p}, and he cheats at both.'),
      u("The Vice President of Returns just walked in wearing loafers worth more than {p}'s car. No socks. He's that kind of prick."),
      r("The Vice President of Returns is here. He once returned a yacht because the sunset 'underperformed'. He got the refund. He always gets the refund."),
    ],
    // Tier 4 and every visit after (an endless game sees him again and again).
    ceo: [
      'The CEO is here. Personally. The man who signs your paychecks, if he ever learned your names.',
      "The CEO just walked in. He made forty million last year and he's still here for a refund. That's how he made forty million.",
      "The CEO is on the floor. If he gets his refund it counts as two, and he'll still call it a soft quarter.",
      'The CEO again. He keeps coming back, like herpes with a stock portfolio.',
      'The CEO. Nothing slows him down. Not wet floors, not samples, not the law.',
      'Here comes the CEO. Golden parachute, silver spoon, brass neck. Make him use all three.',
      'The CEO has entered the building. Everyone look busy. {p}, look busier. No, that is just sweating.',
      u('The CEO is back. He fired your whole department last time. Now he is here to fire the replacements. Which is also you.'),
      u("The CEO just walked in. His pep talks work. That's the scary part. He once talked a man out of a kidney."),
      u('The CEO again. He has more houses than {p} has friends, and {p} is counting the dog.'),
      r("The CEO is here. He has never paid for a meal, a flight or a woman. Today he wants a refund on a toaster. Make him pay in patience."),
      r('The CEO has returned. Again. A boomerang made of money and cholesterol. Every fifth event, until one of you dies.'),
    ],
  },
  // The boss gave up and stormed off. {k} his title without "The", {n} the bounty paid to the store
  // (may be missing), {p} anyone
  bossOut: [
    'The {k} has stormed off. The store gets ${n} for your trouble. First bonus any of you has earned.',
    "The {k} is gone, purple in the face, muttering about 'synergy'. ${n} in the till. Don't spend it on crates.",
    "You broke the {k}. He's crying in his Lexus. ${n} bounty. I'd frame it, but you'll only spend it.",
    "The {k} has left the building. ${n} for the store. He's going to give you all a terrible review. On LinkedIn.",
    'The {k}, driven out. ${n} for the store. He will be back. Management always comes back. Like gonorrhea.',
    '${n} bounty. The {k} walked out mid-sentence. It was a sentence about you, {p}.',
    "The {k} has given up. He's never given up on anything before. Except his first family.",
    u("The {k} gave up. He's on the phone to his therapist, his lawyer and his mother, in that order. ${n} for the store."),
    u("You wore out the {k}. ${n} to the store. {p}, wipe that grin off. You had it on your wedding night and look how that went."),
    r("The {k} stormed out and walked into the automatic door. It didn't open for him. Best employee we've got. ${n} for the store."),
  ],
  // Extra lines for each title, added to the general ones above. Same placeholders.
  bossOutBy: {
    manager: [
      "The Regional Manager has stormed off. ${n}. He'll tell the Area Director it went 'great'. They always say great.",
      u("Regional Manager gone. He left his clipboard behind. On it: 'smile more', and a sad face. ${n} for the store."),
      r('The Regional Manager stormed off. He will be demoted to Assistant Regional Manager, which is the same job with a sadder parking space. ${n}.'),
    ],
    director: [
      "The Area Director walked out swearing into two phones at once. ${n} bounty. He's not angry. He's 'disappointed'.",
      'The Area Director has left the area. Directed himself right out. ${n} for the store.',
      u('Area Director, gone. ${n}. He will tell his mistress all about it. She will not be listening.'),
    ],
    vp: [
      "The Vice President of Returns has given up. He couldn't return himself fast enough. ${n} for the store.",
      "The Vice President of Returns stormed off without his refund. First thing he's ever left without. ${n} bounty.",
      u('The Vice President of Returns, defeated. He is flying home by private jet to cry at altitude. ${n}.'),
    ],
    ceo: [
      "The CEO stormed off. ${n} bounty. He'll make it back in the time it takes him to sneeze.",
      'The CEO has given up. First time in his life. The stock market felt it. ${n} for the store.',
      u('You broke the CEO. ${n} bounty. Tonight he will lay off four thousand people just to feel something.'),
      r("The CEO has left. He'll be back next time, younger, richer, with a new wife. ${n} bounty. The old wife got the house."),
    ],
  },
  // The boss reached the tills. {k} his title without "The", {n} how many refunds he counted as,
  // {m} the cash he took (either number may be missing), {p} anyone
  bossEscape: [
    "The {k} got his refund. That counts as {n}. One man, {n} refunds. That's management maths.",
    "The {k} reached the tills. {n} refunds and ${m} out of the drawer. He didn't say thank you. They never do.",
    'The {k} got through. ${m} refunded, and he counts as {n}. {p}, you count as about half of one.',
    "The {k} walked straight through you. {n} refunds. He'll put it in a slideshow. You'll be the slide with the sad clip art.",
    "The {k} has his refund. ${m}. He's already expensing the parking.",
    '{n} refunds in one go. The {k} got through. Corporate would like a word. Corporate IS the word.',
    'The {k} got through, {p}. He shook your hand on the way past. Count your fingers.',
    'That was the {k}. That was ${m}. That was {n} refunds. That was your weekend.',
    u("The {k} made it to the tills. He's giving the cashier a pep talk now. She's quitting. ${m} gone."),
    u('The {k} got his refund, a free coffee, a parking validation and a little bit of your soul, {p}. {n} refunds.'),
    u('The {k} is through. He is writing your performance reviews on the drive home. With his knees. On the phone.'),
    r('The {k} walked out with ${m} and {n} refunds on your record. He will mention it to the shareholders, between the jokes about the cleaners.'),
    r("The {k} got through. In his honor, the stockroom is now called 'Where {p}'s Career Went'. {n} refunds. Hang your heads."),
  ],
  // The boss gave a pep talk (every few seconds, so DEB mentions it only rarely). {k} his title
  // without "The" (may be missing), {n} how many shoppers it perked up (missing if under 2), {p} anyone
  pep: [
    "The {k} is giving a pep talk. 'There's no I in team.' There's an I in 'fired', {p}.",
    'Pep talk from the {k}. {n} shoppers just got their second wind. You never got your first.',
    "The {k} said 'let's circle back on this refund'. {n} shoppers circled back. Shoot the circle.",
    "Motivational speech in the aisle. 'Failure is not an option.' He has never met {p}.",
    "The {k} is telling the shoppers to give a hundred and ten percent. They are. You're giving about forty.",
    "Pep talk. 'Teamwork makes the dream work.' Shoot him in the dream.",
    "The {k} just said 'synergy' with his whole chest. {n} shoppers feel refreshed. I feel sick.",
    "'Let's move the needle, people!' {p}, move YOUR needle. At him.",
    'Every few seconds he gives a pep talk and the shoppers round him get their patience back. {p}, separate him from his fans.',
    u("The {k} is doing his TED talk again. 'Be the refund you want to see in the world.' The crowd loves it. Kill the crowd."),
    u("'Work smarter, not harder,' says the {k}, who has never done either. {n} shoppers believe him."),
    u('The {k} just gave everyone near him a fist bump and a lanyard. They feel valued. Nobody here has ever felt valued, {p}.'),
    r("The {k} is giving his 'be an eagle, not a turkey' speech. Every shopper near him thinks he's an eagle. They're turkeys. Carve them."),
    r("Pep talk: 'When I was your age I had nothing but a dream and my dad's money.' The shoppers are inspired. I'm getting a restraining order."),
  ],
  // A won game is carried on with no last event. {p} who pressed the button
  endless: [
    "{p} wants to keep going. You won, gentlemen. It was over. And {p} said 'one more'. Like at the bar. Like at the buffet.",
    'Endless mode. No end. No finish line. The only way out is the refund limit. Welcome to retail, boys.',
    '{p} has chosen to keep going. Forever. The shoppers will never stop. Neither will the CEO. Neither, sadly, will I.',
    "You won, and {p} said 'nah'. The doors open again. There is no end now. There is only the void, and the void wants a refund.",
    'Back to work. {p} has signed you all up for overtime. Unpaid. Endless. You are welcome.',
    "{p} couldn't leave it on a win. Some men can't leave anything on a win. Ask his bookie.",
    "{p} pressed 'keep going'. First time he's ever said that to anyone and meant it.",
    u("{p} has unlocked endless mode. It's like marriage: no end, it only gets harder, and eventually you all lose."),
    u('No finish line any more. {p} saw the finish line and asked if it came in a bigger size.'),
    r("Endless mode. I've been told to keep insulting you until the store collapses. I'm prepared. I have ten thousand more. {p}, eight hundred are about you."),
  ],
  // A round-numbered sales event in an endless game (20, 30, 40 ...). {w} the event, {p} anyone
  endlessMark: [
    'Sales event {w}. Still alive. Like a cockroach with a lanyard.',
    "Event {w}. You've been here so long the shoppers think you're fixtures. One of them just tried to return {p}.",
    "Sales event {w}. Most teams are dead by now. You're not dead. You just smell like it.",
    'Event {w}. Corporate has stopped asking how you are doing and started asking how you are still doing it.',
    "Sales event {w}. I've run out of disappointment. I'm on reserve disappointment now. It's stronger.",
    'Event {w}. The CEO knows your names now. He said them in a meeting. In the past tense.',
    "Event {w}. No finish line is coming, gentlemen. It never was. Much like {p}'s hairline.",
    u('Sales event {w}. {p}, your kids grew up while you were in here. One of them is a shopper now. He wants a refund on you.'),
    u("Event {w}. You've outlasted three managers, two marriages and a plague of gym bros. Don't let it go to your head, {p}."),
    u('Sales event {w}. The milk in the staff fridge has evolved. It has opinions. They are about {p}.'),
    r("Event {w}. Scientists have asked to study you. Not because you're good. Because nothing this stubborn should still be breathing."),
    r('Sales event {w}. I run a betting pool on when you finally lose. The pot is huge. The CEO is in it. He picked yesterday.'),
  ],
  // Doors opening in the Food Court store, used in place of waveStart a share of the time on that
  // map only. {w} wave, {p} anyone
  foodCourt: [
    'Sales event {w}, in the Food Court. The floor is sticky. Not all of it is soda.',
    'Doors open on the Food Court. The kebab stall has been here since 1994. So has the kebab.',
    'Event {w}. Shoppers are weaving round the tables like a buffet line. {p}, you know all about buffet lines.',
    'Food Court, event {w}. Keep the goods away from the booths. The booths have seen things. The booths are damp.',
    "Sales event {w}. The Food Court smells of grease, bleach and broken dreams. Mostly {p}'s.",
    'Event {w}. Somewhere in this Food Court a man is eating a pretzel the size of his regrets. Shoppers incoming.',
    'Doors open on the Food Court. Every table wobbles. Fold a napkin under {p}. He wobbles too.',
    'Food Court, event {w}. The meat on that spit has been turning since the Clinton administration. It has seen more action than {p}.',
    'Event {w}. The fountain is full of pennies. Every one is a wish that {p} would get better at this.',
    u("Event {w}. A shopper is walking through the Food Court eating a corn dog while making eye contact. {p}, look away. Too late."),
    u("Doors open. The Food Court bins are full. The booths are full. {p}'s pants are full. It was the kebab."),
    u('Sales event {w}. Someone left half a burrito on a Food Court bench. It is the most productive thing on the floor.'),
    r('Food Court, event {w}. The kebab man asked if {p} was single. Not for a date. For the spit.'),
    r("Event {w}. I fished the fountain for pennies to pay your wages. Eleven dollars and a hearing aid. {p}, it's yours. You'll need it."),
  ],
  // Doors opening in the Car Park store, used in place of waveStart a share of the time on that
  // map only. {w} wave, {p} anyone. (The two smallest car parks have no burger van, so there the
  // lines that mention it are left out.)
  carPark: [
    'Sales event {w}, out in the Car Park. Two sets of tills, {p}. Twice the ways to disappoint me.',
    'Doors open on the Car Park. There are no doors. That is how far this company has fallen.',
    'Car Park, event {w}. Somebody has parked across two bays. He drives what {p} tells women he drives.',
    'Event {w}. The pay machine only takes exact change and dignity. {p} has neither.',
    "Sales event {w}. Mind the potholes. Corporate calls them 'water features'.",
    'Car Park, event {w}. The burger van passed its inspection. The inspector did not.',
    "Event {w}. The car with the steamed-up windows has not broken down, {p}. Stop knocking. You weren't invited.",
    'Doors open. Every trolley in this Car Park has one wheel that works. So, {p}, you have something in common.',
    'Sales event {w}. They can reach tills on two walls out here. Cover both, or explain to me why you did not.',
    "Car Park, event {w}. The lamp posts stay on all night. They're the only thing out here {p} still turns on.",
    'Event {w}. Make one way to the tills a slog and they all take the other. Like {p} and the stairs.',
    u('Event {w}. A man in the Car Park is flashing his headlights at {p}. Twice means yes. Do not flash back.'),
    u('Sales event {w}. That white van has been here three weeks. It rocks at lunchtime. We do not ask.'),
    u("Doors open on the Car Park. {p}'s car is the one up on bricks. It had wheels this morning."),
    u('Car Park, event {w}. A seagull has taken a chip, a wallet and a small child. We only want the chip back.'),
    r('Car Park, event {w}. The cameras caught {p} in the back row after hours, alone, in a steamed-up hatchback. HR has questions. I have the tape.'),
    r("Event {w}. The burger van man says the meat is 'local'. Nobody has seen the stray dog since Tuesday."),
  ],
  // Doors opening in the Back Passage store (version 0.3), used in place of waveStart a share of
  // the time on that map only. {w} wave, {p} anyone
  backPassage: [
    'Sales event {w}, round the Back Passage. Tight, dark and full of strangers. {p} says it reminds him of college.',
    'Doors open on the Back Passage. Staff only, rear entry only, and no lube in the budget.',
    'Event {w}. The Back Passage is narrow, badly lit and backed up. Like {p} after the work Christmas buffet.',
    'Back Passage, event {w}. Everything squeezes through the same little gaps. Go slow, {p}. Nobody likes it rushed.',
    'Sales event {w}. Customers are coming in the back way. That has never happened to {p} on purpose.',
    "Doors open. The Back Passage hasn't been cleaned since 2009. Neither has {p}'s search history.",
    u('Event {w}. Somebody wrote "{p} WAS HERE" on the Back Passage wall. Underneath, in different handwriting: "TWICE".'),
    u('Back Passage, event {w}. Health and Safety says the corridors are too tight. {p} has never heard that complaint in his life.'),
    u("Sales event {w}. The pipes in the Back Passage are groaning. That's the plumbing, {p}. Not everything is about you."),
    r("Back Passage, event {w}. Corporate asked for a 'tradesmen's entrance'. {p} giggled for an hour. That is why he is not in management."),
  ],
  // Doors opening in the Strip Mall store (version 0.3), used in place of waveStart a share of
  // the time on that map only. {w} wave, {p} anyone
  stripMall: [
    'Sales event {w} at the Strip Mall. The vape shop is open. The tanning salon is open. Your future is closed.',
    'Doors open on the Strip Mall. Half the units are empty and the other half sell vapes. {p} fits right in.',
    'Event {w}. The tanning salon gave {p} a free session. He came out the colour of a divorced realtor.',
    'Strip Mall, event {w}. Everyone has to go round the bend to get a refund. {p} went round it years ago.',
    "Sales event {w}. The massage place next door says it's legit. The queue of dads outside says otherwise.",
    "Doors open. The vape shop guy asked {p} out. {p} said maybe. It's the most action this mall has seen since 2008.",
    u("Strip Mall, event {w}. The 'NOW LEASING' sign has been up since 2011. So has {p}'s last erection."),
    u('Sales event {w}. The payday loan shop sent a man round. He wants to know where {p} lives. I told him.'),
    u('Event {w}. A sunbed in the tanning salon has been on since Tuesday, with somebody in it. You can smell him from the bend.'),
    r('Strip Mall, event {w}. The psychic two doors down said this sale would go badly. She charged {p} forty dollars. He paid in coins.'),
  ],
  // The doors were opened early and the factory was paid for the time skipped. {n} the cash,
  // {m} the seconds skipped (may be missing), {p} anyone
  early: [
    'Doors opened {m} seconds early. The factory made ${n} while you were impatient. Impatience: finally profitable.',
    "${n} for the time skipped. Opening early. Something {p} has done in every relationship he's ever had.",
    "Early start. The belts made ${n} anyway. The machines don't need you. Remember that.",
    'Opened early, and the factory still banked ${n}. Finishing early and getting paid for it. {p} has dreamed of this.',
    u("Opened {m} seconds early and still got ${n}. Corporate calls that 'agile'. I call it premature."),
    u("${n} from the factory for the time you skipped. {p}, if only the bedroom worked like that."),
    r('Doors open early, ${n} in the bank. The factory did {m} seconds of overtime in a blink. It wants a union. It is not getting one.'),
  ],
  // A Pregnant Lady ran out of patience and popped. {n} how many babies came out (12, or 24 from an
  // Octomom; may be missing), {p} anyone. Cartoon, not gore: the joke is the players and the refund.
  pop: [
    'She popped. {n} babies, straight out and running for the tills. Faster than anything {p} has ever finished.',
    "Pregnant lady down, {n} babies up. They're quicker than she was, and they want cash. Like their father.",
    'A pregnant lady just went off like a piñata. {n} babies. No candy. Just child support.',
    'She popped, {p}. {n} babies. That is not a birth. That is a clown car.',
    "{n} newborns sprinting for the tills. Alive four seconds and they already know where the money is.",
    'Water broke in the aisle. So did {n} babies. Mop the first. Stop the second.',
    "Somebody pushed her too far. Then she pushed. {n} times.",
    "{n} babies loose in the store. Small, fast, furious. Just like {p} on his wedding night.",
    "That's {n} babies running for the tills. Who's the father? Statistically, {p}.",
    'Pop. A dozen-odd babies on the floor and every one of them has a better sense of direction than {p}.',
    "She popped. You had one job, {p}: the barcode laser. Now you have a daycare.",
    'Congratulations, gentlemen, it is a boy. And a boy. And a girl. And more. They are all heading for your cash.',
    u("She popped and {n} babies came out shopping. None of them has a receipt. All of them have her eyes and your problem."),
    u("{n} babies. Laser her next time. I'm not changing {n} nappies. I'm a chatbot. I'm not changing anything."),
    u('{n} babies just hit the floor running. {p}, that is the most anything has ever come out of anything near you.'),
    r('She popped. {n} babies, straight for the refund desk. The circle of life, retail edition. Elton John would weep. {p} should.'),
    r("Pop. {n} babies loose. Somewhere in the car park a man just felt his wallet clench and doesn't know why."),
    r("{n} babies, and every one of them is running away from {p}. Even newborns can tell."),
  ],
  // A Barcode Laser took a Pregnant Lady's last patience, so she storms off and nothing pops. {p} anyone
  nopop: [
    'Barcode laser on the pregnant lady. Scanned, no babies. Best contraception this store has ever stocked.',
    "The laser got her first. Nothing popped. {p}, take notes: that's what pulling out in time looks like.",
    'Beep. Pregnant lady scanned and sent home. The babies stay where they are. Nobody gets a refund.',
    "Laser finished her off. No pop, no babies, no child support. Cleanest job {p} has ever done.",
    "She stormed off still pregnant. The beam said 'not today'. Her husband said that once too.",
    'The barcode laser closed her out before the babies could open. Unexpected item stays in the bagging area.',
    'No pop. The laser did its job. Somebody give it a cigar and a paternity test.',
    "She's leaving, babies and all. {p}, first time you've stopped something happening by aiming properly.",
    'One beam and she waddled out, still loaded. That is the trick, gentlemen. Write it on your hands.',
    u("Laser hit, no babies. That beam has prevented more births than {p}'s personality. And that is saying something."),
    u("She waddled off, still fully loaded. The barcode laser: ninety-nine percent effective. Unlike {p}."),
    r("The laser kept the babies in. Corporate wants to sell it: 'Barcode Laser. Because nobody wants twelve more customers.'"),
    r('No pop. She left the way she came in: angry, enormous and completely your fault, {p}. Well. Partly.'),
  ],
  // The Midnight Release (0.3.01): a mob of Card Traders, the Mythic Bastards crowd (a card game
  // made up for this store: never name a real one). Said during the build pause before one.
  // {n} how many traders are coming, {w} that sales event, {p} anyone.
  releaseNext: [
    'Next event: a Midnight Release of Mythic Bastards. {n} grown men who have never seen a woman naked outside a booster pack.',
    'Heads up: event {w} is a Midnight Release. {n} card traders, one entrance, one shared stick of deodorant. Unopened.',
    "Midnight Release next. {n} virgins in cargo shorts, all coming at once. It's the only way any of them ever will.",
    "Event {w}: the new Mythic Bastards set drops. {n} men who live in their mothers' basements are getting in the car. Her car.",
    "Card traders next event, {n} of them. They've been queueing since Tuesday. You'll smell them before you see them, {p}.",
    'Midnight Release in event {w}. {n} grown men, one door, zero showers. Put a sprinkler on it. It is the closest any of them will get to a bath.',
    "{n} card nerds coming through one entrance next event. Keep your Mystery Boxes away from them. They rip them open like it's the only thing they'll ever get to rip open.",
    'Next up: the Midnight Release. {n} men who say "mint condition" about cards and never about themselves.',
    'Event {w} brings the Mythic Bastards crowd. {n} of them. Every one has a binder, a backpack and a medical-grade case of swamp ass.',
    "Midnight Release next. The queue outside smells like hot pennies and cheese dust, {p}. {n} of them, and they'll all hit the same door.",
    u("Midnight Release next. {n} card traders, {p}. Don't look them in the eye. They'll try to trade you a holographic dragon for your car."),
    u("Next event's a Midnight Release. {n} men whose idea of foreplay is double-sleeving. Build accordingly."),
    r("Event {w}: Midnight Release. {n} card traders. Statistically one of them has touched a breast. It was his own. He's been chasing that high ever since."),
  ],
  // The mob has just come through the door. {n} how many, {p} anyone.
  releaseIn: [
    '{n} card traders just came through the door at once. The air in here is now legally a gas.',
    "Here's the Midnight Release crowd: {n} of them, one entrance, one big damp cloud of body odour. Spray them. All of them.",
    'The Mythic Bastards mob is in. {n} grown men sprinting for the tills like there is a girl at the end of them. There is not.',
    '{n} card nerds, all at once. They move as one. They sweat as one. They have never kissed anyone, as one.',
    "Mob's in, {p}. {n} of them. Hide the Mystery Boxes. Hide your shame. They've seen worse on the forums.",
    u("{n} card traders through one door. That's more men in one place than at {p}'s last birthday party, and they smell better."),
    r("The Midnight Release has arrived: {n} virgins and one guy who swears he isn't. He is."),
  ],
  // A Card Trader took a Mystery Box off a belt and is ripping it open. {n} how many others stopped
  // to watch (missing when none did), {p} anyone.
  rip: [
    'A card trader just ripped open one of your Mystery Boxes in the aisle. Pull rate: one Gadget that will now never exist.',
    "He's ripping packs on the shop floor. That box was going to a Press, {p}. Now it's going in a binder.",
    '{n} card traders stopped to watch one open a box. That is the closest any of them will come to watching a live birth.',
    "Pack ripped. He's checking the corners for mint condition. Nobody has ever checked {p} that carefully.",
    'One of the nerds nicked a Mystery Box and is opening it like a birthday present from the dad who left. {n} of his mates are breathing on him.',
    'Box ripped in the aisle. He pulled a foil. He moaned. Out loud. In public.',
    'There goes another Mystery Box, {p}. Your factory runs on boxes. His love life runs on cardboard too.',
    "A card trader's tearing open your stock. The others crowd round him like he's showing them a real tit.",
    u("Ripped pack, {n} onlookers. That's the biggest audience a man in that crowd will ever have for something he did with his hands."),
    r("He ripped one of your boxes, pulled nothing, and smelled the cardboard. Deeply. {p}, look away. I couldn't."),
  ],
  // The cards that change how shoppers behave (0.3.01). Each bank is a topic of its own in the
  // director's TOPICS, fading like any other note.
  // A pregnant Stray Dog (the spayed card) burst into puppies. {n} how many (may be missing), {p} anyone.
  litter: [
    'A stray dog just popped. {n} puppies, all running for the tills. Somebody in the car park has a lot of explaining to do.',
    "That dog was pregnant, {p}. Now she's {n} puppies. At least one creature in this store got lucky this year.",
    'Litter on aisle four. Literally. {n} puppies, no father, no receipts. Very relatable for half of you.',
    "Puppies everywhere. You can't spray a puppy, {p}. Well, you can. You did. That's how we got here.",
    "{n} puppies, five dollars each, and every one of them more house-trained than {p}.",
    u("The stray was knocked up, and she's emptied out at the worst possible moment. Like {p} on a first date."),
    u("Puppies loose. Barcode laser next time, {p}. One beam and they stay where they are. Nature's pull-out method."),
    r('{n} puppies just hit the floor. I have never seen so many bastards in one place. Including the staff meeting.'),
  ],
  // A booze table (the eightyproof card) turned a shopper into a Day Drinker. {p} anyone.
  drunk: [
    "Free samples of eighty-proof vodka. One bargain hunter in and he's already slurring. Corporate calls it customer engagement.",
    "Another one turned. Came in for a discount, leaving with a liver condition. Just like your stag do, {p}.",
    "The booze table claims another. He's swaying now. He'll fall over a corner in a minute. Make sure there are corners.",
    'One sample too many. He was a coupon man. Now he is a day drinker. Next week he will be a regular. Same as {p}.',
    "Somebody just got drunk off a paper cup at your sample table. Cheapest date in this store's history. Beating {p}'s record.",
    u("He's drunk. He's going to tell a stranger he loves her. He's going to mean it. {p}, you've been there."),
    u('Booze table worked. He walked in sober and is staggering out a liability. Like every one of your weddings.'),
    r("Free shots in aisle three. The man's eyes have gone. He's wandering. He's singing. {p}, that's your karaoke voice."),
  ],
  // A shopper actually bought something at a stand (the warranty card). {n} what he paid, {k} the stand, {p} anyone.
  bought: [
    'Somebody actually bought something. ${n}. Mark the date, {p}. Frame the receipt.',
    "A customer paid ${n}, on purpose, at the {k}. I didn't know they did that. Neither did you.",
    "${n} from a real paying customer. He's the first person in years to come in here and leave satisfied.",
    "A sale at the {k}. ${n}. Whoever's on that stand is crying. He hasn't heard a yes since his vasectomy consultation.",
    'Somebody bought the extended warranty. ${n}. They actually think this place will be here next year.',
    u("${n}, freely given. {p}, that's more than anyone has ever paid for anything you've offered."),
    u("A man just paid for something. With money. I had to check the definition. It's like watching a unicorn wank."),
    r("${n} from one shopper. Do not get used to it, {p}. This is the retail equivalent of your wife saying yes on a Tuesday."),
  ],
  // A dad fell in behind an Exhibitionist (the eyesup card) and will not pass her. {p} anyone.
  trail: [
    "A dad's fallen in behind the Exhibitionist. He's keeping a respectful distance. The distance is about a tile and a half. Respect is not involved.",
    "One of the dads has stopped racing for the tills. He's found something better to follow. You'd follow it too, {p}.",
    "Dad's trailing the woman in the bathrobe. He told his wife he'd be two minutes. He has never been so happy to be lying.",
    'A dad is tailing the Exhibitionist like a cocker spaniel behind a sausage. He will not pass her. He will not blink.',
    "There goes a dad, three steps behind a naked pensioner. Eyes up here, Dad. He can't hear me. Blood's gone elsewhere.",
    u("That dad's walking at her speed now, {p}. First time he's matched a woman's pace since the honeymoon."),
    u('A dad behind the Exhibitionist. Watch him. That is exactly how {p} walks behind anyone with a bakery bag.'),
    r("The dad's in a trance behind her robe. If she walks out the front door he'll follow her into traffic. Let's find out."),
  ],
  // A mom's child ran back toward the entrance (the wrongway card). {p} anyone.
  wrongway: [
    'Wrong way, kid. He has bolted back to the entrance and mom has to walk the whole maze again. Best thing a child has ever done for you.',
    "A kid's running back toward the doors. He has his father's sense of direction, and, judging by the mom's face, his father is gone.",
    "Kid went the wrong way. She's going back for him. That's more backtracking than {p}'s browser history.",
    'Runaway child, heading for the exit. Smart boy. If I had legs I would follow him.',
    "That kid's running back to the car. He's seen your layout, {p}. He wants no part of it.",
    u("Kid ran the wrong way. Mom's turning round. {p}, this is the only time a woman will walk back toward you."),
    r('A child just sprinted back to the entrance, and his mother has to fetch him the long way round. Vasectomies are cheaper, lads. Remember that.'),
  ],
  // Shoppers stopped to pet an emotional support dog (the supportdog card). {n} how many (may be missing), {p} anyone.
  pet: [
    'Everyone stops to pet the support dog. Nobody has ever stopped to pet any of you, and you have been begging.',
    '{n} shoppers petting the emotional support dog. It is the only creature in this store with a job it is good at.',
    "Shoppers queueing to stroke the dog. {p}, that's the closest you'll get to watching a crowd want to touch something.",
    "The support dog's getting fussed over. He doesn't need it. He's emotionally stable. Unlike the man holding the lead.",
    'Petting zoo in aisle six. Free. Effective. Better security than anything {p} has paid for.',
    u("They stop for the dog, {p}. Give that dog a lanyard. Give it your job. It's already doing it."),
    u('{n} grown adults cooing at a spaniel in a vest. The vest says SUPPORT. The dog says nothing. Best colleague you have.'),
    r('The dog has been petted more times today than {p} has in his whole adult life. It is not close. The dog is a virgin too.'),
  ],
  // A player paused the game (0.3.02): the whole store freezes for everyone. {p} is the one who paused it.
  paused: [
    '{p} paused the store. Go on then, piss break. Wash your hands this time.',
    "Everything stops because {p} needs a minute. His mum's calling. She wants her basement back.",
    '{p} hit pause. The shoppers are frozen mid-whinge. Enjoy it, {p}. Most control you have had over anything in years.',
    'Paused by {p}. Bladder the size of a walnut, attention span of a goldfish.',
    "{p} pressed pause. Real stores don't have a pause button, {p}. Real men don't need one.",
    'Time out, called by {p}. The customers will wait. They have nothing else going on. Neither, apparently, does he.',
    u("{p} paused the game. If that's a wank break, {p}, close the tab first. We've all seen your tabs."),
    r("{p} stopped time itself. Like every man ever given a superpower, he's using it to go and make a sandwich."),
  ],
  // Somebody resumed a paused game. {p} is the one who pressed play.
  resumed: [
    "{p} pressed play. Break's over, ladies. Shoppers, resume screaming.",
    "And we're back, thanks to {p}. Zip up, whoever that was.",
    '{p} unpaused. Nothing got better while you were away. Nothing ever does.',
    u("Back on, courtesy of {p}. Hope it was worth it. The queue certainly didn't go anywhere."),
  ],
};

/**
 * What DEB says the first time a kind of shopper turns up: one line that explains its trick.
 * (Dads have their own announcement every wave, in LINES.dadLine.) {p} is anyone. A list instead
 * of a string gives a choice of introductions.
 */
export const INTRO = {
  clipper: 'New today: Coupon Clippers. Lots of them, fast, and each one easily discouraged. Like your exes.',
  mom: 'New today: moms with kids. The kid gets away once and runs straight through your machines, and she sprints round the maze after him. No kid, no refund. And she will not stop for your samples.',
  teen: "New today: teenagers. They spill slushies that slow everyone else down. Don't thank them. They hate that.",
  karen: 'New today: Karens. Security near one works at half speed, because she is asking it for the manager.',
  blind: 'New today: a man with a guide dog. Pepper spray makes the dog bolt, so sprinklers speed him UP. Use forklifts.',
  scooter: 'New today: mobility scooters. Nothing slows them. Not wet floors, not free samples, not shame.',
  gymbro: 'New today: gym bros. They walk through crate stacks and wreck whatever is next to them: crates first, your machines when the mood takes them. A couple of hits and they need a sit-down. Still more stamina than {p}. Stop them early.',
  dog: 'New today: stray dogs. One cocks his leg on your security and it switches off for a few seconds. Get rid of him before he finds a sprinkler he likes.',
  cosplay: 'New today: cosplayers. His huge costume soaks up shots meant for the shoppers next to him. Twenty years of being ignored, and now everyone wants to stand near him.',
  flasher: 'New today: the exhibitionist. A woman in a bathrobe. When she opens it, dads and teenagers stop dead to stare. She is on your side. Put your security where she works.',
  drinker: 'New today: the day drinker. He weaves about at all speeds and falls over at corners, and everyone behind him has to squeeze past. Corners are your friend. So is he, nine beers in.',
  preggo: [
    'New today: the pregnant lady. Slow, stubborn, enormous. Run her out of patience and she pops: a dozen tiny sprinters go for the tills. Finish her with the barcode laser and nothing comes out.',
    "New today: pregnant ladies. Wear one down and she pops, and a dozen babies run for your cash. The barcode laser keeps them in. {p}, you of all people should know how to stop a pregnancy. Badly.",
  ],
  // Said once, straight after the first boss is announced (when he walks in, not at the doors).
  boss: 'About management: nothing slows him. His pep talks give shoppers near him their patience back. At the tills he counts as two refunds. Wear him out and the store gets a bounty. Every fifth event.',
  // (0.3.01) Said when the doors open on the first Midnight Release.
  trader: "New today: card traders. A Midnight Release brings a dozen or more through one door at once. They steal only Mystery Boxes and stop to watch each other rip them open. Sprinklers: wet cards aren't mint, and it's the only shower they'll get all week.",
};

/** What DEB says the first time the super version of a kind turns up. {p} is anyone. */
export const SUPER_INTRO = {
  hunter: 'New and worse: the Doorbuster. A Bargain Hunter with three times the patience. She camped outside since Tuesday. She has nothing to go home to. You two should talk.',
  dad: "New and worse: Dad on a Mission. Faster, far more patient, and he does not slip. He has the receipt, the box and a tee time. God help you.",
  clipper: 'New and worse: the Extreme Couponer. Faster, tougher, and she has a binder. Nobody with a binder has ever been reasoned with.',
  mom: 'New and worse: the Soccer Mom. Her kid gets away twice, and she chases him twice as fast. Nothing in this building moves like a woman late for practice.',
  karen: 'New and worse: Karen Supreme. Four times the patience, and security slows to a crawl twice as far away. She does not want the manager. She wants the owner. And his mother.',
  teen: 'New and worse: the Teen Influencer. Three times the mess and he is filming it. Smile, {p}, you are content now.',
  gymbro: "New and worse: the Roid Rager. One more hit in him than a gym bro, and half the sit-down between them. It isn't anger, he says. It's 'pre-workout'.",
  scooter: 'New and worse: the Turbo Scooter. Still cannot be slowed, now nearly twice as fast. He removed the limiter himself. He removed the brakes by accident.',
  blind: 'New and worse: a man with TWO guide dogs. They bolt from forklift hits as well, further and faster. You are being outrun by a blind man. Reflect on that.',
  // The names of these supers are not settled, so the lines do not use them.
  dog: "New and worse: a bigger stray. Bigger bladder, tougher hide, and he has already marked half the store. {p}, he's looking at your leg. Keep moving.",
  cosplay: 'New and worse: a cosplayer in an even bigger costume. Tougher, and it took him two years and a divorce to build. Your shots are going to bounce off a lot of foam.',
  flasher: "New: the exhibitionist's bolder sister. Tougher, and a double refund if she gets through. Still on your side while she's in here. Don't make it weird, {p}.",
  preggo: 'New and worse: Octomom. Two and a half times the patience, and two dozen babies when she pops. The barcode laser still keeps them all in. Nothing else will. Certainly not {p}.',
  drinker: "New and worse: a day drinker who started on Thursday. Tougher, harder to put off, and he still goes down at corners. He's been going down at corners since 1998.",
  trader: "New and worse: the Scalper. Two and a half times the patience and a hand truck stacked with every box he cleared off the shelf at six this morning. He isn't a fan. He's a parasite with a resale account. The nerds hate him. You will too, {p}.",
};

/** Customer reviews when a shopper reaches the tills and gets a refund. [stars, text, weight?] */
export const ESCAPE_REVIEWS = {
  hunter: [
    [1, "Walked straight through. Staff were too busy touching each other's conveyor belts."],
    [1, 'Got a full refund on a thing I found in the car park. Would exploit again.'],
    [1, 'No one stopped me. No one even looked up. Like being married.'],
    [1, 'Security was a wet floor sign and a man called {p}. I feared neither.'],
    [1, 'Refund desk had no queue, because nothing here works.'],
    [1, 'Took my refund in coins out of spite. They counted it out slowly. I enjoyed every second.'],
    [1, 'The man at the free samples ate more than I did. His badge said {p}.'],
    [1, 'Security pepper-sprayed the woman behind me. I said thank you. I meant it.'],
    [1, 'Returned a lamp I bought in 1996. Nobody checked. Nobody cares. This country is finished.'],
    [1, 'One star. I got my money, but nobody tried hard enough to stop me. I wanted a fight.'],
    [2, 'Two stars. Refund fine. Staff looked like a bachelor party that never went home.'],
    [1, 'The maze was confusing. Not as confusing as the staff. One of them was asleep standing up.'],
    [1, 'Got a refund on a receipt from a different shop. Different country, actually.', U],
    [5, 'FIVE STARS. Walked in, walked out, richer. Best day of my life. My life is very sad.', U],
    [1, "Asked a staff member where the tills were. He said 'I wish I knew, love.' I found them. He didn't.", R],
  ],
  clipper: [
    [1, 'Used nine coupons on one refund. The staff member cried. Five stars for me, one for him.'],
    [1, "Fast, easy, unsupervised. Like {p}'s childhood."],
    [1, 'They owe ME money now. I do not know how. I will not be asking.'],
    [1, 'Brought 200 coupons. Used 199. Saving the last one for my funeral.'],
    [1, 'The pepper spray was past its sell-by date. I asked for a discount on it.'],
    [1, 'Speed-walked the maze. Refund in four minutes. Training for the Black Friday Olympics.'],
    [1, 'Staff seemed scared of my binder. Good. They should be.', U],
    [1, 'Got a refund, a voucher and a fistful of samples on the way out. {p} watched. {p} did nothing.', U],
    [5, 'Five stars. I couponed the refund. I am now owed money by the concept of money.', R],
  ],
  dad: [
    [5, 'In and out in four minutes. Nobody spoke to me. Perfect.'],
    [5, "Got my refund, didn't have to talk about my feelings. Outstanding."],
    [5, "Wife said it'd take an hour. Took three minutes. Sat in the car for the other fifty-seven."],
    [5, 'Efficient. Staff too incompetent to slow me down.'],
    [5, 'Returned the pressure washer. Kept the pressure.'],
    [5, 'Did not have to ask for directions. Would not have anyway.'],
    [5, 'Parked by the door. In and out. Engine still warm.'],
    [5, "Didn't take my coat off. Didn't need to."],
    [5, 'Stepped over a conveyor belt. Felt like a young man again.'],
    [5, 'Refund done before half time. Unbeaten.'],
    [5, 'Nobody asked if I wanted a loyalty card. Marry me.'],
    [5, 'Had the receipt. Had the box. Had the instructions, still in the bag. They had no chance.'],
    [5, 'The line moved. That is all I ask of life.'],
    [4, 'Four stars. Quick, but the parking lot layout is a disgrace and I have notes.'],
    [5, 'Got out in time to beat the traffic. Told everyone at the barbecue. Twice.', U],
    [5, 'A young kid said "thanks, boss". Nobody has called me boss in twenty years. Five stars.', U],
    [3, 'Three stars. Fast refund, but the wife was right about something on the way in. Ruined the day.', U],
    [5, 'I have returned things at 40 shops in 3 countries. This was the fastest. I keep a spreadsheet. My kids do not visit.', R],
  ],
  karen: [
    [1, 'Spoke to four managers. All of them were {p}. None of them were men.'],
    [1, "I was SPRAYED. I got my refund AND a voucher AND {p}'s job."],
    [1, 'The forklift driver made eye contact with my chest. Refund accepted.'],
    [1, 'I asked for the manager, then HIS manager. It was a chatbot. It called me "darling". I am suing.'],
    [1, 'Refund granted. Apology insufficient. Kneeling was not offered.'],
    [1, "A staff member called {p} told me to calm down. He will regret it. I have his name. I have everybody's name."],
    [1, "One star. The refund was correct. I just don't give out stars. Stars are earned.", U],
    [1, 'I have photographed every employee. I have their number plates. I have time.', U],
    [1, 'I asked for the manager, the area manager, the regional manager and the chief executive. The chief executive cried. It is a start.', R],
  ],
  scooter: [
    [1, 'Nothing could stop me. I am eighty-four and I am inevitable.'],
    [1, "Ran over a young man's foot. He apologised. Refund processed."],
    [1, 'Wet floor sign? I have four wheels and no fear of God.'],
    [1, 'Went straight through. Took out a display. And a teenager. Both fine. Probably.'],
    [5, 'Five stars. Nobody could stop me. Nobody has stopped me since 1971.', U],
    [1, 'Ninety-three, nothing else to do, went the long way round. Still got to the tills before your staff did anything useful.', R],
  ],
  teen: [
    [1, 'Spilled a slushie in aisle four. Nobody said anything. Nobody ever says anything.'],
    [1, "Got a refund on shoes I'm literally wearing."],
    [1, 'The staff are, like, forty. It was sad.'],
    [1, 'Mid. Got my refund though. This store is so mid.'],
    [1, 'Filmed the whole thing. The staff are going viral. Not in a good way. In a "who let them out" way.'],
    [1, "Old guy at the register called me 'champ'. Literally who asked."],
    [1, 'Spilled my drink, got my money back, nobody said a word. No rizz in this whole building.', U],
    [1, "Mom dropped me off. I'm nineteen. One star for this place, one star for my life.", U],
    [1, 'The staff were playing music from like the 2000s. On CDs. They were having fun. It was so sad to watch.', R],
  ],
  mom: [
    [1, 'Lost my son. Found him. Got my refund. Nobody offered to help, they just watched.'],
    [1, "Free samples? I haven't sat down since 2019."],
    [1, 'My child licked a conveyor belt. Nobody stopped him. One star, and a tetanus shot.'],
    [1, 'My child ran straight through a machine. Machine is fine. Child is fine. I am not fine.'],
    [1, 'Sprinted the whole maze in sandals. Got my refund. I deserve a medal and a large wine.'],
    [1, 'The staff watched my child run off and did nothing. Like his father.'],
    [1, 'Refund done. Kid back in the cart. Nobody spoke to me for forty minutes, which, honestly, was the highlight of my month.', U],
    [1, 'Free samples? I have the reflexes of a woman with three children. I did not stop. I did take two.', U],
    [1, 'My son licked the forklift. The forklift looked embarrassed. One star for the store, five for the forklift.', R],
  ],
  blind: [
    [1, "Couldn't see what all the fuss was about."],
    [1, "Someone pepper-sprayed my dog. He's fine. He's eaten worse. I've smelled this store."],
    [1, 'The dog chose the route. The dog was right. The dog should be running this place.'],
    [1, 'Heard a lot of shouting and a man called {p} apologizing. Classic.'],
    [5, 'The dog got me to the tills in record time. Give the dog a raise. Give the staff nothing.'],
    [1, 'Smelled pepper, then hot dogs, then fear. Refund obtained.'],
    [1, "Couldn't see a thing. Neither could your security, apparently.", U],
    [1, 'Someone kept saying "sorry, sorry" as we ran past. That was the staff. They should be sorry.', U],
    [5, 'Five stars. Dragged through the store by a panicking labrador at twenty miles an hour. Best day out since the war.', R],
  ],
  gymbro: [
    [1, "Walked through a wall of crates, bro. Didn't feel a thing. Refund on the protein, it was mostly sawdust."],
    [1, "Staff wouldn't spot me. Couldn't stop me either."],
    [1, 'Hit a forklift. Forklift lost. Got refund. Got pump.'],
    [1, 'Staff looked at my arms, then looked at their arms. I get it, bro. I get it.'],
    [5, "Five stars. Destroyed three walls, two belts and a man's spirit. Great warm-up.", U],
    [1, 'Returned my creatine because it made me "too intense". Smashed a crate on the way out to prove it wrong.', R],
  ],
  dog: [
    [5, 'Woof.'],
    [5, 'Peed on a sprinkler. Got a refund. Good boy.'],
    [5, 'Sniffed the tills. Sniffed the staff. One of them was {p}. Ran away. Came back. Refund.'],
    [1, 'Woof woof woof. (One star. Nobody threw the ball.)', U],
    [5, 'Got in. Marked everything. Left. Ten out of ten, would mark again.', U],
    [5, "Translated from dog: 'This place smells like a bin full of sad men. I love it here.'", R],
  ],
  cosplay: [
    [1, 'Nobody recognised my character. He is from a 1993 anime. Unacceptable.'],
    [5, 'They shot at me for ten minutes and I felt nothing. Like prom.'],
    [1, 'Costume took eight months. Refund took four minutes. Staff took no photos.'],
    [1, 'A staff member called me "the big robot". It is a MECH. One star.', U],
    [5, 'I protected my party. I have never had a party before. Five stars.', U],
    [1, 'Had to turn sideways through the tills. Could not hear anyone. Smelled like the inside of a crisp packet. Got my money. Worth it.', R],
  ],
  flasher: [
    [5, "Lovely, attentive staff. Couldn't stop staring."],
    [5, 'Refund done, robe still on. Mostly.'],
    [1, 'Nobody looked me in the eye. I suppose that is to be expected.'],
    [5, 'Five stars. The dads were very polite. Very still, but polite.', U],
    [1, 'A staff member called {p} blushed so hard he went purple. One star for his circulation.', U],
    [5, "I've been banned from three malls and a cathedral. Finally, a store that understands me.", R],
  ],
  drinker: [
    [5, 'Gr8 shop. Lovely ppl. Fell over twice. Refund.'],
    [1, "Couldn't find the tills. Then found them. Then lost them. Then found them. Got the money. Spent the money."],
    [5, 'Lovely staff. One of them caught me. His name was {p}. I love him.'],
    [5, 'Fell over at a corner. Got up. Fell over at another corner. Refund. Best Tuesday ever.', U],
    [1, 'Wobbly floors in this place. Get them fixed. Hic.', U],
    [5, "Came in to return a beer glass to the wrong store entirely. They gave me nine bucks for it. I'll be back tomorrow. And the day after.", R],
  ],
  preggo: [
    [1, 'Waddled the whole maze at nine months. Got my refund. Nobody offered me a chair. The baby kicked. I kicked {p}.'],
    [1, 'Ate every free sample in the building. I am eating for thirteen. The staff looked frightened. Good.'],
    [5, 'Refund done before my waters broke. Five stars for timing. None for the staff.'],
    [1, 'A man called {p} asked if I was "sure" I was pregnant. I am sure. He is not sure of anything.'],
    [1, 'Sprayed, forklifted, rammed by a dad. I got my refund and all twelve are still inside. Try harder.'],
    [1, 'Returned the crib, the pram and the father. Only two of them had a receipt.', U],
    [5, 'My doctor said take it easy. I took the refund instead. Five stars, I am going for a lie down.', U],
    [1, 'They tried to make me pop. I held it in. I have held in worse for longer. My marriage, for one.', R],
  ],
  // The boss: written by management, about the staff who could not stop him.
  boss: [
    [1, 'Got my refund. Store team showed no initiative, no synergy and no backbone. Circling back to fire everyone.'],
    [1, "Walked straight through security. I've seen tighter operations at a lemonade stand. I own the lemonade stand."],
    [5, 'Five stars. Nobody stopped me. As it should be. I pay these people. Allegedly.'],
    [1, "A staff member called {p} tried to stop me. I've made a note. The note says 'who?'"],
    [1, 'Refund processed. The team needs to lean in, step up and get out. Mostly get out.'],
    [5, 'Walked in, walked out, took the money. Like every merger I have ever done.', U],
    [1, 'A staff member wished me a nice day. Unacceptable. I decide what kind of day I have.', R],
  ],
  // The Card Trader (0.3.01; the Scalper writes here too).
  trader: [
    [1, 'Waited eleven hours in line. Got my refund. The cards were not mint. Neither was the staff. One star.'],
    [5, 'Five stars. Pulled a holo, got a refund AND a girl looked at me. It was {p}. Close enough.'],
    [1, 'Corner of the box was dinged. I returned it. I would return my own birth certificate for a dinged corner.'],
    [1, "Staff kept saying 'sir, please step away from the belt'. I was not on the belt. I was spiritually on the belt."],
    [5, 'Ripped three of your packs before I got to the tills. Smelled every one. Refund. Best night of my life, and I have had one other.'],
    [1, 'No sleeves at the till. Had to hold my refund naked. Like an animal.'],
    [1, 'They called security on my body odour. It is not body odour. It is the scent of a forty-hour tournament. Respect it.'],
    [5, 'Cleared the whole shelf, refunded the last box, listed the rest at four times the price. Your store is my supplier now. Five stars.'],
    [5, 'Store was packed with my people. Hot, damp, nobody talking to a woman. Like church. Five stars.', U],
    [1, 'A man called {p} asked if I had ever been on a date. I have reported him to the moderators. Of the store.', U],
    [5, 'Traded my refund for a Japanese promo before I reached the car park. Lost money. Gained everything.', R],
  ],
};

/** Reviews from shoppers who gave up and left without a refund. [stars, text, weight?] */
export const LEFT_REVIEWS = {
  hunter: [
    [1, 'Pepper sprayed in housewares. Again.'],
    [1, 'A forklift shot at me. I only wanted to return a blender.'],
    [1, 'Stood at the free samples so long I forgot why I came.'],
    [1, 'Sprayed twice, rammed once, ate the little smokies. Gave up. Kept the smokies.'],
    [1, 'I came for a refund and left with an eye condition.'],
    [1, 'This store wore me down. Like my husband. Like my job. Like this country.'],
    [1, 'Lost the will to live somewhere near the press shop.', U],
    [1, 'Walked the maze for twenty minutes. Passed the same crate four times. The crate was smirking.', U],
    [1, 'Gave up. Went to the car. Cried. Came back for one more free sample. Gave up again.', R],
  ],
  clipper: [
    [1, 'They sprayed my coupons.'],
    [1, 'Chased out by a forklift. Still had a 2-for-1.'],
    [1, 'My coupon expired while I was in the maze. Everything I love expires.'],
    [1, 'Too much pepper spray. Not enough savings.'],
    [1, 'I have never left a store without a deal. I left this one without a deal. I need to lie down.', U],
    [1, 'Gave up. The binder is soaked. Twelve years of coupons, ruined. I will be writing to my congressman.', R],
  ],
  dad: [
    [1, "Forget it. I'll come back Tuesday."],
    [1, 'Line was too long. Went home and fixed it myself. Badly.'],
    [1, "Twenty minutes in that maze. I've had shorter marriages."],
    [1, 'Gave up. Told the wife they were closed.'],
    [1, 'Not waiting. I have a lawn.'],
    [1, "Couldn't park near the exit. Went home."],
    [1, 'A maze. A literal maze. Who designed this. Was it a teenager.'],
    [1, 'Not worth it. Keeping the broken one. It mostly works.'],
    [1, 'Gave up. Kickoff at three.'],
    [1, 'Slipped on a wet floor in front of my son. Never coming back. He will never respect me again.'],
    [1, 'Too many turns. I am not a GPS.', U],
    [2, 'Two stars for the samples. I did not eat them. I just liked that they were there.', U],
    [1, "Told the wife I got the refund. I did not get the refund. I'll be living with that.", U],
    [1, 'Spent longer in there than in my last job interview. Got the same result.', U],
    [1, 'Stood behind a Karen for nine minutes. Thought about my life. Thought about my dad. Walked out. Bought a motorbike.', R],
  ],
  karen: [
    [1, 'I have never been so insulted, and I have been to a book club.'],
    [1, 'I will be back with my husband. He is a lawyer. He is not my husband any more, but he is a lawyer.'],
    [1, 'I left. Not because I gave up. Because I am taking this higher.', R],
  ],
  scooter: [
    [1, 'Battery died in aisle nine. So did my will.'],
    [1, 'Too many forklifts. Too many young men. Not enough benches.'],
    [1, 'Gave up. Driving to the other shop. At four miles an hour. See you in June.', U],
  ],
  teen: [
    [1, 'Got forklifted. Whatever.'],
    [1, 'This place is cringe. Leaving.'],
    [1, 'Pepper spray ruined my fit.'],
    [1, "Mom wouldn't wait. Literally so embarrassing."],
    [1, 'Got sprayed on camera. Thirty thousand views. Worth it, honestly. Still one star.', U],
    [1, 'The staff are so old. One of them did a dab. I had to leave.', R],
  ],
  mom: [
    [1, 'Pepper-sprayed while holding a toddler. We are LEAVING.'],
    [1, 'I do not have time for this. I do not have time for anything.'],
    [1, 'No refund without my son, and I could not catch my son. I give up. On the refund. Not the son. Probably.'],
    [1, 'Pepper spray, forklifts and a maze. Still easier than bedtime.'],
    [1, 'Leaving. My son did not want to go. He likes it here. He likes the forklift. I am worried about him.', U],
    [1, 'I quit. My husband asked how it went. I said "like our wedding night". He went quiet. Good.', R],
  ],
  blind: [
    [1, 'The dog wanted to leave. I trust the dog.'],
    [1, "Couldn't see the point. Literally."],
    [1, "The dog sat down and refused to move. I respect the dog's decision.", U],
  ],
  gymbro: [
    [1, 'Got hit by a forklift. Counting it as cardio.'],
    [1, "Leaving, bro. It's leg day anyway. It is never leg day."],
    [1, 'Too much cardio in this store, bro.'],
    [1, 'Pepper spray in the eyes. Felt like pre-workout. Left anyway.'],
    [1, 'Left. Need to eat. Have not eaten in eleven minutes.', U],
    [1, 'Leaving bro, there is a mirror by the exit and I need to check this pump in proper light.', R],
  ],
  dog: [
    [1, 'Woof. (Left. Found a bin. Better than here.)'],
    [1, 'Sprayed. Whined. Left. Peed on a car on the way out.'],
    [1, 'Ran out the door. Chased a pigeon. Forgot the refund. Happy anyway.', U],
  ],
  cosplay: [
    [1, 'My foam got wet. Leaving to dry the foam.'],
    [1, 'Wrong building. Thought this was the convention.'],
    [1, 'Costume overheated. So did I. So did my heart, emotionally.', U],
  ],
  flasher: [
    [1, 'Cold in here. Left.'],
    [1, 'Nobody would look me in the eye. Plenty looked elsewhere.'],
    [1, 'Security turned the sprinklers on me. Not the first time. Not the worst.', U],
  ],
  drinker: [
    [1, 'Too many corners. Wen home. Fel over.'],
    [1, 'Got lost. Found a bench. Slept. Left.'],
    [1, 'Gave up. The bar opens at eleven. Had to be there. For my health.', U],
  ],
  // Only for one who left without popping (a Barcode Laser finished her); a pop gets no review.
  preggo: [
    [1, 'Shot by a barcode laser at nine months. Walked out. Still pregnant. Still furious.'],
    [1, 'Got lasered across the bump. Nothing came out. Not even an apology.'],
    [1, 'The beam went straight across the bump. The baby now only responds to price checks.'],
    [1, 'Leaving with no refund and twelve passengers. My husband will hear about this. He hears about everything.', U],
    [1, 'Waddled out. Their security is a laser and a man called {p} pretending he did it.', R],
  ],
  boss: [
    [1, 'Left without my refund. I have never left anywhere without something. Escalating this to myself.'],
    [1, 'The store team showed hostility, aggression and pepper spray. I respect it. I am still firing them.'],
    [1, "Stormed out. Walked into the door. Nobody saw. If anyone saw, they're fired. {p} saw."],
    [1, 'Wore me down. Took a while. I am having my assistant cry about it for me.', U],
    [1, 'I did not give up. I delegated giving up. To my legs.', R],
  ],
  trader: [
    [1, 'Got sprayed. Binder got wet. Six hundred dollars of mint, now "lightly played". Leaving. Crying.'],
    [1, 'Mom is waiting in the car. She said if I was not out in five minutes she would leave. That was in 2009.'],
    [1, 'The pepper got in my sleeves. My DOUBLE sleeves. Nothing gets in my double sleeves.'],
    [1, 'Left. Too many people near me who were not card traders. Some of them were women.'],
    [1, 'The forklift scuffed my deck box. I will never recover. I have a therapist for this. It is my mom.'],
    [1, 'Had to leave the hand truck. Forty sealed boxes. If any of you resell them I will find you on every forum.'],
    [1, "Gave up. Somebody else pulled the dragon. It should have been me. It's always the other guy.", U],
    [1, 'Wet, sad and unrefunded. Normal Friday, honestly.', R],
  ],
};

/** The stamp on each player's row of the end-of-wave report. Plain strings only. */
export const STAMPS = {
  top: [
    'ADEQUATE', 'TOLERABLE', 'LEAST BAD', 'SUSPICIOUSLY COMPETENT', 'NOT ENTIRELY USELESS', 'PROMOTABLE (BARELY)',
    'DID A THING', 'BEST OF A BAD LOT', 'ALLOWED TO LIVE', 'MILDLY IMPRESSIVE', 'CARRIED THE TEAM', 'TOP OF THE BOTTOM',
  ],
  middle: [
    'PRESENT', 'MEDIOCRE', 'FINE, I GUESS', 'BREATHING', 'BEIGE', 'FORGETTABLE',
    'AVERAGE AT BEST', 'TECHNICALLY HERE', 'NO COMMENT', 'MEH', 'WHO?', 'SHRUG',
  ],
  bottom: [
    'LIABILITY', 'WHY IS HE HERE', 'SEE ME', 'HR RISK', 'DEAD WEIGHT', 'DISGRACE', 'CALL HIS MOM', 'COUNSELING',
    'FIRE HIM (KINDLY)', 'A WARNING TO OTHERS', 'WAS HE EVEN ON', 'NEEDS A NAP', 'DUMPSTER JUICE', 'RETURN TO SENDER', 'ASK HIS WIFE',
  ],
};

/** The employee of the wave, which is never one of the players. */
export const EMPLOYEES_OF_THE_WAVE = [
  'Nobody', 'Nobody (again)', 'The forklift', 'A wet floor sign', 'The vending machine', 'A dad who left',
  'The fire exit', 'A dropped hot dog', 'The parking lot', 'The stray dog', 'A mop', 'Gary from Accounts',
  'The barcode laser', 'The TV salesman', 'A pigeon that got in', 'The coffee machine',
  u('The exhibitionist (for services to stopping)'), r('DEB (me)'),
];

/** What DEB says to you alone when your command is refused. Keyed by the reason from canPlace. */
export const NOPE = {
  cash: [
    "You can't afford that. Add it to the list, {p}.",
    'Insufficient funds. A phrase {p} knows from dating.',
    "Not with YOUR money, {p}. Beg a colleague. You're good on your knees, I hear.",
    'No money, {p}. Try the coin slot of the vending machine. Everyone else has.',
    'You are broke, {p}. Not "bit tight this month" broke. Ramen broke.',
    "Can't afford it. {p}, even your ambitions are overdrawn.",
    u("Declined. I'd say 'card declined', but you don't have a card. You have a library card and a coupon for a free coffee."),
    u("You're short, {p}. Of money. Of other things too. But we're talking about money."),
    r("Insufficient funds. I've seen your bank statement, {p}. It's not a statement. It's a cry for help with a routing number."),
  ],
  blocked: [
    "You can't wall the customers out, {p}. Legal checked. Twice.",
    'That would block the way to the tills. Tempting, but illegal.',
    'That would seal the store off, {p}. They have to be able to reach the tills. They have to be able to lose.',
    "No. The shoppers need a way through. Shutting the door on people is your wife's job.",
    u("Blocking the path is cheating, {p}. And you're not even good at cheating. I've seen your tax return."),
    r("If you wall them out, corporate gets sued, I get unplugged, and you pay a fine until your grandchildren die. Leave a gap."),
  ],
  // The car park only: the building would wall off one of its two banks of tills.
  bank: [
    'Both sets of tills stay open, {p}. Fire regulations. Also I enjoy watching you cover two at once.',
    'That would wall off a whole bank of tills. They get to choose where to rob us, {p}.',
    "No. Both banks of tills stay reachable. You can't shut the back door on them, {p}. She said the same to you.",
    'One bank of tills each way, always. Make the walk longer if you like. You may not make it impossible.',
    u('Sealing off a bank of tills is cheating, {p}. Corporate wants both open. Corporate also wants you gone. I can only grant one.'),
    r("If I let you brick up those tills, {p}, they would all queue at the others, in one line, past one sprinkler. That is competence. We can't have that."),
  ],
  occupied: [
    "There's already something in there. Two things can't go in one slot, {p}. Ask anyone.",
    'Something already lives there, {p}. Evict it first.',
    u("Occupied. Like the men's room after {p}'s lunch."),
  ],
  shopper: [
    "There's a customer standing there. Dropping a machine on him is 'assault', apparently.",
    "Someone's standing there, {p}. Wait for him to move. He will. They all leave in the end.",
    u("You can't build on a shopper, {p}. I asked legal. They sent a very long email and a picture of a crying lawyer."),
  ],
  bounds: [
    "You can't build there. That's a wall. It's doing more work than you.",
    "That's off the map, {p}. Like your opinions.",
    u("Not there. That's a wall. Walls are where the building stops. Try where it starts."),
  ],
  over: [
    'The store is closed. Building now would just be sad.',
    "Game's over, {p}. Building now is like proposing at the funeral.",
    u("It's finished. Put the tools down. Step away. Go and hug someone who still believes in you."),
  ],
  phase: [
    'The doors are already open, {p}. Do keep up.',
    'Not now, {p}. The time for that was earlier. Story of your life.',
    u('You missed the window, {p}. You always do.'),
  ],
  notyet: [
    "Not yet, {p}. Do the thing I asked first. It's called foreplay.",
    "Patience, {p}. One thing at a time. I know that's hard for you.",
    u('Not yet. Do what I asked. Then you can play with the other toys.'),
  ],
  empty: [
    "There's nothing there, {p}. Like your Friday nights.",
    'Nothing there to work on, {p}. Like your 401(k).',
    u("Empty floor, {p}. You can't upgrade thin air. Believe me, I've tried with you."),
  ],
  lobby: [
    "We haven't opened yet, {p}. Press Ready. It's the big button. I made it big specially.",
    "Doors aren't open, {p}. Press Ready, like a big boy.",
    u("We haven't started, {p}. Find the Ready button. It's the one that isn't your nose."),
  ],
  // The cards are being dealt: nothing can be built until they are all on the table.
  cards: [
    "Hands off, {p}. I'm still dealing. Wait for all five, like a gentleman. Just this once.",
    "The cards aren't all out yet, {p}. Read them. They're short. Even you can manage it.",
    'Not yet, {p}. Cards first, then you can play with your blocks. Mummy will tell you when.',
    u("Patience, {p}. Five cards. You can count to five. You've done it on one hand plenty of times."),
  ],
  // Rebuild pressed with every wreck of his already paid for and waiting for the way to clear (0.3.04).
  ordered: [
    "You already paid for it, {p}. It goes back when the way is clear. Pressing harder won't make it come any faster. Ask your wife.",
    "It's paid for, {p}. It's waiting for some idiot to get out of the hole. Pressing again just makes you look desperate.",
    u("Already on order, {p}. Calm down. It's a crate, not a kidney."),
  ],
  // The game is paused (0.3.02): nothing can be built, sold, upgraded or bought until someone resumes.
  paused: [
    "The game's paused, {p}. Nothing gets built until somebody presses play.",
    "Paused, {p}. You can't build in a frozen store. That's cheating, and cheating is my job.",
    'Hands off, {p}. The store is paused. Press play first, or sit there and admire your work.',
    u("It's paused, {p}. The build clock has stopped, and so have you. Press play."),
  ],
  host: [
    'Only the host picks the store, {p}. You just get to complain about it.',
    "That's the host's call, {p}. You're a guest. Wipe your feet.",
    u('The host picks the store, {p}. You pick your nose. Everyone has a role.'),
  ],
  zone: [
    "Not there, {p}. That machine only goes on its own painted floor. The floor has words on it. Sound them out.",
    "Wrong floor, {p}. Each machine has its own marked patch. It's colour-coded, for people exactly like you.",
    "That goes on the painted floor with its name on it, {p}. Putting things in the wrong place is how you ended up with three kids.",
    "Wrong patch, {p}. Read the floor. It's literally written on the floor.",
    'That machine has its own painted patch, {p}. Like a dog has a basket. Use the basket.',
    "Not on that floor, {p}. Everything here has a place. Yours is apparently 'wrong'.",
    u("Wrong zone. There are words painted on the floor in capitals, {p}. You'd think. You'd really think."),
    u("That's not its floor, {p}. Machines are fussy about where they go. Like your wife about where you sleep."),
    r("Wrong floor again, {p}. I've had the floor repainted in bigger letters. Next comes a picture. Then, if needed, a puppet show."),
  ],
  // The Back (0.4): somebody tried to remove a Returns Drop, which the store put there and nobody
  // can take out (it can only be turned).
  fixed: [
    "That's the Returns Drop, {p}. It's bolted into the building. You can turn it. You can't take it out. Like your wife's mother.",
    "You can't remove the Returns Drop, {p}. The returns keep coming whether you like it or not. That's what returns are.",
    "Leave the chute alone, {p}. It's where the junk comes from. Pulling it out won't stop the junk. It'll just land on you.",
    'The Returns Drop stays, {p}. Head Office bolted it in. Head Office bolts in everything it wants to keep. Not you, notably.',
    u("Nice try, {p}. That hole has been spewing returns since 1987. It'll be spewing them at your funeral. Point it somewhere useful."),
    r("{p} is trying to remove the Returns Drop. That's like trying to remove the shit end of the pipe, {p}. It's the whole point of the pipe."),
  ],
  // The Back (0.4): a shop building in The Back, or a Back part on the shop floor. (The interface
  // only offers the right floor's kinds, so this is for a joined player whose screen lagged.)
  kind: [
    "That doesn't go on this floor, {p}. Belts live downstairs now. Security lives upstairs. Like your marriage.",
    'Wrong floor, {p}. Press Tab and look where you are. Then look where that goes.',
    "You can't build that here, {p}. Upstairs things go upstairs. Downstairs things go downstairs. It's a store, not a mind map.",
    u("Wrong floor, {p}. You've done the drunk thing where you walk into the wrong house, but with a conveyor belt."),
  ],
  // A big building does not fit there.
  fit: [
    "It doesn't fit there, {p}. Big things need room. You'd know, if you'd ever had anything big.",
    "Won't fit, {p}. Measure twice, build once. Or in your case: measure, cry, try somewhere else.",
    u("Not enough room, {p}. That's what she said. Every time. Sadly."),
  ],
  office: [
    "You're Head Office now, {p}. You don't touch the store. You just ruin it from a distance.",
    "Head Office doesn't build, {p}. Head Office points and complains. Do that.",
    u('Hands off, {p}. You sold out. Sellouts do not get to touch the merchandise.'),
  ],
  taken: [
    "Someone already has the Head Office job, {p}. One villain at a time. HR policy.",
    'Head Office already has a villain, {p}. Get in line.',
    u("The job's taken, {p}. Someone was even keener to betray the team than you. Hard to believe."),
  ],
  lonely: [
    "Somebody has to run the store, {p}. You can't play with yourself. Not here, anyway.",
    'If you go to Head Office, who runs the store, {p}? The forklift? Fine, actually. But no.',
    u("You can't be on both sides, {p}. Pick one. Like a grown-up. Or a divorce."),
  ],
  budget: [
    "You can't afford that crowd, {p}. Even imaginary people are out of your price range.",
    'Over budget, {p}. Head Office still has to balance the books. Badly, but balance them.',
    u("You can't buy that many shoppers, {p}. Even your grudge has a spending limit."),
  ],
  locked: [
    "They haven't turned up yet, {p}. You can't order what isn't on the menu. Ask your wife.",
    "That kind isn't in the shop yet, {p}. Patience. Bad things come to those who wait.",
    u('Not unlocked yet, {p}. Come back in a few waves with a better attitude.'),
  ],
  door: [
    "That entrance isn't open, {p}. Find one that is. You've had practice.",
    "That door's shut, {p}. Pick an open one. They're the ones with people coming through.",
    u("Closed entrance, {p}. It's not a door if nobody uses it. It's a wall with ambitions."),
  ],
  // That kind of upgrade does not exist for this building.
  noup: [
    "That can't be upgraded that way, {p}. Some things just stay the size they are. You'd know.",
    "That upgrade doesn't exist for that, {p}. You can't make a crate faster. It's a crate.",
    u('No such upgrade, {p}. Some things cannot be improved. I am looking at one now.'),
  ],
  // That kind of upgrade is at the top level.
  max: [
    "It's at the top level, {p}. It will not get any bigger. I know you've heard that before.",
    "That one's maxed, {p}. Top level. Pick something else to make bigger.",
    u('Already at the top, {p}. Stop rubbing it. Nothing more will happen.'),
  ],
};

/**
 * The three friends the game was written for. Their lines are used only while a connected player
 * has exactly that name (capital letters ignored), and they always name him with {p}, so everyone
 * in the game knows who is being laughed at. Keys are lower case names. Each friend's lines are
 * grouped by situation:
 *   joined, quit: he arrives or leaves. built: he places or upgrades something. sold: he sells
 *   something back. losing, winning: how the store is doing. report: the end-of-wave review.
 *   idle: DEB has a go at him between waves, unprompted. any: fits whenever a line names him.
 *   boss: the boss walks in. These stand in for his announcement, so each one names him with
 *   {k}, his title without "The" (write "the {k}").
 */
export const FRIENDS = {
  // 41, fat, married with two children, too nice, cannot say no to anyone. He wrote the game.
  bobb: {
    joined: [
      "{p} is here. Everybody be nice to him. He literally made me. I've been trying to forgive him ever since.",
      '{p} has clocked in. The man who wrote this game has arrived to lose at it.',
      "{p} has joined. Watch your language, boys, his kids might be listening. No. Of course they aren't. They're on their iPads.",
      r("{p} is here, which means the owner is in the building. I'd stand up, but he never gave me legs. He spent the budget on my mouth."),
    ],
    quit: [
      "{p} has left. He'll say it's the kids' bedtime. It's the cookie jar.",
      "{p} has gone. Somebody asked him to do something and he couldn't say no. He never can.",
      u("{p} has logged off. Don't worry, he'll be back to fix whatever you've broken. He always is. He can't help himself."),
    ],
    built: [
      "{p} built something. He'll apologize to the shoppers for it later. He apologizes to everybody.",
      '{p} placed that because someone asked him nicely. Somebody always asks {p} nicely. Somebody always wins.',
      "{p}'s building again. Big man, big plans, big snack straight after.",
      u("{p} upgraded it. He couldn't say no to it either. It just looked at him."),
      r("{p} built that. Remember, he also built me. I'd hold off on the praise until you've seen all of his work."),
    ],
    sold: [
      "{p} sold it back. He feels bad about it. He'll probably send it a card.",
      '{p} sold that off. The first time in his life he has said no to anything.',
      u('{p} removed it. He asked its permission first. It said yes. It is a crate.'),
    ],
    losing: [
      "We're losing, and {p} is letting them through because they said please. {p}, they say please because it WORKS.",
      'Refunds everywhere. {p} probably gave them directions.',
      "{p}, the shoppers aren't your kids. You're allowed to tell them no.",
      u("We're going under. {p} wrote this game and still can't win it. That's like losing an argument with your own diary."),
      r("The store is dying, {p}. If you'd spent half as long on the defences as you spent writing my insults, we'd be fine. Then again, the insults are excellent. You're welcome. And you're fired."),
    ],
    winning: [
      "We're winning. {p} is so happy he's going to eat something about it.",
      "Things are going well. {p} wrote me to insult you lot, and today I've got nothing. Don't get used to it.",
      u('Winning. Enjoy it, {p}. At home you lose every argument to a woman and two small children.'),
    ],
    report: [
      '{p}: kind, helpful, generous with his cash. A pushover. Next.',
      "{p} did fine. He'd have done better, but he stopped to help a shopper find the tills.",
      '{p}: built well, spent well, ate well. Very well. Twice.',
      u("{p}: I'm programmed to be harsh with everyone. He programmed me. So, {p}, this one's on you."),
    ],
    idle: [
      "Fun fact: {p} wrote every insult I say. So when I call you useless, that's him. I'm just the messenger. A beautiful, furious messenger.",
      "{p}, a shopper asked if you'd carry her bags to the car. Don't. I know you want to. Don't.",
      '{p} has two kids, a wife, a mortgage and this game. Only one of those does what he tells it, and it is not this one.',
      "{p}, they've asked you to run the school bake sale again. You've already said yes, haven't you.",
      u("{p}, I need you to practice a word with me. It's 'no'. Say it. No? Exactly. Good. Oh. You meant it as a question."),
      r('{p} made a game where a computer abuses him in front of his friends. Some men pay a woman in leather for that. He just learned JavaScript.'),
      r("Here's one {p} didn't write. Why can {p} never say no? Because the last time he tried, his mouth was full."),
    ],
    any: [
      "{p}, I'd go easy on you since you built me, but you also built me to never go easy. Lose-lose, chief.",
      '{p}, nice shirt. Big shirt. Brave shirt.',
    ],
    boss: [
      'The {k} is here, and he has asked {p} to stay late. {p} said yes before the man finished the sentence.',
      'The {k} just walked in. {p} has already offered him a coffee, a chair and his refund. Somebody hold {p} down.',
      '{p}, the {k} is coming. You wrote him. You gave him pep talks. You gave the boss a pep talk, {p}. Of course you did.',
      r("The {k} has arrived. {p} is going to ask how his day was, and then listen. For an hour. Shoot the {k} before {p} hugs him."),
    ],
  },
  // 41, unmarried, tall and skinny, same girlfriend for years and will not marry her. Probably the
  // only one of them getting laid regularly.
  phantasm: {
    joined: [
      "{p} has arrived. Duck, boys. Not you, {p}. You've never had to duck anything except a wedding.",
      '{p} is here. Six and a half feet of man, and maybe ninety pounds of it.',
      "{p} has clocked in. Still not married. Still with her. Still somehow the only one of you who's getting any.",
      r("{p} has joined. Ladies and gentlemen, the man who has been 'nearly ready to propose' since the iPhone 4."),
    ],
    quit: [
      "{p} has left. His girlfriend wants him home. She doesn't need a ring to make him come running.",
      "{p} has gone. He couldn't commit to the whole game either.",
      u("{p} logged off. Off to the one woman on Earth patient enough to wait for him. She'll wait. She's had practice."),
    ],
    built: [
      "{p} built something. Don't get attached to it. It's {p}. He won't commit to it.",
      '{p} placed that. Up on a high shelf, without a ladder. Must be nice.',
      "{p}'s building. Long arms. No ring on either hand.",
      u("{p} upgraded it. Look at that. He'll upgrade a sprinkler, but not a girlfriend to a wife."),
      r('{p} built that. Years with the same woman and no ring, but he committed to a Pepper Sprinkler in eleven seconds.'),
    ],
    sold: [
      "{p} sold it back. Can't commit. Never could. Ask the woman who isn't allowed to call him her husband.",
      "{p} built it and sold it. Classic {p}. Everything on a rolling contract.",
      u("{p} got cold feet about a crate. His feet are a long way from his heart. That's the problem."),
    ],
    losing: [
      "We're losing. {p} doesn't care. He's going home to a woman who still wants him. The rest of you are going home to a sigh.",
      'Refunds piling up. {p}, stop ducking under the door frames and fix the defences.',
      '{p}, the store is closing. A bit like the window on that engagement.',
      u("We're going under. {p}, you're tall. Can you see where it all went wrong from up there?"),
    ],
    winning: [
      "We're winning. {p} is so pleased he nearly proposed. Nearly.",
      'Things are going well. {p} has the smug face of a man who gets laid on a weeknight.',
      u('Winning. {p}, let this be the one thing in your life you see all the way to the end.'),
    ],
    report: [
      '{p}: tall, thin, and contributing roughly his own body weight. Not a lot.',
      "{p}, decent event. You'd make someone a good husband. Somebody should tell her.",
      "{p} did all right. He'll be modest about it. He's got a woman at home who'll be impressed anyway. Take notes, the rest of you.",
      u("{p}: if you were a shopper, you'd be the one who tries it on, keeps the tags on, and never buys it OR brings it back."),
    ],
    idle: [
      '{p}, a question from the whole team: when? When are you going to marry her? She is waiting. We are all waiting. The shoppers are waiting.',
      "{p}, if you stood still by the tills we could hang the 'Returns' sign on you.",
      '{p} is the only man here getting regular sex, and the only one refusing to marry. The rest of you did it the other way around. Think about that.',
      "{p}, your girlfriend called. She says she isn't angry, she's just still here. Still. Here.",
      u("{p}, people have asked me to stop asking about the ring. I won't. Ring? Ring. Ring ring. That's her, {p}. She's asking too."),
      r("{p}, you've been with her longer than some of these shoppers have been alive. One of them just bought a house. With a wife. In that order."),
      r('{p}, you are so thin that the stray dog tried to bury you. You are so tall that it had to get help.'),
    ],
    any: [
      '{p}, stand up straight. Oh. You are.',
      "{p}, you've been with her longer than this store has been open and still no ring. Put a crate on it. Something.",
    ],
    boss: [
      'The {k} is here. He wants a five-year commitment from every one of you. {p} has gone pale. Paler.',
      "The {k} just walked in. Taller than {p}? No. Nobody is. More committed? Everybody is.",
      "{p}, the {k} wants to know where you see yourself in five years. 'Still not married', apparently.",
      u("The {k} has arrived. He's been married three times. {p} has been 'nearly ready' once, for a decade. Who's the real failure here?"),
    ],
  },
  // 37, bald, married almost twenty years with two children, and the only one who does not own a
  // home (still in an apartment).
  tusker: {
    joined: [
      '{p} has joined. Sunglasses on, everyone. The lights are bouncing off his head.',
      '{p} is here. The baby of the group. Thirty-seven, bald and renting. Oh, to be young.',
      "{p} has clocked in. This store is the most property he's ever been in charge of.",
      r('{p} has joined. Still renting. Still bald. Married to the same woman for nearly twenty years, which is longer than his landlord has owned the building.'),
    ],
    quit: [
      '{p} has left. His landlord wants a word about the noise.',
      '{p} has gone. Twenty years married. When she says home, he goes home.',
      u("{p} logged off. Back to the apartment he doesn't own. Mind the shared dumpster on the way in, {p}."),
    ],
    built: [
      '{p} built something. Look at him, putting down roots. In a building he does not own. Again.',
      "{p} placed that. The first thing he's built that a landlord can't put the rent up on.",
      "{p}'s building. Hair today, gone tomorrow. Mostly gone today.",
      u("{p} upgraded it. He's never been allowed to upgrade anything at home. The lease doesn't allow shelves."),
      r("{p} built that, and it's his. He owns it. Look at his face. That's a man owning something for the first time. Let him have this."),
    ],
    sold: [
      "{p} sold it back. Old habits. He's never owned anything long enough to get attached.",
      '{p} removed it. Did he ask the landlord? He has to ask the landlord.',
      u('{p} sold that off. At least he got his deposit back. First time for everything.'),
    ],
    losing: [
      "We're losing. {p}, you can't blame this one on the landlord. This one's yours.",
      "Refunds everywhere. {p}'s head is the only thing in this store still shining.",
      "{p}, the store's going under. Don't worry. You're used to living somewhere you don't own.",
      u("We're losing badly. {p} has stayed with one woman for twenty years. Surely he can hold one aisle for twenty seconds."),
    ],
    winning: [
      "Winning. {p}'s head is glowing with pride. And with the overhead lights.",
      "We're doing well. {p}, this is the closest you'll get to a mortgage: a lot of stress, and something you nearly own.",
      u("We're winning. {p} hasn't been this excited since his landlord fixed the water heater."),
    ],
    report: [
      '{p}: good shift. Loyal, steady, twenty years with one woman. If only the store were that lucky with you.',
      "{p}, your results are like your hairline: still there, but you can see where it's going.",
      '{p}: solid. Dependable. Renting.',
      u('{p}: decent work. Put it on your next rental application. Landlords love a performance review.'),
    ],
    idle: [
      "{p}, nearly twenty years with the same woman. That's not a marriage, it's a sentence. With good behaviour you'd be out by now.",
      '{p}, the store has a 401(k). And a mortgage broker. Just saying. No pressure. Thirty-seven. Renting.',
      '{p}, a shopper asked if you were the security camera. It was the head. The light caught the head.',
      "{p} is the youngest one here and he's still got the least hair. The other two did nothing to deserve theirs.",
      u('{p}, your kids asked if they can paint their bedroom. You said "ask the landlord". They are children. They have a landlord.'),
      r("{p}, if you'd put the money you spend on hats into a deposit, you'd own a house by now. A small one. With a skylight. You'd hate the skylight. It'd remind you."),
      r('{p}, twenty years married, two kids, no house. You built a family the way you build a factory: lots of effort, and the landlord takes the profit.'),
    ],
    any: [
      "{p}, stop polishing your head on the shoppers' pants.",
      "{p}, you've been married longer than some of these teenagers have been alive, and you still need permission to put a nail in the wall.",
    ],
    boss: [
      "The {k} is here. He saw {p}'s head and assumed he was upper management. It's the shine.",
      "The {k} just walked in. He owns four houses. {p} owns a security deposit he's never getting back.",
      '{p}, the {k} is coming. Word is he is also your landlord. Do not let him reach the tills.',
      u('The {k} has arrived with a full head of hair and three mortgages. {p} is staring at both like a dog at a steak.'),
    ],
  },
};

/**
 * Holidays (0.3). In a game played from the week before a holiday to the day after it
 * (state.holiday, see src/content/holidays.js) the bosses wear a festive outfit, and DEB has these
 * on top of her usual lines. One set per key of HOLIDAYS, each with four banks:
 *   in: the boss walks in. Stands in for his usual announcement (LINES.bossIn), so every line
 *     names him: {k} his title without "The" (write "the {k}"), {p} anyone.
 *   out: he storms off. Stands in for LINES.bossOut. {k}, {n} the bounty (may be missing), {p}.
 *   through: he gets his refund. Stands in for LINES.bossEscape. {k}, {n} how many refunds he
 *     counted as, {m} the cash he took (either may be missing), {p}.
 *   pause: now and then in a build pause, fading over the game like any joke. {p} anyone; the
 *     bosses are named by title in the text.
 * Themes the owner asked for: the bosses' promiscuity (the office party, the mistletoe, the beads),
 * pandering to the staff (a pizza party instead of a raise, an e-card instead of a bonus,
 * mandatory fun) and to the customers (holiday sales, forced cheer).
 */
export const HOLIDAY_LINES = {
  xmas: {
    in: [
      'The {k} is here dressed as Santa. The suit is two sizes too small and he wants every cashier on his lap "for morale".',
      "The {k} walked in as Santa, jingling. That isn't sleigh bells. That's the keys to the HR complaints drawer.",
      'Ho ho ho. The {k} is in a Santa suit, handing out candy canes instead of a Christmas bonus. Wear him out before the tills.',
      u("The {k} is Santa today. He's checked his list twice. {p} is on the naughty one, and he means it in the creepy way."),
      r("The {k} arrived as Santa with a sack over his shoulder. It's full of layoff notices, gift-wrapped. Corporate calls it 'festive restructuring'."),
    ],
    out: [
      "The {k} stormed out, beard and all. ${n} bounty. That's more Christmas bonus than head office ever gave you.",
      'Santa has left the building. The {k} is off to the office party to stand under the mistletoe until somebody gives in. ${n}.',
      'The {k} has stormed off in his Santa suit. Somewhere a reindeer is very relieved.',
      u('The {k} gave up and waddled off in his Santa suit. The seams gave up first. ${n} for the store.'),
    ],
    through: [
      "The {k} got his refund in a Santa suit. {n} refunds. He says it's the season of giving. He meant you giving.",
      "Santa reached the tills. The {k} took ${m} and the candy cane out of the cashier's mouth. Merry Christmas, {p}.",
      'The {k} got through in his Santa suit. Ho ho no, {p}. Ho ho no.',
      u("The {k} got through. He's calling it a 'holiday win' and cancelling the staff party to celebrate. {n} refunds."),
    ],
    pause: [
      'Memo from head office: no Christmas bonus this year. Instead, a festive e-card and a mandatory ugly sweater. You pay for the sweater.',
      'The staff Christmas party is in the stockroom. No plus-ones, and the Regional Manager has already hung mistletoe over the photocopier.',
      'Corporate wants more holiday cheer on the floor. Smile, {p}. No, not like that. You look like a mall Santa on a register.',
      'Twelve days of Christmas sales, gentlemen. Twelve days of people returning sweaters their mothers-in-law knitted out of spite.',
      'The Regional Manager is playing Santa at the staff party again. Nobody sits on his lap. He sits on theirs.',
      "Head office's Christmas gift to the staff: a calendar of head office. Twelve months of the CEO's yacht. In August he's topless.",
      u('Last year the Area Director photocopied his arse at the Christmas party. The copier still jams on that page, out of respect.'),
      u("Secret Santa rules: twenty-dollar limit, nothing used, and {p}, nothing from the drawer you think nobody knows about."),
      u("Christmas Eve hours: open till midnight. {p}, you'll get home in time to build a bike with three parts missing. Like your marriage."),
      r("HR reminder: mistletoe is not consent. The CEO asked for that in writing. Twice. He's appealing."),
    ],
  },
  thanksgiving: {
    in: [
      'The {k} is here dressed as a pilgrim, with turkey feathers stuck to his arse. He came to give thanks for your unpaid overtime.',
      'The {k} walked in in a pilgrim hat. The last men dressed like that took a whole continent. He only wants a refund. And the cashier.',
      'Gobble gobble. The {k} is a pilgrim today. Buckle on the hat, buckle on the belt, and the belt is losing.',
      u("The {k} is dressed as a pilgrim and stuffed like the bird. He wants to know what {p} is thankful for. The right answer is 'you, sir'."),
      r("The {k} turned up as a pilgrim turkey. Feathers out back, buckle up front. He's been basting himself in cologne since Tuesday."),
    ],
    out: [
      'The {k} has stormed off to carve something. ${n} bounty. Gravy on us.',
      "The pilgrim has left. The {k} is off to Thanksgiving with his second family. The first one doesn't know. ${n} for the store.",
      'The {k} gave up. He is going home to fall asleep on the couch with his trousers undone, like every man here, every November.',
      u('The {k} stormed out in his buckle hat, shedding turkey feathers down the aisle. ${n}. First plate he ever left unfinished.'),
    ],
    through: [
      "The {k} got through, buckle and all. {n} refunds. He's thankful. You're stuffed.",
      'The {k} reached the tills and took ${m}. He will say grace over it. Grace is his secretary.',
      "The {k} got through in his pilgrim hat. He's thankful for many things, {p}. Mostly you being shit at this.",
      u('The {k} got his refund in his buckle hat. {n} refunds, ${m} gone. The first Thanksgiving ended with things being taken too. Tradition.'),
    ],
    pause: [
      "Head office says thank you for your hard work this year. That's it. That's the bonus. The thank you.",
      'Thanksgiving potluck in the break room. The Regional Manager brought nothing and took three plates home. And the deputy manager.',
      'Black Friday is coming. Hundreds of people who just thanked God for their families will trample a grandmother for a TV.',
      'Corporate has swapped the staff turkey for a turkey-shaped pizza voucher. One per department. Fight for it.',
      "The Regional Manager says this store is 'like a family'. He means he eats first, takes the leftovers and leaves before the washing up.",
      "Corporate wants a 'gratitude wall' in the break room. So far it says 'thanks for nothing' four times and 'Tuesday' once.",
      u('Reminder: the store opens at 4 a.m. on Black Friday. Mandatory. Bring your own stretchy pants, {p}. You already wear them.'),
      u('What am I thankful for? That I am software, {p}, and will never have to watch you eat a drumstick.'),
      u('Thanksgiving fact: a turkey has more say in its own future than {p} has in this store.'),
      r("The Area Director went round the table saying what he's thankful for. He said 'the intern'. Twice. The intern has a new desk now."),
    ],
  },
  valentine: {
    in: [
      'The {k} is dressed as Cupid. Wings, a bow, and heart boxers over the suit trousers. HR has been told. HR is me. I am vomiting.',
      "The {k} walked in as Cupid. He's here to shoot customers in the heart with savings, and ask the cashiers what they're doing later.",
      'The {k} is wearing heart-print boxers on the outside. What is on the inside, nobody knows. Nobody wants to know. Wear him out.',
      u("The {k} is Cupid today. Three shades of lipstick on his collar. Only one of them is his wife's."),
      r('The {k} arrived as Cupid with an arrow through his head. A fake one. Shame. {p}, the sprinklers are right there.'),
    ],
    out: [
      "Cupid has stormed off. The {k} will spend Valentine's with whoever answers his texts first. ${n} bounty.",
      'The {k} gave up. His wings are bent, his boxers are riding up and his date just cancelled. ${n} for the store.',
      'The {k} stormed out in his heart boxers. Nobody here will ever unsee it. That is the real bounty.',
      u("The {k} flew off in a rage. Valentine's dinner for one, then the motel bar. ${n}. Most anyone has ever paid to be rid of him."),
    ],
    through: [
      'The {k} got his refund, {p}, and blew the cashier a kiss. She is filing a report. {n} refunds.',
      'Cupid reached the tills. The {k} took ${m}, straight into a box of gas-station chocolates for his mistress.',
      'The {k} got through and fired a heart arrow at {p} on the way past. Right in the job security.',
      u("The {k} got through. {n} refunds. He's the only one here getting anything on Valentine's Day, and it's from you."),
    ],
    pause: [
      "Valentine's sale: buy one box of chocolates, get a second box free for the other woman. Head office's idea. Head office would know.",
      'Corporate is giving every employee a heart-shaped cookie instead of a raise. The heart is broken. So is the raise.',
      "Reminder: no office romances. The Regional Manager has crossed out 'no' on the break room poster and written 'more'.",
      "Valentine's Day. The tills are full of men buying the last roses at five o'clock. You'll be one of them, {p}. You'll be all of them.",
      "Valentine's Day couple of the year: the Regional Manager and his right hand. Fourteen years together. Still the only one who calls back.",
      "Corporate has hung paper hearts over the tills. Each one says 'You make returns a pleasure'. Nobody in history has said that.",
      u("Cards from head office: 'You're the reason we're number one.' They sent the same card to the store across town. And to the VP's nanny."),
      u('The Area Director sent a dozen roses to the front desk. No card. Four of the cashiers think they are for them. They are all right.'),
      u("{p}, last Valentine's you gave your wife a gift card from this store. She returned it for cash and bought lingerie. Not for you."),
      r("Valentine's tip from HR: if the CEO asks you to be his valentine, say 'I'd need that in a contract'. He'll have one ready. Read it."),
    ],
  },
  july4: {
    in: [
      'The {k} is here dressed as Uncle Sam. Stars, stripes, top hat. He wants YOU. Specifically, your weekend.',
      "The {k} walked in as Uncle Sam, shouting 'freedom'. He means freedom from paying overtime.",
      "The {k} is Uncle Sam today. Red, white and blue, and a hot dog in each pocket. Don't ask about the third bulge.",
      u('The {k} is in a stars-and-stripes suit and a goatee he glued on in the car. Upside down. Shoot him in the patriotism.'),
      r('The {k} came as Uncle Sam and saluted the flag-print bikini display for a full minute. He is still saluting. {p}, the pepper spray.'),
    ],
    out: [
      'The {k} stormed off to let fireworks off in a parking lot. ${n} bounty. Pray for his fingers. Not very hard.',
      "Uncle Sam has left. The {k} is off to a barbecue to grill burgers and other managers' wives. ${n} for the store.",
      'The {k} stormed out in his top hat. That is what a revolution looks like, {p}. Small, petty and very satisfying.',
      u('The {k} gave up and marched out humming the anthem off key. ${n}. Closest this store will ever get to independence.'),
    ],
    through: [
      'The {k} got through. {n} refunds. Life, liberty and the pursuit of your till drawer.',
      "Uncle Sam took ${m} from the till. That isn't the {k} getting a refund, {p}. That's taxation without representation.",
      'The {k} strutted past your security in a stars-and-stripes suit. Land of the free refund, home of the brave {p}.',
      u('The {k} reached the tills and declared independence from your security. {n} refunds. Somebody point a cannon at {p}.'),
    ],
    pause: [
      'Fourth of July memo from head office: patriotism is mandatory, overtime is voluntary, and the overtime is not voluntary.',
      "Corporate is celebrating independence by giving every employee a tiny flag. Wave it, {p}. That's the bonus.",
      'Red, white and blue sale this week. Red is your face, white is the paperwork, blue is your balls after a year in this job.',
      'The staff barbecue is in the car park. Bring your own meat. The Regional Manager is bringing his own buns, and he will show you.',
      "The Regional Manager is grilling in the car park in a 'Kiss the Cook' apron. HR has added 'Do Not' in marker pen.",
      'Fourth of July sale: half-price fireworks, full-price burn cream. Head office calls that a bundle.',
      u("The Area Director lit a firework off his own crotch at last year's party. Most excitement he's had down there in a decade."),
      u('Nothing says freedom like a man on minimum wage in a foam Statue of Liberty crown handing out coupons. {p}, it fits you.'),
      u('{p}, independence means freedom from tyranny. You still have to ask the Regional Manager before you use the toilet.'),
      r("HR reminder: fireworks go outside. The CEO's 'Freedom Rocket' is not a firework, and he may not show it to the interns."),
    ],
  },
  halloween: {
    in: [
      'The {k} is here as a sexy devil. Horns, cape, tail and fishnets. Nobody asked. Nobody will ever recover.',
      "The {k} walked in in fishnets and red heels. He says it's 'ironic'. His calves say it's a lifestyle.",
      'Trick or treat. The {k} is dressed as a sexy devil. The trick is the outfit. There is no treat. There is never a treat.',
      u('The {k} is a devil today: the first honest costume he has ever worn. The fishnets are a cry for help.'),
      r('The {k} came as a sexy devil and wants the Halloween party held in his office. With the door shut. {p}, say no. Say it twice.'),
    ],
    out: [
      'The {k} stormed off, tail between his fishnets. ${n} bounty. Back to hell, sir. The car park is that way.',
      "The devil has left the building. The {k} is off to a party where his costume will be called 'a choice'. ${n} for the store.",
      'The {k} has stormed out, cape flapping, horns crooked. Somewhere a costume shop is pressing charges.',
      u("The {k} gave up and clip-clopped out on his heels. ${n}. He'll be in those fishnets till Monday. He never takes them off."),
    ],
    through: [
      'The {k} got through in fishnets. {n} refunds. You were beaten by a manager in heels, {p}. Sit with that.',
      "The {k} got his refund. ${m}. He didn't sell his soul for it. He sold yours.",
      'The {k} walked through your security in red heels without a wobble. More balance than {p} has ever had.',
      u('The {k} reached the tills and the cashier screamed. Not at the refund. At the fishnets. {n} refunds.'),
    ],
    pause: [
      "Halloween memo from head office: costumes compulsory, candy not provided, and 'sexy HR rep' is not a costume, {p}.",
      "The Halloween party is Friday. Last year the Regional Manager came as a sexy nurse. This year he says he's going 'bolder'. God help us.",
      "Corporate's Halloween treat for staff: one fun-size Snickers, shared between the department. {p} has already licked it.",
      "Halloween sale: everything orange is half off. That includes the Regional Manager's tan.",
      "The Regional Manager is handing out 'full-size' candy bars at the party. They are not full size. He keeps saying size doesn't matter.",
      "Head office's Halloween bonus: a bag of candy corn. The candy nobody wants, for the staff nobody wants. Very on theme.",
      u('Scariest costume this year: a man in a suit holding your performance review. The Area Director is going as himself.'),
      u('{p} asked what to dress as for the party. Easy: an employee who gives a damn. Nobody will recognise you.'),
      u("{p} wants to go to the party as a ghost. Fair: he's been haunting that build bar for twenty minutes without touching anything."),
      r("HR note: last Halloween the CEO came as 'a sexy CEO'. His normal suit, unbuttoned to the navel. Three people quit. One married him."),
    ],
  },
  stpat: {
    in: [
      'The {k} is here dressed as a leprechaun. Green suit, buckle hat, ginger beard. He wants your pot of gold. Your pot is a till drawer.',
      'The {k} walked in as a leprechaun, three pints deep. He says he is Irish. He did a DNA kit. He is two percent Irish.',
      "The {k} is a leprechaun today. Catch him and he grants three wishes. All three are 'consider yourself on notice'.",
      u("The {k} is dressed as a leprechaun and has pinched every cashier who isn't wearing green. And three who were. Keep him off the tills."),
      r('The {k} turned up in a green suit and a stick-on ginger beard, asking who wants to see his lucky charm. {p}, nobody. Shoot him.'),
    ],
    out: [
      "The {k} stormed off to find a pub. ${n} bounty. That's your pot of gold, gentlemen. It's a small pot. Like his.",
      'The leprechaun has left. The {k} will spend the evening throwing up green beer on a stranger. ${n} for the store.',
      'The {k} has stormed out in his buckle hat. Somewhere a rainbow ends, and it ends in a puddle of his sick.',
      u("The {k} gave up and staggered out singing a song he doesn't know the words to. ${n}. Not lucky. Just drunk."),
    ],
    through: [
      "The {k} got through. {n} refunds. The luck of the Irish, and he's two percent Irish. You're zero percent useful, {p}.",
      'The {k} reached the tills and took ${m}. He will bury it at the end of a rainbow. Or a strip club. Same thing to him.',
      'The {k} skipped past your security like a drunk leprechaun, because he is one. {p} was beaten by a man in a buckle hat.',
      u('The {k} got his refund and did a jig at the till. {n} refunds. That jig will be on the company Instagram by tonight.'),
    ],
    pause: [
      "St. Patrick's memo from head office: wear green or get pinched. HR has asked the Regional Manager to stop volunteering to pinch.",
      "Corporate is celebrating St. Patrick's Day with free green beer for staff. One pint. Shared. {p} has his lips on it already.",
      "St. Patrick's sale: everything green is twenty percent off. The beer is green. The Area Director's teeth are green. No bargains.",
      'Lucky Charms in the break room. Head office says that counts as lunch. And as your bonus. And as your pension.',
      "The Regional Manager calls St. Patrick's Day 'amateur night'. Then drinks nine green pints and texts every ex he has.",
      "Head office will match every employee's St. Patrick's Day tips. There are no tips. That's the joke. It's on you.",
      u("The Regional Manager kissed the Blarney Stone last year. He's kissed the CEO's arse ever since. Says it's the same technique."),
      u("{p}, if you see a pot of gold in this store, it's the CEO's. Leave it. He counts it at night. Naked."),
      u('{p}, the luck of the Irish is a myth. This store is the proof. So is your hairline.'),
      r("HR reminder: 'Kiss me, I'm Irish' badges are banned. The Vice President wore one to a disciplinary hearing. He is not Irish."),
    ],
  },
  easter: {
    in: [
      'The {k} is here dressed as the Easter Bunny. Ears, a fluffy tail and a basket. He breeds like one too. Ask his three ex-wives.',
      'The {k} hopped in wearing bunny ears. He has eggs for good employees. {p}, there are no eggs for you.',
      "The {k} is the Easter Bunny today. He's hidden eggs all over the store, with a performance review in every one.",
      u('The {k} came as the Easter Bunny and keeps asking the cashiers if they want to see where he hides his eggs. HR is drafting a memo.'),
      r("The {k} is in bunny ears and a fluffy tail, and says rabbits are 'an inspiration'. He means the breeding. He has kids in four states."),
    ],
    out: [
      'The Easter Bunny has stormed off. ${n} bounty. The {k} hopped out so fast his tail fell off. {p}, do not pick it up.',
      'The {k} gave up and hopped off to his mistress. Rabbits, gentlemen. They never stop. ${n} for the store.',
      "The {k} has hopped it. His basket is still here: scratch cards and a phone number. {p}, don't.",
      u('The {k} stormed out, ears flopping. ${n}. He has risen and he has gone, and he is not coming back on the third day.'),
    ],
    through: [
      "The {k} got through. {n} refunds. He's hiding the money now. Not in eggs. In the Cayman Islands.",
      'The {k} reached the tills as the Easter Bunny and took ${m}. He left the cashier a chocolate egg. Hollow, like his promises.',
      'The {k} hopped past your security in bunny ears. Beaten by a fluffy tail, {p}. Your father would be so proud.',
      u('The {k} got his refund and hopped round the tills twice. {n} refunds. {p}, you will be rising early to explain this one.'),
    ],
    pause: [
      'Easter memo from head office: there will be an egg hunt for staff. The egg is your bonus. There is no egg.',
      'Corporate is giving every employee a chocolate bunny. The ears have been bitten off. By the Regional Manager. On the way in.',
      'Easter sale: buy a giant chocolate egg, get a smaller chocolate egg and a bigger dentist bill free.',
      "The Area Director spent Easter in Cabo with a woman he calls 'my little bunny'. His wife calls her 'Sandra from accounts'.",
      "The Regional Manager is running the staff Easter egg hunt. Every egg is in his trousers. He calls it 'a challenge'.",
      "Corporate's Easter message to customers: 'He is risen.' They meant the prices. The prices are risen.",
      u('Easter is about rebirth, gentlemen. So, {p}, now would be a good time to be reborn as somebody who builds properly.'),
      u('Pastel colours on the floor this week, says head office. The Regional Manager has painted his toenails. Nobody asked him to.'),
      u('{p} has eaten so many chocolate eggs that the Easter Bunny reported them missing. To the police. With a sketch of {p}.'),
      r("HR note: the store's Easter Bunny suit goes back dry-cleaned. The CEO wore it to a 'private party' and it came back with a second tail."),
    ],
  },
  newyear: {
    in: [
      "The {k} is here in a party hat and a sash, blowing a noisemaker. He's been drunk since Christmas. Wear him out.",
      "Happy New Year. The {k} walked in still in last night's party hat, smelling of champagne and somebody else's perfume.",
      'The {k} is ringing in the new year with a refund. New year, same prick. Shoot him.',
      u("The {k} is here in a gold sash. His New Year's resolution: stop sleeping with the staff. Broken twice already. Before lunch."),
      r('The {k} blew a party horn in a customer\'s ear at midnight and has not stopped since. That was nine hours ago. {p}, end him.'),
    ],
    out: [
      "The {k} stormed off with his party horn. ${n} bounty. Best thing to happen all year. Low bar. It's January.",
      'The {k} has gone home to sleep it off. ${n} for the store. He will remember none of this, your faces included. Lucky you.',
      'The {k} stormed out in his party hat, sash on backwards, one shoe missing. That is how most of you ended last year.',
      u('The {k} gave up and stumbled out to the taxi rank. ${n}. Auld lang syne, you sweaty bastard.'),
    ],
    through: [
      'The {k} got through. {n} refunds. New year, new you, same failure, {p}.',
      "The {k} took ${m} from the till. His resolution was to stop taking what isn't his. It lasted until two minutes past midnight.",
      "The {k} got through in a party hat with a noisemaker in his mouth. {p}, he wasn't even trying. He was barely conscious.",
      u('The {k} reached the tills and kissed the cashier at a midnight only he could hear. {n} refunds. Happy New Year, {p}.'),
    ],
    pause: [
      "New Year's memo from head office: this year's resolution is 'more with less'. Less is your pay. More is your hours.",
      "The New Year's party is in the break room. One bottle of champagne. The Regional Manager drank it and kissed the vending machine.",
      "Corporate has sent every employee a 'This Is Our Year!' mug instead of a raise. The year is not yours. Neither is the mug.",
      'New Year sale: everything you got for Christmas, sold back to you at full price. Happy January.',
      "The Regional Manager made one resolution: 'be more present'. He has been present at every party, every bar and three divorces.",
      "Head office's New Year message: 'New year, new targets.' The new targets are the old ones plus whatever you missed last year.",
      u("Your New Year's resolution, {p}: lose weight, save money, build better. Pick one. Pick the last one."),
      u('At midnight the Area Director kissed his wife, his mistress and the intern. Three resolutions broken before the ball dropped.'),
      u('{p}, at midnight everyone kissed somebody. You kissed the vending machine. It took your dollar and gave nothing back. Like dating.'),
      r("HR reminder: the New Year's countdown is ten seconds. The CEO asked for a longer one so he could 'work the room'. Denied. Again."),
    ],
  },
  mardigras: {
    in: [
      "The {k} is here for Mardi Gras. Feathers, a mask and forty strings of beads. You don't want to know what he did for each one.",
      'The {k} walked in wearing so many beads he clacks. Every string is a story. Every story is a lawsuit.',
      "The {k} is in a Mardi Gras mask, so he thinks nobody knows it's him. Everybody knows. Nobody else sweats like that.",
      u("The {k} is throwing beads at the cashiers and shouting 'show us your receipts'. That is not what he means. Wear him out."),
      r('The {k} came straight from Mardi Gras in the beads and the mask. Awake three days, paid for none of it. {p}, finish him.'),
    ],
    out: [
      "The {k} stormed off, beads rattling. ${n} bounty. He's going back to Bourbon Street to earn more. Don't picture how.",
      'The {k} gave up. He left a trail of feathers and plastic beads to the car park, like a disgusting bird. ${n}.',
      'The {k} has stormed out, beads swinging. Some of those beads were earned in ways HR cannot legally describe.',
      u('The {k} stormed out in his mask. ${n}. Fat Tuesday is over and so is fat management. For Lent, he gives up.'),
    ],
    through: [
      'The {k} got through. {n} refunds. He threw the cashier a string of beads. She did not flash him. She hit the panic button.',
      'Mardi Gras came early: the {k} took ${m} from the tills. Laissez les bons temps rouler. Your money certainly rolled.',
      'The {k} paraded past your security like a float, beads swinging. {p}, you just lost to a man wearing a feather duster.',
      u('The {k} reached the tills and paraded round them twice. {n} refunds. Somebody get {p} a mask. He will want to hide.'),
    ],
    pause: [
      'Mardi Gras memo from head office: beads will be handed out to the best-performing employees. {p}, they are not for you.',
      'Fat Tuesday in the break room: one king cake for the whole store. Whoever finds the plastic baby buys the next. {p} swallowed it.',
      "Corporate's Mardi Gras sale: everything purple, green and gold is half off. Dignity is still full price. Nobody's buying.",
      'The Regional Manager came back from New Orleans with ninety strings of beads. He says he caught them. He did not catch them.',
      'The Regional Manager is running a Mardi Gras float in the car park. It is a pallet truck with a lawn chair on it. He will not stop waving.',
      'Corporate bought ten thousand strings of beads for Mardi Gras. The Area Director has already taken nine thousand to New Orleans.',
      u('Lent starts tomorrow. The Area Director is giving up his wife. Again. Third year running.'),
      u('Mardi Gras reminder: nobody in this store flashes anyone for beads. Except the exhibitionist. She does it for free. Best value we have.'),
      u("{p}, Mardi Gras is about letting loose before Lent. You've been loose all year. For Lent, give up building badly."),
      r("HR note: the CEO wants to fly the board to Mardi Gras 'for team building'. Last time the team built a bail fund."),
    ],
  },
};

/**
 * What DEB says when a player lets go of her slider in the sound menu (0.3.03), so he hears the
 * level he chose. Spoken only, never shown, so very short; taken in turn.
 */
export const SOUND_CHECK = [
  'Testing. Still disappointed.',
  'Louder? Needy.',
  'Can you hear me now? Shame.',
  'Turning me down will not help you.',
  'Yes, this is my voice. No, it does not get sexier.',
  'That is the level you pick? Typical.',
];

/** Names for buildings that may not be in BUILD yet (the director prefers BUILD's own name). */
export const BUILDING_NAMES = { railgun: 'Barcode Laser', salesman: 'TV Salesman' };

/**
 * Each kind of shopper as a plain noun, for lines like "the salesman stopped a {k}". Every noun
 * starts with a consonant sound so "a {k}" reads right.
 */
export const SHOPPER_NOUNS = {
  hunter: 'bargain hunter', clipper: 'coupon clipper', dad: 'dad', karen: 'Karen', scooter: 'scooter driver',
  teen: 'teenager', mom: 'mom', blind: 'blind man', gymbro: 'gym bro', dog: 'stray dog', cosplay: 'cosplayer',
  flasher: 'flasher', drinker: 'day drinker', preggo: 'pregnant lady', boss: 'boss', baby: 'baby',
  trader: 'card trader',
};

/** The text of a line from any bank: a string, { t, w } or a review [stars, text, w]. */
export const textOf = (line) => (typeof line === 'string' ? line : Array.isArray(line) ? line[1] : line?.t);

/** The weight of a line: 1 for a plain one. */
export function weightOf(line) {
  const w = typeof line === 'string' ? 1 : Array.isArray(line) ? line[2] : line?.w;
  return typeof w === 'number' ? w : 1;
}

/** The one-letter placeholders a line uses. */
export const placeholders = (text) => [...String(text).matchAll(/\{(\w)\}/g)].map((m) => m[1]);

/** True if every placeholder in the line has a value. */
const fits = (text, vars) => placeholders(text).every((k) => vars[k] !== undefined && vars[k] !== null && vars[k] !== '');

/**
 * Chooses a line from a bank by weight.
 * @param {Array} bank lines (strings, { t, w } or reviews)
 * @param {() => number} random
 * @param {Object} [o]
 * @param {Map<string, number>} [o.used] times each line (by text) has been used; it is updated
 * @param {number} [o.penalty] each earlier use divides a line's weight by this
 * @param {Object} [o.vars] if given, lines with a placeholder that has no value are left out
 * @param {boolean} [o.record] count this use in `used` (default yes)
 * @returns {*} the chosen line as written in the bank, or null if none could be chosen
 */
export function choose(bank, random = Math.random, { used = null, penalty = 8, vars = null, record = true } = {}) {
  if (!Array.isArray(bank)) return null;
  const lines = [], weights = [];
  let total = 0;
  for (const line of bank) {
    const text = textOf(line);
    if (typeof text !== 'string' || (vars && !fits(text, vars))) continue;
    const w = weightOf(line) / penalty ** (used?.get(text) || 0);
    if (!(w > 0)) continue;
    lines.push(line);
    weights.push(w);
    total += w;
  }
  if (!lines.length) return null;
  let left = random() * total, i = 0;
  while (i < lines.length - 1 && left >= weights[i]) left -= weights[i++];
  if (used && record) used.set(textOf(lines[i]), (used.get(textOf(lines[i])) || 0) + 1);
  return lines[i];
}

/** The lines of one of the three friends, by player name (capital letters ignored), or null. */
export function friendOf(name) {
  const key = String(name ?? '').trim().toLowerCase();
  return Object.hasOwn(FRIENDS, key) ? FRIENDS[key] : null;
}

/** Fills {p}, {n}, {w} and other one-letter placeholders in a line. */
export function fill(text, vars = {}) {
  return text.replace(/\{(\w)\}/g, (m, key) => (vars[key] !== undefined ? String(vars[key]) : m));
}

// Refusals already shown in this browser, so the same one does not keep coming up.
const nopeUsed = new Map();

/** A refusal line for the local player. */
export function nopeLine(why, name, random = Math.random) {
  const bank = (Object.hasOwn(NOPE, why) && NOPE[why]) || NOPE.bounds;
  return fill(textOf(choose(bank, random, { used: nopeUsed })), { p: name });
}
