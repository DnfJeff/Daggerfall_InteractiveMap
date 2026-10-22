// Backups at three levels:
//  1. Snapshots   – full copies kept inside the browser database (automatic + manual), restorable.
//  2. Exports     – portable .json bundles: everything, the Atlas, or chosen Profiles.
//  3. Backup folder – optional folder on disk where snapshots/exports are also written.
import { batch, del, get, getAll, put } from './idb';
import { ATLAS, newId, type AnyRecord, type Profile } from './model';

export const BUNDLE_FORMAT = 'daggerfall-companion';
export const BUNDLE_VERSION = 1;
export const APP_VERSION = '0.3.0';

export type ExportScope =
  | { kind: 'all' }
  | { kind: 'atlas' }
  | { kind: 'profiles'; ids: string[] };

export interface Bundle {
  format: typeof BUNDLE_FORMAT;
  version: number;
  app: string;
  exportedAt: string;
  scope: ExportScope;
  /** World fingerprint of the game data the Atlas was built against. */
  world: string | null;
  settings?: unknown;
  profiles: Profile[];
  records: AnyRecord[];
}

export interface Snapshot {
  id: string;
  at: number;
  reason: string;
  counts: { profiles: number; records: number };
  bundle: Bundle;
}

export async function buildBundle(scope: ExportScope, world: string | null, includeTrash = true): Promise<Bundle> {
  const [profiles, records, settings] = await Promise.all([
    getAll<Profile>('profiles'),
    getAll<AnyRecord>('records'),
    get('kv', 'settings'),
  ]);
  const keep = (r: AnyRecord) => includeTrash || !r.deletedAt;
  let p: Profile[] = [], r: AnyRecord[] = [];
  if (scope.kind === 'all') { p = profiles; r = records.filter(keep); }
  else if (scope.kind === 'atlas') { r = records.filter((x) => x.plane === ATLAS && keep(x)); }
  else {
    const ids = new Set(scope.ids);
    p = profiles.filter((x) => ids.has(x.id));
    r = records.filter((x) => ids.has(x.plane) && keep(x));
  }
  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    app: APP_VERSION,
    exportedAt: new Date().toISOString(),
    scope,
    world,
    settings: scope.kind === 'all' ? settings : undefined,
    profiles: p,
    records: r,
  };
}

export function parseBundle(text: string): Bundle {
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (data?.format !== BUNDLE_FORMAT) throw new Error('This is not a Daggerfall Interactive Map playthrough (.dfc) or export.');
  if (typeof data.version !== 'number' || data.version > BUNDLE_VERSION) {
    throw new Error(`This export was made by a newer version (format v${data.version}). Update the app to import it.`);
  }
  if (!Array.isArray(data.records) || !Array.isArray(data.profiles)) throw new Error('Export is missing its records.');
  return migrateBundle(data);
}

/** Upgrade older bundle versions in place. v1 is current. */
function migrateBundle(b: Bundle): Bundle {
  return b;
}

export interface ImportOptions {
  /** merge: newer `updatedAt` wins per item. replace: clear what the bundle covers, then load it. */
  mode: 'merge' | 'replace';
  /** Import profiles as new copies (fresh ids) so they never collide with existing ones. */
  asCopies?: boolean;
  /** Bring in the bundle's settings (only for 'all' bundles). */
  includeSettings?: boolean;
}

export interface ImportResult { added: number; updated: number; skipped: number; profiles: number }

export async function importBundle(b: Bundle, opts: ImportOptions): Promise<ImportResult> {
  let profiles = b.profiles;
  let records = b.records;
  if (opts.asCopies) {
    const remap = new Map(profiles.map((p) => [p.id, newId('p')]));
    profiles = profiles.map((p) => ({ ...p, id: remap.get(p.id)!, name: `${p.name} (imported)` }));
    records = records.map((r) => (remap.has(r.plane) ? { ...r, id: newId(), plane: remap.get(r.plane)! } : r));
  }

  const existingRecords = new Map((await getAll<AnyRecord>('records')).map((r) => [r.id, r]));
  const existingProfiles = new Map((await getAll<Profile>('profiles')).map((p) => [p.id, p]));
  const res: ImportResult = { added: 0, updated: 0, skipped: 0, profiles: 0 };

  await batch(['records', 'profiles', 'kv'], (s) => {
    if (opts.mode === 'replace') {
      const covered = coveredPlanes(b.scope, profiles);
      for (const r of existingRecords.values()) {
        if (covered === 'all' || covered.has(r.plane)) { s.records.delete(r.id); existingRecords.delete(r.id); }
      }
      if (b.scope.kind === 'all') for (const id of existingProfiles.keys()) { s.profiles.delete(id); existingProfiles.delete(id); }
    }
    for (const p of profiles) {
      const cur = existingProfiles.get(p.id);
      if (!cur || opts.mode === 'replace' || p.lastOpenedAt >= cur.lastOpenedAt) { s.profiles.put(p); res.profiles++; }
    }
    for (const r of records) {
      const cur = existingRecords.get(r.id);
      if (!cur) { s.records.put(r); res.added++; }
      else if (r.updatedAt > cur.updatedAt) { s.records.put(r); res.updated++; }
      else res.skipped++;
    }
    if (opts.includeSettings && b.scope.kind === 'all' && b.settings) s.kv.put(b.settings, 'settings');
  });
  return res;
}

function coveredPlanes(scope: ExportScope, profiles: Profile[]): Set<string> | 'all' {
  if (scope.kind === 'all') return 'all';
  if (scope.kind === 'atlas') return new Set([ATLAS]);
  return new Set(profiles.map((p) => p.id));
}

// ---------- Snapshots ----------

export async function listSnapshots(): Promise<Snapshot[]> {
  const all = await getAll<Snapshot>('snapshots');
  return all.sort((a, b) => b.at - a.at);
}

export async function takeSnapshot(reason: string, world: string | null, keep: number): Promise<Snapshot> {
  const bundle = await buildBundle({ kind: 'all' }, world);
  const snap: Snapshot = {
    id: newId('snap'),
    at: Date.now(),
    reason,
    counts: { profiles: bundle.profiles.length, records: bundle.records.length },
    bundle,
  };
  await put('snapshots', snap);
  const all = await listSnapshots();
  // Never prune "manual" snapshots automatically; prune the oldest automatic ones beyond `keep`.
  const auto = all.filter((s) => !s.reason.startsWith('Manual'));
  for (const s of auto.slice(keep)) await del('snapshots', s.id);
  return snap;
}

export async function deleteSnapshot(id: string) { await del('snapshots', id); }

export async function restoreSnapshot(id: string, world: string | null, keep: number) {
  const snap = await get<Snapshot>('snapshots', id);
  if (!snap) throw new Error('Snapshot not found');
  await takeSnapshot('Before restoring a snapshot', world, keep);
  return importBundle(snap.bundle, { mode: 'replace', includeSettings: true });
}

// ---------- Files ----------

export function bundleFileName(b: Bundle, label: string) {
  const stamp = b.exportedAt.replace(/[:]/g, '-').replace(/\..+$/, '');
  const safe = label.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'export';
  return `daggerfall-companion_${safe}_${stamp}.json`;
}

export function downloadText(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function writeToFolder(dir: FileSystemDirectoryHandle, name: string, text: string) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await (fh as any).createWritable();
  await w.write(text);
  await w.close();
}

// ---------- Human-readable export ----------

export function recordsToMarkdown(title: string, records: AnyRecord[], describeAnchor: (r: AnyRecord) => string) {
  const live = records.filter((r) => !r.deletedAt);
  const lines = [`# ${title}`, '', `_Exported ${new Date().toLocaleString()}_`, ''];
  const section = (heading: string, items: AnyRecord[], fmt: (r: any) => string[]) => {
    if (!items.length) return;
    lines.push(`## ${heading}`, '');
    for (const r of items) lines.push(...fmt(r), '');
  };
  const byTime = (a: AnyRecord, b: AnyRecord) => a.createdAt - b.createdAt;
  section('Journal', live.filter((r) => r.kind === 'journal').sort(byTime), (r) => [
    `### ${new Date(r.createdAt).toLocaleString()}${r.gameTime ? ` · ${r.gameTime}` : ''}${r.anchor ? ` · ${describeAnchor(r)}` : ''}`,
    r.body,
  ]);
  section('Markers', live.filter((r) => r.kind === 'marker').sort(byTime), (r) => [
    `### ${r.name} (${r.category}) — ${describeAnchor(r)}`, r.body, r.tags.length ? `Tags: ${r.tags.join(', ')}` : '',
  ]);
  section('Notes', live.filter((r) => r.kind === 'note').sort(byTime), (r) => [`### ${describeAnchor(r)}`, r.body]);
  section('Guides', live.filter((r) => r.kind === 'guide').sort(byTime), (r) => [`### ${r.title}`, r.body]);
  return lines.join('\n');
}
