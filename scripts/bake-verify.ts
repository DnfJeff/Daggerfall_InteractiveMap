// Checks baked data reproduces the original: same locations, towns, building names, services.
//   npx tsx scripts/bake-verify.ts <ARENA2> [dataDir=public/data]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GameData } from '../src/lib/df/game';
import { loadBaked } from '../src/lib/df/baked';

const [arena2, dir = 'public/data'] = process.argv.slice(2);
(globalThis as any).fetch = async (url: string) => {
  const bytes = readFileSync(join(dir, url.split('/').pop()!));
  return new Response(bytes);
};
const files = new Map(readdirSync(arena2).map((f) => [f.toUpperCase(), join(arena2, f)]));
const orig = await GameData.load({ label: '', names: () => [...files.keys()], file: async (n: string) => (files.has(n.toUpperCase()) ? new Blob([readFileSync(files.get(n.toUpperCase())!)]) : null) });
const t = performance.now();
const { game: baked, roads } = await loadBaked('data/');
console.log(`baked load ${(performance.now() - t).toFixed(0)}ms; roads ${roads ? Object.keys(roads.networks).join(',') : 'none'}`);

let fail = 0;
const check = (label: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; if (fail < 10) console.log('MISMATCH', label, JSON.stringify(a).slice(0, 120), '|', JSON.stringify(b).slice(0, 120)); } };
check('location count', orig.maps.locations.length, baked.maps.locations.length);
check('world', Array.from(orig.world.slice(0, 5000)), Array.from(baked.world.slice(0, 5000)));
check('world sum', orig.world.reduce((a, b) => a + b, 0), baked.world.reduce((a, b) => a + b, 0));
check('politic sum', orig.politic.reduce((a, b) => a + b, 0), baked.politic.reduce((a, b) => a + b, 0));

// Towns: every 25th settlement, plus the big ones.
const towns = orig.maps.locations.filter((l, i) => l.type <= 2 && (i % 25 === 0 || l.type === 0));
let buildings = 0;
for (const l of towns) {
  const a = await orig.town(l), b = await baked.town(baked.maps.locationByMapId(l.mapId)!);
  check(`${l.name} size`, [a.width, a.height, a.buildings.length], [b.width, b.height, b.buildings.length]);
  check(`${l.name} names`, a.buildings.map((x) => [x.key, x.name, x.quality]), b.buildings.map((x) => [x.key, x.name, x.quality]));
  check(`${l.name} automap`, a.automap.reduce((s, v, i) => s + v * (i % 97), 0), b.automap.reduce((s, v, i) => s + v * (i % 97), 0));
  buildings += a.buildings.length;
}
const da = orig.directory(), db = baked.directory();
check('services', da.catalog().map((s) => [s.key, da.where.get(s.key)!.length]), db.catalog().map((s) => [s.key, db.where.get(s.key)!.length]));
check('region facts', JSON.stringify(orig.regionFacts(17)), JSON.stringify(baked.regionFacts(17)));
check('sprite', (await orig.sprite(255))?.data.length, (await baked.sprite(255))?.data.length);
console.log(`${towns.length} towns, ${buildings} buildings, ${da.catalog().length} services compared: ${fail ? `${fail} mismatches` : 'identical'}`);
process.exit(fail ? 1 : 0);
