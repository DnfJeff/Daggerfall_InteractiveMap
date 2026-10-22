import type { BlocksData, RmbBlock } from './blocks';
import { RMB_SIZE } from './blocks';
import { NAMED_BUILDING_TYPES, BldType, buildingKey } from './constants';
import type { LocationDetail, BuildingRecord } from './maps';
import { buildingName, type NameContext } from './names';

export interface TownBuilding {
  /** DFU building key; matches DiscoveryData in DFU saves. */
  key: number;
  blockX: number;
  blockY: number;
  record: number;
  type: number;
  quality: number;
  factionId: number;
  nameSeed: number;
  /** Generated vanilla name, '' for residences. */
  name: string;
  /** Label anchor in town-map pixels (64 per block). */
  cx: number;
  cy: number;
  /** Footprint bounding box in town-map pixels; empty if the building never draws. */
  bbox: [number, number, number, number] | null;
  pixelCount: number;
}

export interface TownModel {
  detail: LocationDetail;
  width: number; // pixels
  height: number;
  /** Automap value per pixel (building type + 1, 0 empty). */
  automap: Uint8Array;
  /** Index into `buildings` per pixel, -1 if none. */
  owner: Int32Array;
  buildings: TownBuilding[];
  missingBlocks: string[];
}

const PX = 64;

export async function buildTown(detail: LocationDetail, blocks: BlocksData, ctx: NameContext): Promise<TownModel> {
  const { width: bw, height: bh } = detail;
  const W = bw * PX, H = bh * PX;
  const automap = new Uint8Array(W * H);
  const buildings: TownBuilding[] = [];
  const missingBlocks: string[] = [];

  // Named buildings appear in the same order in MAPS.BSA and in the blocks (DFU RMBLayout).
  const pool = detail.buildings.filter((b) => NAMED_BUILDING_TYPES.has(b.type)).map((b) => ({ b, used: false }));
  const takeFromPool = (type: number): BuildingRecord | null => {
    const item = pool.find((p) => !p.used && p.b.type === type);
    if (!item) return null;
    item.used = true;
    return item.b;
  };

  // Block grid y=0 is the SOUTH row; the automap is drawn with north up.
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const name = detail.blockNames[by * bw + bx];
      const block: RmbBlock | null = await blocks.rmb(name);
      if (!block) { missingBlocks.push(name); continue; }
      const ox = bx * PX;
      const oy = (bh - 1 - by) * PX;
      for (let y = 0; y < PX; y++) {
        automap.set(block.automap.subarray(y * PX, y * PX + PX), (oy + y) * W + ox);
      }
      block.buildings.forEach((rec, i) => {
        let data = { ...rec.data };
        if (NAMED_BUILDING_TYPES.has(data.type)) {
          const city = takeFromPool(data.type);
          if (city) data = { ...data, nameSeed: city.nameSeed, factionId: city.factionId, sector: city.sector, locationId: city.locationId, quality: city.quality };
          if (rec.modelName === 'KRAVE01.HS2') data = { ...data, type: BldType.GuildHall, factionId: 414 };
        }
        buildings.push({
          key: buildingKey(bx, by, i),
          blockX: bx,
          blockY: by,
          record: i,
          type: data.type,
          quality: data.quality,
          factionId: data.factionId,
          nameSeed: data.nameSeed,
          name: buildingName(data.nameSeed, data.type, data.factionId, ctx),
          cx: ox + (rec.x / RMB_SIZE) * PX,
          cy: oy + (rec.z / RMB_SIZE) * PX,
          bbox: null,
          pixelCount: 0,
        });
      });
    }
  }

  const owner = assignOwnership(automap, W, H, buildings);
  return { detail, width: W, height: H, automap, owner, buildings, missingBlocks };
}

/**
 * Splits the automap into 4-connected same-value components and gives each to the nearest
 * building record of the matching type (falling back to the nearest record of any type).
 * Label anchors move to the component centroid so names sit on the footprint.
 */
function assignOwnership(automap: Uint8Array, W: number, H: number, buildings: TownBuilding[]) {
  const owner = new Int32Array(W * H).fill(-1);
  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  const sums = buildings.map(() => ({ x: 0, y: 0, n: 0, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }));

  for (let start = 0; start < automap.length; start++) {
    const v = automap[start];
    if (!v || seen[start]) continue;
    const comp: number[] = [];
    stack.push(start);
    seen[start] = 1;
    let sx = 0, sy = 0;
    while (stack.length) {
      const p = stack.pop()!;
      comp.push(p);
      const x = p % W, y = (p / W) | 0;
      sx += x; sy += y;
      if (x > 0) visit(p - 1);
      if (x < W - 1) visit(p + 1);
      if (y > 0) visit(p - W);
      if (y < H - 1) visit(p + W);
    }
    const mx = sx / comp.length, my = sy / comp.length;
    let best = -1, bestD = Infinity, bestAny = -1, bestAnyD = Infinity;
    buildings.forEach((b, i) => {
      const d = (b.cx - mx) ** 2 + (b.cy - my) ** 2;
      if (b.type === v - 1 && d < bestD) { best = i; bestD = d; }
      if (d < bestAnyD) { bestAny = i; bestAnyD = d; }
    });
    const idx = best >= 0 && bestD < 64 * 64 ? best : bestAny;
    if (idx < 0) continue;
    const s = sums[idx];
    for (const p of comp) {
      owner[p] = idx;
      const x = p % W, y = (p / W) | 0;
      s.x += x; s.y += y; s.n++;
      if (x < s.x0) s.x0 = x; if (y < s.y0) s.y0 = y;
      if (x > s.x1) s.x1 = x; if (y > s.y1) s.y1 = y;
    }

    function visit(q: number) {
      if (!seen[q] && automap[q] === v) { seen[q] = 1; stack.push(q); }
    }
  }

  buildings.forEach((b, i) => {
    const s = sums[i];
    if (s.n) {
      b.cx = s.x / s.n + 0.5;
      b.cy = s.y / s.n + 0.5;
      b.bbox = [s.x0, s.y0, s.x1 + 1, s.y1 + 1];
      b.pixelCount = s.n;
    }
  });
  return owner;
}
