// Development-only sources backed by the Vite dev middleware (see vite.config.ts).
import type { GameSource } from './source';
import type { SaveRuntime, SavesRoot } from './save';

interface Entry { name: string; dir: boolean }

async function list(path: string): Promise<Entry[] | null> {
  const r = await fetch(`/__dev/${path}`);
  if (!r.ok || !r.headers.get('content-type')?.includes('json')) return null;
  return r.json();
}

export async function devArena2(): Promise<GameSource | null> {
  const entries = await list('arena2').catch(() => null);
  if (!entries) return null;
  const files = new Map(entries.filter((e) => !e.dir).map((e) => [e.name.toUpperCase(), e.name]));
  return {
    label: 'dev ARENA2',
    names: () => [...files.keys()],
    async file(name) {
      const real = files.get(name.toUpperCase());
      if (!real) return null;
      const r = await fetch(`/__dev/arena2/${encodeURIComponent(real)}`);
      return r.ok ? await r.blob() : null;
    },
  };
}

export async function devSaves(runtime: SaveRuntime): Promise<SavesRoot | null> {
  const rootName = runtime === 'dfu' ? 'saves' : 'dfosaves';
  const entries = await list(rootName).catch(() => null);
  if (!entries) return null;
  const cache = new Map<string, Entry[]>();
  return {
    async folders() { return entries.filter((e) => e.dir && /^SAVE\d+$/i.test(e.name)).map((e) => e.name); },
    async file(folder, name) {
      let files = cache.get(folder);
      if (!files) { files = (await list(`${rootName}/${folder}`)) ?? []; cache.set(folder, files); }
      const real = files.find((f) => f.name.toLowerCase() === name.toLowerCase());
      if (!real) return null;
      const r = await fetch(`/__dev/${rootName}/${folder}/${encodeURIComponent(real.name)}`);
      return r.ok ? await r.blob() : null;
    },
  };
}
