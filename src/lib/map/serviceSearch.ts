// "bookstores near Gothway Garden", "mages guild near me", "armorer in Wayrest", "temples".
import type { Directory, Service } from '../df/directory';
import { REGION_NAMES } from '../df/constants';
import type { LocationSummary } from '../df/maps';
import { norm, score, type LocIndex } from './search';

export interface Origin { x: number; y: number; label: string }

export interface ServiceQuery {
  service: Service;
  /** Rank by distance from here, or… */
  near: Origin | null;
  /** …restrict to a region. */
  region: number | null;
  /** Text the user typed for the place, when it couldn't be resolved. */
  unresolved: string | null;
}

const NEAR = /^(.*?)\s+(?:near|around|close to|by|nearest to|closest to)\s+(.+)$/i;
const IN = /^(.*?)\s+in\s+(.+)$/i;

/**
 * Parses a phrase into a service query. `origin()` supplies "me / here". Returns null when the
 * phrase doesn't name a service (the caller then does an ordinary place search).
 */
export function parseServiceQuery(
  text: string,
  dir: Directory,
  places: LocIndex[],
  origin: () => Origin | null,
  visible: (l: LocationSummary) => boolean,
): ServiceQuery | null {
  const t = text.trim();
  if (!t) return null;
  let what = t, where: string | null = null, mode: 'near' | 'in' | null = null;
  const n = NEAR.exec(t);
  const i = !n ? IN.exec(t) : null;
  if (n) { what = n[1]; where = n[2]; mode = 'near'; }
  else if (i) { what = i[1]; where = i[2]; mode = 'in'; }
  const service = dir.match(what);
  if (!service) return null;
  // A bare word like "inn" or "store" also names places; only treat it as a service search when
  // it is an exact service word or comes with near/in.
  if (!mode && !service.words.includes(what.toLowerCase().trim())) return null;

  if (!where) return { service, near: origin(), region: null, unresolved: null };
  const w = norm(where);
  if (/^(me|here|my location|you|current location)$/.test(w)) return { service, near: origin(), region: null, unresolved: null };
  if (mode === 'in') {
    const region = REGION_NAMES.findIndex((r) => norm(r) === w);
    if (region >= 0) return { service, near: null, region, unresolved: null };
  }
  let best: LocationSummary | null = null, bestScore = 0;
  for (const p of places) {
    if (!visible(p.loc)) continue;
    const s = score(w, p.key) + (p.loc.type <= 2 ? 30 : 0);
    if (s > bestScore) { bestScore = s; best = p.loc; }
  }
  if (best && bestScore >= 200) return { service, near: { x: best.x + 0.5, y: best.y + 0.5, label: best.name }, region: null, unresolved: null };
  const region = REGION_NAMES.findIndex((r) => norm(r).startsWith(w));
  if (region >= 0) return { service, near: null, region, unresolved: null };
  return { service, near: origin(), region: null, unresolved: where };
}

export interface ServiceHit { loc: LocationSummary; count: number; dist: number | null; dir: string }

const COMPASS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
export function compass(dx: number, dy: number) {
  if (Math.hypot(dx, dy) < 0.5) return 'here';
  return COMPASS[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
}

export function runServiceQuery(q: ServiceQuery, dir: Directory, visible: (l: LocationSummary) => boolean, limit = 15): ServiceHit[] {
  const out: ServiceHit[] = [];
  for (const mapId of dir.where.get(q.service.key) ?? []) {
    const entry = dir.towns.get(mapId)!;
    const l = entry.loc;
    if (!visible(l)) continue;
    if (q.region !== null && l.region !== q.region) continue;
    const count = entry.offers.get(q.service.key)?.length || 1;
    const dx = l.x + 0.5 - (q.near?.x ?? 0), dy = l.y + 0.5 - (q.near?.y ?? 0);
    out.push({ loc: l, count, dist: q.near ? Math.hypot(dx, dy) : null, dir: q.near ? compass(dx, dy) : '' });
  }
  out.sort((a, b) => (a.dist !== null && b.dist !== null ? a.dist - b.dist : b.count - a.count || a.loc.name.localeCompare(b.loc.name)));
  return out.slice(0, limit);
}
