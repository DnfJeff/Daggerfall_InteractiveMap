// Compare generated building names to names recorded in DFU saves' DiscoveryData.txt.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { GameData } from '../src/lib/df/game';
const [arena2, saves] = process.argv.slice(2);
const src = { label: arena2, m: new Map(readdirSync(arena2).map((f) => [f.toUpperCase(), join(arena2, f)])),
  names() { return [...this.m.keys()]; }, async file(n: string) { const p = this.m.get(n.toUpperCase()); return p ? new Blob([readFileSync(p)]) : null; } };
const g = await GameData.load(src as any);
let ok = 0, bad = 0, missing = 0; const samples: string[] = [];
for (const s of readdirSync(saves)) {
  const p = join(saves, s, 'DiscoveryData.txt'); if (!existsSync(p)) continue;
  const data = JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
  if (!Array.isArray(data)) continue;
  for (const { Value: loc } of data) {
    const l = g.maps.locationByMapId(loc.mapID);
    if (!l || !Array.isArray(loc.discoveredBuildings)) continue;
    const t = await g.town(l);
    for (const { Value: b } of loc.discoveredBuildings) {
      const mine = t.buildings.find((x) => x.key === b.buildingKey);
      if (!mine) { missing++; continue; }
      if (mine.name === b.displayName) ok++; else { bad++; if (samples.length < 25) samples.push(`${s} ${loc.locationName} key=${b.buildingKey} save="${b.displayName}" mine="${mine.name}" override=${b.isOverrideName}`); }
    }
  }
}
console.log({ ok, bad, missing }); console.log(samples.join('\n'));
