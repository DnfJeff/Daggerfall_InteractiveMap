<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import { SPOILER_PRESETS, type SpoilerLevel } from '../lib/state/settings';
  import Sources from './Sources.svelte';
  import { WEB } from '../lib/flavor';

  const save = () => app.saveSettings();
  const MOVERS = /atlas of the iliac|tavern|shop.*name|betony|hidden map|basic roads|world of daggerfall|location loader|roads/i;
  const notable = $derived(app.dfuMods.filter((m) => MOVERS.test(m)));
  let roadsInput: HTMLInputElement | undefined = $state();

  async function pickRoads(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) await app.loadRoads(f, f.name);
    (e.target as HTMLInputElement).value = '';
  }
</script>

<div class="page">
  <section class="card">
    <div class="title">{WEB ? 'Map data' : 'Folders'}</div>
    <Sources />
    {#if app.dfuMods.length}
      <details>
        <summary class="muted small">{app.dfuMods.length} mods installed{notable.length ? ` · ${notable.length} may change places or names` : ''}</summary>
        <div class="mods">{#each app.dfuMods as m}<span class="chip" class:hot={notable.includes(m)}>{m}</span>{/each}</div>
        {#if notable.length}
          <p class="faint small">The map shows vanilla data. With a bound save, building names your character has seen come from the save, so mod renames show there.</p>
        {/if}
      </details>
    {/if}
    <p class="faint small">Nothing is searched for automatically. Each folder is one you chose; press Refresh after changing your install or saving the game.</p>
  </section>

  <section class="card">
    <div class="title">Roads &amp; water</div>
    <p class="small">{app.roadsStatus}</p>
    <div class="row wrap">
      {#if !WEB}
        <input bind:this={roadsInput} type="file" accept=".dfmod" hidden onchange={pickRoads} />
        <button class="small" onclick={() => roadsInput?.click()}>Choose basicroads.dfmod…</button>
      {/if}
      <span class="faint small">Roads, tracks, rivers and streams come from the Basic Roads mod (Hazelnut). Toggle them in Map controls.</span>
    </div>
  </section>

  <section class="card">
    <div class="title">Spoilers</div>
    <div class="presets">
      {#each Object.entries(SPOILER_PRESETS) as [k, p]}
        <label class="preset" class:active={app.settings.spoiler.level === k}>
          <input type="radio" name="lvl" value={k} checked={app.settings.spoiler.level === k} onchange={() => { app.settings.spoiler.level = k as SpoilerLevel; save(); }} />
          <span><strong>{p.title}</strong><small>{p.blurb}</small></span>
        </label>
      {/each}
    </div>
    <div class="overrides">
      <label>Locations
        <select bind:value={app.settings.spoiler.locations} onchange={save}>
          <option value="auto">Follow level</option><option value="all">Show all</option><option value="known">Only known / revealed</option>
        </select>
      </label>
      <label>Shop, tavern &amp; guild names
        <select bind:value={app.settings.spoiler.shopNames} onchange={save}>
          <option value="auto">Follow level</option><option value="show">Show</option><option value="hide">Hide until revealed</option>
        </select>
      </label>
      <label>Dungeon layouts
        <select bind:value={app.settings.spoiler.dungeonLayouts} onchange={save}>
          <option value="auto">Follow level</option><option value="show">Show</option><option value="hide">Hide</option>
        </select>
      </label>
      <label class="row check">
        <input type="checkbox" bind:checked={app.settings.spoiler.useSaveDiscovery} onchange={save} />
        Treat what the bound character has discovered as revealed
      </label>
    </div>
    <p class="faint small">Reveals are remembered per Profile, so revealing something in one playthrough never spoils the next.</p>
  </section>

  <section class="card">
    <div class="title">Display</div>
    <div class="overrides">
      <label>Atlas / playthrough badges
        <select bind:value={app.settings.display.planeStyle} onchange={save}>
          <option value="subtle">Subtle outline</option><option value="strong">Strong fill</option>
        </select>
      </label>
      <label class="row check"><input type="checkbox" bind:checked={app.settings.display.killCounters} onchange={save} /> Show kill counters in the bestiary</label>
    </div>
    <p class="faint small">Label tiers, layers and marker size are in the Map controls panel. Map art comes from your ARENA2 folder (vanilla).</p>
  </section>

  <section class="card">
    <div class="title">Workspace</div>
    <div class="row wrap">
      <button class="small" onclick={() => { app.settings.layout = { ...app.settings.layout, rightOpen: true, rightWidth: 340, rightSplit: 0.58, inspectorOpen: true, controlsOpen: true, bottomHeight: 340, bottomMax: false, sections: {} }; save(); }}>Reset panel layout</button>
      <button class="small" onclick={() => { app.settings.firstRunDone = false; save(); }}>Show the welcome screen again</button>
    </div>
    <dl class="kv small">
      <dt>World fingerprint</dt><dd class="mono">{app.game?.fingerprint ?? '—'}</dd>
    </dl>
    <p class="faint small">Identifies the game data your Atlas was built on; imports made against different data are flagged.</p>
  </section>
</div>

<style>
  .page { position: absolute; inset: 0; overflow: auto; padding: 14px 18px 30px; display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 12px; align-content: start; }
  .small { font-size: 12.5px; }
  .presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 8px 0; }
  @media (max-width: 760px) { .presets { grid-template-columns: 1fr; } }
  .preset { display: flex; gap: 8px; padding: 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
  .preset.active { border-color: var(--gold-dim); }
  .preset small { display: block; color: var(--muted); font-size: 12px; line-height: 1.3; }
  .preset strong { display: block; }
  .preset.active strong { color: var(--gold); }
  .overrides { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px 14px; margin-top: 8px; }
  .overrides label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); }
  .overrides label.check { flex-direction: row; align-items: center; grid-column: 1 / -1; color: var(--text); }
  .mods { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0; }
  .chip.hot { color: var(--warn); border-color: #6b5427; }
  details summary { cursor: pointer; margin-top: 8px; }
  section { display: flex; flex-direction: column; gap: 6px; }
</style>
