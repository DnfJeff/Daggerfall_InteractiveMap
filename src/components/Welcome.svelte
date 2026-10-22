<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import { SPOILER_PRESETS, type SpoilerLevel } from '../lib/state/settings';
  import Sources from './Sources.svelte';
  import { PRODUCT } from '../lib/flavor';
  import { onMount } from 'svelte';
  let builtin = $state(false);
  onMount(async () => (builtin = await app.hasBuiltInData()));
  async function useBuiltin() { await app.useBuiltInData(); if (app.game) await begin(); }

  const returning = $derived(app.settings.firstRunDone);
  const gameOk = $derived(app.sources.arena2.state === 'ok' && !!app.game);

  async function choose(level: SpoilerLevel) {
    app.settings.spoiler.level = level;
    await app.saveSettings();
  }

  async function begin() {
    app.settings.firstRunDone = true;
    await app.saveSettings();
    app.mapLevel = 'overview';
  }
</script>

<div class="welcome">
  <div class="panel">
    <div class="brand">
      <div class="title">{PRODUCT}</div>
      <h1>{returning ? 'Welcome back' : 'Point me at your game'}</h1>
      <p class="muted">
        {#if returning}
          Your notes are safe in this browser. Reconnect your game folder to bring the map back.
        {:else}
          The map, art and names all come from your own Daggerfall install. Nothing is uploaded; everything stays on this computer.
        {/if}
      </p>
    </div>

    <section>
      {#if builtin && !gameOk}
        <div class="quick">
          <button class="primary big" onclick={useBuiltin}>Open the map now</button>
          <span class="muted small">Uses the map data built into this app. No game files needed; you can point it at your own ARENA2 any time.</span>
        </div>
      {/if}
      <div class="step">1 · Game data <span class="faint small">(or your own files)</span></div>
      <Sources />
      {#if import.meta.env.DEV}
        <button class="small" onclick={() => app.useDevData()}>Dev: reload data from the dev server</button>
      {/if}
      {#if app.sources.arena2.state === 'loading'}
        <p class="muted">{app.loadProgress}…</p>
      {/if}
      {#if !app.fsAccess}
        <p class="warn">This browser cannot remember folders, so you'll choose them each visit. Chrome or Edge remember them.</p>
      {/if}
    </section>

    {#if !returning}
      <section>
        <div class="step">2 · How much should the map tell you?</div>
        <div class="presets">
          {#each Object.entries(SPOILER_PRESETS) as [key, p]}
            <button class="preset" class:active={app.settings.spoiler.level === key} onclick={() => choose(key as SpoilerLevel)}>
              <strong>{p.title}</strong>
              <span>{p.blurb}</span>
            </button>
          {/each}
        </div>
        <p class="faint small">Adjustable any time from the status bar.</p>
      </section>
    {/if}

    <footer>
      <button class="primary big" disabled={!gameOk} onclick={begin}>
        {returning ? 'Open the map' : 'Land on the Iliac Bay'} →
      </button>
    </footer>
  </div>
</div>

<style>
  .welcome {
    height: 100%; overflow: auto; display: grid; place-items: center; padding: 24px 16px;
    background: radial-gradient(ellipse at top, #24252e 0%, var(--bg) 70%);
  }
  .panel {
    width: min(680px, 100%); background: var(--panel); border: 1px solid var(--line);
    border-radius: 12px; box-shadow: var(--shadow); padding: 26px 28px;
  }
  .brand h1 { font-size: 26px; margin: 6px 0 6px; }
  .brand p { margin: 0; }
  section { margin-top: 22px; }
  .step { color: var(--gold); font-weight: 600; margin-bottom: 4px; }
  .quick { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; margin-bottom: 18px; }
  .presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
  @media (max-width: 640px) { .presets { grid-template-columns: 1fr; } }
  .preset {
    display: flex; flex-direction: column; gap: 4px; text-align: left; padding: 12px;
    background: var(--panel-2); line-height: 1.35;
  }
  .preset span { font-size: 12.5px; color: var(--muted); }
  .preset.active { border-color: var(--gold-dim); background: #2f2a16; }
  .preset.active strong { color: var(--gold); }
  .small { font-size: 12px; }
  .warn { color: var(--warn); font-size: 13px; }
  footer { margin-top: 24px; display: flex; justify-content: flex-end; }
  .big { padding: 10px 20px; font-size: 15px; }
</style>
