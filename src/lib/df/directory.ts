// A directory of what every settlement offers (shops by type, guilds, temples, ports), read from
// MAPS.BSA building records only, so it covers all ~11k places without loading any blocks.
import { BldType, BLD_LABELS, LOC_TYPES } from './constants';
import { FACTION_TYPE_GOD, FACTION_TYPE_TEMPLE, type Factions } from './factions';
import type { BuildingRecord, LocationSummary, MapsData } from './maps';

export type ServiceCategory = 'shop' | 'guild' | 'temple' | 'travel';

export interface Service {
  key: string;
  label: string;
  plural: string;
  category: ServiceCategory;
  /** Lower-case words and phrases that find this service in search. */
  words: string[];
}

export interface TownEntry {
  loc: LocationSummary;
  port: boolean;
  /** service key -> buildings offering it */
  offers: Map<string, BuildingRecord[]>;
}

const SHOP_WORDS: Partial<Record<number, string[]>> = {
  [BldType.Alchemist]: ['alchemist', 'alchemists', 'potion', 'potions', 'herbs', 'herbalist'],
  [BldType.Armorer]: ['armorer', 'armorers', 'armourer', 'armor', 'armour', 'armory', 'armoury', 'shield', 'shields'],
  [BldType.Bank]: ['bank', 'banks', 'letter of credit', 'loan'],
  [BldType.Bookseller]: ['bookstore', 'bookstores', 'bookseller', 'booksellers', 'book', 'books', 'bookshop'],
  [BldType.ClothingStore]: ['clothing', 'clothes', 'tailor', 'tailors', 'clothier'],
  [BldType.FurnitureStore]: ['furniture', 'furnishings'],
  [BldType.GemStore]: ['gem', 'gems', 'jeweler', 'jewelers', 'jeweller', 'jewelry', 'jewellery'],
  [BldType.GeneralStore]: ['general store', 'general stores', 'supplies', 'supply', 'store', 'stores'],
  [BldType.Library]: ['library', 'libraries'],
  [BldType.PawnShop]: ['pawnshop', 'pawn shop', 'pawn', 'pawnbroker', 'pawnbrokers'],
  [BldType.WeaponSmith]: ['weaponsmith', 'weaponsmiths', 'weapon', 'weapons', 'blacksmith', 'smith', 'smithy', 'sword', 'swords'],
  [BldType.Tavern]: ['tavern', 'taverns', 'inn', 'inns', 'pub', 'room', 'rooms', 'drink'],
  [BldType.HouseForSale]: ['house for sale', 'houses for sale', 'buy a house', 'house'],
};

const PLURAL: Partial<Record<number, string>> = {
  [BldType.Alchemist]: 'Alchemists', [BldType.Armorer]: 'Armorers', [BldType.Bank]: 'Banks', [BldType.Bookseller]: 'Booksellers',
  [BldType.ClothingStore]: 'Clothing stores', [BldType.FurnitureStore]: 'Furniture stores', [BldType.GemStore]: 'Gem stores',
  [BldType.GeneralStore]: 'General stores', [BldType.Library]: 'Libraries', [BldType.PawnShop]: 'Pawn shops',
  [BldType.WeaponSmith]: 'Weaponsmiths', [BldType.Tavern]: 'Taverns', [BldType.HouseForSale]: 'Houses for sale',
};

export class Directory {
  readonly towns = new Map<number, TownEntry>();
  readonly services = new Map<string, Service>();
  /** service key -> mapIds that offer it */
  readonly where = new Map<string, number[]>();

  static build(maps: MapsData, factions: Factions | null): Directory {
    const d = new Directory();
    for (const [type, words] of Object.entries(SHOP_WORDS)) {
      const t = Number(type);
      d.services.set(`bld:${t}`, { key: `bld:${t}`, label: BLD_LABELS[t], plural: PLURAL[t] ?? BLD_LABELS[t], category: 'shop', words: words! });
    }
    d.services.set('port', { key: 'port', label: 'Port', plural: 'Ports', category: 'travel', words: ['port', 'ports', 'ship', 'ships', 'harbor', 'harbour', 'dock', 'docks', 'boat'] });

    for (const loc of maps.locations) {
      if (!LOC_TYPES[loc.type]?.town) continue;
      const detail = maps.detail(loc);
      const entry: TownEntry = { loc, port: detail.port, offers: new Map() };
      const add = (key: string, b: BuildingRecord) => {
        const list = entry.offers.get(key);
        if (list) list.push(b); else entry.offers.set(key, [b]);
      };
      for (const b of detail.buildings) {
        if (SHOP_WORDS[b.type]) add(`bld:${b.type}`, b);
        else if (b.type === BldType.GuildHall && b.factionId) {
          add(`guild:${b.factionId}`, b);
          if (!d.services.has(`guild:${b.factionId}`)) d.services.set(`guild:${b.factionId}`, guildService(b.factionId, factions));
        } else if (b.type === BldType.Temple && b.factionId) {
          // A few temple-typed records belong to guild factions (e.g. the Fighters Guild).
          const fac = factions?.get(b.factionId);
          const asGuild = fac && fac.type !== FACTION_TYPE_GOD && fac.type !== FACTION_TYPE_TEMPLE;
          const key = `${asGuild ? 'guild' : 'temple'}:${b.factionId}`;
          add(key, b);
          if (!d.services.has(key)) d.services.set(key, asGuild ? guildService(b.factionId, factions) : templeService(b.factionId, factions));
        }
      }
      // The exterior flag means "ships for sale at the bank", so only towns with a bank are ports.
      entry.port = detail.port && entry.offers.has(`bld:${BldType.Bank}`);
      if (entry.port) entry.offers.set('port', []);
      d.towns.set(loc.mapId, entry);
      for (const key of entry.offers.keys()) {
        const list = d.where.get(key);
        if (list) list.push(loc.mapId); else d.where.set(key, [loc.mapId]);
      }
    }
    // Umbrella entries: "any temple", "any guild hall".
    for (const [cat, label, plural, words] of [
      ['temple', 'Any temple', 'Temples', ['temple', 'temples', 'healer', 'healing', 'cure', 'shrine']],
      ['guild', 'Any guild hall', 'Guild halls', ['guild', 'guilds', 'guild hall', 'guild halls']],
    ] as const) {
      const ids = new Set<number>();
      for (const [key, list] of d.where) if (key.startsWith(`${cat}:`)) list.forEach((m) => ids.add(m));
      d.services.set(`${cat}:*`, { key: `${cat}:*`, label, plural, category: cat, words: [...words] });
      d.where.set(`${cat}:*`, [...ids]);
      for (const t of d.towns.values()) {
        const all = [...t.offers.entries()].filter(([k]) => k.startsWith(`${cat}:`)).flatMap(([, b]) => b);
        if (all.length) t.offers.set(`${cat}:*`, all);
      }
    }
    return d;
  }

  /** Services sorted for pickers: shops, guilds, temples, travel. */
  catalog(): Service[] {
    const order: ServiceCategory[] = ['shop', 'guild', 'temple', 'travel'];
    return [...this.services.values()]
      .filter((s) => this.where.has(s.key))
      .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.label.localeCompare(b.label));
  }

  /** Best service for a free-text phrase like "bookstores", "mages guild", "kynareth". */
  match(phrase: string): Service | null {
    const q = phrase.toLowerCase().replace(/['’]/g, '').replace(/\s+/g, ' ').trim();
    if (!q) return null;
    let best: Service | null = null, bestScore = 0;
    for (const s of this.catalog()) {
      for (const w of s.words) {
        const score = q === w ? 100 + w.length : q.endsWith(' ' + w) || q.startsWith(w + ' ') ? 50 + w.length : 0;
        if (score > bestScore) { bestScore = score; best = s; }
      }
    }
    return best;
  }
}

function guildService(factionId: number, factions: Factions | null): Service {
  const name = factions?.get(factionId)?.name ?? `Guild #${factionId}`;
  const bare = name.replace(/^The /i, '');
  const lower = bare.toLowerCase().replace(/['’]/g, '');
  const words = [lower, `the ${lower}`];
  const short = lower.replace(/ guild$/, '');
  if (short !== lower) words.push(short, `${short} guilds`);
  if (/^knights? of/.test(lower) || /order of/.test(lower)) words.push('knightly order', 'knights');
  return { key: `guild:${factionId}`, label: bare, plural: `${bare} halls`, category: 'guild', words };
}

/** Temples are keyed by a god faction ("Kynareth") or by a named temple order ("The Akatosh Chantry"). */
function templeService(factionId: number, factions: Factions | null): Service {
  const fac = factions?.get(factionId);
  const name = fac?.name ?? `Temple #${factionId}`;
  const isGod = fac?.type === FACTION_TYPE_GOD;
  const label = isGod ? `Temple of ${name}` : name.replace(/^The /i, '');
  const lower = name.toLowerCase().replace(/^the /, '').replace(/['’]/g, '');
  const words = [lower, label.toLowerCase().replace(/['’]/g, ''), `${lower} temple`, `${lower} temples`];
  return { key: `temple:${factionId}`, label, plural: isGod ? `Temples of ${name}` : label, category: 'temple', words };
}

/** Straight-line distance in map pixels, and a rough feel for it. */
export function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
