// Baked game data: everything the map needs, pre-extracted from a Daggerfall install by
// `npm run bake` (scripts/bake.ts) so the hosted web map works with no game files.
// Contains derived data only (positions, names, town layouts, recombined map art), never the
// original ARENA2 files. Files are gzip-compressed and named .bin so static hosts serve them as-is.
import type { BlocksData, RmbBlock } from './blocks';
import { REGION_NAMES } from './constants';
import { Factions } from './factions';
import { GameData } from './game';
import { PAK_H, PAK_W, type IndexedImage } from './images';
import type { BuildingRecord, LocationDetail, LocationSummary, MapsData, RegionSummary } from './maps';
import { roadsFromGrids, type PathKind, type RoadData } from './roads';

export const BAKE_VERSION = 1;

/** data/game.bin (gzip JSON) */
export interface BakedGame {
  version: number;
  fingerprint: string;
  bakedAt: string;
  regions: { index: number; locationCount: number }[];
  /** Columnar location table; index i is one location. */
  loc: {
    mapId: number[]; region: number[]; index: number[]; name: string[]; type: number[]; x: number[]; y: number[];
    start: number[]; dungeonType: number[]; bw: number[]; bh: number[]; port: number[]; locationId: number[];
    /** Named buildings (+ houses for sale), flattened [type, seed, faction, quality]*. */
    bld: number[][];
    /** Resolved RMB block names (row-major), for settlements. */
    blocks: string[][];
  };
  factions: [number, string, number, number, number, number][];
  /** Block name -> index into blocks.bin automaps, plus its building records. */
  rmb: Record<string, { i: number; b: number[][] }>;
  /** Creature sprites: archive -> [width, height, offset into sprites.bin]. */
  sprites: Record<string, [number, number, number]>;
  roads: { source: string; kinds: PathKind[] } | null;
}

/** data/raster.bin layout (gzip): world, politic, climate, fmapPal, artPal, overview, picker. */
export const RASTER_PARTS = [
  ['world', 1000 * 500], ['politic', PAK_W * PAK_H], ['climate', PAK_W * PAK_H],
  ['fmapPal', 768], ['artPal', 768], ['overview', 320 * 200], ['picker', 320 * 200],
] as const;

// ---------------------------------------------------------------- loading

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes; // host already decompressed it
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function fetchBin(base: string, name: string): Promise<Uint8Array> {
  const r = await fetch(`${base}${name}`);
  if (!r.ok) throw new Error(`Could not load map data (${name}: ${r.status})`);
  return gunzip(new Uint8Array(await r.arrayBuffer()));
}

export async function loadBaked(base: string, progress: (msg: string) => void = () => {}): Promise<{ game: GameData; roads: RoadData | null }> {
  progress('Loading map data');
  const [gameBytes, raster, blocksBin, spritesBin] = await Promise.all([
    fetchBin(base, 'game.bin'), fetchBin(base, 'raster.bin'), fetchBin(base, 'blocks.bin'), fetchBin(base, 'sprites.bin'),
  ]);
  const baked = JSON.parse(new TextDecoder().decode(gameBytes)) as BakedGame;
  if (baked.version > BAKE_VERSION) throw new Error('Map data is newer than this app; reload the page.');

  const g = new GameData();
  g.fingerprint = baked.fingerprint;
  let off = 0;
  const part: Record<string, Uint8Array> = {};
  for (const [name, size] of RASTER_PARTS) { part[name] = raster.subarray(off, off + size); off += size; }
  g.world = part.world;
  g.politic = part.politic;
  g.climate = part.climate;
  g.fmapPal = part.fmapPal;
  g.artPal = part.artPal;
  g.overview = { width: 320, height: 200, data: part.overview };
  g.regionPicker = { width: 320, height: 200, data: part.picker };
  g.factions = Factions.fromList(baked.factions);
  g.maps = new BakedMaps(baked);
  g.blocks = new BakedBlocks(baked.rmb, blocksBin);
  g.spriteSource = async (archive) => {
    const s = baked.sprites[String(archive)];
    if (!s) return null;
    const [w, h, o] = s;
    return { width: w, height: h, data: spritesBin.subarray(o, o + w * h) } as IndexedImage;
  };

  let roads: RoadData | null = null;
  if (baked.roads) {
    progress('Loading roads');
    const bytes = await fetchBin(base, 'roads.bin');
    const grids: Partial<Record<PathKind, Uint8Array>> = {};
    baked.roads.kinds.forEach((k, i) => (grids[k] = bytes.slice(i * 500000, (i + 1) * 500000)));
    roads = roadsFromGrids(grids, baked.roads.source);
  }
  return { game: g, roads };
}

class BakedMaps implements MapsData {
  regions: RegionSummary[];
  locations: LocationSummary[] = [];
  byPixel = new Map<number, number>();
  byMapId = new Map<number, number>();
  blockW: Uint8Array;
  blockH: Uint8Array;

  constructor(private baked: BakedGame) {
    const L = baked.loc;
    this.regions = baked.regions.map((r) => ({ index: r.index, name: REGION_NAMES[r.index] ?? `Region ${r.index}`, locationCount: r.locationCount }));
    this.blockW = Uint8Array.from(L.bw);
    this.blockH = Uint8Array.from(L.bh);
    for (let i = 0; i < L.mapId.length; i++) {
      const loc: LocationSummary = {
        mapId: L.mapId[i], region: L.region[i], index: L.index[i], name: L.name[i], type: L.type[i],
        x: L.x[i], y: L.y[i], visibleAtStart: L.start[i] === 1, dungeonType: L.dungeonType[i],
      };
      this.locations.push(loc);
      this.byPixel.set(loc.y * 1000 + loc.x, i);
      if (!this.byMapId.has(loc.mapId)) this.byMapId.set(loc.mapId, i);
    }
  }

  locationAt(x: number, y: number) { const i = this.byPixel.get(y * 1000 + x); return i === undefined ? null : this.locations[i]; }
  locationByMapId(mapId: number) { const i = this.byMapId.get(mapId); return i === undefined ? null : this.locations[i]; }
  blocksOf(loc: LocationSummary) { const i = this.byMapId.get(loc.mapId); return i === undefined ? 0 : this.blockW[i] * this.blockH[i]; }

  detail(loc: LocationSummary): LocationDetail {
    const i = this.byMapId.get(loc.mapId)!;
    const L = this.baked.loc;
    const flat = L.bld[i] ?? [];
    const buildings: BuildingRecord[] = [];
    for (let k = 0; k + 3 < flat.length; k += 4) {
      buildings.push({ type: flat[k], nameSeed: flat[k + 1], factionId: flat[k + 2], quality: flat[k + 3], sector: 0, locationId: 0 });
    }
    return {
      summary: loc, locationId: L.locationId[i], buildings,
      width: L.bw[i], height: L.bh[i], blockNames: L.blocks[i] ?? [], port: L.port[i] === 1, dungeon: null,
    };
  }
}

class BakedBlocks implements BlocksData {
  private cache = new Map<string, RmbBlock>();
  constructor(private index: BakedGame['rmb'], private automaps: Uint8Array) {}
  get count() { return Object.keys(this.index).length; }

  async rmb(name: string): Promise<RmbBlock | null> {
    const hit = this.cache.get(name);
    if (hit) return hit;
    const e = this.index[name];
    if (!e) return null;
    const block: RmbBlock = {
      name,
      automap: this.automaps.subarray(e.i * 4096, e.i * 4096 + 4096),
      buildings: e.b.map(([x, z, rotation, type, seed, faction, quality, raven]) => ({
        x, z, rotation,
        data: { type, nameSeed: seed, factionId: faction, quality, sector: 0, locationId: 0 },
        modelName: raven ? 'KRAVE01.HS2' : '',
      })),
    };
    this.cache.set(name, block);
    return block;
  }
}
