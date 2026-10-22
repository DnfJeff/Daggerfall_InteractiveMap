// Constants mirrored from Daggerfall Unity (MIT, (C) Daggerfall Workshop).
// These live in the original executable, not ARENA2, so they cannot be read from the install.

export const WORLD_W = 1000;
export const WORLD_H = 500;

export const REGION_NAMES = [
  "Alik'r Desert", 'Dragontail Mountains', 'Glenpoint Foothills', 'Daggerfall Bluffs',
  'Yeorth Burrowland', 'Dwynnen', 'Ravennian Forest', 'Devilrock',
  'Malekna Forest', 'Isle of Balfiera', 'Bantha', "Dak'fron",
  'Islands in the Western Iliac Bay', 'Tamarilyn Point', 'Lainlyn Cliffs', 'Bjoulsae River',
  'Wrothgarian Mountains', 'Daggerfall', 'Glenpoint', 'Betony', 'Sentinel', 'Anticlere', 'Lainlyn', 'Wayrest',
  'Gen Tem High Rock village', 'Gen Rai Hammerfell village', 'Orsinium Area', 'Skeffington Wood',
  'Hammerfell bay coast', 'Hammerfell sea coast', 'High Rock bay coast', 'High Rock sea coast',
  'Northmoor', 'Menevia', 'Alcaire', 'Koegria', 'Bhoriane', 'Kambria', 'Phrygias', 'Urvaius',
  'Ykalon', 'Daenia', 'Shalgora', 'Abibon-Gora', 'Kairou', 'Pothago', 'Myrkwasa', 'Ayasofya',
  'Tigonus', 'Kozanset', 'Satakalaam', 'Totambu', 'Mournoth', 'Ephesus', 'Santaki', 'Antiphyllos',
  'Bergama', 'Gavaudon', 'Tulune', 'Glenumbra Moors', 'Ilessan Hills', 'Cybiades',
];

/** Name bank per region: 0 Breton, 1 Redguard (DFU's corrected per-region races). */
export const REGION_RACES = [
  1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1,
  0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0,
  0, 1,
];

/** Patron deity faction per region (temple domains), from the game executable via DFU. */
export const REGION_TEMPLES = [
  106, 82, 0, 0, 0, 98, 0, 0, 0, 92, 0, 106, 0, 0, 0, 84, 36, 36, 84, 88,
  82, 88, 98, 92, 0, 0, 82, 0, 0, 0, 0, 0, 88, 94, 36, 94, 106, 84, 106, 106,
  88, 98, 82, 98, 84, 94, 36, 88, 94, 36, 98, 84, 106, 88, 106, 88, 92, 84, 98, 88,
  82, 94,
];

export const BETONY = 19;

/** Region map images and their origin in world map pixels. Betony is drawn at 4x scale. */
export const REGION_MAP_OFFSETS: Record<string, [number, number]> = {
  'FMAPAI00.IMG': [212, 340], 'FMAPBI00.IMG': [322, 340],
  'FMAPAI01.IMG': [583, 279], 'FMAPBI01.IMG': [680, 279], 'FMAPCI01.IMG': [583, 340], 'FMAPDI01.IMG': [680, 340],
  'FMAP0I05.IMG': [381, 4], 'FMAP0I09.IMG': [525, 114], 'FMAP0I11.IMG': [437, 340],
  'FMAPAI16.IMG': [578, 0], 'FMAPBI16.IMG': [680, 0], 'FMAPCI16.IMG': [578, 52], 'FMAPDI16.IMG': [680, 52],
  'FMAP0I17.IMG': [39, 106], 'FMAP0I18.IMG': [20, 29], 'FMAP0I19.IMG': [80, 123],
  'FMAP0I20.IMG': [217, 293], 'FMAP0I21.IMG': [263, 79], 'FMAP0I22.IMG': [548, 219], 'FMAP0I23.IMG': [680, 146],
  'FMAP0I26.IMG': [680, 80], 'FMAP0I32.IMG': [41, 0], 'FMAP0I33.IMG': [660, 101], 'FMAP0I34.IMG': [578, 40],
  'FMAP0I35.IMG': [525, 3], 'FMAP0I36.IMG': [440, 40], 'FMAP0I37.IMG': [448, 0], 'FMAP0I38.IMG': [366, 0],
  'FMAP0I39.IMG': [300, 8], 'FMAP0I40.IMG': [202, 0], 'FMAP0I41.IMG': [223, 6], 'FMAP0I42.IMG': [148, 76],
  'FMAP0I43.IMG': [15, 340], 'FMAP0I44.IMG': [61, 340], 'FMAP0I45.IMG': [86, 338], 'FMAP0I46.IMG': [132, 340],
  'FMAP0I47.IMG': [344, 309], 'FMAP0I48.IMG': [381, 251], 'FMAP0I49.IMG': [553, 255], 'FMAP0I50.IMG': [661, 217],
  'FMAP0I51.IMG': [672, 275], 'FMAP0I52.IMG': [680, 256], 'FMAP0I53.IMG': [680, 340], 'FMAP0I54.IMG': [491, 340],
  'FMAP0I55.IMG': [293, 340], 'FMAP0I56.IMG': [263, 340], 'FMAP0I57.IMG': [680, 157], 'FMAP0I58.IMG': [17, 53],
  'FMAP0I59.IMG': [0, 0], 'FMAP0I60.IMG': [107, 11], 'FMAP0I61.IMG': [255, 275],
};

export function regionMapNames(region: number): string[] {
  if (region === 0) return ['FMAPAI00.IMG', 'FMAPBI00.IMG'];
  if (region === 1) return ['FMAPAI01.IMG', 'FMAPBI01.IMG', 'FMAPCI01.IMG', 'FMAPDI01.IMG'];
  if (region === 16) return ['FMAPAI16.IMG', 'FMAPBI16.IMG', 'FMAPCI16.IMG', 'FMAPDI16.IMG'];
  return [`FMAP0I${String(region).padStart(2, '0')}.IMG`];
}

// ---------- Locations ----------

export enum LocType {
  City = 0, Town = 1, Village = 2, Farm = 3, DungeonLarge = 4, Temple = 5, Tavern = 6,
  DungeonMedium = 7, Manor = 8, Shrine = 9, DungeonSmall = 10, Shack = 11, Graveyard = 12, Coven = 13, Ship = 14,
}

export type LayerKey = 'towns' | 'dungeons' | 'temples' | 'homes';

export interface LocTypeInfo { label: string; layer: LayerKey | null; palIndex: number; town: boolean; rank: number }

/** palIndex = FMAP_PAL.COL entry DFU uses for the travel-map dot. rank orders label priority. */
export const LOC_TYPES: Record<number, LocTypeInfo> = {
  [LocType.City]: { label: 'City', layer: 'towns', palIndex: 33, town: true, rank: 10 },
  [LocType.Town]: { label: 'Town', layer: 'towns', palIndex: 35, town: true, rank: 8 },
  [LocType.Village]: { label: 'Village', layer: 'towns', palIndex: 37, town: true, rank: 6 },
  [LocType.Tavern]: { label: 'Tavern', layer: 'towns', palIndex: 39, town: true, rank: 4 },
  [LocType.DungeonLarge]: { label: 'Labyrinth', layer: 'dungeons', palIndex: 237, town: false, rank: 7 },
  [LocType.DungeonMedium]: { label: 'Keep', layer: 'dungeons', palIndex: 240, town: false, rank: 5 },
  [LocType.DungeonSmall]: { label: 'Ruin', layer: 'dungeons', palIndex: 243, town: false, rank: 3 },
  [LocType.Graveyard]: { label: 'Graveyard', layer: 'dungeons', palIndex: 246, town: false, rank: 2 },
  [LocType.Coven]: { label: 'Coven', layer: 'dungeons', palIndex: 0, town: false, rank: 2 },
  [LocType.Temple]: { label: 'Temple', layer: 'temples', palIndex: 96, town: true, rank: 4 },
  [LocType.Shrine]: { label: 'Shrine', layer: 'temples', palIndex: 101, town: true, rank: 2 },
  [LocType.Farm]: { label: 'Farmstead', layer: 'homes', palIndex: 53, town: true, rank: 1 },
  [LocType.Manor]: { label: 'Manor', layer: 'homes', palIndex: 51, town: true, rank: 2 },
  [LocType.Shack]: { label: 'Shack', layer: 'homes', palIndex: 55, town: true, rank: 1 },
  [LocType.Ship]: { label: 'Ship', layer: null, palIndex: 0, town: false, rank: 0 },
};

export const DUNGEON_TYPES = [
  'Crypt', 'Orc Stronghold', 'Human Stronghold', 'Prison', 'Desecrated Temple', 'Mine', 'Natural Cave',
  'Coven', 'Vampire Haunt', 'Laboratory', 'Harpy Nest', 'Ruined Castle', 'Spider Nest', 'Giant Stronghold',
  "Dragon's Den", 'Barbarian Stronghold', 'Volcanic Caves', 'Scorpion Nest', 'Cemetery',
];

// ---------- Buildings ----------

export enum BldType {
  Alchemist = 0, HouseForSale, Armorer, Bank, Town4, Bookseller, ClothingStore, FurnitureStore, GemStore,
  GeneralStore, Library, GuildHall, PawnShop, WeaponSmith, Temple, Tavern, Palace,
  House1, House2, House3, House4, House5, House6, Town23, Ship,
}

export const BLD_LABELS: Record<number, string> = {
  0: 'Alchemist', 1: 'House for sale', 2: 'Armorer', 3: 'Bank', 4: 'Town building', 5: 'Bookseller',
  6: 'Clothing store', 7: 'Furniture store', 8: 'Gem store', 9: 'General store', 10: 'Library',
  11: 'Guild hall', 12: 'Pawn shop', 13: 'Weaponsmith', 14: 'Temple', 15: 'Tavern', 16: 'Palace',
  17: 'Residence', 18: 'Residence', 19: 'Residence', 20: 'Residence', 21: 'Residence (hedged)', 22: 'Residence',
  23: 'City wall', 24: 'Ship',
};

/** Extra door-behaviour notes from the data landscape doc (§5.3). */
export const BLD_NOTES: Record<number, string> = {
  17: 'Doors always locked',
  18: 'Doors unlocked 06:00–18:00',
};

export type BldCategory = 'guild' | 'shop' | 'tavern' | 'house' | 'none';

/** Exterior automap colour category, keyed by building type (automap pixel value - 1). */
export function bldCategory(type: number): BldCategory {
  switch (type) {
    case BldType.GuildHall: case BldType.Temple: return 'guild';
    case BldType.Alchemist: case BldType.Armorer: case BldType.Bank: case BldType.Bookseller:
    case BldType.ClothingStore: case BldType.GemStore: case BldType.GeneralStore: case BldType.Library:
    case BldType.PawnShop: case BldType.WeaponSmith: return 'shop';
    case BldType.Tavern: return 'tavern';
    case BldType.HouseForSale: case BldType.Town4: case BldType.FurnitureStore: case BldType.Palace:
    case BldType.House1: case BldType.House2: case BldType.House3: case BldType.House4:
    case BldType.House5: case BldType.House6: case BldType.Town23: return 'house';
    default: return 'none';
  }
}

/** DFU default automap colours (settings.ini AutomapTempleColor etc.). */
export const AUTOMAP_COLORS: Record<BldCategory, string> = {
  guild: '#418FF1', shop: '#D55A13', tavern: '#6CB31B', house: '#71571E', none: 'transparent',
};

export const NAMED_BUILDING_TYPES = new Set<number>([
  BldType.Alchemist, BldType.Armorer, BldType.Bank, BldType.Bookseller, BldType.ClothingStore,
  BldType.FurnitureStore, BldType.GemStore, BldType.GeneralStore, BldType.Library, BldType.GuildHall,
  BldType.PawnShop, BldType.WeaponSmith, BldType.Temple, BldType.Tavern, BldType.Palace,
]);

export const RMB_PREFIXES = [
  'TVRN', 'GENR', 'RESI', 'WEAP', 'ARMR', 'ALCH', 'BANK', 'BOOK', 'CLOT', 'FURN', 'GEMS', 'LIBR', 'PAWN',
  'TEMP', 'TEMP', 'PALA', 'FARM', 'DUNG', 'CAST', 'MANR', 'SHRI', 'RUIN', 'SHCK', 'GRVE', 'FILL', 'KRAV',
  'KDRA', 'KOWL', 'KMOO', 'KCAN', 'KFLA', 'KHOR', 'KROS', 'KWHE', 'KSCA', 'KHAW', 'MAGE', 'THIE', 'DARK',
  'FIGH', 'CUST', 'WALL', 'MARK', 'SHIP', 'WITC',
];

export const RDB_LETTERS = ['N', 'W', 'L', 'S', 'B', 'M'];

/** DFU building key: (layoutX << 16) | (layoutY << 8) | recordIndex. Matches save DiscoveryData. */
export function buildingKey(x: number, y: number, record: number) {
  return (x << 16) | (y << 8) | record;
}

export function lonLatToPixel(lon: number, lat: number) {
  return { x: Math.floor(lon / 128), y: 499 - Math.floor(lat / 128) };
}

export function worldToPixel(worldX: number, worldZ: number) {
  return { x: Math.floor(worldX / 32768), y: 499 - Math.floor(worldZ / 32768) };
}
