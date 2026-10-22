// Pre-rendered layers derived from game data. Built once per GameData and cached.
import type { GameData } from '../df/game';
import { WORLD_H, WORLD_W, AUTOMAP_COLORS, bldCategory, LOC_TYPES, LocType } from '../df/constants';
import { toRgba, type IndexedImage } from '../df/images';
import type { TownModel } from '../df/town';

const cache = new WeakMap<GameData, WorldLayers>();

export interface WorldLayers {
  base: HTMLCanvasElement;
  /** Region border segments in world units. */
  borders: Path2D;
  regionBounds: Map<number, [number, number, number, number]>;
  regionPath(region: number): Path2D;
  dotColor: Map<number, string>;
  overview: HTMLCanvasElement | null;
}

export function worldLayers(g: GameData): WorldLayers {
  let l = cache.get(g);
  if (l) return l;

  const base = document.createElement('canvas');
  base.width = WORLD_W;
  base.height = WORLD_H;
  const img: IndexedImage = { width: WORLD_W, height: WORLD_H, data: g.world };
  base.getContext('2d')!.putImageData(toRgba(img, g.fmapPal), 0, 0);

  const borders = new Path2D();
  const bounds = new Map<number, [number, number, number, number]>();
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const r = g.regionAt(x, y);
      if (r >= 0) {
        const b = bounds.get(r);
        if (!b) bounds.set(r, [x, y, x + 1, y + 1]);
        else { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x + 1 > b[2]) b[2] = x + 1; if (y + 1 > b[3]) b[3] = y + 1; }
      }
      // Border between two different land regions (coastlines are left to the art).
      const right = x + 1 < WORLD_W ? g.regionAt(x + 1, y) : -1;
      const below = y + 1 < WORLD_H ? g.regionAt(x, y + 1) : -1;
      if (r >= 0 && right >= 0 && r !== right) { borders.moveTo(x + 1, y); borders.lineTo(x + 1, y + 1); }
      if (r >= 0 && below >= 0 && r !== below) { borders.moveTo(x, y + 1); borders.lineTo(x + 1, y + 1); }
    }
  }

  const paths = new Map<number, Path2D>();
  const regionPath = (region: number) => {
    let p = paths.get(region);
    if (p) return p;
    p = new Path2D();
    const b = bounds.get(region);
    if (b) {
      for (let y = b[1]; y < b[3]; y++) {
        let run = -1;
        for (let x = b[0]; x <= b[2]; x++) {
          const inside = x < b[2] && g.regionAt(x, y) === region;
          if (inside && run < 0) run = x;
          if (!inside && run >= 0) { p.rect(run, y, x - run, 1); run = -1; }
        }
      }
    }
    paths.set(region, p);
    return p;
  };

  const dotColor = new Map<number, string>();
  for (const [type, info] of Object.entries(LOC_TYPES)) {
    const i = info.palIndex * 3;
    dotColor.set(Number(type), `rgb(${g.fmapPal[i]},${g.fmapPal[i + 1]},${g.fmapPal[i + 2]})`);
  }
  // The game ramps dungeons from orange (large) to deep red (graveyard); the orange end is easily
  // mistaken for a settlement, so keep the size ramp but move all of it into reds.
  for (const [type, rgb] of [[LocType.DungeonLarge, '#e0352a'], [LocType.DungeonMedium, '#c42a20'], [LocType.DungeonSmall, '#a81f16'], [LocType.Graveyard, '#93100a']] as const) {
    dotColor.set(type, rgb);
  }

  let overview: HTMLCanvasElement | null = null;
  if (g.overview && g.artPal) {
    overview = document.createElement('canvas');
    overview.width = g.overview.width;
    overview.height = g.overview.height;
    overview.getContext('2d')!.putImageData(toRgba(g.overview, g.artPal), 0, 0);
  }

  l = { base, borders, regionBounds: bounds, regionPath, dotColor, overview };
  cache.set(g, l);
  return l;
}

/** Town automap as an image (1 px per automap cell) with the game's building colours. */
const townCanvases = new WeakMap<TownModel, HTMLCanvasElement>();
export function townCanvas(t: TownModel): HTMLCanvasElement {
  let c = townCanvases.get(t);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = t.width;
  c.height = t.height;
  const id = new ImageData(t.width, t.height);
  const rgb: Record<string, [number, number, number]> = {};
  for (const [k, hex] of Object.entries(AUTOMAP_COLORS)) {
    if (hex.startsWith('#')) rgb[k] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  for (let i = 0; i < t.automap.length; i++) {
    const v = t.automap[i];
    if (!v) continue;
    const col = rgb[bldCategory(v - 1)];
    if (!col) continue;
    id.data[i * 4] = col[0]; id.data[i * 4 + 1] = col[1]; id.data[i * 4 + 2] = col[2]; id.data[i * 4 + 3] = 255;
  }
  c.getContext('2d')!.putImageData(id, 0, 0);
  townCanvases.set(t, c);
  return c;
}

/** Outline path (world = town pixels) for one building's footprint. */
const footprintCache = new WeakMap<TownModel, Map<number, Path2D>>();
export function footprint(t: TownModel, index: number): Path2D {
  let m = footprintCache.get(t);
  if (!m) { m = new Map(); footprintCache.set(t, m); }
  let p = m.get(index);
  if (p) return p;
  p = new Path2D();
  const b = t.buildings[index].bbox;
  if (b) {
    const W = t.width;
    for (let y = b[1]; y < b[3]; y++) {
      for (let x = b[0]; x < b[2]; x++) {
        if (t.owner[y * W + x] !== index) continue;
        if (x === 0 || t.owner[y * W + x - 1] !== index) { p.moveTo(x, y); p.lineTo(x, y + 1); }
        if (x === W - 1 || t.owner[y * W + x + 1] !== index) { p.moveTo(x + 1, y); p.lineTo(x + 1, y + 1); }
        if (y === 0 || t.owner[(y - 1) * W + x] !== index) { p.moveTo(x, y); p.lineTo(x + 1, y); }
        if (y === t.height - 1 || t.owner[(y + 1) * W + x] !== index) { p.moveTo(x, y + 1); p.lineTo(x + 1, y + 1); }
      }
    }
  }
  m.set(index, p);
  return p;
}

/** A tiled grey "stone" background similar to the game's automap parchment. */
let stone: CanvasPattern | null = null;
export function stonePattern(ctx: CanvasRenderingContext2D): CanvasPattern {
  if (stone) return stone;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const x = c.getContext('2d')!;
  const id = x.createImageData(96, 96);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 96 * 96; i++) {
    const v = 92 + rnd() * 26 + Math.sin(i * 0.013) * 6;
    id.data[i * 4] = v * 0.93; id.data[i * 4 + 1] = v * 0.95; id.data[i * 4 + 2] = v * 1.08; id.data[i * 4 + 3] = 255;
  }
  x.putImageData(id, 0, 0);
  stone = ctx.createPattern(c, 'repeat')!;
  return stone;
}

// ---------- Roads, tracks and water ----------

export interface PathChunk { x0: number; y0: number; x1: number; y1: number; path: Path2D }
const pathCache = new WeakMap<object, PathChunk[]>();
const TILE = 40; // world pixels per chunk

/** Groups a network's smoothed polylines into tiles so only on-screen chunks are stroked. */
export function pathChunks(net: { lines: { pts: Float32Array; x0: number; y0: number; x1: number; y1: number }[] }): PathChunk[] {
  let chunks = pathCache.get(net);
  if (chunks) return chunks;
  const tiles = new Map<number, PathChunk>();
  for (const l of net.lines) {
    const tx = Math.floor((l.x0 + l.x1) / 2 / TILE), ty = Math.floor((l.y0 + l.y1) / 2 / TILE);
    const k = ty * 1000 + tx;
    let c = tiles.get(k);
    if (!c) { c = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, path: new Path2D() }; tiles.set(k, c); }
    const p = l.pts;
    c.path.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) c.path.lineTo(p[i], p[i + 1]);
    c.x0 = Math.min(c.x0, l.x0); c.y0 = Math.min(c.y0, l.y0); c.x1 = Math.max(c.x1, l.x1); c.y1 = Math.max(c.y1, l.y1);
  }
  chunks = [...tiles.values()];
  pathCache.set(net, chunks);
  return chunks;
}
