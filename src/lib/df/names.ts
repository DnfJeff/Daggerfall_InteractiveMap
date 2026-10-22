// Deterministic building-name generation, reproducing DFU's FormulaHelper.GenerateBuildingName
// (itself a reverse-engineering of classic). Name-part tables are DFU's English localization (MIT).
import strings from '../data/dfu-strings.json';
import nameGen from '../data/dfu-namegen.json';
import { BldType, REGION_RACES } from './constants';
import type { Factions } from './factions';
import { FACTION_TYPE_PROVINCE } from './factions';

/** Classic Daggerfall's C-runtime LCG. Only bits 16-30 are observed, so 32-bit math suffices. */
export class DFRandom {
  private next = 1;
  srand(seed: number) { this.next = seed >>> 0; }
  rand() {
    this.next = (Math.imul(this.next, 1103515245) + 12345) >>> 0;
    return (this.next >>> 16) & 0x7fff;
  }
  range(min: number, max: number) { return (this.rand() % (max - min)) + min; }
}

const S = strings as Record<string, string>;
const list = (key: string) => S[key].replace(/[\r\n]+$/, '').split(/\r\n|\r|\n/);

const TABLES = {
  StoresA: list('StoresA'),
  TavernsA: list('TavernsA'),
  TavernsB: list('TavernsB'),
  [BldType.GeneralStore]: list('GeneralStoresB'),
  [BldType.WeaponSmith]: list('WeaponStoresB'),
  [BldType.Armorer]: list('ArmorStoresB'),
  [BldType.Bookseller]: list('BookStoresB'),
  [BldType.ClothingStore]: list('ClothingStoresB'),
  [BldType.Alchemist]: list('AlchemyStoresB'),
  [BldType.GemStore]: list('GemStoresB'),
  [BldType.PawnShop]: list('PawnStoresB'),
  [BldType.FurnitureStore]: list('FurnitureStoresB'),
  [BldType.Library]: list('LibraryStoresB'),
} as Record<string | number, string[]>;

const BANKS = ['Breton', 'Redguard', 'Nord', 'DarkElf', 'HighElf', 'WoodElf', 'Khajiit', 'Imperial'];
const NG = nameGen as Record<string, string[][]>;

const RULER_TITLES = ['Lord', 'King', 'Queen', 'Duke', 'Duchess', 'Marquis', 'Marquise', 'Count', 'Countess', 'Baron', 'Baroness', 'Lord', 'Lady'];

function maleFirstName(rng: DFRandom, region: number) {
  const bank = BANKS[REGION_RACES[region] ?? 0];
  const sets = NG[bank];
  const pick = (parts: string[]) => parts[rng.rand() % parts.length];
  if (bank === 'Redguard') {
    const a = pick(sets[0]), b = pick(sets[1]), c = pick(sets[2]);
    const d = rng.rand() % 100 < 75 ? pick(sets[3]) : '';
    return a + b + c + d;
  }
  return pick(sets[0]) + pick(sets[1]);
}

export interface NameContext {
  regionIndex: number;
  regionName: string;
  locationName: string;
  factions: Factions | null;
}

/**
 * Returns the in-game name of a building, or '' for houses and unnamed types.
 * `region` drives %ef (owner first name) and %rt (regent title), following DFU's corrected behaviour.
 */
export function buildingName(seed: number, type: number, factionId: number, ctx: NameContext): string {
  const rng = new DFRandom();
  rng.srand(seed);
  let a = '', b = '';
  let singleton = false;
  switch (type) {
    case BldType.HouseForSale: return S.houseForSale;
    case BldType.Tavern:
      b = pick(rng, TABLES.TavernsB);
      a = pick(rng, TABLES.TavernsA);
      break;
    case BldType.GeneralStore: case BldType.WeaponSmith: case BldType.Armorer: case BldType.Bookseller:
    case BldType.ClothingStore: case BldType.Alchemist: case BldType.GemStore: case BldType.PawnShop:
    case BldType.FurnitureStore: case BldType.Library:
      b = pick(rng, TABLES[type]);
      a = pick(rng, TABLES.StoresA);
      break;
    case BldType.Bank:
      b = ctx.regionName;
      a = S.theBankOf;
      break;
    case BldType.GuildHall: {
      const fac = ctx.factions?.get(factionId);
      if (fac) { a = fac.name; singleton = true; }
      break;
    }
    case BldType.Temple: {
      const fac = ctx.factions?.get(factionId);
      const child = fac?.children.length ? ctx.factions?.get(fac.children[0]) : null;
      if (child) { a = child.name; singleton = true; }
      break;
    }
    case BldType.Palace: {
      const castles: Record<string, string> = { Daggerfall: 'Castle Daggerfall', Wayrest: 'Castle Wayrest', Sentinel: 'Castle Sentinel' };
      a = castles[ctx.locationName] ?? S.palace;
      singleton = true;
      break;
    }
    case BldType.Town23:
      a = S.cityWall;
      singleton = true;
      break;
    default:
      return '';
  }
  a = a.replaceAll('%cn', ctx.locationName);
  if (a.includes('%ef')) {
    rng.rand(); // classic burns one roll before expanding the macro
    a = a.replaceAll('%ef', maleFirstName(rng, ctx.regionIndex));
  }
  if (a.includes('%rt')) {
    const prov = ctx.factions?.byTypeAndRegion(FACTION_TYPE_PROVINCE, ctx.regionIndex);
    a = a.replaceAll('%rt', RULER_TITLES[prov?.ruler ?? 0] ?? 'Lord');
  }
  return singleton ? a : `${a} ${b}`;
}

function pick(rng: DFRandom, parts: string[]) {
  return parts[rng.range(0, parts.length)];
}
