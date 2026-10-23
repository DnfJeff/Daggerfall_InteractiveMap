import { GameData } from '../df/game';
import { DirectoryHandleSource, FileListSource, type GameSource } from '../df/source';
import {
  HandleSavesRoot, FileListSavesRoot, listSaves, readSave, RUNTIME_LABEL,
  type PlaceResolver, type SaveDetail, type SaveRuntime, type SaveSummary, type SavesRoot,
} from '../df/save';
import type { LocationSummary } from '../df/maps';
import type { TownBuilding } from '../df/town';
import { LOC_TYPES, REGION_NAMES } from '../df/constants';
import { del, get, getAll, put } from '../db/idb';
import {
  ATLAS, NO_PROFILE, PROFILE_COLORS, anchorKey, newId,
  type Anchor, type AnyRecord, type Plane, type Profile, type RecordKind,
  type MarkerRecord, type NoteRecord, type JournalRecord, type SpotRecord, type StatusRecord,
} from '../db/model';
import { buildBundle, bundleFileName, takeSnapshot, writeToFolder } from '../db/backup';
import { DEFAULT_SETTINGS, mergeSettings, type DockTab, type Settings } from './settings';
import { loadBasicRoads, type RoadData } from '../df/roads';
import { loadBaked } from '../df/baked';
import { BUILTIN_DATA, WEB } from '../flavor';
import { DroppedSavesRoot, detailFromSnapshot, snapshotSave, type SaveSnapshot } from '../df/save';
import { parseBundle, type Bundle } from '../db/backup';

export type MapLevel = 'overview' | 'world' | 'town';
export type Selection =
  | { t: 'region'; region: number }
  | { t: 'loc'; mapId: number }
  | { t: 'bld'; mapId: number; key: number }
  | { t: 'record'; id: string }
  | { t: 'creature'; id: number }
  | { t: 'point'; x: number; y: number };

export type SourceKind = 'arena2' | 'dfuSaves' | 'dfoSaves' | 'dfu' | 'backup';
export const SOURCE_KINDS: SourceKind[] = ['arena2', 'dfuSaves', 'dfoSaves', 'dfu', 'backup'];
/** Which save runtime a source kind feeds, if any. */
export const SAVE_SOURCE_RUNTIME: Partial<Record<SourceKind, SaveRuntime>> = { dfuSaves: 'dfu', dfoSaves: 'dfo' };
export interface SourceStatus {
  kind: SourceKind;
  name: string | null;
  state: 'unset' | 'needs-permission' | 'loading' | 'ok' | 'error';
  detail: string;
  persistable: boolean;
}

export interface ComposerState {
  kind: 'marker' | 'note' | 'journal' | 'guide';
  anchor: Anchor | null;
  recordId?: string;
  plane?: Plane;
}

export interface Toast { id: number; text: string; tone: 'info' | 'ok' | 'warn' | 'error' }

const hasFsAccess = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

class AppState {
  ready = $state(false);
  /** 'files': read from the user's ARENA2. 'builtin': the baked map data shipped with the app. */
  dataMode = $state<'files' | 'builtin' | null>(null);
  /** The .dfc file this session saves to (File System Access), if any. */
  dfcHandle = $state.raw<FileSystemFileHandle | null>(null);
  dfcName = $state<string | null>(null);
  /** Time of the last save to a .dfc file; records changed after it are "unsaved". */
  dfcSavedAt = $state(0);
  /** A .dfc dropped or opened, waiting for the user to choose merge/replace. */
  pendingImport = $state.raw<{ bundle: Bundle; fileName: string } | null>(null);
  /** Saves found in something dropped/picked, waiting for the user to choose one. */
  pendingSaves = $state.raw<{ root: SavesRoot; saves: SaveSummary[] } | null>(null);
  fsAccess = hasFsAccess;

  // ---- sources & game ----
  sources = $state<Record<SourceKind, SourceStatus>>({
    arena2: { kind: 'arena2', name: null, state: 'unset', detail: '', persistable: hasFsAccess },
    dfuSaves: { kind: 'dfuSaves', name: null, state: 'unset', detail: '', persistable: hasFsAccess },
    dfoSaves: { kind: 'dfoSaves', name: null, state: 'unset', detail: '', persistable: hasFsAccess },
    dfu: { kind: 'dfu', name: null, state: 'unset', detail: '', persistable: hasFsAccess },
    backup: { kind: 'backup', name: null, state: 'unset', detail: '', persistable: hasFsAccess },
  });
  game = $state.raw<GameData | null>(null);
  loadProgress = $state('');
  private handles: Partial<Record<SourceKind, FileSystemDirectoryHandle>> = {};
  private savesRoots: Record<SaveRuntime, SavesRoot | null> = { dfu: null, dfo: null };
  saves = $state.raw<SaveSummary[]>([]);
  boundSave = $state.raw<SaveDetail | null>(null);
  dfuMods = $state.raw<string[]>([]);
  private modFiles = new Map<string, () => Promise<Blob>>();
  roads = $state.raw<RoadData | null>(null);
  roadsStatus = $state('Not loaded: needs the Basic Roads mod (choose your DFU install).');

  // ---- user data ----
  settings = $state<Settings>(structuredClone(DEFAULT_SETTINGS));
  profiles = $state.raw<Profile[]>([]);
  records = $state.raw<AnyRecord[]>([]);
  storage = $state<{ persisted: boolean; usage: number; quota: number }>({ persisted: false, usage: 0, quota: 0 });
  /** Running inside the desktop exe (Tauri): storage is the app's own data/ folder, not a browser profile. */
  desktop = typeof location !== 'undefined' && location.hostname === 'tauri.localhost';
  /** Browser's "install this app" prompt, when offered. */
  installPrompt = $state.raw<any>(null);
  /** Running as an installed app window. */
  installed = $state(typeof window !== 'undefined' && matchMedia('(display-mode: standalone)').matches);

  // ---- navigation ----
  mapLevel = $state<MapLevel>('overview');
  /** Current world-map zoom (screen px per map pixel), published by the map for the controls panel. */
  mapZoom = $state(1);
  /** Window width, kept current by the workspace. Narrow: side panels become a drawer. Phone: compact layout. */
  viewportWidth = $state(typeof window !== 'undefined' ? innerWidth : 1280);
  narrow = $derived(this.viewportWidth < 900);
  phone = $derived(this.viewportWidth < 640);
  /** On narrow screens the side panels are a drawer, shown on demand (not a saved layout setting). */
  drawerOpen = $state(false);
  /** Bestiary "where" filter: a habitat key ('dungeon:0', 'wild:woodland:wild-day', …) or 'region:<n>'. */
  bestiaryWhere = $state<string | null>(null);
  /** A pending "services near X" query for the find box. */
  serviceQuery = $state<{ key: string; near: { x: number; y: number; label: string }; token: number } | null>(null);
  townMapId = $state<number | null>(null);
  selection = $state<Selection | null>(null);
  flyRequest = $state<{ x: number; y: number; zoom?: number; token: number } | null>(null);
  townFocus = $state<{ key: number; token: number } | null>(null);
  composer = $state<ComposerState | null>(null);
  showProfilePicker = $state(false);
  toasts = $state<Toast[]>([]);

  // ---------- derived ----------
  activeProfile = $derived(this.profiles.find((p) => p.id === this.settings.activeProfileId) ?? null);
  revealPlane = $derived(this.settings.activeProfileId ?? NO_PROFILE);

  liveRecords = $derived(this.records.filter((r) => !r.deletedAt));
  visibleRecords = $derived(this.liveRecords.filter((r) =>
    (r.plane === ATLAS && this.settings.layers.atlas) ||
    (r.plane === this.settings.activeProfileId && this.settings.layers.playthrough)));
  byAnchor = $derived.by(() => {
    const m = new Map<string, AnyRecord[]>();
    for (const r of this.visibleRecords) {
      if (!r.anchorKey || r.kind === 'reveal' || r.kind === 'kill' || r.kind === 'spot' || r.kind === 'status') continue;
      const list = m.get(r.anchorKey);
      if (list) list.push(r); else m.set(r.anchorKey, [r]);
    }
    return m;
  });
  reveals = $derived(new Set(this.liveRecords.filter((r) => r.kind === 'reveal' && r.plane === this.revealPlane).map((r) => r.anchorKey)));
  kills = $derived(new Map(this.liveRecords
    .filter((r) => r.kind === 'kill' && r.plane === this.settings.activeProfileId)
    .map((r) => [(r.anchor as { id: number }).id, r as Extract<AnyRecord, { kind: 'kill' }>])));
  trash = $derived(this.records.filter((r) => r.deletedAt).sort((a, b) => b.deletedAt! - a.deletedAt!));

  discovery = $derived(this.settings.spoiler.useSaveDiscovery ? this.boundSave?.discovery ?? null : null);

  /** "I'm here" and "Home" for the current playthrough (or for no-profile browsing). */
  spots = $derived.by(() => {
    const out: { here: SpotRecord | null; home: SpotRecord | null } = { here: null, home: null };
    for (const r of this.liveRecords) if (r.kind === 'spot' && r.plane === this.revealPlane) out[r.role] = r;
    return out;
  });
  /** Dungeon (or any place) progress, by mapId, for the current playthrough. */
  statuses = $derived(new Map(this.liveRecords
    .filter((r): r is StatusRecord => r.kind === 'status' && r.plane === this.revealPlane && r.anchor?.t === 'loc')
    .map((r) => [(r.anchor as { mapId: number }).mapId, r.status])));
  /** Player level used for encounter odds: the bound character's, else the one set in the bestiary. */
  encounterLevel = $derived(this.boundSave?.character?.level || this.settings.bestiary.level || 1);
  /** mapIds offering the service chosen in the map filter, or null when no filter is set. */
  serviceMatches = $derived.by(() => {
    const key = this.settings.filter.service;
    if (!key || !this.game) return null;
    return new Set(this.game.directory().where.get(key) ?? []);
  });

  // =====================================================================
  // Startup
  // =====================================================================
  async init() {
    try {
      this.settings = mergeSettings(await get('kv', 'settings'));
      this.profiles = await getAll<Profile>('profiles');
      this.records = await getAll<AnyRecord>('records');
    } catch (e) {
      this.toast(`Could not open the browser database: ${(e as Error).message}`, 'error');
    }
    if (typeof window !== 'undefined') {
      addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.installPrompt = e; });
      addEventListener('appinstalled', () => { this.installPrompt = null; this.installed = true; this.requestPersistence(true); });
    }
    await this.refreshStorage();
    // Installed apps are normally granted persistence without asking; make sure it is on.
    if (this.installed && !this.storage.persisted) await this.requestPersistence(true);
    // v0.1 stored the (Unity) saves folder as "handle:saves".
    const legacy = await get<FileSystemDirectoryHandle>('kv', 'handle:saves').catch(() => undefined);
    if (legacy) {
      if (!(await get('kv', 'handle:dfuSaves').catch(() => undefined))) await put('kv', legacy, 'handle:dfuSaves');
      await del('kv', 'handle:saves');
    }
    for (const kind of SOURCE_KINDS) {
      const h = await get<FileSystemDirectoryHandle>('kv', `handle:${kind}`).catch(() => undefined);
      if (!h) continue;
      this.handles[kind] = h;
      this.sources[kind].name = h.name;
      const perm = await (h as any).queryPermission?.({ mode: kind === 'backup' ? 'readwrite' : 'read' });
      if (perm === 'granted') await this.connect(kind);
      else this.setSource(kind, 'needs-permission', 'Click to reconnect (the browser asks once per session).');
    }
    // Development: folders configured for the dev server load straight away.
    if (import.meta.env.DEV && !WEB && this.sources.arena2.state !== 'ok') await this.useDevData(true);
    // The hosted map opens straight onto the map with the built-in data.
    if (WEB) {
      if (!(await get('kv', 'settings').catch(() => undefined))) this.settings.spoiler.level = 'cartographer';
      this.settings.firstRunDone = true;
      await this.useBuiltInData();
      this.dfcSavedAt = Number((await get('kv', 'dfcSavedAt').catch(() => 0)) ?? 0);
    }
    this.ready = true;
    this.maybeAutoSnapshot();
  }

  async saveSettings() {
    await put('kv', $state.snapshot(this.settings), 'settings');
  }

  // =====================================================================
  // Sources
  // =====================================================================
  private setSource(kind: SourceKind, state: SourceStatus['state'], detail: string) {
    this.sources[kind].state = state;
    this.sources[kind].detail = detail;
  }

  /** Must be called from a click: opens the folder picker. */
  async pick(kind: SourceKind) {
    if (!hasFsAccess) return false;
    try {
      const h: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({
        id: `dfc-${kind}`,
        mode: kind === 'backup' ? 'readwrite' : 'read',
      });
      let chosen = h;
      if (kind === 'arena2') chosen = (await this.findArena2(h)) ?? h;
      if (kind === 'dfuSaves' || kind === 'dfoSaves') chosen = (await this.findSaves(h)) ?? h;
      this.handles[kind] = chosen;
      this.sources[kind].name = chosen.name;
      await put('kv', chosen, `handle:${kind}`);
      await this.connect(kind);
      return true;
    } catch (e) {
      if ((e as Error).name !== 'AbortError') this.toast((e as Error).message, 'error');
      return false;
    }
  }

  /** If the user picked the install folder, use its ARENA2 child (and say so). Only looks one level down. */
  private async findArena2(h: FileSystemDirectoryHandle) {
    const src = await new DirectoryHandleSource(h).scan();
    if (src.names().includes('MAPS.BSA')) return h;
    const sub = src.subdir('ARENA2');
    if (sub) { this.toast(`Using the ARENA2 folder inside “${h.name}”.`, 'info'); return sub; }
    return null;
  }

  /** Accept the folder above "Saves" too (e.g. "Daggerfall JavaScript"). Only looks one level down. */
  private async findSaves(h: FileSystemDirectoryHandle) {
    const src = await new DirectoryHandleSource(h).scan();
    if (src.subdirs().some((d) => /^SAVE\d+$/.test(d.key))) return h;
    const sub = src.subdir('Saves');
    if (sub) { this.toast(`Using the Saves folder inside “${h.name}”.`, 'info'); return sub; }
    return null;
  }

  /** Must be called from a click: re-grants permission for a remembered folder. */
  async reconnect(kind: SourceKind) {
    const h = this.handles[kind];
    if (!h) return this.pick(kind);
    const perm = await (h as any).requestPermission?.({ mode: kind === 'backup' ? 'readwrite' : 'read' });
    if (perm === 'granted') await this.connect(kind);
    else this.toast('Permission was not granted.', 'warn');
  }

  async forget(kind: SourceKind) {
    delete this.handles[kind];
    await del('kv', `handle:${kind}`);
    this.sources[kind].name = null;
    this.setSource(kind, 'unset', '');
    const runtime = SAVE_SOURCE_RUNTIME[kind];
    if (runtime) { this.savesRoots[runtime] = null; await this.refreshSaves(); }
    if (kind === 'dfu') { this.modFiles.clear(); this.dfuMods = []; await this.loadRoads(); }
  }

  /** Fallback for browsers without the File System Access API: an <input webkitdirectory> FileList. */
  async useFileList(kind: SourceKind, files: File[]) {
    if (!files.length) return;
    const root = ((files[0] as any).webkitRelativePath as string).split('/')[0];
    const runtime = SAVE_SOURCE_RUNTIME[kind];
    if (kind === 'arena2') {
      let src: GameSource = new FileListSource(root, files);
      if (!src.names().includes('MAPS.BSA')) src = new FileListSource(root, files, 'ARENA2');
      this.sources.arena2.name = root;
      await this.loadGame(src);
    } else if (runtime) {
      this.sources[kind].name = root;
      this.savesRoots[runtime] = new FileListSavesRoot(files);
      await this.refreshSaves();
    }
  }

  /** Development only: load game data, saves and mods from folders the dev server exposes. */
  async useDevData(quiet = false) {
    if (!import.meta.env.DEV) return;
    const dev = await import('../df/devsource');
    const src = await dev.devArena2();
    if (!src) { if (!quiet) this.toast('Dev data not configured (set DFC_DEV_ARENA2).', 'warn'); return; }
    this.sources.arena2.name = 'dev: ARENA2';
    await this.loadGame(src);
    for (const runtime of ['dfu', 'dfo'] as SaveRuntime[]) {
      const root = await dev.devSaves(runtime);
      if (!root) continue;
      const kind = runtime === 'dfu' ? 'dfuSaves' : 'dfoSaves';
      this.sources[kind].name = `dev: ${RUNTIME_LABEL[runtime]} saves`;
      this.savesRoots[runtime] = root;
    }
    await this.refreshSaves();
    const roads = await fetch('/__dev/dfu/DaggerfallUnity_Data/StreamingAssets/Mods/basicroads.dfmod').catch(() => null);
    if (roads?.ok) {
      this.sources.dfu.name = 'dev: DFU install';
      this.setSource('dfu', 'ok', 'Mods read through the dev server');
      await this.loadRoads(await roads.blob(), 'Basic Roads mod');
    }
  }

  private async connect(kind: SourceKind) {
    const h = this.handles[kind];
    if (!h) return;
    const runtime = SAVE_SOURCE_RUNTIME[kind];
    if (kind === 'arena2') await this.loadGame(await new DirectoryHandleSource(h).scan());
    else if (runtime) { this.savesRoots[runtime] = new HandleSavesRoot(h); await this.refreshSaves(); }
    else if (kind === 'dfu') await this.scanDfu(h);
    else if (kind === 'backup') this.setSource('backup', 'ok', 'Backups can be written here.');
  }

  private async loadGame(src: GameSource) {
    const previous = this.game?.fingerprint ?? null;
    this.setSource('arena2', 'loading', 'Reading game data…');
    try {
      const g = await GameData.load(src, (m) => (this.loadProgress = m));
      this.game = g;
      this.placeIndex = null;
      this.dataMode = 'files';
      const towns = g.maps.locations.filter((l) => LOC_TYPES[l.type]?.town).length;
      const regions = g.maps.regions.filter((r) => r.locationCount > 0).length;
      const msg = `${regions} regions, ${g.maps.locations.length.toLocaleString()} locations (${towns.toLocaleString()} with a town map), ${g.blocks.count.toLocaleString()} blocks`;
      this.setSource('arena2', 'ok', msg);
      if (previous && previous !== g.fingerprint) this.toast('Game data changed since last load: map data reloaded.', 'warn');
      else if (previous) this.toast('Game data reloaded; nothing changed.', 'ok');
      if (this.boundSave) await this.loadBoundSave();
    } catch (e) {
      this.setSource('arena2', 'error', (e as Error).message);
    }
  }

  async refresh(kind: SourceKind) {
    if (SAVE_SOURCE_RUNTIME[kind]) return this.refreshSaves(true);
    if (this.handles[kind]) await this.connect(kind);
  }

  /** Re-lists saves from every connected save folder (both runtimes). */
  async refreshSaves(report = false) {
    const before = new Map(this.saves.map((s) => [s.id, s.realTime]));
    const all: SaveSummary[] = [];
    for (const runtime of ['dfu', 'dfo'] as SaveRuntime[]) {
      const kind = runtime === 'dfu' ? 'dfuSaves' : 'dfoSaves';
      const root = this.savesRoots[runtime];
      if (!root) continue;
      this.setSource(kind, 'loading', 'Reading saves…');
      try {
        const list = await listSaves(root, runtime);
        all.push(...list);
        const chars = new Set(list.map((s) => s.characterName)).size;
        const imported = list.filter((s) => s.format !== runtime).length;
        this.setSource(kind, 'ok', `${list.length} saves from ${chars} character${chars === 1 ? '' : 's'}${imported ? ` (${imported} imported from the other runtime)` : ''}`);
      } catch (e) {
        this.setSource(kind, 'error', (e as Error).message);
      }
    }
    this.saves = all.sort((a, b) => b.realTime - a.realTime);
    if (report && before.size) {
      const added = all.filter((s) => !before.has(s.id)).length;
      const changed = all.filter((s) => before.has(s.id) && before.get(s.id) !== s.realTime).length;
      this.toast(added || changed ? `${added} new, ${changed} updated save${added + changed === 1 ? '' : 's'}.` : 'No save changes.', 'ok');
    }
    await this.loadBoundSave();
  }

  private async scanDfu(h: FileSystemDirectoryHandle) {
    this.setSource('dfu', 'loading', 'Looking for mods…');
    try {
      const mods: string[] = [];
      this.modFiles.clear();
      const walk = async (dir: FileSystemDirectoryHandle, path: string[]) => {
        for await (const e of (dir as any).values() as AsyncIterable<FileSystemHandle>) {
          if (e.kind === 'file' && e.name.toLowerCase().endsWith('.dfmod')) {
            mods.push(e.name.replace(/\.dfmod$/i, ''));
            const fh = e as FileSystemFileHandle;
            this.modFiles.set(e.name.toLowerCase(), () => fh.getFile());
          }
          else if (e.kind === 'directory' && path.length < 3 && /^(daggerfallunity_data|streamingassets|mods)$/i.test(e.name)) {
            await walk(e as FileSystemDirectoryHandle, [...path, e.name]);
          }
        }
      };
      await walk(h, []);
      this.dfuMods = mods.sort();
      this.setSource('dfu', 'ok', mods.length ? `${mods.length} mods installed` : 'No .dfmod files found (vanilla, or not the install folder)');
      await this.loadRoads();
    } catch (e) {
      this.setSource('dfu', 'error', (e as Error).message);
    }
  }

  /** Reads road/track/river grids from the Basic Roads mod (found in the DFU install, or a file the user picks). */
  async loadRoads(file?: Blob, label?: string) {
    const get = this.modFiles.get('basicroads.dfmod');
    if (!file && !get) { this.roads = null; this.roadsStatus = 'Needs the Basic Roads mod: set your Daggerfall Unity install, or choose basicroads.dfmod.'; return; }
    try {
      const blob = file ?? (await get!());
      this.roads = loadBasicRoads(new Uint8Array(await blob.arrayBuffer()), label ?? 'Basic Roads mod');
      const n = this.roads.networks;
      this.roadsStatus = `From ${this.roads.source}: ${[n.road && `${n.road.lines.length} roads`, n.track && `${n.track.lines.length} tracks`, n.river && 'rivers', n.stream && 'streams'].filter(Boolean).join(', ')}`;
    } catch (e) {
      this.roads = null;
      this.roadsStatus = `Could not read roads: ${(e as Error).message}`;
    }
  }

  /** Lookups from save-side place references (pixel ids, region + name) to mapIds. */
  private placeIndex: Map<string, number> | null = null;
  private places: PlaceResolver = {
    mapIdAtPixel: (x, y) => this.game?.maps.locationAt(x, y)?.mapId ?? null,
    mapIdByRegionAndName: (region, name) => {
      const g = this.game;
      if (!g) return null;
      if (!this.placeIndex) {
        this.placeIndex = new Map();
        for (const l of g.maps.locations) this.placeIndex.set(`${l.region}:${l.name}`, l.mapId);
      }
      return this.placeIndex.get(`${region}:${name}`) ?? null;
    },
  };

  /** Loads the map data that ships with the app (no game files needed). */
  async useBuiltInData() {
    this.setSource('arena2', 'loading', 'Loading built-in map data…');
    try {
      const { game, roads } = await loadBaked(BUILTIN_DATA, (m) => (this.loadProgress = m));
      this.game = game;
      this.placeIndex = null;
      this.dataMode = 'builtin';
      this.sources.arena2.name = 'Built-in map data';
      this.setSource('arena2', 'ok', `${game.maps.locations.length.toLocaleString()} places, ready to use`);
      if (roads) {
        this.roads = roads;
        const n = roads.networks;
        this.roadsStatus = `Built in (from ${roads.source}): ${[n.road && `${n.road.lines.length} roads`, n.track && `${n.track.lines.length} tracks`, n.river && 'rivers', n.stream && 'streams'].filter(Boolean).join(', ')}`;
      }
      if (this.activeProfile) await this.loadBoundSave();
    } catch (e) {
      this.setSource('arena2', 'error', (e as Error).message);
    }
  }

  /** True when this build ships baked map data (the desktop build does too). */
  async hasBuiltInData() {
    try { return (await fetch(`${BUILTIN_DATA}game.bin`, { method: 'HEAD' })).ok; } catch { return false; }
  }

  /** Resolves the active Profile's save: a live folder binding, else the snapshot captured into it. */
  async loadBoundSave() {
    const p = this.activeProfile;
    const b = p?.binding;
    if (this.boundSave?.screenshotUrl) URL.revokeObjectURL(this.boundSave.screenshotUrl);
    this.boundSave = null;
    if (!p) return;
    const summary = b ? this.resolveBinding(b) : null;
    const root = summary ? this.savesRoots[summary.runtime] : null;
    if (summary && root) {
      try { this.boundSave = await readSave(root, summary, this.places); return; }
      catch (e) { this.toast(`Could not read ${summary.folder}: ${(e as Error).message}`, 'error'); }
    }
    if (p.saveSnapshot) this.boundSave = detailFromSnapshot(p.saveSnapshot);
  }

  // ---- dropped / picked files: .dfc playthroughs and game saves ----

  /** Handles anything dropped on the window or chosen in a file picker. */
  async handleFiles(files: { path: string; file: File }[]) {
    const dfc = files.find((f) => /\.(dfc|json)$/i.test(f.file.name));
    if (dfc) return this.openDfcFile(dfc.file);
    const saveFiles = files.filter((f) => /\.(txt|jpg)$/i.test(f.file.name));
    if (saveFiles.length) {
      const root = new DroppedSavesRoot(saveFiles);
      const found = await listSaves(root, 'dfu');
      if (!found.length) { this.toast('No Daggerfall save found in what was dropped (looking for SaveInfo.txt / SaveData.txt).', 'warn'); return; }
      if (found.length === 1) return this.captureSave(root, found[0]);
      this.pendingSaves = { root, saves: found };
      return;
    }
    this.toast('Drop a .dfc playthrough file, or a Daggerfall save folder.', 'warn');
  }

  /** Reads one save and stores a snapshot of it in the active playthrough (creating one if needed). */
  async captureSave(root: SavesRoot, summary: SaveSummary) {
    this.pendingSaves = null;
    try {
      const detail = await readSave(root, summary, this.places);
      const runtime = detail.summary.format === 'dfo' ? 'dfo' : 'dfu';
      const snap: SaveSnapshot = snapshotSave({ ...detail, summary: { ...detail.summary, runtime, id: `${runtime}:${detail.summary.folder}` } });
      let p = this.activeProfile;
      if (!p) p = await this.createProfile(detail.character?.name || summary.characterName || 'My playthrough', null);
      await this.updateProfile(p.id, { saveSnapshot: snap });
      await this.loadBoundSave();
      this.toast(`Captured ${snap.character?.name ?? summary.characterName} (${summary.saveName}): ${snap.discovery.locations.length} places known.`, 'ok');
    } catch (e) {
      this.toast(`Could not read that save: ${(e as Error).message}`, 'error');
    }
  }

  async openDfcFile(file: File, handle: FileSystemFileHandle | null = null) {
    try {
      const bundle = parseBundle(await file.text());
      this.pendingImport = { bundle, fileName: file.name };
      if (handle) { this.dfcHandle = handle; this.dfcName = file.name; }
    } catch (e) {
      this.toast((e as Error).message, 'error');
    }
  }

  /** Open a .dfc with the system file picker (falls back to a plain file input in the caller). */
  async pickDfc(): Promise<boolean> {
    const w = window as any;
    if (!w.showOpenFilePicker) return false;
    try {
      const [h] = await w.showOpenFilePicker({ types: [{ description: 'Daggerfall playthrough', accept: { 'application/json': ['.dfc'] } }] });
      await this.openDfcFile(await h.getFile(), h);
    } catch (e) { if ((e as Error).name !== 'AbortError') this.toast((e as Error).message, 'error'); }
    return true;
  }

  /** Records changed since the last .dfc save. */
  unsavedCount = $derived(this.records.filter((r) => r.updatedAt > this.dfcSavedAt && r.kind !== 'reveal').length);

  /** Saves everything (Atlas, playthroughs, settings) to a .dfc file. Save-as when no file is open. */
  async saveDfc(saveAs = false) {
    const bundle = await buildBundle({ kind: 'all' }, this.game?.fingerprint ?? null, false);
    const text = JSON.stringify(bundle);
    const w = window as any;
    const suggested = (this.activeProfile?.name ?? 'daggerfall').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.dfc';
    try {
      let handle = saveAs ? null : this.dfcHandle;
      if (!handle && w.showSaveFilePicker) {
        handle = await w.showSaveFilePicker({ suggestedName: this.dfcName ?? suggested, types: [{ description: 'Daggerfall playthrough', accept: { 'application/json': ['.dfc'] } }] });
      }
      if (handle) {
        const writable = await (handle as any).createWritable();
        await writable.write(text);
        await writable.close();
        this.dfcHandle = handle;
        this.dfcName = handle.name;
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = this.dfcName ?? suggested;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
      this.dfcSavedAt = Date.now();
      await put('kv', this.dfcSavedAt, 'dfcSavedAt');
      this.toast(`Saved ${this.dfcName ?? suggested}.`, 'ok');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') this.toast((e as Error).message, 'error');
    }
  }

  resolveBinding(b: Profile['binding']): SaveSummary | null {
    if (!b) return null;
    const runtime = b.runtime ?? 'dfu';
    const pool = this.saves.filter((s) => s.runtime === runtime);
    if (b.mode === 'pinned') return pool.find((s) => s.folder === b.folder) ?? null;
    // Newest first. DFO saves have a stable character id; fall back to the name.
    return (b.characterId ? pool.find((s) => s.characterId === b.characterId) : null)
      ?? pool.find((s) => s.characterName === b.characterName) ?? null;
  }

  async saveThumbnail(save: SaveSummary): Promise<string | null> {
    const f = await this.savesRoots[save.runtime]?.file(save.folder, 'Screenshot.jpg');
    return f ? URL.createObjectURL(f) : null;
  }

  // =====================================================================
  // Profiles
  // =====================================================================
  async createProfile(name: string, binding: Profile['binding']) {
    const p: Profile = {
      id: newId('p'),
      name: name.trim() || 'New playthrough',
      color: PROFILE_COLORS[this.profiles.length % PROFILE_COLORS.length],
      createdAt: Date.now(),
      lastOpenedAt: Date.now(),
      binding,
      notes: '',
    };
    await put('profiles', p);
    this.profiles = [...this.profiles, p];
    await this.openProfile(p.id);
    return p;
  }

  async updateProfile(id: string, patch: Partial<Profile>) {
    const cur = this.profiles.find((p) => p.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch };
    await put('profiles', next);
    this.profiles = this.profiles.map((p) => (p.id === id ? next : p));
    if (id === this.settings.activeProfileId && 'binding' in patch) await this.loadBoundSave();
  }

  async openProfile(id: string | null) {
    this.settings.activeProfileId = id;
    await this.saveSettings();
    if (id) await this.updateProfile(id, { lastOpenedAt: Date.now() });
    await this.loadBoundSave();
  }

  async deleteProfile(id: string) {
    await this.snapshot('Before deleting a profile');
    for (const r of this.records.filter((r) => r.plane === id)) await del('records', r.id);
    await del('profiles', id);
    this.records = this.records.filter((r) => r.plane !== id);
    this.profiles = this.profiles.filter((p) => p.id !== id);
    if (this.settings.activeProfileId === id) await this.openProfile(null);
  }

  // =====================================================================
  // Records
  // =====================================================================
  async upsert<T extends AnyRecord>(rec: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'anchorKey'> & { id?: string; createdAt?: number }): Promise<T> {
    const now = Date.now();
    const existing = rec.id ? this.records.find((r) => r.id === rec.id) : undefined;
    const full = {
      ...existing,
      ...rec,
      id: rec.id ?? newId(),
      createdAt: existing?.createdAt ?? rec.createdAt ?? now,
      updatedAt: now,
      anchorKey: anchorKey(rec.anchor),
    } as T;
    await put('records', $state.snapshot(full));
    this.records = existing ? this.records.map((r) => (r.id === full.id ? full : r)) : [...this.records, full];
    return full;
  }

  async trashRecord(id: string) {
    const r = this.records.find((x) => x.id === id);
    if (!r) return;
    const next = { ...r, deletedAt: Date.now(), updatedAt: Date.now() };
    await put('records', next);
    this.records = this.records.map((x) => (x.id === id ? next : x));
    this.toast('Moved to Trash. Restore it from Data → Trash.', 'info');
  }

  async restoreRecord(id: string) {
    const r = this.records.find((x) => x.id === id);
    if (!r) return;
    const { deletedAt: _, ...rest } = r;
    const next = { ...rest, updatedAt: Date.now() } as AnyRecord;
    await put('records', next);
    this.records = this.records.map((x) => (x.id === id ? next : x));
  }

  async purgeRecord(id: string) {
    await del('records', id);
    this.records = this.records.filter((x) => x.id !== id);
  }

  /** Copy (Atlas <- -> Playthrough) as a deliberate action. Returns the new record. */
  async copyToPlane(id: string, plane: Plane) {
    const r = this.records.find((x) => x.id === id);
    if (!r) return null;
    const { id: _id, createdAt: _c, updatedAt: _u, anchorKey: _k, deletedAt: _d, ...rest } = r;
    return this.upsert({ ...rest, plane } as any);
  }

  async moveToPlane(id: string, plane: Plane) {
    const r = this.records.find((x) => x.id === id);
    if (!r) return;
    await this.upsert({ ...r, plane } as any);
  }

  recordsFor(a: Anchor, kinds: RecordKind[] = ['marker', 'note']): (MarkerRecord | NoteRecord | JournalRecord)[] {
    return (this.byAnchor.get(anchorKey(a)) ?? []).filter((r) => kinds.includes(r.kind)) as (MarkerRecord | NoteRecord | JournalRecord)[];
  }

  // ---- reveals ----
  isRevealed(a: Anchor) { return this.reveals.has(anchorKey(a)); }

  async setRevealed(a: Anchor, on: boolean) {
    const key = anchorKey(a);
    const existing = this.liveRecords.find((r) => r.kind === 'reveal' && r.plane === this.revealPlane && r.anchorKey === key);
    if (on && !existing) await this.upsert({ kind: 'reveal', plane: this.revealPlane, anchor: a } as any);
    if (!on && existing) await this.purgeRecord(existing.id);
  }

  async revealMany(anchors: Anchor[]) {
    for (const a of anchors) if (!this.isRevealed(a)) await this.upsert({ kind: 'reveal', plane: this.revealPlane, anchor: a } as any);
  }

  // ---- bestiary ----
  async setKill(creatureId: number, patch: { slain?: boolean; count?: number }) {
    const plane = this.settings.activeProfileId;
    if (!plane) { this.toast('Open a Profile to track kills for a playthrough.', 'warn'); return; }
    const cur = this.kills.get(creatureId);
    await this.upsert({
      id: cur?.id,
      kind: 'kill',
      plane,
      anchor: { t: 'creature', id: creatureId },
      slain: patch.slain ?? cur?.slain ?? false,
      count: Math.max(0, patch.count ?? cur?.count ?? 0),
    } as any);
  }

  // ---- here / home, place status ----
  async setSpot(role: 'here' | 'home', anchor: Anchor | null) {
    const cur = this.spots[role];
    if (!anchor) { if (cur) await this.purgeRecord(cur.id); return; }
    await this.upsert({ id: cur?.id, kind: 'spot', role, plane: this.revealPlane, anchor } as any);
    this.toast(`${role === 'here' ? "You're at" : 'Home is'} ${this.describeAnchor(anchor)}.`, 'ok');
  }

  /** World map position of an anchor, for distances and drawing. */
  anchorPoint(a: Anchor | null): { x: number; y: number } | null {
    if (!a) return null;
    if (a.t === 'px') return { x: a.x, y: a.y };
    if (a.t === 'loc' || a.t === 'bld' || a.t === 'town') {
      const l = this.game?.maps.locationByMapId(a.mapId);
      return l ? { x: l.x + 0.5, y: l.y + 0.5 } : null;
    }
    return null;
  }

  /** Where "near me" means: manual "I'm here", else the bound save's position, else the selection. */
  origin(): { x: number; y: number; label: string } | null {
    const here = this.anchorPoint(this.spots.here?.anchor ?? null);
    if (here) return { ...here, label: this.describeAnchor(this.spots.here!.anchor).split(' · ')[0] };
    const pos = this.boundSave?.position;
    if (pos) return { x: pos.x, y: pos.y, label: 'your character' };
    const sel = this.selection;
    if (sel?.t === 'loc' || sel?.t === 'bld') {
      const l = this.game?.maps.locationByMapId(sel.mapId);
      if (l) return { x: l.x + 0.5, y: l.y + 0.5, label: l.name };
    }
    return null;
  }

  /** Open the find results for a service near a place. */
  findNear(key: string, loc: LocationSummary) {
    this.serviceQuery = { key, near: { x: loc.x + 0.5, y: loc.y + 0.5, label: loc.name }, token: Math.random() };
  }

  async setStatus(mapId: number, status: 'started' | 'cleared' | null) {
    const cur = this.liveRecords.find((r) => r.kind === 'status' && r.plane === this.revealPlane && r.anchorKey === `loc:${mapId}`);
    if (!status) { if (cur) await this.purgeRecord(cur.id); return; }
    await this.upsert({ id: cur?.id, kind: 'status', status, plane: this.revealPlane, anchor: { t: 'loc', mapId } } as any);
  }

  // =====================================================================
  // Spoilers
  // =====================================================================
  locationMode(): 'all' | 'known' {
    const s = this.settings.spoiler;
    if (s.locations !== 'auto') return s.locations;
    return s.level === 'explorer' ? 'known' : 'all';
  }

  shopNamesShown(): boolean {
    const s = this.settings.spoiler;
    if (s.shopNames !== 'auto') return s.shopNames === 'show';
    return s.level === 'cartographer';
  }

  dungeonLayoutsShown(): boolean {
    const s = this.settings.spoiler;
    if (s.dungeonLayouts !== 'auto') return s.dungeonLayouts === 'show';
    return s.level === 'cartographer';
  }

  locationDiscovered(loc: LocationSummary) {
    return !!this.discovery?.locations.has(loc.mapId);
  }

  /** Spoiler-aware: is this location shown on the map / in search? */
  locationVisible(loc: LocationSummary): boolean {
    if (this.locationMode() === 'all') return true;
    return loc.visibleAtStart || this.locationDiscovered(loc) || this.reveals.has(`loc:${loc.mapId}`) || this.byAnchor.has(`loc:${loc.mapId}`);
  }

  /** Name as the player's game shows it: save-recorded (covers mods) > generated. */
  buildingRealName(mapId: number, b: TownBuilding): string {
    const fromSave = this.boundSave?.discovery.buildings.get(mapId)?.get(b.key);
    return fromSave || b.name;
  }

  /** Visibility for a building name known only from MAPS.BSA (no layout key), e.g. in service search. */
  serviceNameVisible(mapId: number, name: string): boolean {
    if (this.shopNamesShown()) return true;
    if (this.reveals.has(`town:${mapId}`) || this.reveals.has('town:*')) return true;
    return !!this.discovery?.names.get(mapId)?.has(name);
  }

  buildingNameVisible(mapId: number, b: TownBuilding): boolean {
    if (!b.name && !this.boundSave?.discovery.buildings.get(mapId)?.get(b.key)) return false;
    if (this.shopNamesShown()) return true;
    if (this.discovery?.buildings.get(mapId)?.has(b.key) || (b.name && this.discovery?.names.get(mapId)?.has(b.name))) return true;
    return this.reveals.has(`bld:${mapId}:${b.key}`) || this.reveals.has(`town:${mapId}`) || this.reveals.has('town:*');
  }

  // =====================================================================
  // Navigation
  // =====================================================================
  /** Open a page in the bottom dock. */
  openDock(tab: DockTab) {
    const l = this.settings.layout;
    l.bottomTab = tab;
    l.bottomOpen = true;
    if (this.phone) { l.bottomMax = true; this.drawerOpen = false; }
    this.saveLayout();
  }

  /** Make sure the map is visible (un-maximise the dock). */
  showMap() {
    if (this.settings.layout.bottomMax) { this.settings.layout.bottomMax = false; this.saveLayout(); }
  }

  private layoutTimer: ReturnType<typeof setTimeout> | null = null;
  /** Debounced: layout changes come in bursts while dragging splitters. */
  saveLayout() {
    if (this.layoutTimer) clearTimeout(this.layoutTimer);
    this.layoutTimer = setTimeout(() => this.saveSettings(), 300);
  }

  flyTo(x: number, y: number, zoom?: number) {
    if (this.mapLevel !== 'world') this.mapLevel = 'world';
    this.showMap();
    this.flyRequest = { x, y, zoom, token: Math.random() };
  }

  goToLocation(loc: LocationSummary, zoom = 14) {
    this.selection = { t: 'loc', mapId: loc.mapId };
    this.flyTo(loc.x + 0.5, loc.y + 0.5, zoom);
  }

  openTown(mapId: number, focusKey?: number) {
    this.showMap();
    this.townMapId = mapId;
    this.mapLevel = 'town';
    if (focusKey !== undefined) {
      this.selection = { t: 'bld', mapId, key: focusKey };
      this.townFocus = { key: focusKey, token: Math.random() };
    } else this.selection = { t: 'loc', mapId };
  }

  goToAnchor(a: Anchor) {
    const g = this.game;
    if (!g) return;
    if (a.t === 'px') this.flyTo(a.x, a.y, 20);
    else if (a.t === 'loc') { const l = g.maps.locationByMapId(a.mapId); if (l) this.goToLocation(l); }
    else if (a.t === 'bld') this.openTown(a.mapId, a.key);
    else if (a.t === 'town') this.openTown(a.mapId);
    else if (a.t === 'region') this.selection = { t: 'region', region: a.region };
    else if (a.t === 'creature') { this.openDock('bestiary'); this.selection = { t: 'creature', id: a.id }; }
  }

  describeAnchor(a: Anchor | null): string {
    if (!a) return 'Unattached';
    const g = this.game;
    switch (a.t) {
      case 'px': {
        const r = g?.regionAt(Math.floor(a.x), Math.floor(a.y)) ?? -1;
        return `Map ${Math.floor(a.x)}, ${Math.floor(a.y)}${r >= 0 ? ` · ${REGION_NAMES[r]}` : ''}`;
      }
      case 'loc': {
        const l = g?.maps.locationByMapId(a.mapId);
        return l ? `${l.name} · ${REGION_NAMES[l.region]}` : `Location #${a.mapId}`;
      }
      case 'bld': case 'town': {
        const l = g?.maps.locationByMapId(a.mapId);
        return `${a.t === 'bld' ? 'Building in ' : 'Spot in '}${l?.name ?? `#${a.mapId}`}`;
      }
      case 'region': return REGION_NAMES[a.region] ?? `Region ${a.region}`;
      case 'creature': return `Creature #${a.id}`;
    }
  }

  planeLabel(plane: Plane) {
    if (plane === ATLAS) return 'Atlas';
    return this.profiles.find((p) => p.id === plane)?.name ?? 'Playthrough';
  }

  planeColor(plane: Plane) {
    if (plane === ATLAS) return 'var(--atlas)';
    return this.profiles.find((p) => p.id === plane)?.color ?? 'var(--play)';
  }

  // =====================================================================
  // Backups
  // =====================================================================
  async snapshot(reason: string) {
    const snap = await takeSnapshot(reason, this.game?.fingerprint ?? null, this.settings.backup.keepSnapshots);
    if (this.settings.backup.writeToFolder && this.handles.backup && this.sources.backup.state === 'ok') {
      try {
        await writeToFolder(this.handles.backup, bundleFileName(snap.bundle, 'snapshot'), JSON.stringify(snap.bundle, null, 1));
      } catch (e) {
        this.toast(`Snapshot saved in the browser, but writing to the backup folder failed: ${(e as Error).message}`, 'warn');
      }
    }
    return snap;
  }

  private async maybeAutoSnapshot() {
    const b = this.settings.backup;
    if (!this.records.length && !this.profiles.length) return;
    if (b.autoSnapshotHours <= 0) return;
    if (Date.now() - b.lastAutoSnapshot < b.autoSnapshotHours * 3600_000) return;
    await this.snapshot('Automatic (on open)');
    this.settings.backup.lastAutoSnapshot = Date.now();
    await this.saveSettings();
  }

  async writeBackupToFolder(label: string) {
    const h = this.handles.backup;
    if (!h) return false;
    const bundle = await buildBundle({ kind: 'all' }, this.game?.fingerprint ?? null);
    await writeToFolder(h, bundleFileName(bundle, label), JSON.stringify(bundle, null, 1));
    return true;
  }

  async reloadAll() {
    this.settings = mergeSettings(await get('kv', 'settings'));
    this.profiles = await getAll<Profile>('profiles');
    this.records = await getAll<AnyRecord>('records');
    await this.loadBoundSave();
  }

  async refreshStorage() {
    try {
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      const est = (await navigator.storage?.estimate?.()) ?? {};
      this.storage = { persisted, usage: est.usage ?? 0, quota: est.quota ?? 0 };
    } catch { /* not supported */ }
  }

  async requestPersistence(quiet = false) {
    const ok = (await navigator.storage?.persist?.()) ?? false;
    await this.refreshStorage();
    if (quiet && !ok) return;
    this.toast(ok
      ? 'Storage is now persistent: the browser will not clear your notes.'
      : 'The browser declined. Install the app (Data & backups) and it is granted; meanwhile keep a backup folder.', ok ? 'ok' : 'warn');
  }

  /** Shows the browser's install dialog. Installed apps get persistent storage. */
  async installApp() {
    const p = this.installPrompt;
    if (!p) return false;
    p.prompt();
    const choice = await p.userChoice.catch(() => null);
    this.installPrompt = null;
    return choice?.outcome === 'accepted';
  }

  // =====================================================================
  toast(text: string, tone: Toast['tone'] = 'info') {
    const id = Math.random();
    this.toasts = [...this.toasts, { id, text, tone }];
    setTimeout(() => (this.toasts = this.toasts.filter((t) => t.id !== id)), tone === 'error' ? 9000 : 4500);
  }
}

export const app = new AppState();
