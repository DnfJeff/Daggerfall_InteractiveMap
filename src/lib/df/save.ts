// Read-only access to saves from both modern runtimes. The companion never writes saves.
//  - Daggerfall Unity (DFU):   %USERPROFILE%\AppData\LocalLow\Daggerfall Workshop\Daggerfall Unity\Saves
//  - Daggerfall Online (DFO):  %APPDATA%\Daggerfall JavaScript\Saves
// Both use SAVE<n> folders with SaveInfo.txt + SaveData.txt, but the JSON inside differs, and a
// DFO folder can also hold DFU-format saves it imported. Format is detected per save, not per folder.
import { worldToPixel } from './constants';

export type SaveRuntime = 'dfu' | 'dfo';
export type SaveFormat = 'dfu' | 'dfo';

export const RUNTIME_LABEL: Record<SaveRuntime, string> = { dfu: 'Daggerfall Unity', dfo: 'Daggerfall Online' };
export const RUNTIME_SAVE_PATH: Record<SaveRuntime, string> = {
  dfu: '%USERPROFILE%\\AppData\\LocalLow\\Daggerfall Workshop\\Daggerfall Unity\\Saves',
  dfo: '%APPDATA%\\Daggerfall JavaScript\\Saves',
};

export interface SaveSummary {
  /** Unique across runtimes: "dfu:SAVE3". */
  id: string;
  runtime: SaveRuntime;
  format: SaveFormat;
  folder: string;
  saveName: string;
  characterName: string;
  /** DFO saves carry a stable character id; DFU saves don't. */
  characterId: string | null;
  /** Normalised to DFU game seconds so both runtimes share one clock. */
  gameTime: number;
  realTime: number; // JS ms
  version: string;
}

export interface SaveDiscovery {
  /** mapIds of locations the character knows. */
  locations: Set<number>;
  /** mapId -> building key -> displayed name (only when keys follow the DFU layout convention). */
  buildings: Map<number, Map<number, string>>;
  /** mapId -> names of identified buildings (works for every format). */
  names: Map<number, Set<string>>;
}

export interface SaveDetail {
  summary: SaveSummary;
  character: {
    name: string;
    gender: string;
    race: string;
    career: string;
    level: number;
    gold: number;
    health: [number, number];
    stats: Record<string, number>;
    skills: Record<string, number>;
  } | null;
  position: { x: number; y: number; worldX: number; worldZ: number; context: string; inDungeon: boolean; inBuilding: boolean } | null;
  discovery: SaveDiscovery;
  /** First line is "hh:mm:ss on <date> in <place>", rest is text. */
  notebook: { header: string; lines: string[] }[];
  screenshotUrl: string | null;
}

/** Resolves save-side place references to world locations. */
export interface PlaceResolver {
  mapIdAtPixel(x: number, y: number): number | null;
  mapIdByRegionAndName(region: number, name: string): number | null;
}

/** A directory handle (Chromium) or a flat file map (fallback / dev) for one Saves folder. */
export interface SavesRoot {
  folders(): Promise<string[]>;
  file(folder: string, name: string): Promise<Blob | null>;
}

export class HandleSavesRoot implements SavesRoot {
  constructor(readonly handle: FileSystemDirectoryHandle) {}
  async folders() {
    const out: string[] = [];
    for await (const e of (this.handle as any).values() as AsyncIterable<FileSystemHandle>) {
      if (e.kind === 'directory' && /^SAVE\d+$/i.test(e.name)) out.push(e.name);
    }
    return out;
  }
  async file(folder: string, name: string) {
    try {
      const dir = await this.handle.getDirectoryHandle(folder);
      for await (const e of (dir as any).values() as AsyncIterable<FileSystemHandle>) {
        if (e.kind === 'file' && e.name.toLowerCase() === name.toLowerCase()) return await (e as FileSystemFileHandle).getFile();
      }
    } catch { /* folder vanished */ }
    return null;
  }
}

export class FileListSavesRoot implements SavesRoot {
  private map = new Map<string, Map<string, File>>();
  constructor(files: File[]) {
    for (const f of files) {
      const parts = ((f as any).webkitRelativePath as string).split('/');
      if (parts.length !== 3 || !/^SAVE\d+$/i.test(parts[1])) continue;
      if (!this.map.has(parts[1])) this.map.set(parts[1], new Map());
      this.map.get(parts[1])!.set(parts[2].toLowerCase(), f);
    }
  }
  async folders() { return [...this.map.keys()]; }
  async file(folder: string, name: string) { return this.map.get(folder)?.get(name.toLowerCase()) ?? null; }
}

async function json(blob: Blob | null): Promise<any> {
  if (!blob) return null;
  const text = (await blob.text()).replace(/^\uFEFF/, '');
  if (!text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// ---------- time ----------

const MIN_PER_YEAR = 360 * 1440;
/** DFO keeps classic minutes counted from 3E 404; express them as DFU seconds. */
const classicMinutesToSeconds = (m: number) => (m + 404 * MIN_PER_YEAR) * 60;
/** .NET ticks (100 ns since 0001-01-01) to JS milliseconds; JS ms pass through. */
const toJsMs = (t: number) => (t > 1e15 ? (t - 621355968000000000) / 10000 : t);

export async function listSaves(root: SavesRoot, runtime: SaveRuntime): Promise<SaveSummary[]> {
  const out: SaveSummary[] = [];
  for (const folder of await root.folders()) {
    const info = await json(await root.file(folder, 'SaveInfo.txt'));
    if (!info) continue;
    const rawGame = Number(info.dateAndTime?.gameTime ?? 0);
    const rawReal = Number(info.dateAndTime?.realTime ?? 0);
    // DFO-native SaveInfo: realTime in JS ms and gameTime in classic minutes.
    const format: SaveFormat = rawReal > 1e15 || info.$version ? 'dfu' : 'dfo';
    out.push({
      id: `${runtime}:${folder}`,
      runtime,
      format,
      folder,
      saveName: info.saveName ?? folder,
      characterName: info.characterName ?? '',
      characterId: info.characterId ?? null,
      gameTime: format === 'dfo' ? classicMinutesToSeconds(rawGame) : rawGame,
      realTime: toJsMs(rawReal),
      version: info.dfuVersion ?? '',
    });
  }
  return out.sort((a, b) => b.realTime - a.realTime);
}

const SKILL_NAMES = [
  'Medical', 'Etiquette', 'Streetwise', 'Jumping', 'Orcish', 'Harpy', 'Giantish', 'Dragonish', 'Nymph', 'Daedric',
  'Spriggan', 'Centaurian', 'Impish', 'Lockpicking', 'Mercantile', 'Pickpocket', 'Stealth', 'Swimming', 'Climbing',
  'Backstabbing', 'Dodging', 'Running', 'Destruction', 'Restoration', 'Illusion', 'Alteration', 'Thaumaturgy',
  'Mysticism', 'ShortBlade', 'LongBlade', 'HandToHand', 'Axe', 'BluntWeapon', 'Archery', 'CriticalStrike',
];

export async function readSave(root: SavesRoot, summary: SaveSummary, places: PlaceResolver): Promise<SaveDetail> {
  const [data, shot] = await Promise.all([
    json(await root.file(summary.folder, 'SaveData.txt')),
    root.file(summary.folder, 'Screenshot.jpg'),
  ]);
  const base = { summary, screenshotUrl: shot ? URL.createObjectURL(shot) : null };
  if (data && !data.playerData && ('classicMinutes' in data || 'world' in data)) return { ...base, ...parseDfo(data, places) };
  const [disc, notes] = await Promise.all([
    json(await root.file(summary.folder, 'DiscoveryData.txt')),
    json(await root.file(summary.folder, 'NotebookData.txt')),
  ]);
  return { ...base, ...parseDfu(data, disc, notes, summary) };
}

type Parsed = Omit<SaveDetail, 'summary' | 'screenshotUrl'>;

function emptyDiscovery(): SaveDiscovery {
  return { locations: new Set(), buildings: new Map(), names: new Map() };
}

function addName(d: SaveDiscovery, mapId: number, key: number | null, name: string) {
  if (!name) return;
  if (key !== null) {
    if (!d.buildings.has(mapId)) d.buildings.set(mapId, new Map());
    d.buildings.get(mapId)!.set(key, name);
  }
  if (!d.names.has(mapId)) d.names.set(mapId, new Set());
  d.names.get(mapId)!.add(name);
}

function position(worldX: number, worldZ: number, context: string, inDungeon: boolean, inBuilding: boolean) {
  const px = worldToPixel(worldX, worldZ);
  return {
    x: px.x + (worldX % 32768) / 32768,
    y: px.y + 1 - (worldZ % 32768) / 32768,
    worldX, worldZ, context, inDungeon, inBuilding,
  };
}

function parseNotebook(entries: unknown): SaveDetail['notebook'] {
  const out: SaveDetail['notebook'] = [];
  if (!Array.isArray(entries)) return out;
  for (const e of entries) {
    if (!Array.isArray(e) || !e.length) continue;
    out.push({
      header: String(e[0]).replace(/^D:/, '').replace(/:$/, ''),
      lines: e.slice(1).map((l: string) => String(l).replace(/^[A-Z]?:\s?/, '').replace(/^\s/, '')),
    });
  }
  return out;
}

function parseDfu(data: any, disc: any, notes: any, summary: SaveSummary): Parsed {
  let character: SaveDetail['character'] = null;
  let pos: SaveDetail['position'] = null;
  const pe = data?.playerData?.playerEntity;
  if (pe) {
    character = {
      name: pe.name ?? summary.characterName,
      gender: pe.gender ?? '',
      race: pe.raceTemplate?.Name ?? '',
      career: pe.careerTemplate?.Name ?? '',
      level: pe.level ?? 0,
      gold: pe.goldPieces ?? 0,
      health: [pe.currentHealth ?? 0, pe.maxHealth ?? 0],
      stats: numbers(pe.stats),
      skills: numbers(pe.skills),
    };
  }
  const pp = data?.playerData?.playerPosition;
  if (pp && typeof pp.worldPosX === 'number') pos = position(pp.worldPosX, pp.worldPosZ, pp.worldContext ?? '', !!pp.insideDungeon, !!pp.insideBuilding);

  const discovery = emptyDiscovery();
  if (Array.isArray(disc)) {
    for (const entry of disc) {
      const v = entry?.Value;
      if (!v) continue;
      discovery.locations.add(v.mapID);
      if (Array.isArray(v.discoveredBuildings)) {
        for (const b of v.discoveredBuildings) if (b?.Value) addName(discovery, v.mapID, b.Value.buildingKey, b.Value.displayName ?? '');
      }
    }
  }
  return { character, position: pos, discovery, notebook: parseNotebook(notes?.notebookEntries) };
}

function parseDfo(d: any, places: PlaceResolver): Parsed {
  const skills: Record<string, number> = {};
  if (Array.isArray(d.skills)) d.skills.forEach((v: number, i: number) => { if (SKILL_NAMES[i]) skills[SKILL_NAMES[i]] = v; });
  const stats: Record<string, number> = {};
  for (const [k, v] of Object.entries(d.stats ?? {})) if (typeof v === 'number') stats[k[0].toUpperCase() + k.slice(1)] = v;
  const character: SaveDetail['character'] = {
    name: d.name ?? '',
    gender: d.gender ? d.gender[0].toUpperCase() + d.gender.slice(1) : '',
    race: d.race ?? '',
    career: d.career?.name ?? '',
    level: d.level ?? 0,
    gold: d.goldPieces ?? 0,
    health: [d.health ?? 0, d.maxHealth ?? 0],
    stats,
    skills,
  };
  const w = d.world;
  const pos = w && typeof w.nativeX === 'number'
    ? position(w.nativeX, w.nativeZ, d.locationKey ?? '', !!d.dungeon, !!d.interior)
    : null;

  // DFO keys locations by map pixel id, and buildings by "<region>:<location name>".
  const discovery = emptyDiscovery();
  for (const pixelId of Object.keys(d.discovery?.locations ?? {})) {
    const id = Number(pixelId);
    const mapId = places.mapIdAtPixel(id % 1000, Math.floor(id / 1000));
    if (mapId !== null) discovery.locations.add(mapId);
  }
  for (const [where, buildings] of Object.entries(d.discovery?.buildings ?? {})) {
    const m = /^(\d+):(.*)$/.exec(where);
    if (!m) continue;
    const mapId = places.mapIdByRegionAndName(Number(m[1]), m[2]);
    if (mapId === null) continue;
    for (const b of Object.values(buildings as Record<string, any>)) {
      // DFO's building keys follow its own layout order, so only the names are comparable.
      addName(discovery, mapId, null, b?.customUserDisplayName || b?.displayName || '');
    }
  }
  return { character, position: pos, discovery, notebook: parseNotebook(d.quest?.notebook?.notebookEntries) };
}

function numbers(obj: any): Record<string, number> {
  const out: Record<string, number> = {};
  if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) if (!k.startsWith('$') && typeof v === 'number') out[k] = v;
  return out;
}

const MONTHS = ['Morning Star', "Sun's Dawn", 'First Seed', "Rain's Hand", 'Second Seed', 'Midyear',
  "Sun's Height", 'Last Seed', 'Hearthfire', 'Frostfall', "Sun's Dusk", 'Evening Star'];

/** DFU game time (seconds) to "14th of First Seed, 3E 405, 09:12". */
export function formatGameTime(seconds: number) {
  const minute = 60, hour = 3600, day = 86400, month = day * 30, year = month * 12;
  let s = Math.floor(seconds);
  const y = Math.floor(s / year); s -= y * year;
  const mo = Math.floor(s / month); s -= mo * month;
  const d = Math.floor(s / day) + 1; s -= (d - 1) * day;
  const h = Math.floor(s / hour); s -= h * hour;
  const m = Math.floor(s / minute);
  const suffix = d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th';
  return `${d}${suffix} of ${MONTHS[mo] ?? '?'}, 3E ${y}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}


// ---------- snapshots: a save captured into a playthrough (portable, no folder access needed) ----------

export interface SaveSnapshot {
  summary: SaveSummary;
  character: SaveDetail['character'];
  position: SaveDetail['position'];
  discovery: { locations: number[]; buildings: [number, [number, string][]][]; names: [number, string[]][] };
  notebook: SaveDetail['notebook'];
  capturedAt: number;
}

export function snapshotSave(d: SaveDetail): SaveSnapshot {
  return {
    summary: d.summary,
    character: d.character,
    position: d.position,
    discovery: {
      locations: [...d.discovery.locations],
      buildings: [...d.discovery.buildings].map(([m, b]) => [m, [...b]]),
      names: [...d.discovery.names].map(([m, n]) => [m, [...n]]),
    },
    notebook: d.notebook,
    capturedAt: Date.now(),
  };
}

export function detailFromSnapshot(s: SaveSnapshot): SaveDetail {
  return {
    summary: s.summary,
    character: s.character,
    position: s.position,
    discovery: {
      locations: new Set(s.discovery.locations),
      buildings: new Map(s.discovery.buildings.map(([m, b]) => [m, new Map(b)])),
      names: new Map(s.discovery.names.map(([m, n]) => [m, new Set(n)])),
    },
    notebook: s.notebook,
    screenshotUrl: null,
  };
}

/** Saves dropped or picked as plain files: paths like "SAVE3/SaveData.txt" or "Saves/SAVE3/SaveData.txt". */
export class DroppedSavesRoot implements SavesRoot {
  private map = new Map<string, Map<string, File>>();
  constructor(files: { path: string; file: File }[]) {
    for (const { path, file } of files) {
      const parts = path.split('/').filter(Boolean);
      const name = parts.pop()!;
      // The folder holding the file is the save; dropping files without a folder makes one save.
      const folder = parts.length ? parts[parts.length - 1] : 'SAVE';
      if (!this.map.has(folder)) this.map.set(folder, new Map());
      this.map.get(folder)!.set(name.toLowerCase(), file);
    }
    for (const [k, v] of [...this.map]) if (!v.has('saveinfo.txt') && !v.has('savedata.txt')) this.map.delete(k);
  }
  async folders() { return [...this.map.keys()]; }
  async file(folder: string, name: string) { return this.map.get(folder)?.get(name.toLowerCase()) ?? null; }
}

/** Reads a dropped DataTransfer (files and folders) into path + File pairs. */
export async function filesFromDrop(dt: DataTransfer): Promise<{ path: string; file: File }[]> {
  const out: { path: string; file: File }[] = [];
  const entries = [...dt.items].map((i) => (i as any).webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...dt.files].map((f) => ({ path: f.name, file: f }));
  const walk = async (entry: any, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file: File = await new Promise((res, rej) => entry.file(res, rej));
      out.push({ path: `${prefix}${entry.name}`, file });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      for (;;) {
        const batch: any[] = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e, `${prefix}${entry.name}/`);
      }
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
}
