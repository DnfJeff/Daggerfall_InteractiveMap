import { LocType } from '../df/constants';

/** All dungeon-type labels share one colour so they never read as settlements. */
const DUNGEON_LABEL = '#f39a72';

/**
 * Label tiers: which location labels appear from which zoom (screen px per map pixel), and who wins
 * when labels collide. Order matters: settlements first, then landmarks, then dungeons, then homes.
 */
export interface LabelClass {
  key: string;
  label: string;
  types: number[];
  defaultZoom: number;
  priority: number;
  size: number;
  color: string;
}

export const LABEL_CLASSES: LabelClass[] = [
  { key: 'city', label: 'Cities', types: [LocType.City], defaultZoom: 1.6, priority: 100, size: 13, color: '#f2d55b' },
  { key: 'town', label: 'Towns', types: [LocType.Town], defaultZoom: 4, priority: 90, size: 12, color: '#f3ead2' },
  { key: 'village', label: 'Villages', types: [LocType.Village], defaultZoom: 7, priority: 80, size: 11.5, color: '#e9e2cc' },
  { key: 'tavern', label: 'Taverns', types: [LocType.Tavern], defaultZoom: 9, priority: 62, size: 11, color: '#e6c9a8' },
  { key: 'temple', label: 'Temples', types: [LocType.Temple], defaultZoom: 9, priority: 60, size: 11, color: '#b9d2f2' },
  { key: 'dungeonL', label: 'Large dungeons', types: [LocType.DungeonLarge], defaultZoom: 10.5, priority: 56, size: 11, color: DUNGEON_LABEL },
  { key: 'dungeonM', label: 'Keeps', types: [LocType.DungeonMedium], defaultZoom: 12, priority: 52, size: 11, color: DUNGEON_LABEL },
  { key: 'dungeonS', label: 'Ruins', types: [LocType.DungeonSmall], defaultZoom: 13.5, priority: 48, size: 11, color: DUNGEON_LABEL },
  { key: 'shrine', label: 'Shrines', types: [LocType.Shrine], defaultZoom: 13, priority: 44, size: 11, color: '#a9c2e2' },
  { key: 'grave', label: 'Graveyards & covens', types: [LocType.Graveyard, LocType.Coven], defaultZoom: 15, priority: 40, size: 11, color: DUNGEON_LABEL },
  { key: 'manor', label: 'Manors', types: [LocType.Manor], defaultZoom: 15, priority: 34, size: 11, color: '#e0cdbf' },
  { key: 'home', label: 'Farms & shacks', types: [LocType.Farm, LocType.Shack], defaultZoom: 18, priority: 30, size: 10.5, color: '#d8ccb8' },
];

export const CLASS_OF_TYPE = new Map<number, LabelClass>();
for (const c of LABEL_CLASSES) for (const t of c.types) CLASS_OF_TYPE.set(t, c);

/** Wheel notches are ~x1.2; presets shift every tier by whole notches. */
export const NOTCH = 1.2;
