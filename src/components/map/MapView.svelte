<script lang="ts">
  import { app } from '../../lib/state/app.svelte';
  import { REGION_NAMES } from '../../lib/df/constants';
  import Icon from '../Icon.svelte';
  import FindBox from './FindBox.svelte';
  import FileMenu from '../FileMenu.svelte';
  import OverviewMap from './OverviewMap.svelte';
  import WorldMap from './WorldMap.svelte';
  import TownMap from './TownMap.svelte';

  const town = $derived(app.townMapId !== null ? app.game?.maps.locationByMapId(app.townMapId) ?? null : null);
  let focusRegion = $state<number | null>(null);
</script>

<div class="mapview">
  <div class="top">
    <nav class="crumbs" aria-label="Map level">
      <button class="ghost small" class:here={app.mapLevel === 'overview'} onclick={() => (app.mapLevel = 'overview')}>Iliac Bay</button>
      <span class="sep">›</span>
      <button class="ghost small" class:here={app.mapLevel === 'world'} onclick={() => (app.mapLevel = 'world')}>
        {app.mapLevel === 'town' && town ? REGION_NAMES[town.region] : 'Regions'}
      </button>
      {#if town && app.mapLevel === 'town'}
        <span class="sep">›</span>
        <button class="ghost small here">{town.name}</button>
      {/if}
    </nav>
    <FindBox />
    <span class="spacer"></span>
    <FileMenu />
    {#if !app.settings.layout.rightOpen}
      <button class="small" onclick={() => { app.settings.layout.rightOpen = true; app.saveLayout(); }} title="Inspector & map controls ( ] )"><Icon name="panel" size={15} /> Panels</button>
    {/if}
  </div>

  <div class="stage">
    {#if !app.game}
      <div class="empty-state">Game data not loaded.</div>
    {:else if app.mapLevel === 'overview'}
      <OverviewMap onpick={(r) => { focusRegion = r; app.mapLevel = 'world'; }} />
    {:else if app.mapLevel === 'world'}
      <WorldMap {focusRegion} onfocused={() => (focusRegion = null)} />
    {:else if app.mapLevel === 'town' && town}
      <TownMap loc={town} />
    {/if}
  </div>

  {#if app.mapLevel === 'town'}
    <button class="back small" onclick={() => { app.mapLevel = 'world'; if (town) app.flyTo(town.x + 0.5, town.y + 0.5, 24); }}>
      <Icon name="back" size={14} /> Back to region
    </button>
  {/if}
</div>

<style>
  .mapview { position: absolute; inset: 0; display: flex; flex-direction: column; }
  .top {
    display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--panel);
    border-bottom: 1px solid var(--line-soft); position: relative; z-index: 6;
  }
  .crumbs { display: flex; align-items: center; gap: 2px; white-space: nowrap; flex: none; }
  .crumbs button { color: var(--muted); }
  .crumbs button.here { color: var(--gold); }
  .sep { color: var(--faint); }
  .stage { flex: 1; position: relative; min-height: 0; }
  .empty-state { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); }
  .back { position: absolute; left: 12px; bottom: 12px; z-index: 4; display: flex; align-items: center; gap: 4px; }
</style>
