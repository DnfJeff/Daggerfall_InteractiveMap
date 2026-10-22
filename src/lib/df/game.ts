import { BlocksFile, type BlocksData } from './blocks';
import { BETONY, LOC_TYPES, REGION_MAP_OFFSETS, REGION_NAMES, REGION_RACES, REGION_TEMPLES, WORLD_H, WORLD_W, regionMapNames } from './constants';
import { Directory } from './directory';
import { climateKey, type ClimateKey } from './encounters';
import { Factions, FACTION_TYPE_PROVINCE } from './factions';
import { PAK_W, parseImg, parsePak, parsePalette, type IndexedImage, type Palette } from './images';
import { MapsFile, type LocationSummary, type MapsData } from './maps';
import { readBytes, readText, type GameSource } from './source';
import { buildTown, type TownModel } from './town';
import { readTextureFrame } from './texture';

const RULER_TITLES = ['Lord', 'King', 'Queen', 'Duke', 'Duchess', 'Marquis', 'Marquise', 'Count', 'Countess', 'Baron', 'Baroness', 'Lord', 'Lady'];

/** Plain facts about a region, derived from the game data. */
export interface RegionFacts {
  region: number;
  land: number;
  climate: { key: ClimateKey; share: number }[];
  /** The city sharing the region's name, when there is one. */
  capital: LocationSummary | null;
  largest: LocationSummary[];
  ports: LocationSummary[];
  people: 'Breton' | 'Redguard';
  deity: string | null;
  ruler: { title: string; name: string | null } | null;
  counts: { cities: number; towns: number; villages: number; dungeons: number; temples: number; guilds: number };
  dungeonTypes: [number, number][];
}

export interface GameReport {
  ok: boolean;
  regions: number;
  locations: number;
  missing: string[];
  fingerprint: string;
}

export const REQUIRED_FILES = ['MAPS.BSA', 'BLOCKS.BSA', 'POLITIC.PAK', 'FMAP_PAL.COL'];
export const OPTIONAL_FILES = ['TRAV0I00.IMG', 'TRAV0I01.IMG', 'ART_PAL.COL', 'CLIMATE.PAK', 'FACTION.TXT'];

/** Everything parsed from one ARENA2 folder. */
export class GameData {
  maps!: MapsData;
  blocks!: BlocksData;
  factions: Factions | null = null;
  politic!: Uint8Array; // PAK_W x 500, value = region + 128 on land
  climate: Uint8Array | null = null; // PAK_W x 500, CLIMATE.PAK values (223 ocean .. 232)
  fmapPal!: Palette;
  artPal: Palette | null = null;
  overview: IndexedImage | null = null;
  regionPicker: IndexedImage | null = null;
  /** 1000x500 palette-indexed world composed from the region maps (FMAP_PAL). */
  world!: Uint8Array;
  seaIndex = 0;
  regionImages = new Map<string, IndexedImage>();
  fingerprint = '';
  /** ARENA2 folder when loaded from files; absent for baked (hosted) data. */
  src: GameSource | null = null;
  /** Overrides sprite loading (baked data ships sprites pre-extracted). */
  spriteSource: ((archive: number) => Promise<IndexedImage | null>) | null = null;
  private towns = new Map<number, Promise<TownModel>>();
  private sprites = new Map<number, Promise<IndexedImage | null>>();

  /** First frame of the first record of TEXTURE.<archive> (monster sprites), or null. */
  sprite(archive: number): Promise<IndexedImage | null> {
    let p = this.sprites.get(archive);
    if (!p && this.spriteSource) { p = this.spriteSource(archive); this.sprites.set(archive, p); }
    if (!p) {
      if (!this.src) return Promise.resolve(null);
      p = readBytes(this.src, `TEXTURE.${String(archive).padStart(3, '0')}`)
        .then((b) => (b ? readTextureFrame(b, 0, 0) : null))
        .catch(() => null);
      this.sprites.set(archive, p);
    }
    return p;
  }

  static async check(src: GameSource): Promise<{ missing: string[]; present: string[] }> {
    const names = new Set(src.names());
    return {
      missing: REQUIRED_FILES.filter((f) => !names.has(f)),
      present: [...REQUIRED_FILES, ...OPTIONAL_FILES].filter((f) => names.has(f)),
    };
  }

  static async load(src: GameSource, progress: (msg: string) => void = () => {}): Promise<GameData> {
    const g = new GameData();
    g.src = src;
    const { missing } = await GameData.check(src);
    if (missing.length) throw new Error(`Missing from this folder: ${missing.join(', ')}`);

    progress('Reading MAPS.BSA');
    const mapsBlob = (await src.file('MAPS.BSA'))!;
    const blocksBlob = (await src.file('BLOCKS.BSA'))!;
    g.fingerprint = await fingerprint([mapsBlob, blocksBlob]);
    g.maps = await MapsFile.load(mapsBlob);
    progress('Indexing BLOCKS.BSA');
    g.blocks = await BlocksFile.load(blocksBlob);

    progress('Reading palettes and political map');
    g.politic = parsePak((await readBytes(src, 'POLITIC.PAK'))!);
    g.fmapPal = parsePalette((await readBytes(src, 'FMAP_PAL.COL'))!);
    const clim = await readBytes(src, 'CLIMATE.PAK');
    if (clim) g.climate = parsePak(clim);
    const art = await readBytes(src, 'ART_PAL.COL');
    if (art) g.artPal = parsePalette(art);
    const ov = await readBytes(src, 'TRAV0I00.IMG');
    if (ov) g.overview = parseImg(ov);
    const picker = await readBytes(src, 'TRAV0I01.IMG');
    if (picker) g.regionPicker = parseImg(picker);

    const facText = await readText(src, 'FACTION.TXT');
    if (facText) g.factions = Factions.parse(facText);

    progress('Composing region maps');
    for (const name of Object.keys(REGION_MAP_OFFSETS)) {
      const b = await readBytes(src, name);
      const img = b ? parseImg(b) : null;
      if (img) g.regionImages.set(name, img);
    }
    g.world = g.composeWorld();
    progress('Ready');
    return g;
  }

  /** Politic region at a world pixel, or -1 for sea / unclaimed. */
  regionAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return -1;
    const v = this.politic[y * PAK_W + x + 1];
    return v >= 128 ? v - 128 : -1;
  }

  /**
   * Seamless 1000x500 map from the game's own region art: each land pixel takes its colour
   * from its own region's FMAP image; sea and gaps take any image covering them.
   */
  private composeWorld(): Uint8Array {
    const world = new Uint8Array(WORLD_W * WORLD_H);
    const covered = new Uint8Array(WORLD_W * WORLD_H);
    const sample = (name: string, x: number, y: number): number => {
      const img = this.regionImages.get(name);
      const off = REGION_MAP_OFFSETS[name];
      if (!img || !off) return -1;
      const lx = x - off[0], ly = y - off[1];
      if (lx < 0 || ly < 0 || lx >= img.width || ly >= img.height) return -1;
      return img.data[ly * img.width + lx];
    };
    // Pass 1: sea / anything, from every (1:1 scale) image.
    for (const [name, img] of this.regionImages) {
      if (name === 'FMAP0I19.IMG') continue; // Betony is drawn at 4x
      const [ox, oy] = REGION_MAP_OFFSETS[name];
      for (let y = 0; y < img.height; y++) {
        const wy = oy + y;
        if (wy >= WORLD_H) break;
        for (let x = 0; x < img.width; x++) {
          const wx = ox + x;
          if (wx >= WORLD_W) break;
          const i = wy * WORLD_W + wx;
          if (!covered[i]) { world[i] = img.data[y * img.width + x]; covered[i] = 1; }
        }
      }
    }
    // Open sea beyond every region image: use the most common sea colour.
    const freq = new Uint32Array(256);
    for (let i = 0; i < world.length; i++) if (covered[i] && this.politic[(i / WORLD_W | 0) * PAK_W + (i % WORLD_W) + 1] < 128) freq[world[i]]++;
    let sea = 0;
    for (let c = 1; c < 256; c++) if (freq[c] > freq[sea]) sea = c;
    for (let i = 0; i < world.length; i++) if (!covered[i]) world[i] = sea;
    this.seaIndex = sea;
    // Pass 2: land pixels from their own region's art. Each region map draws its own region in
    // highlighted colours and neighbours dimmed, so learn the dimmed -> highlighted palette mapping
    // from pixels both images cover, and apply it where a region's own art doesn't reach.
    const own = new Int16Array(WORLD_W * WORLD_H).fill(-1);
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        const r = this.regionAt(x, y);
        if (r < 0 || r === BETONY) continue;
        for (const name of regionMapNames(r)) {
          const v = sample(name, x, y);
          if (v >= 0) { own[y * WORLD_W + x] = v; break; }
        }
      }
    }
    const pairs = new Uint32Array(256 * 256);
    for (let i = 0; i < world.length; i++) {
      if (own[i] >= 0 && covered[i] && world[i] !== own[i]) pairs[world[i] * 256 + own[i]]++;
    }
    const lift = new Int16Array(256).fill(-1);
    for (let d = 0; d < 256; d++) {
      let best = -1, n = 0, total = 0;
      for (let l = 0; l < 256; l++) {
        const c = pairs[d * 256 + l];
        total += c;
        if (c > n) { n = c; best = l; }
      }
      if (best >= 0 && n >= 20 && n / total > 0.3) lift[d] = best;
    }
    for (let i = 0; i < world.length; i++) {
      if (own[i] >= 0) world[i] = own[i];
      else if (this.politic[(i / WORLD_W | 0) * PAK_W + (i % WORLD_W) + 1] >= 128 && lift[world[i]] >= 0) world[i] = lift[world[i]];
    }
    return world;
  }

  regionName(i: number) { return REGION_NAMES[i] ?? `Region ${i}`; }

  climateAt(x: number, y: number): number {
    if (!this.climate || x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return 223;
    return this.climate[y * PAK_W + x + 1];
  }

  private dir: Directory | null = null;
  /** What every settlement offers. Built on first use (~11k MAPS.BSA reads, no blocks). */
  directory(): Directory {
    return (this.dir ??= Directory.build(this.maps, this.factions));
  }

  private facts = new Map<number, RegionFacts>();
  regionFacts(region: number): RegionFacts {
    let f = this.facts.get(region);
    if (f) return f;
    const climate = new Map<ClimateKey, number>();
    let land = 0;
    for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
      if (this.regionAt(x, y) !== region) continue;
      land++;
      const k = climateKey(this.climateAt(x, y));
      if (k) climate.set(k, (climate.get(k) ?? 0) + 1);
    }
    const locs = this.maps.locations.filter((l) => l.region === region);
    const dir = this.directory();
    const settlements = locs.filter((l) => l.type <= 2).sort((a, b) => this.maps.blocksOf(b) - this.maps.blocksOf(a));
    const named = settlements.find((l) => l.name === REGION_NAMES[region] && l.type === 0) ?? null;
    const prov = this.factions?.byTypeAndRegion(FACTION_TYPE_PROVINCE, region);
    const exactProv = prov && prov.region === region ? prov : null;
    const rulerFaction = exactProv?.children.map((id) => this.factions!.get(id)).find((c) => c?.type === 4) ?? null;
    const deityId = REGION_TEMPLES[region] ?? 0;
    const services = (key: string) => locs.filter((l) => dir.towns.get(l.mapId)?.offers.has(key)).length;
    f = {
      region,
      land,
      climate: [...climate.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, share: land ? n / land : 0 })),
      capital: named,
      largest: settlements.slice(0, 3),
      ports: locs.filter((l) => dir.towns.get(l.mapId)?.port).sort((a, b) => this.maps.blocksOf(b) - this.maps.blocksOf(a)),
      people: REGION_RACES[region] === 1 ? 'Redguard' : 'Breton',
      deity: deityId ? this.factions?.get(deityId)?.name ?? null : null,
      ruler: exactProv && exactProv.ruler ? { title: RULER_TITLES[exactProv.ruler] ?? 'Lord', name: rulerFaction?.name ?? null } : null,
      counts: {
        cities: locs.filter((l) => l.type === 0).length,
        towns: locs.filter((l) => l.type === 1).length,
        villages: locs.filter((l) => l.type === 2).length,
        dungeons: locs.filter((l) => LOC_TYPES[l.type]?.layer === 'dungeons').length,
        temples: services('temple:*'),
        guilds: services('guild:*'),
      },
      dungeonTypes: [...locs.reduce((m, l) => (l.dungeonType !== 255 && LOC_TYPES[l.type]?.layer === 'dungeons' ? m.set(l.dungeonType, (m.get(l.dungeonType) ?? 0) + 1) : m), new Map<number, number>())]
        .sort((a, b) => b[1] - a[1]),
    };
    this.facts.set(region, f);
    return f;
  }

  town(loc: LocationSummary): Promise<TownModel> {
    let p = this.towns.get(loc.mapId);
    if (!p) {
      const detail = this.maps.detail(loc);
      p = buildTown(detail, this.blocks, {
        regionIndex: loc.region,
        regionName: this.regionName(loc.region),
        locationName: loc.name,
        factions: this.factions,
      });
      this.towns.set(loc.mapId, p);
      p.catch(() => this.towns.delete(loc.mapId));
    }
    return p;
  }
}

/** Identity of a "world" for atlas purposes: data file sizes + a sample of MAPS.BSA. */
async function fingerprint(blobs: Blob[]): Promise<string> {
  const parts: string[] = [];
  for (const b of blobs) {
    const head = new Uint8Array(await b.slice(0, 4096).arrayBuffer());
    const tail = new Uint8Array(await b.slice(Math.max(0, b.size - 4096)).arrayBuffer());
    let h = 2166136261;
    for (const arr of [head, tail]) for (let i = 0; i < arr.length; i++) { h ^= arr[i]; h = Math.imul(h, 16777619); }
    parts.push(`${b.size.toString(36)}-${(h >>> 0).toString(36)}`);
  }
  return parts.join('.');
}
