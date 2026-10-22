<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { app } from '../../lib/state/app.svelte';
  import { Camera, attachPanZoom } from '../../lib/map/camera';
  import { footprint, stonePattern, townCanvas } from '../../lib/map/layers';
  import { drawMarker } from '../../lib/map/draw';
  import { labelSprite, blitLabel, CollisionGrid } from '../../lib/map/labels';
  import { AUTOMAP_COLORS, BLD_LABELS, LOC_TYPES, REGION_NAMES, bldCategory, NAMED_BUILDING_TYPES } from '../../lib/df/constants';
  import { qualityBand } from '../../lib/df/quality';
  import type { LocationSummary } from '../../lib/df/maps';
  import type { TownModel, TownBuilding } from '../../lib/df/town';
  import type { MarkerRecord } from '../../lib/db/model';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';

  let { loc }: { loc: LocationSummary } = $props();

  let wrap: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  const cam = new Camera();
  cam.minZ = 0.5;
  cam.maxZ = 40;

  let town = $state.raw<TownModel | null>(null);
  let error = $state('');
  let hoverIdx = $state(-1);
  let hoverPos = $state<{ x: number; y: number } | null>(null);
  let menu = $state<{ x: number; y: number; title?: string; items: (MenuItem | '-')[] } | null>(null);

  $effect(() => {
    const l = loc;
    town = null; error = '';
    app.game!.town(l).then((t) => { if (l === loc) { town = t; fitTown(); } }, (e) => (error = String(e?.message ?? e)));
  });

  const selectedKey = $derived(app.selection?.t === 'bld' && app.selection.mapId === loc.mapId ? app.selection.key : null);
  const markers = $derived(app.settings.layers.markers
    ? app.visibleRecords.filter((r): r is MarkerRecord => r.kind === 'marker' && r.anchor?.t === 'town' && r.anchor.mapId === loc.mapId)
    : []);
  const notedKeys = $derived.by(() => {
    const m = new Map<number, string>();
    for (const r of app.visibleRecords) {
      if ((r.kind === 'note' || r.kind === 'marker') && r.anchor?.t === 'bld' && r.anchor.mapId === loc.mapId) m.set(r.anchor.key, app.planeColor(r.plane));
    }
    return m;
  });

  /** Named buildings with a footprint, largest first (label priority). */
  const namedOrder = $derived(town ? town.buildings.filter((b) => b.pixelCount > 0 && NAMED_BUILDING_TYPES.has(b.type)).sort((a, c) => c.pixelCount - a.pixelCount) : []);

  function nameOf(b: TownBuilding) {
    return app.buildingNameVisible(loc.mapId, b) ? app.buildingRealName(loc.mapId, b) : null;
  }
  const stats = $derived.by(() => {
    if (!town) return null;
    void app.reveals; void app.settings.spoiler; void app.discovery;
    const named = town.buildings.filter((b) => NAMED_BUILDING_TYPES.has(b.type) && b.pixelCount);
    return { named: named.length, hidden: named.filter((b) => !nameOf(b)).length };
  });

  function fitTown() {
    if (!town || !cam.w) return;
    cam.set(cam.fit(0, 0, town.width, town.height, 0.92));
    cam.minZ = cam.z * 0.5;
  }

  let frame = 0;
  function schedule() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); }); }
  cam.onChange = schedule;

  function draw() {
    if (!canvas) return;
    const dpr = devicePixelRatio || 1;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0c0d10';
    ctx.fillRect(0, 0, cam.w, cam.h);
    if (!town) return;
    const t = town;
    const z = cam.z;

    ctx.save();
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cam.w / 2 - cam.x * z), dpr * (cam.h / 2 - cam.y * z));
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.scale(1 / 4, 1 / 4); // pattern texel = 1/4 town pixel
    ctx.fillStyle = stonePattern(ctx);
    ctx.fillRect(-64 * 4, -64 * 4, (t.width + 128) * 4, (t.height + 128) * 4);
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(-64, -64, t.width + 128, 64); ctx.fillRect(-64, t.height, t.width + 128, 64);
    ctx.fillRect(-64, 0, 64, t.height); ctx.fillRect(t.width, 0, 64, t.height);
    ctx.drawImage(townCanvas(t), 0, 0);

    ctx.lineWidth = 2 / z;
    const sel = selectedKey === null ? -1 : t.buildings.findIndex((b) => b.key === selectedKey);
    if (hoverIdx >= 0 && hoverIdx !== sel) { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke(footprint(t, hoverIdx)); }
    if (sel >= 0) { ctx.strokeStyle = '#f2d55b'; ctx.lineWidth = 3 / z; ctx.stroke(footprint(t, sel)); }
    ctx.restore();

    // Note dots on buildings.
    for (const [key, color] of notedKeys) {
      const b = t.buildings.find((x) => x.key === key);
      if (!b?.bbox) continue;
      const [sx, sy] = cam.toScreen(b.bbox[2], b.bbox[1]);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    }

    // Labels in the game's yellow, biggest named buildings first. Size is quantised so sprites cache.
    if (app.settings.layers.labels) {
      const grid = new CollisionGrid();
      const size = Math.round(Math.max(10, Math.min(14, 9 + z * 0.9)) * 2) / 2;
      for (const b of namedOrder) {
        const name = nameOf(b);
        if (!name) continue;
        const [sx, sy] = cam.toScreen(b.cx, b.cy);
        const sp = labelSprite(name, size, '#f6e05e');
        const box = [sx - sp.w / 2 + 3, sy - sp.h / 2 + 2, sx + sp.w / 2 - 3, sy + sp.h / 2 - 2] as const;
        if (!app.settings.labels.overlap && !grid.fits(box[0], box[1], box[2], box[3])) continue;
        grid.add(box[0], box[1], box[2], box[3]);
        blitLabel(ctx, sp, sx, sy, 'center');
      }
    }

    for (const m of markers) {
      const a = m.anchor as { x: number; y: number };
      const [sx, sy] = cam.toScreen(a.x, a.y);
      drawMarker(ctx, sx, sy, m.category, app.planeColor(m.plane), app.settings.display.markerScale, app.selection?.t === 'record' && app.selection.id === m.id);
      blitLabel(ctx, labelSprite(m.name, 11, '#ffffff'), sx, sy + 9, 'center');
    }

    blitLabel(ctx, labelSprite('N ↑', 13, '#f2d55b', 700), cam.w - 34, 22, 'center');
  }

  function buildingAt(sx: number, sy: number): number {
    if (!town) return -1;
    const [wx, wy] = cam.toWorld(sx, sy);
    const x = Math.floor(wx), y = Math.floor(wy);
    if (x < 0 || y < 0 || x >= town.width || y >= town.height) return -1;
    return town.owner[y * town.width + x];
  }

  function markerAt(sx: number, sy: number) {
    for (const m of markers) {
      const a = m.anchor as { x: number; y: number };
      const [mx, my] = cam.toScreen(a.x, a.y);
      if (Math.abs(sx - mx) < 10 && sy < my + 2 && sy > my - 26) return m;
    }
    return null;
  }

  function openMenu(sx: number, sy: number) {
    const t = town;
    if (!t) return;
    const [wx, wy] = cam.toWorld(sx, sy);
    const spot = { t: 'town' as const, mapId: loc.mapId, x: +wx.toFixed(2), y: +wy.toFixed(2) };
    const m = markerAt(sx, sy);
    const items: (MenuItem | '-')[] = [];
    let title: string | undefined;
    if (m) {
      title = m.name;
      items.push({ label: 'Edit marker', action: () => (app.composer = { kind: 'marker', anchor: m.anchor, recordId: m.id }) });
      items.push({ label: 'Move to Trash', tone: 'danger', action: () => app.trashRecord(m.id) });
    } else {
      const idx = buildingAt(sx, sy);
      if (idx >= 0) {
        const b = t.buildings[idx];
        const a = { t: 'bld' as const, mapId: loc.mapId, key: b.key };
        title = nameOf(b) ?? BLD_LABELS[b.type];
        app.selection = { t: 'bld', mapId: loc.mapId, key: b.key };
        items.push({ label: 'Add note to this building', action: () => (app.composer = { kind: 'note', anchor: a }) });
        if (b.name && !app.shopNamesShown()) {
          const on = app.isRevealed(a);
          items.push({ label: on ? 'Hide name again' : 'Reveal name', action: () => app.setRevealed(a, !on) });
        }
      }
      items.push({ label: 'Add marker here', action: () => (app.composer = { kind: 'marker', anchor: spot }) });
      items.push({ label: 'Add journal entry here', action: () => (app.composer = { kind: 'journal', anchor: idx >= 0 ? { t: 'bld', mapId: loc.mapId, key: t.buildings[idx].key } : spot }) });
      if (stats?.hidden) items.push('-', { label: `Reveal all ${stats.hidden} hidden names in ${loc.name}`, action: () => app.setRevealed({ t: 'town', mapId: loc.mapId, x: 0, y: 0 }, true) });
    }
    menu = { x: sx, y: sy, title, items };
  }

  onMount(() => {
    const resize = () => {
      const dpr = devicePixelRatio || 1;
      cam.w = wrap.clientWidth; cam.h = wrap.clientHeight;
      canvas.width = cam.w * dpr; canvas.height = cam.h * dpr;
      canvas.style.width = cam.w + 'px'; canvas.style.height = cam.h + 'px';
      schedule();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    fitTown();
    const detach = attachPanZoom(canvas, cam, {
      onHover(sx, sy) {
        const i = buildingAt(sx, sy);
        if (i !== hoverIdx) { hoverIdx = i; schedule(); }
        hoverPos = { x: sx, y: sy };
      },
      onClick(sx, sy) {
        menu = null;
        const m = markerAt(sx, sy);
        if (m) { app.selection = { t: 'record', id: m.id }; return; }
        const i = buildingAt(sx, sy);
        app.selection = i >= 0 && town ? { t: 'bld', mapId: loc.mapId, key: town.buildings[i].key } : { t: 'loc', mapId: loc.mapId };
      },
      onDouble(sx, sy) { cam.zoomAt(sx, sy, 2); },
      onContext: (sx, sy) => openMenu(sx, sy),
      onLeave() { hoverIdx = -1; hoverPos = null; schedule(); },
    });
    return () => { ro.disconnect(); detach(); cam.stop(); };
  });

  $effect(() => {
    void markers; void notedKeys; void selectedKey; void app.reveals; void app.settings.spoiler; void app.discovery;
    void app.settings.layers.labels; void app.settings.labels.overlap; void town;
    schedule();
  });

  // Centre on a building requested from elsewhere (inspector, journal links).
  $effect(() => {
    const f = app.townFocus;
    const t = town;
    if (!f || !t) return;
    untrack(() => {
      const b = t.buildings.find((x) => x.key === f.key);
      if (b) cam.flyTo({ x: b.cx, y: b.cy, z: Math.max(cam.z, 6) }, 450);
      app.townFocus = null;
    });
  });

  const hoverInfo = $derived.by(() => {
    if (!town || hoverIdx < 0 || !hoverPos) return null;
    const b = town.buildings[hoverIdx];
    const name = nameOf(b);
    const lines: string[] = [];
    const typeLabel = BLD_LABELS[b.type] ?? `Type ${b.type}`;
    if (name) lines.push(typeLabel);
    if (NAMED_BUILDING_TYPES.has(b.type) && b.type !== 16 && b.type !== 11 && b.type !== 14) {
      const q = qualityBand(b.quality);
      lines.push(`Quality ${b.quality}/20 · ${q.band}`);
    }
    const note = app.recordsFor({ t: 'bld', mapId: loc.mapId, key: b.key })[0];
    if (note) lines.push(`“${note.body.split('\n')[0].slice(0, 80)}”`);
    if (!name && b.name) lines.push('Name hidden · right-click to reveal');
    return { title: name ?? (b.name ? `${typeLabel} (unidentified)` : typeLabel), lines };
  });
</script>

<div class="town" bind:this={wrap}>
  <canvas bind:this={canvas} class:hovering={hoverIdx >= 0}></canvas>
  {#if !town && !error}<div class="loading">Drawing {loc.name}…</div>{/if}
  {#if error}<div class="loading err">Could not draw this town: {error}</div>{/if}
  {#if hoverInfo && hoverPos && !menu}
    <div class="tip" style:left="{hoverPos.x + 16}px" style:top="{hoverPos.y + 12}px">
      <strong>{hoverInfo.title}</strong>
      {#each hoverInfo.lines as l}<span>{l}</span>{/each}
    </div>
  {/if}
  {#if menu}<ContextMenu {...menu} onclose={() => (menu = null)} />{/if}

  <div class="legend">
    <span class="place"><strong>{loc.name}</strong> · {LOC_TYPES[loc.type].label}, {REGION_NAMES[loc.region]}</span>
    <span><i style:background={AUTOMAP_COLORS.guild}></i>Guilds</span>
    <span><i style:background={AUTOMAP_COLORS.shop}></i>Shops</span>
    <span><i style:background={AUTOMAP_COLORS.tavern}></i>Taverns</span>
    <span><i style:background={AUTOMAP_COLORS.house}></i>Houses</span>
    {#if stats?.hidden}
      <button class="small" onclick={() => app.setRevealed({ t: 'town', mapId: loc.mapId, x: 0, y: 0 }, true)}>
        Reveal {stats.hidden} hidden name{stats.hidden === 1 ? '' : 's'}
      </button>
    {:else if app.isRevealed({ t: 'town', mapId: loc.mapId, x: 0, y: 0 })}
      <button class="small ghost" onclick={() => app.setRevealed({ t: 'town', mapId: loc.mapId, x: 0, y: 0 }, false)}>Hide names again</button>
    {/if}
    {#if town?.missingBlocks.length}<span class="warn">{town.missingBlocks.length} block(s) missing</span>{/if}
  </div>
  <div class="zoom">
    <button class="small" onclick={() => cam.zoomAt(cam.w / 2, cam.h / 2, 1.5)} aria-label="Zoom in">+</button>
    <button class="small" onclick={() => cam.zoomAt(cam.w / 2, cam.h / 2, 1 / 1.5)} aria-label="Zoom out">−</button>
    <button class="small" onclick={fitTown} title="Fit town">⤢</button>
  </div>
</div>

<style>
  .town { position: absolute; inset: 0; overflow: hidden; }
  canvas { display: block; touch-action: none; }
  canvas.hovering { cursor: pointer; }
  .loading { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); }
  .err { color: var(--danger); }
  .tip {
    position: absolute; pointer-events: none; z-index: 10; background: rgba(14, 15, 18, 0.94); border: 1px solid var(--line);
    border-radius: 6px; padding: 7px 10px; display: flex; flex-direction: column; font-size: 12.5px; max-width: 320px;
  }
  .tip strong { color: var(--gold); font-size: 13.5px; }
  .tip span { color: var(--muted); }
  .legend {
    position: absolute; left: 50%; transform: translateX(-50%); bottom: 12px; display: flex; gap: 14px; align-items: center;
    background: rgba(14,15,18,0.85); border: 1px solid var(--line-soft); padding: 5px 14px; border-radius: 999px; font-size: 12.5px; white-space: nowrap;
  }
  .legend i { display: inline-block; width: 11px; height: 11px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
  .legend .place { color: var(--muted); }
  .legend .place strong { color: var(--gold); }
  .warn { color: var(--warn); }
  .zoom { position: absolute; right: 12px; bottom: 12px; display: flex; flex-direction: column; gap: 4px; }
  .zoom button { width: 32px; height: 32px; padding: 0; font-size: 16px; }
  @media (max-width: 1200px) { .legend .place { display: none; } }
</style>
