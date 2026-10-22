// The companion's own data. Everything here is user-authored or user-chosen;
// nothing from the game files is stored, so exports stay small and portable.

/** Where a record attaches. Stable game identities only (see data landscape §15.1). */
export type Anchor =
  | { t: 'px'; x: number; y: number }                       // world map pixel (fractional ok)
  | { t: 'loc'; mapId: number }                             // a location
  | { t: 'bld'; mapId: number; key: number }                // a building in a location (DFU building key)
  | { t: 'town'; mapId: number; x: number; y: number }      // a spot on a town map (town pixels)
  | { t: 'region'; region: number }
  | { t: 'creature'; id: number };

export function anchorKey(a: Anchor | null): string {
  if (!a) return '';
  switch (a.t) {
    case 'px': return `px:${Math.floor(a.x)}:${Math.floor(a.y)}`;
    case 'loc': return `loc:${a.mapId}`;
    case 'bld': return `bld:${a.mapId}:${a.key}`;
    case 'town': return `town:${a.mapId}`;
    case 'region': return `region:${a.region}`;
    case 'creature': return `creature:${a.id}`;
  }
}

/** 'atlas' = true in every playthrough of this world. Otherwise the id of a Profile. */
export type Plane = 'atlas' | string;
export const ATLAS: Plane = 'atlas';
/** Reveals made while no Profile is loaded. */
export const NO_PROFILE: Plane = '_none';

export type RecordKind = 'marker' | 'note' | 'journal' | 'reveal' | 'kill' | 'guide' | 'spot' | 'status';

export const MARKER_CATEGORIES = ['landmark', 'town', 'dungeon', 'quest', 'danger', 'shop', 'custom'] as const;
export type MarkerCategory = (typeof MARKER_CATEGORIES)[number];

interface Base {
  id: string;
  plane: Plane;
  kind: RecordKind;
  anchor: Anchor | null;
  anchorKey: string;
  createdAt: number;
  updatedAt: number;
  /** Soft delete; records sit in the Trash until purged. */
  deletedAt?: number;
}

export interface MarkerRecord extends Base { kind: 'marker'; name: string; category: MarkerCategory; body: string; tags: string[] }
export interface NoteRecord extends Base { kind: 'note'; body: string; tags: string[] }
export interface JournalRecord extends Base { kind: 'journal'; body: string; tags: string[]; gameTime?: string }
export interface RevealRecord extends Base { kind: 'reveal' }
export interface KillRecord extends Base { kind: 'kill'; slain: boolean; count: number }
export interface GuideRecord extends Base { kind: 'guide'; title: string; body: string; tags: string[] }
/** "I'm here" / "Home": one of each per plane, set by hand. */
export interface SpotRecord extends Base { kind: 'spot'; role: 'here' | 'home' }
/** Progress on a place, usually a dungeon. */
export interface StatusRecord extends Base { kind: 'status'; status: 'started' | 'cleared' }

export type AnyRecord = MarkerRecord | NoteRecord | JournalRecord | RevealRecord | KillRecord | GuideRecord | SpotRecord | StatusRecord;

export interface SaveBinding {
  /** 'pinned' reads exactly one save folder; 'character' follows the newest save of a character. */
  mode: 'pinned' | 'character';
  /** Which game's saves: Daggerfall Unity or Daggerfall Online. Older bindings default to 'dfu'. */
  runtime?: 'dfu' | 'dfo';
  folder?: string;
  characterName?: string;
  /** Daggerfall Online's stable character id, when known. */
  characterId?: string;
}

export interface Profile {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  lastOpenedAt: number;
  binding: SaveBinding | null;
  /** A save captured into this playthrough (web map, or for keeping a character with the notes). */
  saveSnapshot?: import('../df/save').SaveSnapshot | null;
  notes: string;
}

export function newId(prefix = 'r') {
  const rnd = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${Date.now().toString(36)}${rnd[0].toString(36)}${rnd[1].toString(36).slice(0, 4)}`;
}

export const PROFILE_COLORS = ['#3fb8a8', '#c96fd1', '#e07a5f', '#7aa2f7', '#9ece6a', '#e0af68', '#f7768e'];
