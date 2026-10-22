// npx tsx scripts/roads-probe.ts <basicroads.dfmod>
import { readFileSync } from 'node:fs';
import { loadBasicRoads } from '../src/lib/df/roads';
const t0 = performance.now();
const r = loadBasicRoads(new Uint8Array(readFileSync(process.argv[2])), 'probe');
console.log(`${(performance.now() - t0).toFixed(0)}ms`);
for (const [k, n] of Object.entries(r.networks)) console.log(k, 'pixels', n!.pixels, 'lines', n!.lines.length, 'points', n!.lines.reduce((a, l) => a + l.pts.length / 2, 0));
