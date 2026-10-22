/** Minimal FACTION.TXT reader: ids, names, types, regions, rulers and the parent/child tree. */
export interface Faction {
  id: number;
  name: string;
  type: number;
  /** 0-based region index, or -1. FACTION.TXT stores it 1-based. */
  region: number;
  ruler: number;
  parent: number;
  children: number[];
}

export const FACTION_TYPE_GOD = 1;
export const FACTION_TYPE_PROVINCE = 7;
export const FACTION_TYPE_TEMPLE = 9;

export class Factions {
  readonly byId = new Map<number, Faction>();

  static parse(text: string): Factions {
    const f = new Factions();
    const blocks: string[][] = [];
    let cur: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith(';') || line === '') continue;
      if (line.includes('#')) {
        if (cur.length) blocks.push(cur);
        cur = [];
      }
      cur.push(line);
    }
    if (cur.length) blocks.push(cur);

    let resolverId = 980;
    let lastTabs = 0;
    let previous: Faction | null = null;
    const stack: number[] = [];
    for (const block of blocks) {
      const tabs = /^\t*/.exec(block[0])![0].length;
      if (tabs > lastTabs && previous) stack.push(previous.id);
      else if (tabs < lastTabs) while (stack.length > tabs) stack.pop();
      lastTabs = tabs;

      const fac: Faction = { id: 0, name: '', type: 0, region: -1, ruler: 0, parent: stack.length ? stack[stack.length - 1] : 0, children: [] };
      for (const line of block) {
        if (line.includes('#')) { fac.id = parseInt(line.split('#')[1].trim(), 10); continue; }
        if (!line.trim()) continue;
        let parts = line.split(':');
        if (parts.length !== 2) parts = line.trim().split(' ');
        if (parts.length !== 2) continue;
        const tag = parts[0].trim().toLowerCase();
        const value = parts[1].trim();
        if (tag === 'name') fac.name = value;
        else if (tag === 'type') fac.type = parseInt(value, 10);
        else if (tag === 'region') { const v = parseInt(value, 10); fac.region = v === -1 ? -1 : v - 1; }
        else if (tag === 'ruler') fac.ruler = parseInt(value, 10);
      }
      if (f.byId.has(fac.id)) fac.id = resolverId++;
      f.byId.set(fac.id, fac);
      previous = fac;
    }
    for (const fac of f.byId.values()) {
      const parent = f.byId.get(fac.parent);
      if (parent && fac.parent !== fac.id) parent.children.push(fac.id);
    }
    return f;
  }

  get(id: number) { return this.byId.get(id) ?? null; }

  /** Compact form for baking: [id, name, type, region, ruler, parent]. */
  toList(): [number, string, number, number, number, number][] {
    return [...this.byId.values()].map((f) => [f.id, f.name, f.type, f.region, f.ruler, f.parent]);
  }

  static fromList(list: [number, string, number, number, number, number][]): Factions {
    const f = new Factions();
    for (const [id, name, type, region, ruler, parent] of list) f.byId.set(id, { id, name, type, region, ruler, parent, children: [] });
    for (const fac of f.byId.values()) {
      const parent = f.byId.get(fac.parent);
      if (parent && fac.parent !== fac.id) parent.children.push(fac.id);
    }
    return f;
  }

  /** DFU FindFactionByTypeAndRegion: exact region match, else the last region -1 faction of that type. */
  byTypeAndRegion(type: number, region: number): Faction | null {
    let partial: Faction | null = null;
    for (const fac of this.byId.values()) {
      if (fac.type === type && fac.region === region) return fac;
      if (fac.type === type && fac.region === -1) partial = fac;
    }
    return partial;
  }
}
