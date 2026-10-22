<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import { WEB } from '../lib/flavor';
  import { formatGameTime, RUNTIME_LABEL } from '../lib/df/save';
  import { REGION_NAMES } from '../lib/df/constants';

  const s = $derived(app.boundSave);
  const ch = $derived(s?.character ?? null);
  const pos = $derived(s?.position ?? null);
  const here = $derived(pos && app.game ? app.game.maps.locationAt(Math.floor(pos.x), Math.floor(pos.y)) : null);
  const region = $derived(pos && app.game ? app.game.regionAt(Math.floor(pos.x), Math.floor(pos.y)) : -1);
  const skills = $derived(ch ? Object.entries(ch.skills).sort((a, b) => b[1] - a[1]) : []);
  const LANGS = new Set(['Orcish', 'Harpy', 'Giantish', 'Dragonish', 'Nymph', 'Daedric', 'Spriggan', 'Centaurian', 'Impish']);
</script>

<div class="page">
  {#if !app.activeProfile}
    <div class="empty-state">
      <h2>No playthrough open</h2>
      <p class="muted">The character view reads the save your Profile is bound to. It never edits saves.</p>
      <button class="primary" onclick={() => (app.showProfilePicker = true)}>Open or create a Profile</button>
    </div>
  {:else if !s}
    <div class="empty-state">
      <h2>{app.activeProfile.name}</h2>
      <p class="muted">
        {#if WEB}Drop your Daggerfall save folder anywhere on the page (or File → Capture my character) to copy your character into this playthrough.
        {:else if app.sources.dfuSaves.state !== 'ok' && app.sources.dfoSaves.state !== 'ok'}Choose your saves folder in Preferences and bind this profile to a character, or drop a save folder on the page to capture it.
        {:else if !app.activeProfile.binding}This profile isn't bound to a save.
        {:else}The bound save wasn't found. It may have been deleted or renamed.{/if}
      </p>
      <div class="row">
        <button onclick={() => app.openDock('prefs')}>Preferences</button>
        <button class="primary" onclick={() => (app.showProfilePicker = true)}>Edit profile binding</button>
      </div>
    </div>
  {:else}
    <header class="row wrap">
      <h2>{ch?.name ?? s.summary.characterName}</h2>
      {#if ch}<span class="muted">Level {ch.level} {ch.gender} {ch.race} {ch.career}</span>{/if}
      <span class="spacer"></span>
      <span class="faint small">{s.summary.folder} · “{s.summary.saveName}” · saved {new Date(s.summary.realTime).toLocaleString()}</span>
      <button class="small" onclick={() => app.refreshSaves(true)}>Refresh</button>
    </header>

    <div class="grid">
      <div class="card col">
        {#if s.screenshotUrl}<img class="shot" src={s.screenshotUrl} alt="Save screenshot" />{/if}
        <dl class="kv">
          <dt>Date</dt><dd>{formatGameTime(s.summary.gameTime)}</dd>
          {#if ch}<dt>Health</dt><dd>{ch.health[0]} / {ch.health[1]}</dd><dt>Gold</dt><dd>{ch.gold.toLocaleString()}</dd>{/if}
          {#if pos}
            <dt>Where</dt>
            <dd>
              {here ? here.name : region >= 0 ? 'Wilderness' : 'At sea'}{region >= 0 ? `, ${REGION_NAMES[region]}` : ''}
              {pos.inDungeon ? ' (in a dungeon)' : pos.inBuilding ? ' (indoors)' : ''}
            </dd>
          {/if}
          <dt>Places known</dt><dd>{s.discovery.locations.size}</dd>
          <dt>Game</dt><dd>{RUNTIME_LABEL[s.summary.runtime]}{s.summary.format !== s.summary.runtime ? ` (imported ${RUNTIME_LABEL[s.summary.format]} save)` : ''}</dd>
        </dl>
        {#if pos}<button class="primary" onclick={() => app.flyTo(pos.x, pos.y, 30)}>Show on map</button>{/if}
      </div>

      {#if ch}
        <div class="card">
          <div class="title">Attributes</div>
          <div class="stats">
            {#each Object.entries(ch.stats) as [k, v]}
              <div class="stat"><span>{k.slice(0, 3).toUpperCase()}</span><strong>{v}</strong><i style:width="{Math.min(100, v)}%"></i></div>
            {/each}
          </div>
        </div>
        <div class="card">
          <div class="title">Skills</div>
          <div class="skills">
            {#each skills as [k, v]}
              <div class="skill" class:lang={LANGS.has(k)}><span>{k.replace(/([a-z])([A-Z])/g, '$1 $2')}</span><strong>{v}</strong></div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .page { position: absolute; inset: 0; overflow: auto; padding: 16px 20px; }
  h2 { color: var(--gold); font-size: 20px; }
  header { margin-bottom: 14px; gap: 10px; }
  .small { font-size: 12.5px; }
  .empty-state { max-width: 460px; margin: 10vh auto; display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; align-items: start; }
  .shot { width: 100%; border-radius: 6px; border: 1px solid var(--line); }
  .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 16px; margin-top: 8px; }
  .stat { display: grid; grid-template-columns: 40px 1fr; align-items: center; position: relative; padding-bottom: 5px; }
  .stat span { color: var(--muted); font-size: 12px; }
  .stat strong { text-align: right; }
  .stat i { position: absolute; left: 40px; bottom: 0; height: 3px; background: var(--gold-dim); border-radius: 2px; max-width: calc(100% - 40px); }
  .skills { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 3px 14px; margin-top: 8px; font-size: 13px; }
  .skill { display: flex; justify-content: space-between; border-bottom: 1px dotted var(--line-soft); }
  .skill.lang span { color: var(--muted); font-style: italic; }
</style>
