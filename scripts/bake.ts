// Bakes the map data the hosted web map ships with, from a local Daggerfall install.
//   npm run bake -- <ARENA2 folder> [basicroads.dfmod] [outDir=public/data]
// Output is derived data only (positions, names, town layouts, recombined map art, creature sprites,
// road grids), never the original ARENA2 files.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { GameData } from '../src/lib/df/game';
import { BlocksFile } from '../src/lib/df/blocks';
import { BldType, LOC_TYPES, NAMED_BUILDING_TYPES } from '../src/lib/df/constants';
import { BAKE_VERSION, RASTER_PARTS, type BakedGame } from '../src/lib/df/baked';
import { readUnityFs, findTextAsset } from '../src/lib/df/unityfs';
import { PATH_KINDS, type PathKind } from '../src/lib/df/roads';
import enemies from '../src/lib/data/dfu-enemies.json';

const [arena2, roadsMod, outArg] = process.argv.slice(2);
if (!arena2) { console.error('usage: npm run bake -- <ARENA2> [basicroads.dfmod] [outDir]'); process.exit(1); }
const out = outArg ?? 'public/data';
mkdirSync(out, { recursive: true });

const files = new Map(readdirSync(arena2).map((f) => [f.toUpperCase(), join(arena2, f)]));
const src = {
  label: arena2,
  names: () => [...files.keys()],
  file: async (n: string) => (files.has(n.toUpperCase()) ? new Blob([readFileSync(files.get(n.toUpperCase())!)]) : null),
};

const t0 = performance.now();
const g = await GameData.load(src, (m) => console.log('·', m));
const blocks = g.blocks as BlocksFile;
const maps = g.maps;

const loc: BakedGame['loc'] = {
  mapId: [], region: [], index: [], name: [], type: [], x: [], y: [], start: [], dungeonType: [],
  bw: [], bh: [], port: [], locationId: [], bld: [], blocks: [],
};
const rmb: BakedGame['rmb'] = {};
const automaps: Uint8Array[] = [];

for (const l of maps.locations) {
  const i = maps.byMapId.get(l.mapId)!;
  loc.mapId.push(l.mapId); loc.region.push(l.region); loc.index.push(l.index); loc.name.push(l.name);
  loc.type.push(l.type); loc.x.push(l.x); loc.y.push(l.y); loc.start.push(l.visibleAtStart ? 1 : 0);
  loc.dungeonType.push(l.dungeonType); loc.bw.push(maps.blockW[i]); loc.bh.push(maps.blockH[i]);
  if (!LOC_TYPES[l.type]?.town) {
    loc.port.push(0); loc.locationId.push(0); loc.bld.push([]); loc.blocks.push([]);
    continue;
  }
  const d = maps.detail(l);
  loc.port.push(d.port ? 1 : 0);
  loc.locationId.push(d.locationId);
  loc.bld.push(d.buildings
    .filter((b) => NAMED_BUILDING_TYPES.has(b.type) || b.type === BldType.HouseForSale)
    .flatMap((b) => [b.type, b.nameSeed, b.factionId, b.quality]));
  const names: string[] = [];
  for (const raw of d.blockNames) {
    const name = blocks.resolveName(raw) ?? raw;
    names.push(name);
    if (rmb[name]) continue;
    const block = await blocks.rmb(name);
    if (!block) continue;
    rmb[name] = {
      i: automaps.length,
      b: block.buildings.map((b) => [b.x, b.z, b.rotation, b.data.type, b.data.nameSeed, b.data.factionId, b.data.quality, b.modelName === 'KRAVE01.HS2' ? 1 : 0]),
    };
    automaps.push(block.automap);
  }
  loc.blocks.push(names);
}

// Creature sprites (first frame), palette-indexed.
const sprites: BakedGame['sprites'] = {};
const spriteBytes: Uint8Array[] = [];
let spriteOff = 0;
for (const e of enemies as { texture?: number }[]) {
  if (e.texture === undefined || sprites[e.texture]) continue;
  const img = await g.sprite(e.texture);
  if (!img) continue;
  sprites[e.texture] = [img.width, img.height, spriteOff];
  spriteBytes.push(img.data);
  spriteOff += img.data.length;
}

// Roads (optional): raw direction grids from the Basic Roads mod.
let roads: BakedGame['roads'] = null;
if (roadsMod) {
  const data = readUnityFs(new Uint8Array(readFileSync(roadsMod)));
  const kinds: PathKind[] = [];
  const grids: Uint8Array[] = [];
  const ASSET: Record<PathKind, string> = { road: 'roadData', track: 'trackData', river: 'riverData', stream: 'streamData' };
  for (const k of PATH_KINDS) {
    const grid = findTextAsset(data, ASSET[k], 500000);
    if (grid) { kinds.push(k); grids.push(grid); }
  }
  roads = { source: 'Basic Roads mod (Hazelnut)', kinds };
  writeFileSync(join(out, 'roads.bin'), gzipSync(concat(grids), { level: 9 }));
}

const baked: BakedGame = {
  version: BAKE_VERSION,
  fingerprint: g.fingerprint,
  bakedAt: new Date().toISOString(),
  regions: maps.regions.map((r) => ({ index: r.index, locationCount: r.locationCount })),
  loc,
  factions: g.factions?.toList() ?? [],
  rmb,
  sprites,
  roads,
};

const rasterParts: Record<string, Uint8Array> = {
  world: g.world, politic: g.politic, climate: g.climate!, fmapPal: g.fmapPal, artPal: g.artPal!,
  overview: g.overview!.data, picker: g.regionPicker!.data,
};
const raster = concat(RASTER_PARTS.map(([name, size]) => {
  const p = rasterParts[name];
  if (p.length !== size) throw new Error(`${name}: expected ${size} bytes, got ${p.length}`);
  return p;
}));

const write = (name: string, bytes: Uint8Array) => {
  const gz = gzipSync(bytes, { level: 9 });
  writeFileSync(join(out, name), gz);
  console.log(`  ${name.padEnd(12)} ${(bytes.length / 1024).toFixed(0).padStart(6)} KB -> ${(gz.length / 1024).toFixed(0).padStart(5)} KB`);
};
write('game.bin', new TextEncoder().encode(JSON.stringify(baked)));
write('raster.bin', raster);
write('blocks.bin', concat(automaps));
write('sprites.bin', concat(spriteBytes));
console.log(`baked ${loc.mapId.length} locations, ${automaps.length} blocks, ${Object.keys(sprites).length} sprites${roads ? `, roads (${roads.kinds.join(', ')})` : ''} in ${((performance.now() - t0) / 1000).toFixed(1)}s`);

function concat(parts: Uint8Array[]) {
  const outBuf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { outBuf.set(p, o); o += p.length; }
  return outBuf;
}
