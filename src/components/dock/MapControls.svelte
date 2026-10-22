<script lang="ts">
  import { app } from '../../lib/state/app.svelte';
  import { LOC_TYPES, LocType, type LayerKey } from '../../lib/df/constants';
  import { LABEL_CLASSES, NOTCH } from '../../lib/map/labelClasses';
  import { worldLayers } from '../../lib/map/layers';
  import { defaultLabelClasses } from '../../lib/state/settings';
  import Section from './Section.svelte';

  const L = $derived(app.settings.layers);
  const F = $derived(app.settings.filter);
  const groups = $derived.by(() => {
    const cat = app.game?.directory().catalog() ?? [];
    return [
      { label: 'Shops & services', items: cat.filter((s) => s.category === 'shop' || s.category === 'travel') },
      { label: 'Guilds & orders', items: cat.filter((s) => s.category === 'guild') },
      { label: 'Temples', items: cat.filter((s) => s.category === 'temple') },
    ].filter((g) => g.items.length);
  });
  const save = () => app.saveSettings();
  const layers = $derived(app.game ? worldLayers(app.game) : null);

  const filters: { k: LayerKey; label: string; types: number[] }[] = [
    { k: 'towns', label: 'Towns & taverns', types: [LocType.City, LocType.Town, LocType.Village, LocType.Tavern] },
    { k: 'dungeons', label: 'Dungeons', types: [LocType.DungeonLarge, LocType.DungeonMedium, LocType.DungeonSmall, LocType.Graveyard, LocType.Coven] },
    { k: 'temples', label: 'Temples & shrines', types: [LocType.Temple, LocType.Shrine] },
    { k: 'homes', label: 'Homes & farms', types: [LocType.Manor, LocType.Farm, LocType.Shack] },
  ];
  const counts = $derived.by(() => {
    const c: Record<string, number> = {};
    if (!app.game) return c;
    void app.reveals; void app.discovery; void app.settings.spoiler;
    for (const l of app.game.maps.locations) {
      const k = LOC_TYPES[l.type]?.layer;
      if (k && app.locationVisible(l)) c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  });

  function toggle(k: keyof typeof app.settings.layers) {
    app.settings.layers[k] = !app.settings.layers[k];
    save();
  }

  // ---- label tiers ----
  const tiers = $derived(app.settings.labels.classes);
  const zoom = $derived(app.mapZoom);
  const showingCount = $derived(LABEL_CLASSES.filter((c) => tiers[c.key]?.on && zoom >= (tiers[c.key]?.zoom ?? c.defaultZoom)).length);
  // Slider works in log space so each step feels like a wheel notch.
  const toSlider = (z: number) => Math.log(z) / Math.log(NOTCH);
  const fromSlider = (v: number) => +Math.pow(NOTCH, v).toFixed(2);
  const MIN = toSlider(1), MAX = toSlider(60);

  function setTier(key: string, patch: Partial<{ on: boolean; zoom: number }>) {
    const cur = tiers[key] ?? { on: true, zoom: LABEL_CLASSES.find((c) => c.key === key)!.defaultZoom };
    app.settings.labels.classes[key] = { ...cur, ...patch };
    app.saveLayout();
  }
  function shiftAll(notches: number) {
    for (const c of LABEL_CLASSES) {
      const cur = tiers[c.key] ?? { on: true, zoom: c.defaultZoom };
      app.settings.labels.classes[c.key] = { ...cur, zoom: +Math.min(60, Math.max(1, cur.zoom * Math.pow(NOTCH, notches))).toFixed(2) };
    }
    save();
  }
  function resetTiers() { app.settings.labels.classes = defaultLabelClasses(); save(); }
  function dotColor(type: number) { return layers?.dotColor.get(type) ?? '#888'; }
</script>

<div class="controls">
  <Section id="ctl.filters" title="Places" meta={`${Object.values(counts).reduce((a, b) => a + b, 0).toLocaleString()} shown`}>
    {#each filters as f}
      <div class="filter">
        <label class="row"><input type="checkbox" checked={L[f.k]} onchange={() => toggle(f.k)} /> {f.label}</label>
        <span class="faint n">{(counts[f.k] ?? 0).toLocaleString()}</span>
      </div>
      <div class="legend">
        {#each f.types as t}<span><i style:background={dotColor(t)}></i>{LOC_TYPES[t].label}</span>{/each}
      </div>
    {/each}
    <label class="row sub"><input type="checkbox" checked={L.townSize} onchange={() => toggle('townSize')} /> Size settlement dots by town footprint</label>
    <label class="row sub"><input type="checkbox" bind:checked={app.settings.filter.hideCleared} onchange={save} /> Hide dungeons marked cleared</label>
  </Section>

  <Section id="ctl.has" title="Only places with…" meta={F.service ? `${(app.serviceMatches?.size ?? 0).toLocaleString()} match` : undefined}>
    <select value={F.service ?? ''} onchange={(e) => { F.service = (e.target as HTMLSelectElement).value || null; save(); }}>
      <option value="">Anything (no filter)</option>
      {#each groups as grp}
        <optgroup label={grp.label}>
          {#each grp.items as s}<option value={s.key}>{s.label} ({app.game?.directory().where.get(s.key)?.length ?? 0})</option>{/each}
        </optgroup>
      {/each}
    </select>
    {#if F.service}
      <div class="row">
        <label class="row"><input type="radio" bind:group={F.mode} value="dim" onchange={save} /> Dim others</label>
        <label class="row"><input type="radio" bind:group={F.mode} value="hide" onchange={save} /> Hide others</label>
        <span class="spacer"></span>
        <button class="small ghost" onclick={() => { F.service = null; save(); }}>Clear</button>
      </div>
    {/if}
    <p class="faint small">Also from search: “bookstores near Gothway Garden” → Show all on map.</p>
  </Section>

  <Section id="ctl.paths" title="Roads & water" meta={app.roads ? undefined : 'not loaded'}>
    <div class="grid2">
      <label class="row"><input type="checkbox" checked={L.roads} onchange={() => toggle('roads')} disabled={!app.roads?.networks.road} /><i class="sw road"></i>Roads</label>
      <label class="row"><input type="checkbox" checked={L.tracks} onchange={() => toggle('tracks')} disabled={!app.roads?.networks.track} /><i class="sw track"></i>Tracks</label>
      <label class="row"><input type="checkbox" checked={L.rivers} onchange={() => toggle('rivers')} disabled={!app.roads?.networks.river} /><i class="sw river"></i>Rivers</label>
      <label class="row"><input type="checkbox" checked={L.streams} onchange={() => toggle('streams')} disabled={!app.roads?.networks.stream} /><i class="sw stream"></i>Streams</label>
    </div>
    <p class="faint small">{app.roadsStatus}</p>
    {#if !app.roads}
      <button class="small" onclick={() => app.openDock('prefs')}>Set DFU install folder…</button>
    {/if}
  </Section>

  <Section id="ctl.labels" title="Labels" meta={`zoom ×${zoom.toFixed(1)} · ${showingCount}/${LABEL_CLASSES.length} tiers`}>
    <label class="row"><input type="checkbox" checked={L.labels} onchange={() => toggle('labels')} /> Show place labels</label>
    <div class="tiers" class:off={!L.labels}>
      {#each LABEL_CLASSES as c}
        {@const t = tiers[c.key] ?? { on: true, zoom: c.defaultZoom }}
        {@const live = t.on && zoom >= t.zoom}
        <div class="tier" class:live>
          <input type="checkbox" checked={t.on} onchange={() => setTier(c.key, { on: !t.on })} aria-label={`Show ${c.label} labels`} />
          <span class="name" style:color={c.color}>{c.label}</span>
          <input type="range" min={MIN} max={MAX} step="0.25" value={toSlider(t.zoom)} disabled={!t.on}
            oninput={(e) => setTier(c.key, { zoom: fromSlider(+(e.target as HTMLInputElement).value) })}
            aria-label={`${c.label} labels appear from zoom`} />
          <span class="z mono">×{t.zoom.toFixed(1)}</span>
        </div>
      {/each}
      <div class="zbar" aria-hidden="true">
        <span class="cursor" style:left="{Math.min(100, Math.max(0, ((toSlider(Math.max(1, zoom)) - MIN) / (MAX - MIN)) * 100))}%"></span>
      </div>
    </div>
    <div class="row wrap">
      <button class="small" onclick={() => shiftAll(1)} title="Every tier appears one notch later">Sparser</button>
      <button class="small" onclick={() => shiftAll(-1)} title="Every tier appears one notch sooner">Denser</button>
      <button class="small ghost" onclick={resetTiers}>Reset</button>
    </div>
    <label class="row"><input type="checkbox" bind:checked={app.settings.labels.notedFirst} onchange={save} /> Places with notes always labelled</label>
    <label class="row"><input type="checkbox" bind:checked={app.settings.labels.overlap} onchange={save} /> Allow overlapping labels</label>
    <p class="faint small">Higher tiers win when labels collide: settlements, then temples and taverns, then dungeons, then homes. Lit rows are showing at the current zoom.</p>
  </Section>

  <Section id="ctl.overlays" title="Overlays">
    <label class="row"><input type="checkbox" checked={L.borders} onchange={() => toggle('borders')} /> Region borders</label>
    <label class="row slider sub">Border strength
      <input type="range" min="1" max="4" step="0.5" bind:value={app.settings.display.borderWeight} disabled={!L.borders} oninput={() => app.saveLayout()} />
    </label>
    <label class="row"><input type="checkbox" checked={L.player} onchange={() => toggle('player')} /> Character position (bound save)</label>
  </Section>

  <Section id="ctl.notes" title="Your notes">
    <label class="row"><input type="checkbox" checked={L.markers} onchange={() => toggle('markers')} /> Markers & note dots</label>
    <label class="row"><input type="checkbox" checked={L.atlas} onchange={() => toggle('atlas')} /><span style:color="var(--atlas)">◆</span> Atlas</label>
    <label class="row"><input type="checkbox" checked={L.playthrough} onchange={() => toggle('playthrough')} /><span style:color={app.activeProfile?.color ?? 'var(--play)'}>●</span> {app.activeProfile?.name ?? 'This playthrough'}</label>
    <label class="row slider">Marker size
      <input type="range" min="0.7" max="1.6" step="0.1" bind:value={app.settings.display.markerScale} onchange={save} />
    </label>
  </Section>
</div>

<style>
  .controls { font-size: 13px; }
  .small { font-size: 12px; margin: 0; }
  .filter { display: flex; justify-content: space-between; align-items: center; }
  .n { font-size: 12px; font-variant-numeric: tabular-nums; }
  .legend { display: flex; flex-wrap: wrap; gap: 2px 10px; margin: -4px 0 4px 24px; font-size: 11.5px; color: var(--muted); }
  .legend i { display: inline-block; width: 8px; height: 8px; margin-right: 4px; outline: 1px solid #0009; }
  .sub { color: var(--muted); }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .sw { display: inline-block; width: 18px; height: 0; border-top: 3px solid; }
  .sw.road { border-color: #d9c08a; }
  .sw.track { border-top-style: dashed; border-color: #a88c62; border-top-width: 2px; }
  .sw.river { border-color: #4f8fd8; }
  .sw.stream { border-color: #6aa4e0; border-top-width: 2px; }
  .tiers { display: flex; flex-direction: column; gap: 1px; position: relative; }
  .tiers.off { opacity: 0.45; }
  .tier { display: grid; grid-template-columns: 18px 1fr 96px 42px; align-items: center; gap: 6px; padding: 2px 4px; border-radius: 4px; }
  .tier.live { background: rgba(242, 213, 91, 0.07); }
  .tier .name { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.55; }
  .tier.live .name { opacity: 1; }
  .tier input[type='range'] { width: 100%; accent-color: var(--gold-dim); }
  .z { text-align: right; color: var(--faint); font-size: 11.5px; }
  /* Sits under the slider column: shows where the current zoom falls. */
  .zbar { position: relative; height: 6px; width: 96px; margin: 2px 52px 0 auto; border-top: 1px solid var(--line-soft); }
  .cursor { position: absolute; top: 0; width: 2px; height: 6px; background: var(--gold); transform: translateX(-1px); }
  .slider { justify-content: space-between; }
</style>
