import { Reader } from './bytes';
import type { IndexedImage } from './images';

/**
 * TEXTURE.### archives (sprites, wall textures). Palette is ART_PAL.COL; index 0 is transparent.
 * Supports uncompressed single frames, multi-frame (transparent-run) frames, and RLE records.
 */
export function readTextureFrame(bytes: Uint8Array, record = 0, frame = 0): IndexedImage | null {
  const r = new Reader(bytes);
  const count = r.i16();
  if (record >= count) return null;
  r.seek(26 + record * 20);
  r.i16();
  const recPos = r.i32();
  r.seek(recPos);
  r.i16(); r.i16();
  const width = r.i16();
  const height = r.i16();
  const compression = r.u16();
  r.i32(); // record size
  const dataOffset = r.i32();
  r.i16();
  const frameCount = r.u16();
  if (width <= 0 || height <= 0 || frame >= Math.max(1, frameCount)) return null;
  const data = new Uint8Array(width * height);
  const base = recPos + dataOffset;

  if (compression === 0x0108 || compression === 0x1108) {
    r.seek(base + height * frame * 4);
    const rows: { off: number; rle: boolean }[] = [];
    for (let i = 0; i < height; i++) rows.push({ off: r.u16(), rle: r.u16() === 0x8000 });
    let dst = 0;
    for (const row of rows) {
      r.seek(recPos + row.off);
      if (row.rle) {
        const rowWidth = r.u16();
        let pos = 0;
        while (pos < rowWidth) {
          let probe = r.i16();
          if (probe < 0) {
            probe = -probe;
            const px = r.u8();
            for (let i = 0; i < probe; i++) data[dst++] = px;
          } else if (probe > 0) {
            data.set(r.take(probe), dst);
            dst += probe;
          }
          pos += Math.abs(probe) || 1;
        }
      } else {
        data.set(r.take(width), dst);
        dst += width;
      }
    }
    return { width, height, data };
  }

  if (frameCount <= 1) {
    for (let y = 0; y < height; y++) data.set(bytes.subarray(base + y * 256, base + y * 256 + width), y * width);
    return { width, height, data };
  }

  r.seek(base + frame * 4);
  r.seek(base + r.i32());
  const cx = r.i16();
  const cy = r.i16();
  const out = new Uint8Array(cx * cy);
  let dst = 0;
  for (let y = 0; y < cy; y++) {
    let x = 0;
    while (x < cx) {
      const skip = r.u8();
      x += skip; dst += skip;
      const n = r.u8();
      for (let i = 0; i < n; i++) { out[dst++] = r.u8(); x++; }
    }
  }
  return { width: cx, height: cy, data: out };
}
