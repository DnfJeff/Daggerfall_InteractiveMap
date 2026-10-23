<script lang="ts">
  import { app } from '../../lib/state/app.svelte';
  import { LOC_TYPES, REGION_NAMES } from '../../lib/df/constants';
  import { buildLocIndex, norm, score, searchLocations } from '../../lib/map/search';
  import { parseServiceQuery, runServiceQuery, type ServiceHit } from '../../lib/map/serviceSearch';
  import { buildingName } from '../../lib/df/names';
  import type { LocationSummary } from '../../lib/df/maps';
  import type { MarkerRecord } from '../../lib/db/model';
  import Icon from '../Icon.svelte';

  let q = $state('');
  let open = $state(false);
  let active = $state(0);
  let input: HTMLInputElement | undefined = $state();

  const index = $derived(app.game ? buildLocIndex(app.game.maps.locations) : []);
  const visible = (l: LocationSummary) => app.locationVisible(l);

  type Hit = { kind: 'loc'; loc: LocationSummary } | { kind: 'marker'; rec: MarkerRecord } | { kind: 'service'; hit: ServiceHit };

  const svc = $derived.by(() => {
    if (!app.game || !q.trim()) return null;
    void app.settings.spoiler.level; void app.reveals; void app.discovery; void app.spots; void app.boundSave;
    const dir = app.game.directory();
    const parsed = parseServiceQuery(q, dir, index, () => app.origin(), visible);
    return parsed ? { parsed, hits: runServiceQuery(parsed, dir, visible) } : null;
  });

  const result = $derived.by(() => {
    if (!q.trim()) return { hits: [] as Hit[], hidden: 0 };
    void app.settings.spoiler.level; void app.reveals; void app.discovery;
    if (svc) return { hits: svc.hits.map((hit) => ({ kind: 'service' as const, hit })), hidden: 0 };
    const nq = norm(q);
    const markers = app.visibleRecords
      .filter((r): r is MarkerRecord => r.kind === 'marker')
      .map((r) => ({ r, s: score(nq, norm(r.name)) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => ({ kind: 'marker' as const, rec: x.r }));
    const locs = searchLocations(index, q, visible, 40);
    return { hits: [...markers, ...locs.hits.map((loc) => ({ kind: 'loc' as const, loc }))], hidden: locs.hidden };
  });

  /** Names of the matching buildings in a town, spoiler-aware. */
  function namesIn(h: ServiceHit): string[] {
    const g = app.game!;
    const recs = g.directory().towns.get(h.loc.mapId)?.offers.get(svc!.parsed.service.key) ?? [];
    const ctx = { regionIndex: h.loc.region, regionName: REGION_NAMES[h.loc.region], locationName: h.loc.name, factions: g.factions };
    return recs.map((b) => {
      const name = buildingName(b.nameSeed, b.type, b.factionId, ctx);
      return name && app.serviceNameVisible(h.loc.mapId, name) ? name : '';
    }).filter(Boolean);
  }

  function choose(h: Hit) {
    open = false;
    if (h.kind === 'loc') app.goToLocation(h.loc);
    else if (h.kind === 'service') app.goToLocation(h.hit.loc);
    else { app.selection = { t: 'record', id: h.rec.id }; if (h.rec.anchor) app.goToAnchor(h.rec.anchor); }
  }

  function showAllOnMap() {
    if (!svc) return;
    app.settings.filter.service = svc.parsed.service.key;
    app.saveSettings();
    open = false;
    if (svc.parsed.region !== null) app.selection = { t: 'region', region: svc.parsed.region };
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, result.hits.length - 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); e.preventDefault(); }
    else if (e.key === 'Enter' && result.hits[active]) choose(result.hits[active]);
    else if (e.key === 'Escape') { open = false; input?.blur(); }
  }

  async function revealMatches() {
    const nq = norm(q);
    const hidden = index.filter((it) => score(nq, it.key) && !app.locationVisible(it.loc)).slice(0, 50);
    await app.revealMany(hidden.map((it) => ({ t: 'loc', mapId: it.loc.mapId })));
    app.toast(`Revealed ${hidden.length} location${hidden.length === 1 ? '' : 's'} in this profile.`, 'ok');
  }

  function globalKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' || (e.key === '/' && !(e.target as HTMLElement).closest('input, textarea'))) {
      e.preventDefault();
      input?.focus();
      input?.select();
    }
  }

  // "Find … near here" requests from the inspector's service chips.
  $effect(() => {
    const req = app.serviceQuery;
    if (!req || !app.game) return;
    const s = app.game.directory().services.get(req.key);
    if (s) { q = `${s.plural.toLowerCase()} near ${req.near.label}`; open = true; active = 0; input?.focus(); }
    app.serviceQuery = null;
  });

  const fmtDist = (d: number | null) => (d === null ? '' : d < 0.5 ? 'here' : `${d < 10 ? d.toFixed(1) : Math.round(d)}`);
</script>

<svelte:window onkeydown={globalKey} />

<div class="find">
  <Icon name="search" size={15} />
  <input
    bind:this={input}
    type="search"
    placeholder="Find a place, marker, or “armorer near Gothway Garden”…  (Ctrl+F)"
    bind:value={q}
    onfocus={() => (open = true)}
    oninput={() => { open = true; active = 0; }}
    onkeydown={onKey}
    onblur={() => setTimeout(() => (open = false), 150)}
    aria-label="Find a place or a service"
  />
  {#if open && q.trim()}
    <div class="results" role="listbox">
      {#if svc}
        <div class="svc-head">
          <strong>{svc.parsed.service.plural}</strong>
          <span class="muted">
            {#if svc.parsed.region !== null}in {REGION_NAMES[svc.parsed.region]}
            {:else if svc.parsed.near}nearest to {svc.parsed.near.label}
            {:else}everywhere (set “I'm here” to sort by distance){/if}
          </span>
          {#if svc.parsed.unresolved}<span class="warn">· couldn't find “{svc.parsed.unresolved}”</span>{/if}
          <span class="spacer"></span>
          <button class="small" onmousedown={(e) => { e.preventDefault(); showAllOnMap(); }}>Show all on map</button>
        </div>
      {/if}
      {#each result.hits as h, i}
        <button class="hit" class:active={i === active} onmousedown={(e) => { e.preventDefault(); choose(h); }} onmouseenter={() => (active = i)}>
          {#if h.kind === 'service'}
            {@const names = namesIn(h.hit)}
            <span class="dist mono" title="Map pixels, straight line">{fmtDist(h.hit.dist)}{h.hit.dir && h.hit.dir !== 'here' ? ` ${h.hit.dir}` : ''}</span>
            <span class="col tight">
              <span class="name">{h.hit.loc.name}{h.hit.count > 1 ? ` · ${h.hit.count}` : ''}</span>
              {#if names.length}<span class="sub">{names.join(' · ')}</span>{:else if svc?.parsed.service.category === 'shop'}<span class="sub faint">names unidentified</span>{/if}
            </span>
            <span class="ctx">{REGION_NAMES[h.hit.loc.region]} · {LOC_TYPES[h.hit.loc.type]?.label}</span>
          {:else if h.kind === 'loc'}
            <span class="dot" style:background={app.game ? `rgb(${[...app.game.fmapPal.slice(LOC_TYPES[h.loc.type].palIndex * 3, LOC_TYPES[h.loc.type].palIndex * 3 + 3)].join(',')})` : ''}></span>
            <span class="name">{h.loc.name}</span>
            <span class="ctx">{REGION_NAMES[h.loc.region]} · {LOC_TYPES[h.loc.type]?.label}</span>
          {:else}
            <span class="pinmark" style:color={app.planeColor(h.rec.plane)}><Icon name="pin" size={13} /></span>
            <span class="name">{h.rec.name}</span>
            <span class="ctx">{app.planeLabel(h.rec.plane)} marker · {app.describeAnchor(h.rec.anchor)}</span>
          {/if}
        </button>
      {:else}
        <div class="none">No visible matches.</div>
      {/each}
      {#if result.hidden}
        <div class="hidden-note">
          {result.hidden} more match{result.hidden === 1 ? '' : 'es'} hidden by your spoiler level.
          <button class="small" onmousedown={(e) => { e.preventDefault(); revealMatches(); }}>Reveal them</button>
        </div>
      {/if}
      {#if !svc}
        <div class="tip faint">Try “bookstores near Gothway Garden”, “mages guild near me”, “armorer in Wayrest”, or “temples”.</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .find { position: relative; display: flex; align-items: center; gap: 6px; width: min(460px, 48vw); color: var(--muted); }
  @media (max-width: 899px) { .find { flex: 1; width: auto; min-width: 0; } }
  @media (max-width: 639px) {
    .find :global(svg) { display: none; }
    .results { position: fixed; top: 48px; left: 6px; right: 6px; max-height: calc(100dvh - 150px); }
    .ctx { display: none; }
    .svc-head { font-size: 12px; }
  }
  input { flex: 1; min-width: 0; }
  .results {
    position: absolute; top: calc(100% + 6px); left: 0; right: -60px; max-height: 64vh; overflow: auto;
    background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); padding: 4px; z-index: 30;
  }
  .svc-head { display: flex; align-items: center; gap: 6px; padding: 6px 8px 8px; border-bottom: 1px solid var(--line-soft); margin-bottom: 4px; font-size: 12.5px; flex-wrap: wrap; }
  .svc-head strong { color: var(--gold); }
  .warn { color: var(--warn); }
  .hit { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; border: 0; background: transparent; padding: 6px 8px; }
  .hit.active { background: var(--panel-3); }
  .dot { width: 9px; height: 9px; border-radius: 2px; flex: none; outline: 1px solid #0008; }
  .pinmark { line-height: 0; }
  .name { color: var(--text); }
  .tight { gap: 0; min-width: 0; }
  .sub { font-size: 12px; color: var(--gold-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dist { width: 54px; flex: none; color: var(--muted); font-size: 11.5px; text-align: right; }
  .ctx { color: var(--muted); font-size: 12px; margin-left: auto; white-space: nowrap; padding-left: 8px; }
  .none { padding: 8px; color: var(--faint); }
  .hidden-note { padding: 8px; font-size: 12.5px; color: var(--muted); border-top: 1px solid var(--line-soft); display: flex; gap: 8px; align-items: center; justify-content: space-between; }
  .tip { padding: 6px 8px 4px; font-size: 12px; border-top: 1px solid var(--line-soft); }
</style>
