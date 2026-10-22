// Fast map labels: each distinct label is rasterised once into a small canvas (text + halo) and
// blitted with drawImage afterwards; collisions use a spatial hash instead of a linear scan.

interface Sprite { canvas: HTMLCanvasElement; w: number; h: number }

const MAX_SPRITES = 6000;
const sprites = new Map<string, Sprite>();
let measureCtx: CanvasRenderingContext2D | null = null;

export function labelFont(size: number, weight = 600) {
  return `${weight} ${size}px 'Segoe UI', system-ui, sans-serif`;
}

/** CSS-pixel sprite for `text`; rendered at device resolution. */
export function labelSprite(text: string, size: number, color: string, weight = 600): Sprite {
  const dpr = devicePixelRatio || 1;
  const key = `${text}\u0000${size}\u0000${color}\u0000${weight}\u0000${dpr}`;
  let s = sprites.get(key);
  if (s) {
    // refresh LRU position
    sprites.delete(key);
    sprites.set(key, s);
    return s;
  }
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  measureCtx.font = labelFont(size, weight);
  const pad = 3;
  const w = Math.ceil(measureCtx.measureText(text).width) + pad * 2;
  const h = Math.ceil(size * 1.35) + pad;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  const c = canvas.getContext('2d')!;
  c.scale(dpr, dpr);
  c.font = labelFont(size, weight);
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(8,8,10,0.85)';
  c.strokeText(text, pad, h / 2);
  c.fillStyle = color;
  c.fillText(text, pad, h / 2);
  s = { canvas, w, h };
  sprites.set(key, s);
  if (sprites.size > MAX_SPRITES) sprites.delete(sprites.keys().next().value!);
  return s;
}

/**
 * Draws a label anchored at (x, y). align: 'left' puts the text's left edge at x, 'center' centres it.
 * Returns the occupied box (CSS px) for collision bookkeeping.
 */
export function blitLabel(ctx: CanvasRenderingContext2D, sp: Sprite, x: number, y: number, align: 'left' | 'center' = 'left') {
  const left = align === 'left' ? x - 3 : x - sp.w / 2;
  const top = y - sp.h / 2;
  ctx.drawImage(sp.canvas, left, top, sp.w, sp.h);
  return [left + 3, top + 2, left + sp.w - 3, top + sp.h - 2] as const;
}

/** Spatial hash of occupied screen rectangles. */
export class CollisionGrid {
  private cells = new Map<number, [number, number, number, number][]>();
  constructor(private cell = 64) {}
  private *keys(x0: number, y0: number, x1: number, y1: number) {
    const c = this.cell;
    for (let gy = Math.floor(y0 / c); gy <= Math.floor(y1 / c); gy++)
      for (let gx = Math.floor(x0 / c); gx <= Math.floor(x1 / c); gx++) yield gy * 100003 + gx;
  }
  fits(x0: number, y0: number, x1: number, y1: number) {
    for (const k of this.keys(x0, y0, x1, y1)) {
      const list = this.cells.get(k);
      if (!list) continue;
      for (const b of list) if (x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]) return false;
    }
    return true;
  }
  add(x0: number, y0: number, x1: number, y1: number) {
    const box: [number, number, number, number] = [x0, y0, x1, y1];
    for (const k of this.keys(x0, y0, x1, y1)) {
      const list = this.cells.get(k);
      if (list) list.push(box); else this.cells.set(k, [box]);
    }
  }
}
