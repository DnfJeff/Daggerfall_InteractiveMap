/** Little-endian cursor over a byte buffer. All Daggerfall formats are LE. */
export class Reader {
  readonly view: DataView;
  readonly bytes: Uint8Array;
  pos: number;

  constructor(bytes: Uint8Array, pos = 0) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = pos;
  }

  get length() { return this.bytes.byteLength; }
  seek(pos: number) { this.pos = pos; return this; }
  skip(n: number) { this.pos += n; return this; }

  u8() { return this.view.getUint8(this.pos++); }
  i8() { return this.view.getInt8(this.pos++); }
  u16() { const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  i16() { const v = this.view.getInt16(this.pos, true); this.pos += 2; return v; }
  u32() { const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }
  i32() { const v = this.view.getInt32(this.pos, true); this.pos += 4; return v; }
  take(n: number) { const v = this.bytes.subarray(this.pos, this.pos + n); this.pos += n; return v; }

  /** Fixed-width field holding a NUL-terminated string. Always advances `width` bytes. */
  cstr(width: number) {
    const start = this.pos;
    this.pos += width;
    return decodeCString(this.bytes, start, width);
  }
}

const latin1 = new TextDecoder('latin1');

export function decodeCString(bytes: Uint8Array, start: number, maxLen: number) {
  let end = start;
  const limit = Math.min(bytes.length, start + maxLen);
  while (end < limit && bytes[end] !== 0) end++;
  return latin1.decode(bytes.subarray(start, end));
}

export function decodeText(bytes: Uint8Array) {
  return latin1.decode(bytes);
}
