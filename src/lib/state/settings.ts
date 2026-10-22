import { LABEL_CLASSES } from '../map/labelClasses';

export type SpoilerLevel = 'explorer' | 'wanderer' | 'cartographer';

/** Tabs of the bottom dock ("content browser"). */
export type DockTab = 'bestiary' | 'journal' | 'character' | 'guides' | 'data' | 'prefs';

export interface Settings {
  spoiler: {
    level: SpoilerLevel;
    /** auto = follow level. known = only start-visible, discovered or revealed. */
    locations: 'auto' | 'all' | 'known';
    shopNames: 'auto' | 'show' | 'hide';
    dungeonLayouts: 'auto' | 'show' | 'hide';
    /** With a bound save, treat what the character has discovered as revealed. */
    useSaveDiscovery: boolean;
  };
  layers: {
    towns: boolean; dungeons: boolean; temples: boolean; homes: boolean;
    roads: boolean; tracks: boolean; rivers: boolean; streams: boolean;
    borders: boolean; labels: boolean; markers: boolean; atlas: boolean; playthrough: boolean; player: boolean;
    /** Scale settlement dots by their real block footprint. */
    townSize: boolean;
  };
  labels: {
    /** Per label class: shown at all, and from which zoom. */
    classes: Record<string, { on: boolean; zoom: number }>;
    /** Let labels overlap instead of dropping the lower-priority one. */
    overlap: boolean;
    /** Places with your notes or markers always get a label once their dot shows. */
    notedFirst: boolean;
  };
  /** "Only places that have…" map filter. */
  filter: { service: string | null; mode: 'dim' | 'hide'; hideCleared: boolean };
  /** Level used for encounter odds when no save is bound. */
  bestiary: { level: number };
  display: { markerScale: number; planeStyle: 'subtle' | 'strong'; killCounters: boolean; /** 1 = faint .. 4 = bold */ borderWeight: number };
  layout: {
    rightOpen: boolean;
    rightWidth: number;
    /** Fraction of the right dock given to the inspector (rest is map controls). */
    rightSplit: number;
    inspectorOpen: boolean;
    controlsOpen: boolean;
    bottomOpen: boolean;
    bottomHeight: number;
    bottomMax: boolean;
    bottomTab: DockTab;
    /** Collapsible section states, keyed by section id. */
    sections: Record<string, boolean>;
  };
  backup: { keepSnapshots: number; autoSnapshotHours: number; writeToFolder: boolean; lastAutoSnapshot: number };
  activeProfileId: string | null;
  firstRunDone: boolean;
}

export function defaultLabelClasses() {
  return Object.fromEntries(LABEL_CLASSES.map((c) => [c.key, { on: true, zoom: c.defaultZoom }]));
}

export const DEFAULT_SETTINGS: Settings = {
  spoiler: { level: 'wanderer', locations: 'auto', shopNames: 'auto', dungeonLayouts: 'auto', useSaveDiscovery: true },
  layers: {
    towns: true, dungeons: true, temples: true, homes: true,
    roads: true, tracks: true, rivers: true, streams: false,
    borders: true, labels: true, markers: true, atlas: true, playthrough: true, player: true, townSize: true,
  },
  labels: { classes: defaultLabelClasses(), overlap: false, notedFirst: true },
  filter: { service: null, mode: 'dim', hideCleared: false },
  bestiary: { level: 1 },
  display: { markerScale: 1, planeStyle: 'subtle', killCounters: false, borderWeight: 2 },
  layout: {
    rightOpen: true, rightWidth: 340, rightSplit: 0.58, inspectorOpen: true, controlsOpen: true,
    bottomOpen: false, bottomHeight: 340, bottomMax: false, bottomTab: 'journal', sections: {},
  },
  backup: { keepSnapshots: 15, autoSnapshotHours: 12, writeToFolder: false, lastAutoSnapshot: 0 },
  activeProfileId: null,
  firstRunDone: false,
};

export const SPOILER_PRESETS: Record<SpoilerLevel, { title: string; blurb: string }> = {
  explorer: { title: 'Explorer', blurb: 'Only what the game would show a new character. Everything else is one deliberate click away.' },
  wanderer: { title: 'Wanderer', blurb: 'Every location on the map; shop names and dungeon layouts stay hidden until you reveal them.' },
  cartographer: { title: 'Cartographer', blurb: 'Show everything the game data knows.' },
};

/** Merge stored settings over defaults (two levels deep) so new fields appear after upgrades. */
export function mergeSettings(stored: any): Settings {
  const out: any = structuredClone(DEFAULT_SETTINGS);
  if (!stored || typeof stored !== 'object') return out;
  for (const [k, v] of Object.entries(stored)) {
    if (!(k in out)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') {
      for (const [k2, v2] of Object.entries(v as object)) {
        const base = out[k][k2];
        out[k][k2] = base && typeof base === 'object' && v2 && typeof v2 === 'object' && !Array.isArray(v2) ? { ...base, ...v2 } : v2;
      }
    } else out[k] = v;
  }
  return out;
}
