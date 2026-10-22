import { Reader } from './bytes';

/** 256-entry RGB palette from a .COL (8-byte header) or raw .PAL file. Values are 0-255. */
export type Palette = Uint8Array; // length 768

export function parsePalette(bytes: Uint8Array): Palette {
  if (bytes.length === 776) return bytes.slice(8, 776);
  if (bytes.length === 768) return bytes.slice();
  throw new Error(`Unexpected palette size ${bytes.length}`);
}

export interface IndexedImage {
  width: number;
  height: number;
  /** One palette index per pixel, top-down rows. */
  data: Uint8Array;
}

/** Headerless .IMG files are identified purely by their byte length. */
const HEADERLESS: Record<number, [number, number]> = {
  44: [22, 22], 289: [17, 17], 441: [49, 9], 512: [32, 16], 720: [9, 80],
  990: [45, 22], 1720: [43, 40], 2140: [107, 20], 2916: [81, 36], 3200: [40, 80],
  3938: [179, 22], 4280: [107, 40], 4508: [322, 14], 20480: [320, 64],
  26496: [184, 144], 64000: [320, 200], 64768: [320, 200], 68800: [320, 215], 112128: [512, 219],
};

/** Parses an uncompressed or RLE .IMG. Returns null for empty stub files (e.g. FMAP0I00.IMG). */
export function parseImg(bytes: Uint8Array): IndexedImage | null {
  const known = HEADERLESS[bytes.length];
  if (known) {
    const [w, h] = known;
    return { width: w, height: h, data: bytes.slice(0, w * h) };
  }
  if (bytes.length < 12) return null;
  const r = new Reader(bytes);
  r.i16(); r.i16(); // x/y offset (unused)
  const width = r.i16();
  const height = r.i16();
  const compression = r.u16();
  r.u16(); // pixel data length
  if (width <= 0 || height <= 0) return null;
  const n = width * height;
  if (compression === 0) return { width, height, data: bytes.slice(12, 12 + n) };
  // RLE variants share the same run encoding.
  const out = new Uint8Array(n);
  let p = 0;
  r.seek(12);
  while (p < n && r.pos < bytes.length) {
    const code = r.u8();
    if (code > 127) {
      const v = r.u8();
      for (let i = 0; i < code - 127 && p < n; i++) out[p++] = v;
    } else {
      for (let i = 0; i <= code && p < n; i++) out[p++] = r.u8();
    }
  }
  return { width, height, data: out };
}

/**
 * PAK (CLIMATE.PAK / POLITIC.PAK): 500 rows, offset table of u32 at start,
 * each row is runs of (u16 count, u8 value). Width is 1001; DFU indexes with x+1.
 */
export const PAK_W = 1001;
export const PAK_H = 500;

export function parsePak(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(PAK_W * PAK_H);
  const offsets = new Reader(bytes);
  const r = new Reader(bytes);
  for (let row = 0; row < PAK_H; row++) {
    r.seek(offsets.u32());
    let x = 0;
    const base = row * PAK_W;
    while (x < PAK_W) {
      const count = r.u16();
      const value = r.u8();
      for (let c = 0; c < count && x < PAK_W; c++) out[base + x++] = value;
    }
  }
  return out;
}

/** Converts indexed pixels to RGBA. `transparent` indices become alpha 0. */
export function toRgba(img: IndexedImage, pal: Palette, transparent: number[] = []): ImageData {
  const out = new ImageData(img.width, img.height);
  const d = out.data;
  const t = new Set(transparent);
  for (let i = 0; i < img.data.length; i++) {
    const c = img.data[i];
    const o = i * 4;
    d[o] = pal[c * 3];
    d[o + 1] = pal[c * 3 + 1];
    d[o + 2] = pal[c * 3 + 2];
    d[o + 3] = t.has(c) ? 0 : 255;
  }
  return out;
}

export function paletteColor(pal: Palette, index: number): [number, number, number] {
  return [pal[index * 3], pal[index * 3 + 1], pal[index * 3 + 2]];
}
