import { Reader, decodeCString } from './bytes';

/**
 * BSA archive (MAPS.BSA, BLOCKS.BSA, MONSTER.BSA).
 * Header: i16 count, u16 type. Directory sits at the END of the file.
 *  - Name records (0x0100): 18 bytes each: 14-byte name, i32 size.
 *  - Number records (0x0200): 8 bytes each: u32 id, i32 size.
 * Records are packed back to back from offset 4.
 */
export interface BsaEntry { name: string; id: number; size: number; offset: number }

export class BsaArchive {
  readonly entries: BsaEntry[] = [];
  private byName = new Map<string, number>();

  private constructor(private blob: Blob) {}

  static async open(blob: Blob): Promise<BsaArchive> {
    const a = new BsaArchive(blob);
    const head = new Reader(new Uint8Array(await blob.slice(0, 4).arrayBuffer()));
    const count = head.i16();
    const type = head.u16();
    const stride = type === 0x0100 ? 18 : type === 0x0200 ? 8 : 0;
    if (!stride) throw new Error(`Not a BSA archive (directory type ${type.toString(16)})`);
    const dirBytes = new Uint8Array(await blob.slice(blob.size - stride * count).arrayBuffer());
    const r = new Reader(dirBytes);
    let offset = 4;
    for (let i = 0; i < count; i++) {
      const base = i * stride;
      let name: string, id: number, size: number;
      if (stride === 18) {
        name = decodeCString(dirBytes, base, 14);
        size = r.seek(base + 14).i32();
        id = i;
      } else {
        id = r.seek(base).u32();
        size = r.i32();
        name = String(id);
      }
      a.entries.push({ name, id, size, offset });
      a.byName.set(name.toUpperCase(), i);
      offset += size;
    }
    return a;
  }

  get count() { return this.entries.length; }
  indexOf(name: string) { return this.byName.get(name.toUpperCase()) ?? -1; }

  async read(index: number): Promise<Uint8Array> {
    const e = this.entries[index];
    if (!e) throw new Error(`BSA record ${index} out of range`);
    return new Uint8Array(await this.blob.slice(e.offset, e.offset + e.size).arrayBuffer());
  }

  /** Whole archive in memory; faster when reading most records (MAPS.BSA index). */
  async readAll(): Promise<(i: number) => Uint8Array> {
    const all = new Uint8Array(await this.blob.arrayBuffer());
    return (i: number) => {
      const e = this.entries[i];
      return all.subarray(e.offset, e.offset + e.size);
    };
  }
}
