import type { RegionFacts } from './game';
import { encounterOdds, wildTable, type WildTime } from './encounters';

/** Odds for a random wilderness encounter anywhere in a region, weighting each climate by its land share. */
export function regionOdds(facts: RegionFacts, time: WildTime, level: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const { key, share } of facts.climate) {
    for (const [id, p] of encounterOdds(wildTable(key, time), level)) out.set(id, (out.get(id) ?? 0) + p * share);
  }
  return out;
}
