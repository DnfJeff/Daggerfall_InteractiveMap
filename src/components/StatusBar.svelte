<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import { SPOILER_PRESETS, type SpoilerLevel } from '../lib/state/settings';
  import { formatGameTime } from '../lib/df/save';
  import Icon from './Icon.svelte';

  const profile = $derived(app.activeProfile);
  const bound = $derived(app.boundSave?.summary ?? null);
  const bindingBroken = $derived(!!profile?.binding && !bound && app.sources[profile.binding.runtime === 'dfo' ? 'dfoSaves' : 'dfuSaves'].state === 'ok');

  async function setLevel(e: Event) {
    app.settings.spoiler.level = (e.target as HTMLSelectElement).value as SpoilerLevel;
    await app.saveSettings();
  }
  async function refreshAll() {
    await app.refresh('arena2');
    await app.refreshSaves(true);
  }
</script>

<div class="bar">
  <button class="seg profile" onclick={() => (app.showProfilePicker = true)} title="Switch playthrough profile">
    {#if profile}
      <span class="swatch" style:background={profile.color}></span><strong>{profile.name}</strong>
    {:else}
      <span class="swatch atlas"></span><span class="muted">No profile · Atlas only</span>
    {/if}
  </button>

  <span class="seg" title="Save the active profile reads">
    {#if bound}
      <span class="muted">{bound.runtime === 'dfo' ? 'DFO' : 'DFU'}:</span> {bound.characterName} · <span class="mono">{bound.folder}</span>
      <span class="faint">({formatGameTime(bound.gameTime)})</span>
    {:else if bindingBroken}
      <span class="warn">Bound save not found</span>
    {:else if profile}
      <span class="faint">No save bound</span>
    {:else}
      <span class="faint">—</span>
    {/if}
  </span>

  <span class="spacer"></span>

  <label class="seg" title="Spoiler level">
    <Icon name="eye" size={14} />
    <select value={app.settings.spoiler.level} onchange={setLevel}>
      {#each Object.entries(SPOILER_PRESETS) as [k, p]}<option value={k}>{p.title}</option>{/each}
    </select>
  </label>

  {#if !app.storage.persisted && !app.desktop}
    <button class="seg warnbtn" onclick={() => app.openDock('data')} title="Storage may be cleared by the browser — open Data to fix">
      <Icon name="shield" size={14} /> Not persistent
    </button>
  {/if}

  {#if app.dataMode === 'files' || app.sources.dfuSaves.state === 'ok' || app.sources.dfoSaves.state === 'ok'}
  <button class="seg" onclick={refreshAll} title="Re-read game data and saves"><Icon name="refresh" size={14} /> Refresh</button>
  {/if}
</div>

<style>
  .bar {
    height: 100%; display: flex; align-items: stretch; background: #0e0f12; border-top: 1px solid var(--line-soft);
    font-size: 12.5px; padding: 0 6px; gap: 2px; overflow: hidden; white-space: nowrap;
  }
  .seg { display: flex; align-items: center; gap: 6px; padding: 0 10px; border: 0; border-radius: 0; background: transparent; }
  button.seg:hover { background: var(--panel-2); }
  .swatch { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .swatch.atlas { background: var(--atlas); }
  select { background: transparent; border: 0; padding: 0 2px; color: var(--gold); font-weight: 600; }
  .warn { color: var(--warn); }
  .warnbtn { color: var(--warn); }
</style>
