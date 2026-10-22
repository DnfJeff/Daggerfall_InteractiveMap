<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import type { DockTab } from '../lib/state/settings';
  import Icon from './Icon.svelte';
  import MapView from './map/MapView.svelte';
  import StatusBar from './StatusBar.svelte';
  import Composer from './Composer.svelte';
  import ProfilePicker from './ProfilePicker.svelte';
  import RightDock from './dock/RightDock.svelte';
  import BottomDock from './dock/BottomDock.svelte';
  import Splitter from './dock/Splitter.svelte';
  import { DOCK_TABS } from './dock/tabs';
  import DropZone from './DropZone.svelte';
  import ImportDialog from './ImportDialog.svelte';
  import SavePicker from './SavePicker.svelte';

  const L = $derived(app.settings.layout);
  let center: HTMLDivElement;
  let winW = $state(innerWidth);
  const narrow = $derived(winW < 900);

  const mapFocused = $derived(!L.bottomOpen || !L.bottomMax);

  function railTab(tab: DockTab) {
    if (L.bottomOpen && L.bottomTab === tab) L.bottomOpen = false;
    else { L.bottomTab = tab; L.bottomOpen = true; }
    app.saveLayout();
  }

  function dragRight(dx: number) {
    L.rightWidth = Math.round(Math.min(Math.max(260, winW * 0.6), Math.max(260, L.rightWidth - dx)));
  }
  function dragBottom(dy: number) {
    const max = (center?.clientHeight ?? 600) - 140;
    L.bottomHeight = Math.round(Math.min(max, Math.max(140, L.bottomHeight - dy)));
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'Escape') app.selection = null;
    else if (e.key === ']') { L.rightOpen = !L.rightOpen; app.saveLayout(); }
    else if (e.key === '`') { L.bottomOpen = !L.bottomOpen; if (!L.bottomOpen) L.bottomMax = false; app.saveLayout(); }
  }
</script>

<svelte:window onkeydown={onKey} bind:innerWidth={winW} />

<div class="ws" style:--right={L.rightOpen && !narrow ? `${L.rightWidth}px` : '0px'}>
  <nav class="rail" aria-label="Workspace">
    <button class="ghost" class:active={mapFocused} onclick={() => app.showMap()} title="Map">
      <Icon name="map" size={20} /><span>Map</span>
    </button>
    <div class="sep"></div>
    {#each DOCK_TABS.slice(0, 4) as t}
      <button class="ghost" class:active={L.bottomOpen && L.bottomTab === t.key} onclick={() => railTab(t.key)} title={t.label}>
        <Icon name={t.icon} size={20} /><span>{t.label}</span>
      </button>
    {/each}
    <div class="spacer"></div>
    {#each DOCK_TABS.slice(4) as t}
      <button class="ghost" class:active={L.bottomOpen && L.bottomTab === t.key} onclick={() => railTab(t.key)} title={t.label}>
        <Icon name={t.icon} size={20} /><span>{t.label.split(' ')[0]}</span>
      </button>
    {/each}
    <div class="sep"></div>
    <button class="ghost" class:active={L.rightOpen} onclick={() => { L.rightOpen = !L.rightOpen; app.saveLayout(); }} title="Inspector & map controls ( ] )">
      <Icon name="panel" size={20} /><span>Panels</span>
    </button>
  </nav>

  <div class="center" bind:this={center}>
    <div class="map-area" class:hidden={!mapFocused}>
      <MapView />
    </div>
    {#if L.bottomOpen && !L.bottomMax}
      <Splitter axis="y" label="Resize dock" ondrag={dragBottom} onend={() => app.saveLayout()} ondouble={() => { L.bottomMax = true; app.saveLayout(); }} />
    {/if}
    <div class="bottom" class:max={L.bottomOpen && L.bottomMax} style:height={L.bottomOpen ? (L.bottomMax ? 'auto' : `${L.bottomHeight}px`) : '34px'}>
      <BottomDock />
    </div>
  </div>

  {#if L.rightOpen}
    {#if !narrow}
      <div class="rsplit"><Splitter axis="x" label="Resize side panels" ondrag={dragRight} onend={() => app.saveLayout()} ondouble={() => { L.rightWidth = 340; app.saveLayout(); }} /></div>
    {/if}
    <aside class="right" class:drawer={narrow}><RightDock /></aside>
  {/if}

  <footer><StatusBar /></footer>
</div>

{#if app.composer}<Composer />{/if}
{#if app.showProfilePicker}<ProfilePicker />{/if}
{#if app.pendingImport}<ImportDialog />{/if}
{#if app.pendingSaves}<SavePicker />{/if}
<DropZone />

<style>
  .ws {
    height: 100%;
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr) auto var(--right);
    grid-template-rows: minmax(0, 1fr) 30px;
    grid-template-areas: 'rail center rsplit right' 'status status status status';
  }
  .rail {
    grid-area: rail; background: var(--panel); border-right: 1px solid var(--line-soft);
    display: flex; flex-direction: column; gap: 1px; padding: 6px 5px; overflow: hidden auto;
  }
  .rail button {
    display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 7px 0;
    font-size: 10.5px; color: var(--muted); border-radius: 8px;
  }
  .rail button.active { color: var(--gold); background: var(--panel-3); border-color: var(--line); }
  .rail .sep { height: 1px; background: var(--line-soft); margin: 4px 6px; }
  .center { grid-area: center; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .map-area { flex: 1; min-height: 120px; position: relative; overflow: hidden; }
  .map-area.hidden { flex: 0; min-height: 0; visibility: hidden; }
  .bottom { flex: none; min-height: 34px; display: flex; flex-direction: column; }
  .bottom.max { flex: 1; }
  .rsplit { grid-area: rsplit; display: flex; }
  .right { grid-area: right; min-width: 0; min-height: 0; border-left: 1px solid var(--line-soft); overflow: hidden; }
  .right.drawer {
    position: fixed; right: 0; top: 0; bottom: 30px; width: min(360px, 92vw); z-index: 30; box-shadow: var(--shadow);
  }
  footer { grid-area: status; }
</style>
