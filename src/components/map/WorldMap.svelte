<script lang="ts" module>
  // Survives switching between overview / region / town.
  let lastCamera: { x: number; y: number; z: number } | null = null;
</script>

<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { app } from '../../lib/state/app.svelte';
  import { Camera, attachPanZoom } from '../../lib/map/camera';
  import { worldLayers, townCanvas, pathChunks } from '../../lib/map/layers';
  import { drawMarker } from '../../lib/map/draw';
  import { labelSprite, blitLabel, CollisionGrid } from '../../lib/map/labels';
  import { CLASS_OF_TYPE } from '../../lib/map/labelClasses';
  import { DUNGEON_TYPES, LOC_TYPES, REGION_NAMES, WORLD_H, WORLD_W } from '../../lib/df/constants';
  import type { LocationSummary } from '../../lib/df/maps';
  import type { TownModel } from '../../lib/df/town';
  import type { PathKind } from '../../lib/df/roads';
  import type { PathChunk } from '../../lib/map/layers';
  import type { MarkerRecord, Anchor } from '../../lib/db/model';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';

  let { focusRegion, onfocused }: { focusRegion: number | null; onfocused: () => void } = $props();

  let wrap: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  const cam = new Camera();
  cam.minZ = 0.6;
  cam.maxZ = 600;

  const g = $derived(app.game!);
  const layers = $derived(worldLayers(g));

  type Hover = { kind: 'loc'; loc: LocationSummary; sx: number; sy: number } | { kind: 'marker'; rec: MarkerRecord; sx: number; sy: number } | null;
  let hover = $state<Hover>(null);
  let cursor = $state<{ x: number; y: number; region: number } | null>(null);
  let menu = $state<{ x: number; y: number; title?: string; items: (MenuItem | '-')[] } | null>(null);
  let zoomLabel = $state('');

  // Towns drawn inside their map pixel at deep zoom.
  const townCache = new Map<number, TownModel | 'loading' | 'error'>();
  const TOWN_ZOOM = 36;

  // ---- what to draw ----
  const layerOn = $derived(app.settings.layers);
  const matches = $derived(app.serviceMatches);
  const filterHide = $derived(app.settings.filter.mode === 'hide');
  const hideCleared = $derived(app.settings.filter.hideCleared);
  const visibleLocs = $derived.by(() => {
    void app.reveals; void app.discovery; void app.settings.spoiler; void app.byAnchor;
    return g.maps.locations.filter((l) => {
      const info = LOC_TYPES[l.type];
      if (!info?.layer || !layerOn[info.layer]) return false;
      if (filterHide && matches && !matches.has(l.mapId)) return false;
      if (hideCleared && app.statuses.get(l.mapId) === 'cleared') return false;
      return app.locationVisible(l);
    });
  });
  const visibleSet = $derived(new Set(visibleLocs));
  const markers = $derived(layerOn.markers
    ? app.visibleRecords.filter((r): r is MarkerRecord => r.kind === 'marker' && (r.anchor?.t === 'px' || r.anchor?.t === 'loc'))
    : []);
  const notedLocs = $derived.by(() => {
    const m = new Map<number, string>();
    for (const r of app.visibleRecords) {
      if (r.kind !== 'note' && r.kind !== 'marker') continue;
      const a = r.anchor;
      if (a && (a.t === 'loc' || a.t === 'bld' || a.t === 'town')) m.set(a.mapId, app.planeColor(r.plane));
    }
    return m;
  });
  const selectedMapId = $derived(app.selection?.t === 'loc' || app.selection?.t === 'bld' ? app.selection.mapId : null);
  const selectedRegion = $derived(app.selection?.t === 'region' ? app.selection.region : null);
  const fadeUndiscovered = $derived(!!app.discovery && app.locationMode() === 'all');

  /** Dot size multiplier from the real block footprint (1 block ~0.9x, a full city ~2x). */
  const dotScale = $derived.by(() => {
    const m = new Map<LocationSummary, number>();
    if (!layerOn.townSize) return m;
    for (const l of visibleLocs) {
      if (l.type > 2) continue;
      m.set(l, 0.75 + 0.17 * Math.sqrt(g.maps.blocksOf(l)));
    }
    return m;
  });

  /** Label candidates in priority order (recomputed when data changes, not per frame). */
  const labelCands = $derived.by(() => {
    const noted = app.settings.labels.notedFirst ? notedLocs : null;
    return visibleLocs
      .map((l) => ({ l, cls: CLASS_OF_TYPE.get(l.type)!, noted: !!noted?.has(l.mapId) || !!matches?.has(l.mapId), size: g.maps.blocksOf(l) }))
      .filter((c) => c.cls && (!matches || filterHide || matches.has(c.l.mapId) || c.cls.priority >= 80))
      .sort((a, b) => (+b.noted - +a.noted) || (b.cls.priority - a.cls.priority) || (b.size - a.size));
  });

  const PATH_STYLE: Record<PathKind, { color: string; w: (z: number) => number; alpha: number; dash?: number[]; casing?: string }> = {
    stream: { color: '#5d9be0', w: (z) => Math.min(2.5, Math.max(0.6, z * 0.08)), alpha: 0.8 },
    river: { color: '#3f7fd2', w: (z) => Math.min(6, Math.max(1, z * 0.2)), alpha: 0.9 },
    track: { color: '#b39466', w: (z) => Math.min(2.6, Math.max(0.8, z * 0.1)), alpha: 0.95, dash: [5, 4] },
    road: { color: '#e2cc94', w: (z) => Math.min(5, Math.max(1, z * 0.17)), alpha: 1, casing: 'rgba(48,36,18,0.55)' },
  };
  const pathLayers = $derived.by(() => {
    const n = app.roads?.networks;
    if (!n) return [];
    const out: { kind: PathKind; chunks: PathChunk[] }[] = [];
    if (layerOn.streams && n.stream) out.push({ kind: 'stream', chunks: pathChunks(n.stream) });
    if (layerOn.rivers && n.river) out.push({ kind: 'river', chunks: pathChunks(n.river) });
    if (layerOn.tracks && n.track) out.push({ kind: 'track', chunks: pathChunks(n.track) });
    if (layerOn.roads && n.road) out.push({ kind: 'road', chunks: pathChunks(n.road) });
    return out;
  });

  function markerPos(r: MarkerRecord): [number, number] | null {
    const a = r.anchor!;
    if (a.t === 'px') return [a.x, a.y];
    if (a.t === 'loc') { const l = g.maps.locationByMapId(a.mapId); return l ? [l.x + 0.5, l.y + 0.5] : null; }
    return null;
  }

  // ---- render ----
  let frame = 0;
  function schedule() {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); });
  }
  cam.onChange = () => {
    lastCamera = { x: cam.x, y: cam.y, z: cam.z };
    if (Math.abs(Math.log(cam.z / app.mapZoom)) > 0.02) app.mapZoom = +cam.z.toFixed(2);
    schedule();
  };

  function drawStatus(ctx: CanvasRenderingContext2D, x: number, y: number, status: 'started' | 'cleared') {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = status === 'cleared' ? '#3f8f45' : '#c08a1e';
    ctx.fill();
    ctx.strokeStyle = '#0b0b0d'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath();
    if (status === 'cleared') { ctx.moveTo(x - 2.5, y); ctx.lineTo(x - 0.5, y + 2); ctx.lineTo(x + 2.8, y - 2.2); }
    else { ctx.moveTo(x, y - 2.8); ctx.lineTo(x, y); ctx.lineTo(x + 2, y + 1.2); }
    ctx.stroke();
    ctx.restore();
  }

  function drawSpot(ctx: CanvasRenderingContext2D, x: number, y: number, role: 'here' | 'home') {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fillStyle = role === 'here' ? 'rgba(242,213,91,0.22)' : 'rgba(110,170,240,0.22)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = role === 'here' ? '#f2d55b' : '#7ab0f0';
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = "bold 12px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(role === 'here' ? '●' : '⌂', x, y + 0.5);
    ctx.restore();
  }

  function dotSize(l: LocationSummary, base: number) {
    return Math.min(Math.max(cam.z, 3), base * (dotScale.get(l) ?? 1));
  }

  function draw() {
    if (!canvas) return;
    const dpr = devicePixelRatio || 1;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0c0d10';
    ctx.fillRect(0, 0, cam.w, cam.h);
    const z = cam.z;
    const b = cam.bounds();
    const level = z < 4 ? 'Province' : z < TOWN_ZOOM ? 'Region' : 'Street';
    if (level !== zoomLabel) zoomLabel = level;
    const inView = (l: LocationSummary) => l.x + 1 >= b.x0 && l.x <= b.x1 && l.y + 1 >= b.y0 && l.y <= b.y1;

    // World space: art, region tint, paths, borders, towns.
    ctx.save();
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cam.w / 2 - cam.x * z), dpr * (cam.h / 2 - cam.y * z));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(layers.base, 0, 0);

    const hoverRegion = cursor && z < 10 ? cursor.region : -1;
    for (const r of new Set([hoverRegion, selectedRegion ?? -1])) {
      if (r < 0) continue;
      ctx.fillStyle = r === selectedRegion ? 'rgba(242,213,91,0.16)' : 'rgba(242,213,91,0.08)';
      ctx.fill(layers.regionPath(r));
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const { kind, chunks } of pathLayers) {
      const st = PATH_STYLE[kind];
      const vis = chunks.filter((c) => c.x1 >= b.x0 && c.x0 <= b.x1 && c.y1 >= b.y0 && c.y0 <= b.y1);
      if (!vis.length) continue;
      const w = st.w(z) / z;
      ctx.globalAlpha = z < 2.5 ? st.alpha * 0.7 : st.alpha;
      if (st.casing && z >= 3) {
        ctx.strokeStyle = st.casing;
        ctx.lineWidth = w + 2 / z;
        for (const c of vis) ctx.stroke(c.path);
      }
      ctx.strokeStyle = st.color;
      ctx.lineWidth = w;
      ctx.setLineDash(st.dash && z >= 4 ? st.dash.map((d) => d / z) : []);
      for (const c of vis) ctx.stroke(c.path);
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;

    if (layerOn.borders) {
      const bw = app.settings.display.borderWeight;
      ctx.strokeStyle = `rgba(242,213,91,${Math.min(1, (z > 20 ? 0.2 : 0.3) + bw * 0.15)})`;
      ctx.lineWidth = (0.6 + bw * 0.5) / z;
      ctx.stroke(layers.borders);
    }

    if (z >= TOWN_ZOOM) {
      let budget = 80;
      for (const l of visibleLocs) {
        if (!inView(l) || !LOC_TYPES[l.type].town || budget-- <= 0) continue;
        const t = townCache.get(l.mapId);
        if (t === undefined) {
          townCache.set(l.mapId, 'loading');
          app.game!.town(l).then((m) => { townCache.set(l.mapId, m); schedule(); }, () => townCache.set(l.mapId, 'error'));
          continue;
        }
        if (typeof t === 'string') continue;
        const bw = t.detail.width / 8, bh = t.detail.height / 8;
        const ox = l.x + (1 - bw) / 2, oy = l.y + (1 - bh) / 2;
        ctx.fillStyle = 'rgba(70,72,80,0.85)';
        ctx.fillRect(ox, oy, bw, bh);
        ctx.drawImage(townCanvas(t), ox, oy, bw, bh);
      }
    }
    ctx.restore();

    // Location dots (screen space so they stay crisp).
    const base = Math.max(3, Math.min(z * 0.62, 10));
    const deep = z >= TOWN_ZOOM;
    for (const l of visibleLocs) {
      if (!inView(l)) continue;
      const [sx, sy] = cam.toScreen(l.x + 0.5, l.y + 0.5);
      const faded = fadeUndiscovered && !app.locationDiscovered(l) && !l.visibleAtStart;
      const dimmed = !!matches && !matches.has(l.mapId);
      ctx.globalAlpha = dimmed ? 0.22 : faded ? 0.4 : 1;
      const d = deep ? z : dotSize(l, base);
      if (matches && !dimmed && !deep) {
        ctx.strokeStyle = '#f2d55b';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy, d / 2 + 5, 0, Math.PI * 2); ctx.stroke();
      }
      if (deep) {
        ctx.strokeStyle = layers.dotColor.get(l.type)!;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx - d / 2, sy - d / 2, d, d);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(sx - d / 2 - 1, sy - d / 2 - 1, d + 2, d + 2);
        ctx.fillStyle = layers.dotColor.get(l.type)!;
        ctx.fillRect(sx - d / 2, sy - d / 2, d, d);
      }
      const noted = notedLocs.get(l.mapId);
      if (noted && layerOn.markers) {
        ctx.fillStyle = noted;
        ctx.beginPath();
        ctx.arc(sx + d / 2 + 2, sy - d / 2 - 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      const status = app.statuses.get(l.mapId);
      if (status) drawStatus(ctx, sx + d / 2 + 1, sy + d / 2 + 1, status);
    }
    ctx.globalAlpha = 1;

    // "I'm here" and "Home" (manual), drawn under labels so names stay readable.
    for (const role of ['home', 'here'] as const) {
      const p = app.anchorPoint(app.spots[role]?.anchor ?? null);
      if (!p || p.x < b.x0 - 1 || p.x > b.x1 + 1 || p.y < b.y0 - 1 || p.y > b.y1 + 1) continue;
      const [sx, sy] = cam.toScreen(p.x, p.y);
      drawSpot(ctx, sx, sy, role);
    }

    const ring = (l: LocationSummary, color: string) => {
      const [sx, sy] = cam.toScreen(l.x + 0.5, l.y + 0.5);
      const r = (deep ? z : dotSize(l, base)) / 2 + 4;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - r, sy - r, r * 2, r * 2);
    };
    const selLoc = selectedMapId !== null ? g.maps.locationByMapId(selectedMapId) : null;
    if (selLoc) ring(selLoc, '#f2d55b');
    if (hover?.kind === 'loc') ring(hover.loc, 'rgba(255,255,255,0.8)');

    const pos = app.boundSave?.position;
    if (pos && layerOn.player) {
      const [sx, sy] = cam.toScreen(pos.x, pos.y);
      ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(242,213,91,0.25)'; ctx.fill();
      ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#f2d55b'; ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // Labels: pre-rendered sprites, spatial-hash collisions, tiered by zoom.
    const grid = new CollisionGrid();
    const placeLabel = (l: LocationSummary, color: string, size: number, force: boolean) => {
      const [sx, sy] = cam.toScreen(l.x + 0.5, l.y + 0.5);
      const sp = labelSprite(l.name, size, color);
      const x0 = sx + (deep ? z : dotSize(l, base)) / 2 + 5;
      const bx0 = x0, by0 = sy - sp.h / 2 + 2, bx1 = x0 + sp.w - 6, by1 = sy + sp.h / 2 - 2;
      if (!force && !app.settings.labels.overlap && !grid.fits(bx0, by0, bx1, by1)) return;
      grid.add(bx0, by0, bx1, by1);
      blitLabel(ctx, sp, x0, sy);
    };
    // Hovered and selected places always get a label, placed first.
    const hovered = hover?.kind === 'loc' ? hover.loc : null;
    for (const l of [selLoc, hovered]) if (l && inView(l)) placeLabel(l, '#ffffff', 12.5, true);
    if (layerOn.labels) {
      const tiers = app.settings.labels.classes;
      let placed = 0;
      for (const c of labelCands) {
        const t = tiers[c.cls.key] ?? { on: true, zoom: c.cls.defaultZoom };
        if (!t.on && !c.noted) continue;
        if (z < t.zoom && !(c.noted && z >= 3)) continue;
        if (!inView(c.l) || c.l === selLoc || c.l === hovered) continue;
        placeLabel(c.l, c.cls.color, c.cls.size, false);
        if (++placed > 900) break;
      }
    }

    for (const m of markers) {
      const p = markerPos(m);
      if (!p || p[0] < b.x0 - 1 || p[0] > b.x1 + 1 || p[1] < b.y0 - 1 || p[1] > b.y1 + 1) continue;
      const [sx, sy] = cam.toScreen(p[0], p[1]);
      const active = (app.selection?.t === 'record' && app.selection.id === m.id) || (hover?.kind === 'marker' && hover.rec.id === m.id);
      drawMarker(ctx, sx, sy, m.category, app.planeColor(m.plane), app.settings.display.markerScale, active);
      if (z >= 4 && layerOn.labels) blitLabel(ctx, labelSprite(m.name, 11, '#ffffff'), sx, sy + 9, 'center');
    }
  }

  // ---- picking ----
  function pickAt(sx: number, sy: number): Hover {
    // Markers first (their hit area sits above the anchor).
    for (let i = markers.length - 1; i >= 0; i--) {
      const p = markerPos(markers[i]);
      if (!p) continue;
      const [mx, my] = cam.toScreen(p[0], p[1]);
      if (Math.abs(sx - mx) < 10 && sy < my + 2 && sy > my - 26) return { kind: 'marker', rec: markers[i], sx, sy };
    }
    const [wx, wy] = cam.toWorld(sx, sy);
    const radius = Math.max(7 / cam.z, 0.5);
    let best: LocationSummary | null = null, bestD = Infinity;
    for (let y = Math.floor(wy - radius); y <= Math.floor(wy + radius); y++) {
      for (let x = Math.floor(wx - radius); x <= Math.floor(wx + radius); x++) {
        const l = g.maps.locationAt(x, y);
        if (!l || !visibleSet.has(l)) continue;
        const d = (l.x + 0.5 - wx) ** 2 + (l.y + 0.5 - wy) ** 2;
        if (d < bestD && d <= (radius + 0.5) ** 2) { best = l; bestD = d; }
      }
    }
    return best ? { kind: 'loc', loc: best, sx, sy } : null;
  }

  function anchorAt(sx: number, sy: number): Anchor {
    const [wx, wy] = cam.toWorld(sx, sy);
    return { t: 'px', x: +wx.toFixed(3), y: +wy.toFixed(3) };
  }

  function openMenu(sx: number, sy: number) {
    const h = pickAt(sx, sy);
    const here = anchorAt(sx, sy);
    const items: (MenuItem | '-')[] = [];
    let title: string | undefined;
    if (h?.kind === 'loc') {
      const l = h.loc;
      title = l.name;
      app.selection = { t: 'loc', mapId: l.mapId };
      if (LOC_TYPES[l.type].town) items.push({ label: 'Open town', action: () => app.openTown(l.mapId), hint: 'double-click' });
      items.push({ label: `Add note to ${l.name}`, action: () => (app.composer = { kind: 'note', anchor: { t: 'loc', mapId: l.mapId } }) });
      items.push({ label: 'Add marker on this place', action: () => (app.composer = { kind: 'marker', anchor: { t: 'loc', mapId: l.mapId } }) });
      items.push('-');
      if (!l.visibleAtStart && app.locationMode() === 'known')
        items.push({ label: app.isRevealed({ t: 'loc', mapId: l.mapId }) ? 'Hide again' : 'Keep revealed', action: () => app.setRevealed({ t: 'loc', mapId: l.mapId }, !app.isRevealed({ t: 'loc', mapId: l.mapId })) });
      items.push({ label: 'Add journal entry here', action: () => (app.composer = { kind: 'journal', anchor: { t: 'loc', mapId: l.mapId } }) });
      items.push('-');
      items.push({ label: "I'm here", action: () => app.setSpot('here', { t: 'loc', mapId: l.mapId }) });
      items.push({ label: 'Set as home', action: () => app.setSpot('home', { t: 'loc', mapId: l.mapId }) });
      if (LOC_TYPES[l.type].layer === 'dungeons') {
        const st = app.statuses.get(l.mapId);
        items.push({ label: st === 'started' ? 'Unmark started' : 'Mark started', action: () => app.setStatus(l.mapId, st === 'started' ? null : 'started') });
        items.push({ label: st === 'cleared' ? 'Unmark cleared' : 'Mark cleared', action: () => app.setStatus(l.mapId, st === 'cleared' ? null : 'cleared') });
      }
    } else if (h?.kind === 'marker') {
      title = h.rec.name;
      app.selection = { t: 'record', id: h.rec.id };
      items.push({ label: 'Edit marker', action: () => (app.composer = { kind: 'marker', anchor: h.rec.anchor, recordId: h.rec.id }) });
      items.push({ label: 'Move to Trash', tone: 'danger', action: () => app.trashRecord(h.rec.id) });
    } else {
      const [wx, wy] = cam.toWorld(sx, sy);
      const r = g.regionAt(Math.floor(wx), Math.floor(wy));
      title = r >= 0 ? REGION_NAMES[r] : 'Open water';
      items.push({ label: 'Add marker here', action: () => (app.composer = { kind: 'marker', anchor: here }) });
      items.push({ label: 'Add journal entry here', action: () => (app.composer = { kind: 'journal', anchor: here }) });
      items.push({ label: "I'm here", action: () => app.setSpot('here', here) });
      items.push({ label: 'Set as home', action: () => app.setSpot('home', here) });
      if (r >= 0) items.push({ label: `Notes on ${REGION_NAMES[r]}`, action: () => (app.selection = { t: 'region', region: r }) });
    }
    menu = { x: sx, y: sy, title, items };
  }

  onMount(() => {
    const resize = () => {
      const dpr = devicePixelRatio || 1;
      cam.w = wrap.clientWidth;
      cam.h = wrap.clientHeight;
      canvas.width = cam.w * dpr;
      canvas.height = cam.h * dpr;
      canvas.style.width = cam.w + 'px';
      canvas.style.height = cam.h + 'px';
      schedule();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    cam.minZ = Math.min(cam.w / WORLD_W, cam.h / WORLD_H) * 0.9;

    if (lastCamera) cam.set(lastCamera);
    else cam.set(cam.fit(0, 0, WORLD_W, WORLD_H, 0.98));

    const detach = attachPanZoom(canvas, cam, {
      onHover(sx, sy) {
        const h = pickAt(sx, sy);
        if (h?.kind !== hover?.kind || (h?.kind === 'loc' && hover?.kind === 'loc' && h.loc !== hover.loc) || (h?.kind === 'marker' && hover?.kind === 'marker' && h.rec !== hover.rec)) schedule();
        hover = h;
        const [wx, wy] = cam.toWorld(sx, sy);
        const region = g.regionAt(Math.floor(wx), Math.floor(wy));
        if (region !== cursor?.region) schedule();
        cursor = { x: wx, y: wy, region };
      },
      onClick(sx, sy) {
        menu = null;
        const h = pickAt(sx, sy);
        if (h?.kind === 'loc') app.selection = { t: 'loc', mapId: h.loc.mapId };
        else if (h?.kind === 'marker') app.selection = { t: 'record', id: h.rec.id };
        else {
          const [wx, wy] = cam.toWorld(sx, sy);
          const r = g.regionAt(Math.floor(wx), Math.floor(wy));
          app.selection = r >= 0 ? { t: 'region', region: r } : null;
        }
        schedule();
      },
      onDouble(sx, sy) {
        const h = pickAt(sx, sy);
        if (h?.kind === 'loc' && LOC_TYPES[h.loc.type].town) app.openTown(h.loc.mapId);
        else cam.zoomAt(sx, sy, 2.2);
      },
      onContext: (sx, sy) => openMenu(sx, sy),
      onLeave() { hover = null; cursor = null; schedule(); },
    });

    const keys = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      const step = 80;
      if (e.key === '+' || e.key === '=') cam.zoomAt(cam.w / 2, cam.h / 2, 1.4);
      else if (e.key === '-') cam.zoomAt(cam.w / 2, cam.h / 2, 1 / 1.4);
      else if (e.key === 'ArrowLeft') cam.panBy(step, 0);
      else if (e.key === 'ArrowRight') cam.panBy(-step, 0);
      else if (e.key === 'ArrowUp') cam.panBy(0, step);
      else if (e.key === 'ArrowDown') cam.panBy(0, -step);
      else return;
      e.preventDefault();
    };
    addEventListener('keydown', keys);
    return () => { ro.disconnect(); detach(); removeEventListener('keydown', keys); cam.stop(); };
  });

  // Fly to a region chosen on the overview.
  $effect(() => {
    if (focusRegion === null) return;
    const bnd = layers.regionBounds.get(focusRegion);
    untrack(() => {
      if (bnd) cam.flyTo(cam.fit(bnd[0], bnd[1], bnd[2], bnd[3], 0.85), 700);
      onfocused();
    });
  });

  // Fly requests from search, inspector, journal links…
  $effect(() => {
    const f = app.flyRequest;
    if (!f) return;
    untrack(() => cam.flyTo({ x: f.x, y: f.y, z: f.zoom ?? Math.max(cam.z, 14) }));
  });

  // Redraw when anything visual changes.
  $effect(() => {
    void labelCands; void markers; void dotScale; void pathLayers; void selectedMapId; void selectedRegion; void layerOn.borders; void layerOn.labels;
    void layerOn.player; void app.boundSave; void app.settings.labels.overlap; void app.settings.display.borderWeight; void app.settings.display.markerScale; void app.selection;
    void JSON.stringify(app.settings.labels.classes); void app.statuses; void app.spots; void matches;
    schedule();
  });

  const hoverInfo = $derived.by(() => {
    if (!hover) return null;
    if (hover.kind === 'marker') {
      return { title: hover.rec.name, lines: [`${app.planeLabel(hover.rec.plane)} marker · ${hover.rec.category}`, hover.rec.body.split('\n')[0]].filter(Boolean) };
    }
    const l = hover.loc;
    const info = LOC_TYPES[l.type];
    const lines = [`${info.label} · ${REGION_NAMES[l.region]}`];
    if (l.dungeonType !== 255 && info.layer === 'dungeons') lines.push(DUNGEON_TYPES[l.dungeonType] ?? 'Dungeon');
    const blocks = g.maps.blocksOf(l);
    if (info.town && blocks > 1) lines[0] += ` · ${blocks} blocks`;
    const note = app.recordsFor({ t: 'loc', mapId: l.mapId })[0];
    if (note) lines.push(`“${('name' in note ? note.name + ': ' : '') + note.body.split('\n')[0]}”`.slice(0, 90));
    if (app.discovery) lines.push(app.locationDiscovered(l) ? 'Discovered by your character' : 'Not yet discovered');
    const st = app.statuses.get(l.mapId);
    if (st) lines.push(st === 'cleared' ? '✓ Cleared' : '◐ Started');
    if (info.town) lines.push('Double-click to open the town');
    return { title: l.name, lines };
  });
</script>

<div class="world" bind:this={wrap}>
  <canvas bind:this={canvas} class:hovering={!!hover}></canvas>
  {#if hoverInfo && hover && !menu}
    <div class="tip" style:left="{hover.sx + 16}px" style:top="{hover.sy + 12}px">
      <strong>{hoverInfo.title}</strong>
      {#each hoverInfo.lines as line}<span>{line}</span>{/each}
    </div>
  {/if}
  {#if menu}<ContextMenu {...menu} onclose={() => (menu = null)} />{/if}
  <div class="readout">
    {#if cursor}
      <span class="mono">{Math.floor(cursor.x)}, {Math.floor(cursor.y)}</span>
      {#if cursor.region >= 0}<span>{REGION_NAMES[cursor.region]}</span>{/if}
    {/if}
    <span class="faint">{zoomLabel}</span>
  </div>
  <div class="zoom">
    <button class="small" onclick={() => cam.zoomAt(cam.w / 2, cam.h / 2, 1.6)} aria-label="Zoom in">+</button>
    <button class="small" onclick={() => cam.zoomAt(cam.w / 2, cam.h / 2, 1 / 1.6)} aria-label="Zoom out">−</button>
    {#if app.boundSave?.position}
      <button class="small" title="Centre on your character" onclick={() => { const p = app.boundSave!.position!; cam.flyTo({ x: p.x, y: p.y, z: Math.max(cam.z, 20) }); }}>◎</button>
    {/if}
  </div>
</div>

<style>
  .world { position: absolute; inset: 0; overflow: hidden; }
  canvas { display: block; touch-action: none; }
  canvas.hovering { cursor: pointer; }
  .tip {
    position: absolute; pointer-events: none; z-index: 10; background: rgba(14, 15, 18, 0.94); border: 1px solid var(--line);
    border-radius: 6px; padding: 7px 10px; display: flex; flex-direction: column; font-size: 12.5px; max-width: 320px;
  }
  .tip strong { color: var(--gold); font-size: 13.5px; }
  .tip span { color: var(--muted); }
  .readout {
    position: absolute; left: 10px; bottom: 10px; display: flex; gap: 10px; font-size: 12px; color: var(--muted);
    background: rgba(14,15,18,0.75); padding: 3px 10px; border-radius: 999px; pointer-events: none;
  }
  .zoom { position: absolute; right: 12px; bottom: 12px; display: flex; flex-direction: column; gap: 4px; }
  .zoom button { width: 32px; height: 32px; padding: 0; font-size: 16px; }
</style>
