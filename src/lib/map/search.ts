import type { LocationSummary } from '../df/maps';
import { LOC_TYPES } from '../df/constants';

/** Normalise for matching: lowercase, strip apostrophes and punctuation. */
export function norm(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’`]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim();
}

/**
 * Score a candidate: prefix > word-prefix > substring > in-order subsequence. 0 = no match.
 * Typos within the first few characters still surface via the subsequence fallback.
 */
export function score(query: string, target: string): number {
  if (!query) return 0;
  if (target === query) return 1000;
  if (target.startsWith(query)) return 800 - target.length;
  const wi = target.indexOf(' ' + query);
  if (wi >= 0) return 600 - wi - target.length * 0.1;
  const si = target.indexOf(query);
  if (si >= 0) return 400 - si;
  // subsequence with gap penalty
  let t = 0, gaps = 0, last = -1;
  for (const ch of query) {
    if (ch === ' ') continue;
    const idx = target.indexOf(ch, t);
    if (idx < 0) return 0;
    if (last >= 0) gaps += idx - last - 1;
    last = idx;
    t = idx + 1;
  }
  const s = 200 - gaps * 6 - target.length * 0.2;
  return s > 20 ? s : 0;
}

export interface LocIndex { loc: LocationSummary; key: string }

export function buildLocIndex(locs: LocationSummary[]): LocIndex[] {
  return locs.map((loc) => ({ loc, key: norm(loc.name) }));
}

export function searchLocations(index: LocIndex[], q: string, visible: (l: LocationSummary) => boolean, limit = 40) {
  const nq = norm(q);
  if (!nq) return { hits: [] as LocationSummary[], hidden: 0 };
  const scored: { loc: LocationSummary; s: number }[] = [];
  let hidden = 0;
  for (const it of index) {
    const s = score(nq, it.key);
    if (!s) continue;
    if (!visible(it.loc)) { hidden++; continue; }
    scored.push({ loc: it.loc, s: s + (LOC_TYPES[it.loc.type]?.rank ?? 0) * 2 });
  }
  scored.sort((a, b) => b.s - a.s);
  return { hits: scored.slice(0, limit).map((x) => x.loc), hidden };
}
