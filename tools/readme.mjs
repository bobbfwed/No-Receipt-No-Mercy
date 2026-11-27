// Keeps the parts of README.md that change as the game grows up to date: the version number, the
// list of store designs with a picture of each, The Back's parts and supplies (0.4), and the list
// of shoppers with pictures and what they do. The text comes from the game's own data, so the
// README cannot drift from the game.
//
//   node tools/readme.mjs           rewrite those parts of README.md
//   node tools/readme.mjs --shots   also retake the pictures in docs/img/ first (the dev server
//                                   must be running: node tools/serve.mjs). Do this when a map
//                                   design or a shopper's drawing changes, or one is added.
//
// test/readme.test.js fails if README.md is out of date, so run this after every change to
// src/version.js, the maps, The Back or the shoppers.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MAP_DESIGNS, MAP_SIZES, SHOPPERS, BUILD, TUNE, BACK, mapSize } from '../src/sim/index.js';
import { SHOPPER_HELP, SUPER_HELP, BOSS_HELP, BACK_HOW } from '../src/content/help.js';
import {
  SHOPPER_ORDER, SECURITY_ORDER, BACK_ORDER, shopperFacts, bossFacts, fmt, paceText, edgeText, releaseText,
  supplyFacts, tierFacts, payText, howItWorks,
} from '../src/content/facts.js';
import { versionText } from '../src/version.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://bobbfwed.github.io/No-Receipt-No-Mercy/';

/** The generated parts of the README, by name. Each goes between `<!-- gen:name -->` markers. */
export function generated() {
  // The opening line of the README: the one place the play link is given at the top.
  const version = `**Play version ${versionText()} now: ${SITE}** (nothing to install; works in a browser on a computer, a tablet or a phone).`;

  const maps = [
    'The host picks a design and a size before the game starts. Each player gets his own shopper entrance. The store\'s walls and shelves go all the way down, so The Back under it has the same shape, with the Returns Drops where the store put them.',
    '',
    ...Object.entries(MAP_DESIGNS).flatMap(([k, d]) => [`### ${d.name}`, d.desc, '', `![${d.name}](docs/img/map-${k}.png)`, '']),
    // (Two designs have plots of their own: the Back Passage's is taller, to stack up more
    // corridors, and the Strip Mall's bigger, as the middle of it is car park.)
    `| Size | Most designs | ${MAP_DESIGNS.corridors.name} | ${MAP_DESIGNS.horseshoe.name} | Suits |`,
    '|---|---|---|---|---|',
    ...Object.entries(MAP_SIZES).map(([k, z]) => {
      const [c, m] = ['corridors', 'horseshoe'].map((d) => mapSize(d, k));
      return `| ${z.name} | ${z.w} x ${z.h} | ${c.w} x ${c.h} | ${m.w} x ${m.h} | ${z.players ? `${z.players} player${z.players > 1 ? 's' : ''}` : 'the original; cramped'} |`;
    }),
  ].join('\n');

  const shoppers = [
    `Patience is what security wears down; when it runs out the shopper storms off and gets no refund. The numbers are for the first sales event at Normal difficulty; patience grows every event. Each picture shows the ordinary shopper and its super version, which turns up later and takes a double refund. The boss, last in the list, walks in with the crowd every ${TUNE.bossEvery}th sales event. ${paceText()}`,
    '',
    '| | Shopper |',
    '|---|---|',
    ...SHOPPER_ORDER.map((k) => {
      const f = shopperFacts(k), help = SHOPPER_HELP[k];
      // (An img tag, not Markdown, so the picture keeps a fixed width inside the table.)
      return `| <img src="docs/img/shopper-${k}.png" alt="${f.name} and ${f.superName}" width="200"> | **${f.name}** · ${f.releaseOnly ? `Midnight Release events only (from sales event ${f.first})` : `from sales event ${f.first}`} · patience ${fmt(f.hp)}, speed ${fmt(f.speed)}, refund $${f.refund}<br>${help.trick}${f.releaseOnly ? `<br>${releaseText()}.` : ''}${edgeText(k) ? `<br>${edgeText(k)}` : ''}<br>**Beat it with:** ${help.beat}<br>**Super: ${f.superName}** (from sales event ${f.superFrom}). ${SUPER_HELP[k]} |`;
    }),
    // The boss is not one of SHOPPERS: he has a row of his own, last.
    (() => {
      const b = bossFacts();
      const ranks = b.titles.map((t) => `${t.title} (event ${t.from}${t.tier === b.titles.length ? ' on' : ''})`).join(', ');
      return `| <img src="docs/img/shopper-boss.png" alt="The boss, ${b.name}" width="200"> | **${b.name}** (the boss) · every ${b.every}th sales event · patience ${fmt(b.hp)}, more for each rank, speed ${fmt(b.speed)}, refund $${b.refund} times his rank<br>${BOSS_HELP.trick}<br>Every ${fmt(b.pepEvery)} seconds his pep talk gives every shopper within ${fmt(b.pepRange)} tiles ${Math.round(b.pepHeal * 100)}% of their patience back. If he reaches a till he counts as ${b.refunds} refunds; if he storms out the store gets a bounty of $${TUNE.bossBounty} times his rank.<br>**Beat him with:** ${BOSS_HELP.beat}<br>**Ranks:** ${ranks}. |`;
    })(),
  ].join('\n');

  // The Back (0.4): the floor under the shop, its parts and the supplies it makes.
  const price = (k) => (k === 'drop' ? 'put down by the store' : k === 'lift' ? 'comes with the building' : `$${BUILD[k].cost}`);
  const tiers = tierFacts();
  const back = [
    `Under the shop is **The Back** (Tab switches floors). Nothing down there gets in a shopper's way. Returns Drops cough up returned junk; belts carry it to machines that turn it into supplies; more belts carry those to the Dumbwaiter under each security building, which sends them up. Security works as built until it is stocked, and better while it is, and every supply is used up as the building works. The Back makes no money, bar a Clearance Bin's pennies for leftovers. ${payText()}`,
    '',
    '| Part | Price | What it does |',
    '|---|---|---|',
    ...BACK_ORDER.map((k) => `| **${BUILD[k].name}** | ${price(k)} | ${BACK_HOW[k].does} |`),
    '',
    '| Supply | Made by | What it does upstairs |',
    '|---|---|---|',
    ...supplyFacts().map((s) => `| **${s.name}** | ${s.maker} | ${s.track === 'wire' ? 'Stops dads and walls off shoppers: a security building given a wire direction keeps everyone off its tiles and the ' + BACK.wireReach + ' beyond it that way while it holds wire' : `More ${s.gives}`} (${s.track === 'wire' ? 'every security building with a wire direction' : s.takers.length === SECURITY_ORDER.length ? 'every security building' : s.takers.join(', ')}) |`),
    '',
    `Every supply comes in four brands. The machines make ${tiers[0].name}; each pass through a Rebrander puts it up one: ${tiers.slice(1).map((t, i) => `${t.name} in ${fmt(t.secs)} s from ${tiers[i].name}`).join(', ')}. A better brand does more: Bottled Spite, Rage Cola and Extension Cord count as ${tiers.map((t) => `+${t.level}`).join(', ')} levels, and a unit of Razor Wire turns away ${tiers.map((t) => t.wire).join(', ')} dads.`,
  ].join('\n');

  // How the game works (0.4, stage 6), section by section: the Employee Handbook's first tab.
  const howto = howItWorks().map((s) => `**${s.title}.** ${s.text}`).join('\n\n');

  return { version, howto, maps, back, shoppers };
}

/** README text with the generated parts put in. */
export function fill(text) {
  let out = text;
  for (const [name, body] of Object.entries(generated())) {
    const re = new RegExp(`(<!-- gen:${name} -->)[\\s\\S]*?(<!-- /gen:${name} -->)`);
    if (!re.test(out)) throw new Error(`README.md has no <!-- gen:${name} --> ... <!-- /gen:${name} --> markers`);
    out = out.replace(re, (m, a, b) => `${a}\n${body}\n${b}`);
  }
  return out;
}

/** The pictures the README shows, as [file, page address, width, height]. */
export function pictures(base = 'http://localhost:5173') {
  return [
    ...Object.keys(MAP_DESIGNS).map((k) => [`docs/img/map-${k}.png`, `${base}/tools/render-harness.html?design=${k}&size=m&players=3&fitview=1&nostart=1&demo=0&route=1`, 1200, 660]),
    ...[...Object.keys(SHOPPERS), 'boss'].map((k) => [`docs/img/shopper-${k}.png`, `${base}/tools/portrait.html?k=${k}`, 340, 180]),
  ];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--shots')) {
    fs.mkdirSync(path.join(root, 'docs/img'), { recursive: true });
    for (const [file, url, w, h] of pictures()) {
      execFileSync(process.execPath, [path.join(root, 'tools/realshot.mjs'), url, path.join(root, file), '1500', String(w), String(h)], { stdio: 'ignore' });
      console.log(`took ${file}`);
    }
  }
  const file = path.join(root, 'README.md');
  const before = fs.readFileSync(file, 'utf8');
  const after = fill(before);
  if (after !== before) { fs.writeFileSync(file, after); console.log('README.md updated'); } else console.log('README.md was already up to date');
}
