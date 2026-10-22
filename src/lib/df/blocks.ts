import { BsaArchive } from './bsa';
import { Reader } from './bytes';
import type { BuildingRecord } from './maps';

/** The parts of an RMB block a 2D town map needs. */
export interface RmbBlock {
  name: string;
  /** 64x64 automap; pixel value = building type + 1, 0 = empty. Top-down rows. */
  automap: Uint8Array;
  /** One per building sub-record, in record order. */
  buildings: { x: number; z: number; rotation: number; data: BuildingRecord; modelName: string }[];
}

const RMB_SIZE = 4096; // world units per block edge

/** What town building needs from block data (BLOCKS.BSA, or baked data for the web map). */
export interface BlocksData {
  readonly count: number;
  rmb(name: string): Promise<RmbBlock | null>;
}

export class BlocksFile implements BlocksData {
  private cache = new Map<string, RmbBlock>();
  private constructor(private bsa: BsaArchive) {}

  static async load(blob: Blob) {
    return new BlocksFile(await BsaArchive.open(blob));
  }

  get count() { return this.bsa.count; }

  /** DFU's CheckName: unknown names fall back to the last block sharing prefix and 6-char suffix. */
  resolveName(name: string): string | null {
    if (this.bsa.indexOf(name) >= 0) return name;
    const prefix = name.slice(0, 4);
    const suffix = name.slice(-6);
    let found: string | null = null;
    for (const e of this.bsa.entries) {
      if (e.name.startsWith(prefix) && e.name.endsWith(suffix)) found = e.name;
    }
    return found;
  }

  async rmb(name: string): Promise<RmbBlock | null> {
    const resolved = this.resolveName(name);
    if (!resolved) return null;
    const hit = this.cache.get(resolved);
    if (hit) return hit;
    const bytes = await this.bsa.read(this.bsa.indexOf(resolved));
    const block = parseRmb(resolved, bytes);
    this.cache.set(resolved, block);
    return block;
  }
}

export function parseRmb(name: string, bytes: Uint8Array): RmbBlock {
  const r = new Reader(bytes);
  const numRecords = r.u8();
  r.u8(); r.u8();
  const positions: { x: number; z: number; rot: number }[] = [];
  for (let i = 0; i < 32; i++) {
    r.u32(); r.u32();
    const x = r.i32();
    const z = r.i32();
    const rot = r.i32();
    positions.push({ x, z, rot });
  }
  const data: BuildingRecord[] = [];
  for (let i = 0; i < 32; i++) {
    const nameSeed = r.u16();
    r.skip(4 + 2 + 2 + 4 + 4);
    const factionId = r.u16();
    const sector = r.i16();
    const locationId = r.u16();
    const type = r.u8();
    const quality = r.u8();
    data.push({ nameSeed, factionId, sector, locationId, type, quality });
  }
  r.skip(32 * 4); // section 2 unknown
  r.skip(32 * 4); // block data sizes
  r.skip(8 + 256 + 256); // ground header, tiles, scenery
  const automap = r.take(64 * 64).slice();
  // Strip ground-flat speckles, as DFU does for its exterior automap.
  for (let i = 0; i < automap.length; i++) if (automap[i] === 0xfb) automap[i] = 0;
  r.cstr(13);
  const otherNames: string[] = [];
  for (let i = 0; i < 32; i++) otherNames.push(r.cstr(13));

  const buildings = [];
  for (let i = 0; i < numRecords; i++) {
    buildings.push({
      x: positions[i].x,
      z: positions[i].z,
      rotation: positions[i].rot,
      data: data[i],
      modelName: otherNames[i] ?? '',
    });
  }
  return { name, automap, buildings };
}

export { RMB_SIZE };
