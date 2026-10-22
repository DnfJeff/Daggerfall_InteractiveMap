import { BsaArchive } from './bsa';
import { Reader, decodeCString } from './bytes';
import { REGION_NAMES, RMB_PREFIXES, RDB_LETTERS, lonLatToPixel } from './constants';

/** One row of the world index: everything needed to draw and search the map. */
export interface LocationSummary {
  /** Stable atlas anchor: MapTable MapId (unique across the world in vanilla data). */
  mapId: number;
  region: number;
  index: number;
  name: string;
  type: number;
  x: number;
  y: number;
  /** "Discovered" bit in the map table: visible on the travel map from the start of a new game. */
  visibleAtStart: boolean;
  dungeonType: number; // 255 = none
}

export interface RegionSummary {
  index: number;
  name: string;
  locationCount: number;
}

export interface BuildingRecord {
  nameSeed: number;
  factionId: number;
  sector: number;
  locationId: number;
  type: number;
  quality: number;
}

export interface LocationDetail {
  summary: LocationSummary;
  locationId: number;
  buildings: BuildingRecord[];
  width: number;
  height: number;
  /** Row-major RMB block names, width*height. */
  blockNames: string[];
  /** Exterior flag: ships can be bought at this town's banks (a port). */
  port: boolean;
  dungeon: DungeonLayout | null;
}

export interface DungeonBlock { x: number; z: number; name: string; isStart: boolean }
export interface DungeonLayout { blocks: DungeonBlock[] }

/** The main quest's opening dungeon, known to every character from the first minute. */
export const START_DUNGEON = { region: 17, name: "Privateer's Hold" };

/**
 * What the app needs from the world's location data. `MapsFile` reads it from MAPS.BSA;
 * `BakedMaps` (baked.ts) serves the same from pre-extracted data for the hosted web map.
 */
export interface MapsData {
  regions: RegionSummary[];
  locations: LocationSummary[];
  byPixel: Map<number, number>;
  byMapId: Map<number, number>;
  blockW: Uint8Array;
  blockH: Uint8Array;
  locationAt(x: number, y: number): LocationSummary | null;
  locationByMapId(mapId: number): LocationSummary | null;
  blocksOf(loc: LocationSummary): number;
  detail(loc: LocationSummary): LocationDetail;
}

interface RegionRecords { pItem: Uint8Array; dItem: Uint8Array; table: Uint8Array; names: Uint8Array }

export class MapsFile implements MapsData {
  regions: RegionSummary[] = [];
  locations: LocationSummary[] = [];
  /** Packed world pixel id (y*1000+x) -> location index into `locations`. */
  byPixel = new Map<number, number>();
  byMapId = new Map<number, number>();
  private raw: RegionRecords[] = [];

  static async load(blob: Blob): Promise<MapsFile> {
    const bsa = await BsaArchive.open(blob);
    const rec = await bsa.readAll();
    const m = new MapsFile();
    const regionCount = Math.floor(bsa.count / 4);
    for (let r = 0; r < regionCount; r++) {
      const base = r * 4;
      const records = { pItem: rec(base), dItem: rec(base + 1), table: rec(base + 2), names: rec(base + 3) };
      m.raw.push(records);
      m.readRegion(r, records);
    }
    m.readSizes();
    return m;
  }

  /** Exterior block grid width/height per location (8x8 = a full city). Index matches `locations`. */
  blockW = new Uint8Array(0);
  blockH = new Uint8Array(0);

  private readSizes() {
    this.blockW = new Uint8Array(this.locations.length);
    this.blockH = new Uint8Array(this.locations.length);
    this.locations.forEach((loc, li) => {
      const rec = this.raw[loc.region];
      const r = new Reader(rec.pItem);
      const count = new Reader(rec.names).u32();
      r.seek(count * 4 + r.seek(loc.index * 4).u32());
      const doors = r.u32();
      r.skip(doors * 6 + 112);           // LocationRecordElement header
      const buildings = r.u16();
      r.skip(5 + buildings * 26 + 32 + 4 + 4);
      this.blockW[li] = r.u8();
      this.blockH[li] = r.u8();
    });
  }

  blocksOf(loc: LocationSummary) {
    const i = this.byMapId.get(loc.mapId);
    return i === undefined ? 0 : this.blockW[i] * this.blockH[i];
  }

  private readRegion(region: number, rec: RegionRecords) {
    if (rec.names.length < 4 || rec.table.length === 0) {
      this.regions.push({ index: region, name: REGION_NAMES[region] ?? `Region ${region}`, locationCount: 0 });
      return;
    }
    const names = new Reader(rec.names);
    const count = names.u32();
    const table = new Reader(rec.table);
    for (let i = 0; i < count; i++) {
      // Names are 32-byte slots; two names fill all 32 bytes with no terminator.
      const name = decodeCString(rec.names, 4 + i * 32, 32);
      const mapId = table.i32();
      const bitfield = table.u32();
      const longitude = (bitfield & 0x1ffffff) >>> 8;
      const type = ((bitfield * 4) >>> 0) >>> 27;
      const visibleAtStart = ((bitfield >>> 24) & 0x40) !== 0;
      const latitude = (table.i32() & 0xffffff) >>> 8;
      const dungeonType = table.u8();
      table.u32(); // key
      const { x, y } = lonLatToPixel(longitude, latitude);
      const loc: LocationSummary = { mapId, region, index: i, name, type, x, y, visibleAtStart, dungeonType };
      // Every new character wakes up inside Privateer's Hold; the game reveals it by script, not by flag.
      if (region === START_DUNGEON.region && name === START_DUNGEON.name) loc.visibleAtStart = true;
      const li = this.locations.length;
      this.locations.push(loc);
      this.byPixel.set(y * 1000 + x, li);
      if (!this.byMapId.has(mapId)) this.byMapId.set(mapId, li);
    }
    this.regions.push({ index: region, name: REGION_NAMES[region] ?? `Region ${region}`, locationCount: count });
  }

  locationAt(x: number, y: number): LocationSummary | null {
    const i = this.byPixel.get(y * 1000 + x);
    return i === undefined ? null : this.locations[i];
  }

  locationByMapId(mapId: number): LocationSummary | null {
    const i = this.byMapId.get(mapId);
    return i === undefined ? null : this.locations[i];
  }

  /** Reads the exterior (and dungeon, if any) records for one location. */
  detail(loc: LocationSummary): LocationDetail {
    const rec = this.raw[loc.region];
    const count = new Reader(rec.names).u32();
    const r = new Reader(rec.pItem);
    const offset = r.seek(loc.index * 4).u32();
    r.seek(count * 4 + offset);
    const header = readLocationRecordElement(r);

    const buildingCount = r.u16();
    r.skip(5);
    const buildings: BuildingRecord[] = [];
    for (let b = 0; b < buildingCount; b++) {
      const nameSeed = r.u16();
      r.skip(4 + 2 + 2 + 4 + 4); // service time, unknowns
      const factionId = r.u16();
      const sector = r.i16();
      const locationId = r.u16();
      const type = r.u8();
      const quality = r.u8();
      buildings.push({ nameSeed, factionId, sector, locationId, type, quality });
    }

    r.skip(32); // AnotherName
    r.i32(); // MapId
    r.u32(); // LocationId
    const width = r.u8();
    const height = r.u8();
    r.skip(4);
    const letter1 = r.u8();
    const port = r.u8() !== 0;
    r.u8();
    const blockIndex = r.take(64);
    const blockNumber = r.take(64);
    const blockChar = r.take(64);

    const blockNames: string[] = [];
    for (let i = 0; i < width * height; i++) {
      blockNames.push(resolveRmbName(blockIndex[i], blockNumber[i], blockChar[i], letter1));
    }

    return {
      summary: loc,
      locationId: header.locationId,
      buildings,
      width,
      height,
      blockNames,
      port,
      dungeon: this.readDungeon(rec.dItem, header.locationId),
    };
  }

  private readDungeon(dItem: Uint8Array, locationId: number): DungeonLayout | null {
    if (dItem.length < 4) return null;
    const r = new Reader(dItem);
    const count = r.u32();
    let found = -1;
    for (let i = 0; i < count; i++) {
      const off = r.u32();
      r.u16();
      const exteriorId = r.u16();
      if (exteriorId === locationId) { found = off; break; }
    }
    if (found < 0) return null;
    r.seek(4 + count * 8 + found);
    const header = readLocationRecordElement(r);
    r.u16(); r.u32(); r.u32();
    const blockCount = r.u16();
    r.skip(5);
    const blocks: DungeonBlock[] = [];
    for (let i = 0; i < blockCount; i++) {
      const x = r.i8();
      const z = r.i8();
      const bits = r.u16();
      const number = bits & 0x3ff;
      const isStart = (bits & 0x400) !== 0;
      const letter = RDB_LETTERS[bits >> 11] ?? 'N';
      blocks.push({ x, z, isStart, name: `${letter}${String(number).padStart(7, '0')}.RDB` });
    }
    // Classic's Orsinium fix-up: a border block overlaps another.
    if (header.locationId === 50015 && blocks[13]) blocks[13].z = -2;
    return { blocks };
  }
}

function readLocationRecordElement(r: Reader) {
  const doorCount = r.u32();
  r.skip(doorCount * 6);
  r.u32(); r.u16(); r.u8();
  const x = r.i32();
  r.u32();
  const y = r.i32();
  r.u16(); r.u16(); r.u32(); r.u32(); r.u16();
  const locationId = r.u16();
  r.u32(); r.u16(); r.u32();
  r.skip(26);
  const name = r.cstr(32);
  r.skip(9);
  return { x, y, locationId, name };
}

const LETTER2 = ['A', 'L', 'M', 'S'];

export function resolveRmbName(blockIndex: number, blockNumber: number, blockChar: number, letter1Code: number) {
  const prefix = RMB_PREFIXES[blockIndex] ?? 'FILL';
  const letter1 = blockChar & 0x10 ? String.fromCharCode(letter1Code) : 'A';
  const letter2 = LETTER2[((2 * blockChar) & 0xff) >> 6];
  const numbers = blockIndex === 13 || blockIndex === 14
    ? String.fromCharCode((blockChar & 0xf) + 65) + String(blockNumber)
    : String(blockNumber).padStart(2, '0');
  return `${prefix}${letter1}${letter2}${numbers}.RMB`;
}
