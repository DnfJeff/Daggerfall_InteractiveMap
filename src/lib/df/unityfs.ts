// Minimal reader for Unity "UnityFS" asset bundles, which is what DFU .dfmod files are.
// Enough to pull TextAsset payloads (e.g. Basic Roads' path grids) out by name.

export function lz4Block(src: Uint8Array, outSize: number): Uint8Array {
  const out = new Uint8Array(outSize);
  let i = 0, o = 0;
  while (i < src.length) {
    const tok = src[i++];
    let lit = tok >> 4;
    if (lit === 15) { let b; do { b = src[i++]; lit += b; } while (b === 255); }
    out.set(src.subarray(i, i + lit), o);
    i += lit; o += lit;
    if (i >= src.length) break;
    const off = src[i] | (src[i + 1] << 8);
    i += 2;
    let len = tok & 15;
    if (len === 15) { let b; do { b = src[i++]; len += b; } while (b === 255); }
    len += 4;
    for (let k = 0; k < len; k++, o++) out[o] = out[o - off];
  }
  return out;
}

function decompress(src: Uint8Array, size: number, kind: number) {
  if (kind === 0) return src;
  if (kind === 2 || kind === 3) return lz4Block(src, size);
  throw new Error(`Unsupported bundle compression (${kind}); only LZ4 bundles are readable.`);
}

/** Returns the concatenated, decompressed data stream of all bundle nodes. */
export function readUnityFs(buf: Uint8Array): Uint8Array {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 0;
  const cstr = () => { let s = ''; while (buf[p]) s += String.fromCharCode(buf[p++]); p++; return s; };
  if (cstr() !== 'UnityFS') throw new Error('Not a UnityFS bundle');
  const version = dv.getUint32(p); p += 4;
  cstr(); cstr();
  p += 8; // total size
  const cInfo = dv.getUint32(p), uInfo = dv.getUint32(p + 4), flags = dv.getUint32(p + 8);
  p += 12;
  if (version >= 7) p = (p + 15) & ~15;
  const infoAtEnd = (flags & 0x80) !== 0;
  const infoStart = infoAtEnd ? buf.length - cInfo : p;
  const info = decompress(buf.subarray(infoStart, infoStart + cInfo), uInfo, flags & 0x3f);
  if (!infoAtEnd) p += cInfo;
  const idv = new DataView(info.buffer, info.byteOffset, info.byteLength);
  let q = 16; // skip hash
  const blockCount = idv.getInt32(q); q += 4;
  const blocks: { u: number; c: number; f: number }[] = [];
  for (let k = 0; k < blockCount; k++, q += 10) blocks.push({ u: idv.getUint32(q), c: idv.getUint32(q + 4), f: idv.getUint16(q + 8) });
  const total = blocks.reduce((a, b) => a + b.u, 0);
  const data = new Uint8Array(total);
  let o = 0;
  for (const b of blocks) {
    data.set(decompress(buf.subarray(p, p + b.c), b.u, b.f & 0x3f), o);
    p += b.c; o += b.u;
  }
  return data;
}

/**
 * Finds serialized TextAssets by name: int32 nameLength, name, align to 4, int32 dataLength, data.
 * Returns the payload of the first asset with that exact name and (optionally) exact length.
 */
export function findTextAsset(data: Uint8Array, name: string, expectLength?: number): Uint8Array | null {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const needle = new TextEncoder().encode(name);
  outer: for (let i = 0; i + 8 + needle.length < data.length; i++) {
    if (dv.getInt32(i, true) !== needle.length) continue;
    for (let k = 0; k < needle.length; k++) if (data[i + 4 + k] !== needle[k]) continue outer;
    const at = (i + 4 + needle.length + 3) & ~3;
    const len = dv.getInt32(at, true);
    if (len <= 0 || at + 4 + len > data.length) continue;
    if (expectLength !== undefined && len !== expectLength) continue;
    return data.subarray(at + 4, at + 4 + len);
  }
  return null;
}
