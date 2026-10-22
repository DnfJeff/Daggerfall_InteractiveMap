// npx tsx scripts/sizes-probe.ts <arena2>/MAPS.BSA — town block-size distribution per location type
import { readFileSync } from 'node:fs';
import { MapsFile } from '../src/lib/df/maps';
import { LOC_TYPES } from '../src/lib/df/constants';
const m = await MapsFile.load(new Blob([readFileSync(process.argv[2])]));
const by: Record<string, Record<number, number>> = {};
m.locations.forEach((l, i) => { const t = LOC_TYPES[l.type].label; const s = m.blockW[i] * m.blockH[i]; (by[t] ??= {})[s] = (by[t][s] ?? 0) + 1; });
for (const [t, h] of Object.entries(by)) console.log(t.padEnd(10), Object.entries(h).map(([s, n]) => `${s}:${n}`).join(' '));
const d = m.locations.find((l) => l.name === 'Daggerfall' && l.type === 0)!;
console.log('Daggerfall', m.detail(d).width, m.detail(d).height, m.blocksOf(d));
