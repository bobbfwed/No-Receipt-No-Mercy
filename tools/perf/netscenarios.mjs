// Runs tools/perf/netbench.mjs over a list of scenarios and prints one line each: how often the
// joined player's picture stood still and for how long, how far behind he ran, catch-up bursts,
// full copies and why, checksum mismatches.
// Usage: node tools/perf/netscenarios.mjs [--from=e16] [--secs=300] [--only=name,name] [--json=file]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const from = arg('from', 'e16'), secs = arg('secs', '300');
const only = arg('only', '') ? arg('only').split(',') : null;
// A phone like a mid-range Android: simulation steps 4x as slow as this PC, 6 ms + 0.02 ms a
// shopper to draw (tools/perf/render.mjs, phone at 4x slow-down); a weak phone: 10x and 15 ms.
const MID = ['--slow=4', '--render=6', '--renderPer=0.02'];
const WEAK = ['--slow=10', '--render=15', '--renderPer=0.05'];
const SCEN = [
  ['ideal link, PC client', ['--link=ideal']],
  ['home broadband both ends', ['--link=home']],
  ['phone client, good 4G/wifi (50 ms, 40 ms jitter, 0.5% loss)', ['--link=mobile', '--loss=0.005', ...MID]],
  ['phone client, typical mobile (1% loss)', ['--link=mobile', ...MID]],
  ['phone client, poor signal (3% loss, 80 ms jitter, 1.5 Mbps)', ['--link=bad', ...MID]],
  ['slow uplink 1 Mbps, no loss (full copies queue up)', ['--link=home', '--mbps=1', '--jitter=0']],
  ['slow uplink 2 Mbps, no loss', ['--link=home', '--mbps=2', '--jitter=0']],
  ['weak phone client at 1x', ['--link=home', ...WEAK]],
  ['weak phone client at 3x', ['--link=home', '--speed=3', ...WEAK]],
  ['weak phone client at 5x', ['--link=home', '--speed=5', ...WEAK]],
  ['very weak phone (30x, 60 ms frames) at 5x', ['--link=home', '--speed=5', '--slow=30', '--render=60', '--renderPer=0.2']],
  ['host timer every 100 ms (busy phone host)', ['--link=home', '--hostEvery=100']],
  ['host timer every 250 ms', ['--link=home', '--hostEvery=250']],
  ['host tab hidden (timer once a second)', ['--link=home', '--hostEvery=1000']],
  ['engine differs in last bit of Math.hypot', ['--link=home', '--ulp=1']],
];
// Anything else on the command line (--session=..., --link=...) goes to every run.
const passOn = process.argv.slice(2).filter((a) => /^--(session|dir)=/.test(a));
const rows = [];
for (const [name, args] of SCEN) {
  if (only && !only.some((o) => name.includes(o))) continue;
  const out = execFileSync(process.execPath, ['tools/perf/netbench.mjs', `--from=${from}`, `--secs=${secs}`, ...args, ...passOn], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const r = JSON.parse(out);
  const row = {
    scenario: name, args: args.join(' '),
    stallsPerMin: r.stalls.perMinute, stallP50: r.stalls.p50Ms, stallP95: r.stalls.p95Ms, longest: r.stalls.longestMs, stillPct: r.stalls.stillSharePct,
    behindP50: r.behindSteps.p50, behindP95: r.behindSteps.p95, behindMax: r.behindSteps.max, burstsPerMin: r.bursts.perMinute, maxSteps: r.bursts.maxStepsInOneFrame,
    copies: `${r.copiesSent.routine} routine, ${r.copiesSent.asked} asked`, mismatches: r.client.mismatches, jumps: r.client.jumps,
    frameP95: r.clientFrameMs.p95, lost: r.lostPackets, kbps: +(Object.values(r.kbPerSec).reduce((a, b) => a + b, 0) - r.kbPerSec.up).toFixed(2),
  };
  rows.push(row);
  console.log(JSON.stringify(row));
}
if (arg('json', '')) writeFileSync(arg('json'), JSON.stringify({ from, secs, rows }, null, 1));
