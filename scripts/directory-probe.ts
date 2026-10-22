// npx tsx scripts/directory-probe.ts <arena2> — services directory and region facts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GameData } from '../src/lib/df/game';
import { encounterOdds, dungeonTable, wildTable } from '../src/lib/df/encounters';
const dir = process.argv[2];
const m = new Map(readdirSync(dir).map((f) => [f.toUpperCase(), join(dir, f)]));
const g = await GameData.load({ label: dir, names: () => [...m.keys()], file: async (n: string) => (m.has(n.toUpperCase()) ? new Blob([readFileSync(m.get(n.toUpperCase())!)]) : null) });
let t = performance.now();
const d = g.directory();
console.log(`directory ${(performance.now() - t).toFixed(0)}ms, towns ${d.towns.size}, ports ${d.where.get('port')?.length}`);
for (const s of d.catalog()) console.log(' ', s.key.padEnd(12), s.label.padEnd(30), d.where.get(s.key)!.length);
for (const q of ['bookstores', 'armorer', 'mages guild', 'kynareth', 'temple', 'ships', 'inn']) console.log(q, '->', d.match(q)?.label);
t = performance.now();
const f = g.regionFacts(17);
console.log(`facts ${(performance.now() - t).toFixed(0)}ms`, JSON.stringify({ ...f, capital: f.capital?.name, largest: f.largest.map((l) => l.name), ports: f.ports.map((l) => l.name) }));
const odds = encounterOdds(wildTable('woodland', 'wild-day'), 2);
console.log('woodland day L2', [...odds].sort((a, b) => b[1] - a[1]).map(([id, p]) => `${id}:${(p * 100).toFixed(1)}%`).join(' '));
console.log('crypt L10', [...encounterOdds(dungeonTable(0), 10)].sort((a, b) => b[1] - a[1]).slice(0, 6));
