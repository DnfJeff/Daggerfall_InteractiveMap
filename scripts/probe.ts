// Dev probe: run the browser parsers against a real ARENA2 folder from Node.
//   npm run probe -- "D:\path\to\arena2" [outDir]
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { GameData } from '../src/lib/df/game';
import type { GameSource } from '../src/lib/df/source';
import { LOC_TYPES, WORLD_W, WORLD_H, AUTOMAP_COLORS, bldCategory } from '../src/lib/df/constants';
import { buildingName, DFRandom } from '../src/lib/df/names';

class NodeSource implements GameSource {
  private map = new Map<string, string>();
  constructor(readonly label: string) {
    for (const f of readdirSync(label)) this.map.set(f.toUpperCase(), join(label, f));
  }
  names() { return [...this.map.keys()]; }
  async file(name: string) {
    const p = this.map.get(name.toUpperCase());
    return p ? new Blob([readFileSync(p)]) : null;
  }
}

function bmp(path: string, w: number, h: number, rgb: (x: number, y: number) => [number, number, number]) {
  const row = Math.ceil((w * 3) / 4) * 4;
  const buf = Buffer.alloc(54 + row * h);
  buf.write('BM'); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14); buf.writeInt32LE(w, 18); buf.writeInt32LE(-h, 22);
  buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = rgb(x, y); const o = 54 + y * row + x * 3;
    buf[o] = b; buf[o + 1] = g; buf[o + 2] = r;
  }
  writeFileSync(path, buf);
}

const dir = process.argv[2];
const out = process.argv[3] ?? '.';
mkdirSync(out, { recursive: true });
const t0 = performance.now();
const g = await GameData.load(new NodeSource(dir), (m) => console.log('·', m));
console.log(`loaded in ${(performance.now() - t0).toFixed(0)}ms; regions=${g.maps.regions.filter((r) => r.locationCount).length} locations=${g.maps.locations.length} blocks=${g.blocks.count} fp=${g.fingerprint}`);
const byType: Record<string, number> = {};
for (const l of g.maps.locations) byType[LOC_TYPES[l.type]?.label ?? l.type] = (byType[LOC_TYPES[l.type]?.label ?? l.type] ?? 0) + 1;
console.log(byType);

const rng = new DFRandom(); rng.srand(1); console.log('rand seq', rng.rand(), rng.rand(), rng.rand());
console.log('Ashfield Hall-style seed 27748 tavern ->', buildingName(27748, 15, 0, { regionIndex: 17, regionName: 'Daggerfall', locationName: 'x', factions: g.factions }));

const pal = g.fmapPal;
bmp(join(out, 'world.bmp'), WORLD_W, WORLD_H, (x, y) => {
  const l = g.maps.locationAt(x, y);
  const c = l ? LOC_TYPES[l.type]?.palIndex ?? 0 : g.world[y * WORLD_W + x];
  return [pal[c * 3], pal[c * 3 + 1], pal[c * 3 + 2]];
});

for (const want of ['Daggerfall', 'Ashfield Hall', 'Gothway Garden']) {
  const loc = g.maps.locations.find((l) => l.name === want);
  if (!loc) { console.log('not found', want); continue; }
  const t = await g.town(loc);
  console.log(`\n${want} (${g.regionName(loc.region)}) px=${loc.x},${loc.y} ${t.detail.width}x${t.detail.height} blocks, ${t.buildings.length} buildings, missing=${t.missingBlocks}`);
  for (const b of t.buildings.filter((b) => b.name)) console.log(`  ${b.key.toString().padStart(7)} type=${b.type} q=${b.quality} ${b.name}`);
  const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
  bmp(join(out, `town-${want.replace(/\W/g, '')}.bmp`), t.width, t.height, (x, y) => {
    const v = t.automap[y * t.width + x];
    if (!v) return [90, 90, 100];
    const c = AUTOMAP_COLORS[bldCategory(v - 1)];
    return c === 'transparent' ? [255, 0, 255] : hex(c);
  });
}
