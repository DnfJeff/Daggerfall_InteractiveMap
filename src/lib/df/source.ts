/**
 * A GameSource is a read-only view of one folder the user pointed us at
 * (ARENA2, a DFU save folder, ...). File lookups are case-insensitive because
 * Daggerfall installs mix "arena2", "ARENA2", "Maps.bsa" freely.
 */
export interface GameSource {
  readonly label: string;
  names(): string[];
  file(name: string): Promise<Blob | null>;
}

export async function readBytes(src: GameSource, name: string): Promise<Uint8Array | null> {
  const f = await src.file(name);
  if (!f) return null;
  return new Uint8Array(await f.arrayBuffer());
}

export async function readText(src: GameSource, name: string): Promise<string | null> {
  const f = await src.file(name);
  if (!f) return null;
  return await f.text();
}

/** Backed by the File System Access API (Chromium). Supports a later re-read on Refresh. */
export class DirectoryHandleSource implements GameSource {
  private index = new Map<string, FileSystemFileHandle>();
  private dirs = new Map<string, FileSystemDirectoryHandle>();
  constructor(readonly handle: FileSystemDirectoryHandle) {}
  get label() { return this.handle.name; }

  async scan() {
    this.index.clear();
    this.dirs.clear();
    // `values()` exists on FileSystemDirectoryHandle in Chromium; typed loosely for portability.
    for await (const entry of (this.handle as any).values() as AsyncIterable<FileSystemHandle>) {
      if (entry.kind === 'file') this.index.set(entry.name.toUpperCase(), entry as FileSystemFileHandle);
      else this.dirs.set(entry.name.toUpperCase(), entry as FileSystemDirectoryHandle);
    }
    return this;
  }
  names() { return [...this.index.keys()]; }
  subdirs() { return [...this.dirs.entries()].map(([k, h]) => ({ key: k, handle: h })); }
  subdir(name: string) { return this.dirs.get(name.toUpperCase()) ?? null; }
  async file(name: string) {
    const h = this.index.get(name.toUpperCase());
    return h ? await h.getFile() : null;
  }
}

/** Backed by an <input webkitdirectory> FileList (Firefox / fallback). Not persistable. */
export class FileListSource implements GameSource {
  private index = new Map<string, File>();
  constructor(readonly label: string, files: File[], subPath = '') {
    for (const f of files) {
      const rel = ((f as any).webkitRelativePath as string | undefined) ?? f.name;
      const parts = rel.split('/');
      // parts[0] is the picked folder; keep only direct children of `subPath`.
      const inner = parts.slice(1).join('/');
      const prefix = subPath ? subPath.toUpperCase() + '/' : '';
      const up = inner.toUpperCase();
      if (prefix && !up.startsWith(prefix)) continue;
      const rest = up.slice(prefix.length);
      if (rest.includes('/')) continue;
      this.index.set(rest, f);
    }
  }
  names() { return [...this.index.keys()]; }
  async file(name: string) { return this.index.get(name.toUpperCase()) ?? null; }
}
