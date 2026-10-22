// Random-encounter tables (classic FALL.EXE, via Daggerfall Unity, MIT) and the classic
// level-based pick, turned into "what lives here, and how likely at my level".
import tables from '../data/dfu-encounters.json';
import { DUNGEON_TYPES } from './constants';

type Tables = {
  dungeon: Record<string, number[]>;
  wild: Record<string, number[] | Record<string, number[]>>;
  building: Record<string, number[]>;
};
const T = tables as Tables;

export type ClimateKey = 'desert' | 'mountain' | 'rainforest' | 'subtropical' | 'woodland' | 'haunted';
export const CLIMATE_LABEL: Record<ClimateKey, string> = {
  desert: 'Desert', mountain: 'Mountains', rainforest: 'Rainforest', subtropical: 'Subtropical',
  woodland: 'Woodland & swamp', haunted: 'Haunted woodland',
};
/** Raw CLIMATE.PAK value -> encounter climate (ocean has none). */
export function climateKey(value: number): ClimateKey | null {
  switch (value) {
    case 224: case 225: return 'desert';
    case 226: return 'mountain';
    case 227: return 'rainforest';
    case 229: return 'subtropical';
    case 228: case 230: case 231: return 'woodland';
    case 232: return 'haunted';
    default: return null;
  }
}

export type WildTime = 'wild-day' | 'wild-night' | 'town-night';
export const WILD_TIME_LABEL: Record<WildTime, string> = {
  'wild-day': 'Wilderness, day', 'wild-night': 'Wilderness, night', 'town-night': 'In a town at night',
};

export function wildTable(climate: ClimateKey, time: WildTime): number[] {
  return ((T.wild[climate] as Record<string, number[]>)?.[time]) ?? [];
}
export function dungeonTable(dungeonType: number): number[] {
  return T.dungeon[String(dungeonType)] ?? [];
}
export const underwaterTable = () => T.wild.underwater as number[];

/**
 * Probability of each creature for one encounter roll at `level` (classic rules: 80% within
 * level±3, 15% from the bottom up to level+1, 5% wide; clamped to the 20-entry table).
 */
export function encounterOdds(table: number[], level: number): Map<number, number> {
  const odds = new Map<number, number>();
  if (!table.length) return odds;
  const windows: [number, number, number][] = [
    [0.8, level - 3, level + 3],
    [0.15, 0, level + 1],
    [0.05, 0, level <= 5 ? level + 2 : 19],
  ];
  for (const [weight, lo, hi] of windows) {
    let min = lo, max = hi;
    if (min < 0) { min = 0; max = 5; }
    if (max > 19) { min = 14; max = 19; }
    max = Math.min(max, table.length - 1);
    min = Math.min(min, max);
    const n = max - min + 1;
    for (let i = min; i <= max; i++) odds.set(table[i], (odds.get(table[i]) ?? 0) + weight / n);
  }
  return odds;
}

export interface Habitat { kind: 'dungeon' | 'wild' | 'building' | 'water'; label: string; key: string }

/** Every table a creature appears in, for "where can I find this?". */
export function habitatsOf(creatureId: number): Habitat[] {
  const out: Habitat[] = [];
  for (const [k, list] of Object.entries(T.dungeon)) {
    if (list.includes(creatureId)) out.push({ kind: 'dungeon', label: DUNGEON_TYPES[Number(k)] ?? 'Dungeon', key: `dungeon:${k}` });
  }
  for (const c of Object.keys(CLIMATE_LABEL) as ClimateKey[]) {
    for (const t of Object.keys(WILD_TIME_LABEL) as WildTime[]) {
      if (wildTable(c, t).includes(creatureId)) out.push({ kind: 'wild', label: `${CLIMATE_LABEL[c]} · ${WILD_TIME_LABEL[t]}`, key: `wild:${c}:${t}` });
    }
  }
  if (underwaterTable().includes(creatureId)) out.push({ kind: 'water', label: 'Underwater', key: 'water' });
  const BLD: Record<string, string> = { default: 'Shops & public buildings', guild: 'Guild halls', temple: 'Temples', palace: 'Palaces & locked houses', house2: 'Houses', house3: 'Houses' };
  const seen = new Set<string>();
  for (const [k, list] of Object.entries(T.building)) {
    if (list.includes(creatureId) && !seen.has(BLD[k])) { seen.add(BLD[k]); out.push({ kind: 'building', label: `Indoors: ${BLD[k]}`, key: `building:${k}` }); }
  }
  return out;
}

/** Table for a habitat key as produced by `habitatsOf` or the bestiary's "where" picker. */
export function tableFor(key: string): number[] {
  const [kind, a, b] = key.split(':');
  if (kind === 'dungeon') return dungeonTable(Number(a));
  if (kind === 'wild') return wildTable(a as ClimateKey, b as WildTime);
  if (kind === 'water') return underwaterTable();
  if (kind === 'building') return T.building[a] ?? [];
  return [];
}
