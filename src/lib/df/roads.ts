// Path networks from the Basic Roads mod (Hazelnut): one byte per world map pixel per path type,
// a bitmask of the 8 directions a path leaves that pixel. N is the pixel above (y - 1).
import { WORLD_H, WORLD_W } from './constants';
import { findTextAsset, readUnityFs } from './unityfs';

export type PathKind = 'road' | 'track' | 'river' | 'stream';
export const PATH_KINDS: PathKind[] = ['road', 'track', 'river', 'stream'];
const ASSET: Record<PathKind, string> = { road: 'roadData', track: 'trackData', river: 'riverData', stream: 'streamData' };

// bit -> [dx, dy]
const DIRS: [number, number, number][] = [
  [128, 0, -1], [64, 1, -1], [32, 1, 0], [16, 1, 1], [8, 0, 1], [4, -1, 1], [2, -1, 0], [1, -1, -1],
];

/** A smoothed polyline in world units (map pixels, centres at +0.5). */
export interface Polyline { pts: Float32Array; x0: number; y0: number; x1: number; y1: number }

export interface PathNetwork {
  kind: PathKind;
  grid: Uint8Array;
  lines: Polyline[];
  pixels: number;
}

export interface RoadData { source: string; networks: Partial<Record<PathKind, PathNetwork>> }

export function loadBasicRoads(bundle: Uint8Array, source: string): RoadData {
  const data = readUnityFs(bundle);
  const grids: Partial<Record<PathKind, Uint8Array>> = {};
  for (const kind of PATH_KINDS) {
    const grid = findTextAsset(data, ASSET[kind], WORLD_W * WORLD_H);
    if (grid) grids[kind] = grid.slice();
  }
  if (!grids.road && !grids.track) throw new Error('No road or track data found in this mod file.');
  return roadsFromGrids(grids, source);
}

/** Builds vector networks from raw 1000x500 direction grids (as extracted or baked). */
export function roadsFromGrids(grids: Partial<Record<PathKind, Uint8Array>>, source: string): RoadData {
  const networks: RoadData['networks'] = {};
  for (const kind of PATH_KINDS) if (grids[kind]) networks[kind] = vectorize(kind, grids[kind]!);
  return { source, networks };
}

/** Walks the pixel graph into chains between junctions/ends, then Chaikin-smooths each chain. */
function vectorize(kind: PathKind, grid: Uint8Array): PathNetwork {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H ? 0 : grid[y * WORLD_W + x]);
  // Only keep edges both ends agree on, so stray bits don't produce dangling spurs.
  const edges = (x: number, y: number) => {
    const v = at(x, y);
    const out: [number, number][] = [];
    for (let d = 0; d < 8; d++) {
      const [bit, dx, dy] = DIRS[d];
      if (!(v & bit)) continue;
      const back = DIRS[(d + 4) % 8][0];
      if (at(x + dx, y + dy) & back) out.push([x + dx, y + dy]);
    }
    return out;
  };
  const used = new Set<number>();
  const key = (ax: number, ay: number, bx: number, by: number) => {
    const a = ay * WORLD_W + ax, b = by * WORLD_W + bx;
    return a < b ? a * 600000 + b : b * 600000 + a;
  };
  const lines: Polyline[] = [];
  let pixels = 0;
  const degree = (x: number, y: number) => edges(x, y).length;

  const walk = (sx: number, sy: number, nx: number, ny: number) => {
    const pts: number[] = [sx + 0.5, sy + 0.5];
    let px = sx, py = sy, cx = nx, cy = ny;
    used.add(key(px, py, cx, cy));
    for (;;) {
      pts.push(cx + 0.5, cy + 0.5);
      const next = edges(cx, cy).filter(([ex, ey]) => !used.has(key(cx, cy, ex, ey)));
      if (degree(cx, cy) !== 2 || next.length !== 1) break;
      const [ex, ey] = next[0];
      used.add(key(cx, cy, ex, ey));
      px = cx; py = cy; cx = ex; cy = ey;
      if (cx === sx && cy === sy) { pts.push(cx + 0.5, cy + 0.5); break; }
    }
    void px; void py;
    lines.push(smooth(pts));
  };

  // Chains starting at ends and junctions first, then any remaining loops.
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        if (!grid[y * WORLD_W + x]) continue;
        if (pass === 0) pixels++;
        const e = edges(x, y);
        if (pass === 0 && e.length === 2) continue;
        for (const [ex, ey] of e) if (!used.has(key(x, y, ex, ey))) walk(x, y, ex, ey);
      }
    }
  }
  return { kind, grid, lines, pixels };
}

/** Two rounds of Chaikin corner cutting, keeping end points fixed (they meet towns and junctions). */
function smooth(src: number[]): Polyline {
  let pts = src;
  for (let it = 0; it < 2 && pts.length >= 6; it++) {
    const out: number[] = [pts[0], pts[1]];
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
      out.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25, ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75);
    }
    out.push(pts[pts.length - 2], pts[pts.length - 1]);
    pts = out;
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i] < x0) x0 = pts[i]; if (pts[i] > x1) x1 = pts[i];
    if (pts[i + 1] < y0) y0 = pts[i + 1]; if (pts[i + 1] > y1) y1 = pts[i + 1];
  }
  return { pts: new Float32Array(pts), x0, y0, x1, y1 };
}

export function pathAt(net: PathNetwork | undefined, x: number, y: number) {
  return !!net && x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H && net.grid[y * WORLD_W + x] !== 0;
}
