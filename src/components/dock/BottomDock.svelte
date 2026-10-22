<script lang="ts">
  import { app } from '../../lib/state/app.svelte';
  import type { DockTab } from '../../lib/state/settings';
  import Icon from '../Icon.svelte';
  import Bestiary from '../Bestiary.svelte';
  import Journal from '../Journal.svelte';
  import Character from '../Character.svelte';
  import Guides from '../Guides.svelte';
  import DataManager from '../DataManager.svelte';
  import Preferences from '../Preferences.svelte';
  import { DOCK_TABS } from './tabs';


  const L = $derived(app.settings.layout);

  function pick(tab: DockTab) {
    if (L.bottomOpen && L.bottomTab === tab) L.bottomOpen = false;
    else { L.bottomTab = tab; L.bottomOpen = true; }
    app.saveLayout();
  }
</script>

<div class="bdock" class:open={L.bottomOpen}>
  <div class="tabs" role="tablist">
    {#each DOCK_TABS as t}
      <button role="tab" class="tab" class:active={L.bottomOpen && L.bottomTab === t.key} aria-selected={L.bottomOpen && L.bottomTab === t.key} onclick={() => pick(t.key)}>
        <Icon name={t.icon} size={14} /> {t.label}
      </button>
    {/each}
    <span class="spacer"></span>
    {#if L.bottomOpen}
      <button class="ghost icon" title={L.bottomMax ? 'Restore (show map)' : 'Maximise'} onclick={() => { L.bottomMax = !L.bottomMax; app.saveLayout(); }}>
        <Icon name={L.bottomMax ? 'down' : 'up'} size={15} />
      </button>
      <button class="ghost icon" title="Close dock (`)" onclick={() => { L.bottomOpen = false; L.bottomMax = false; app.saveLayout(); }}><Icon name="close" size={15} /></button>
    {:else}
      <button class="ghost icon" title="Open dock (`)" onclick={() => { L.bottomOpen = true; app.saveLayout(); }}><Icon name="up" size={15} /></button>
    {/if}
  </div>
  {#if L.bottomOpen}
    <div class="page-host">
      {#if L.bottomTab === 'bestiary'}<Bestiary />
      {:else if L.bottomTab === 'journal'}<Journal />
      {:else if L.bottomTab === 'character'}<Character />
      {:else if L.bottomTab === 'guides'}<Guides />
      {:else if L.bottomTab === 'data'}<DataManager />
      {:else if L.bottomTab === 'prefs'}<Preferences />
      {/if}
    </div>
  {/if}
</div>

<style>
  .bdock { display: flex; flex-direction: column; height: 100%; background: var(--panel); min-height: 0; }
  .tabs {
    flex: none; height: 34px; display: flex; align-items: stretch; gap: 0; padding: 0 6px; background: #17181d;
    border-top: 1px solid var(--line-soft); border-bottom: 1px solid var(--line-soft); overflow-x: auto; overflow-y: hidden;
  }
  .tab {
    display: flex; align-items: center; gap: 6px; border: 0; border-radius: 0; background: transparent; color: var(--muted);
    padding: 0 12px; font-size: 12.5px; white-space: nowrap; border-bottom: 2px solid transparent;
  }
  .tab:hover { background: var(--panel-2); color: var(--text); }
  .tab.active { color: var(--gold); border-bottom-color: var(--gold); background: var(--panel); }
  .tabs .icon { align-self: center; }
  .page-host { position: relative; flex: 1; min-height: 0; overflow: hidden; }
</style>
