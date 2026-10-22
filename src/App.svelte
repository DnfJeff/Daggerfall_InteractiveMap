<script lang="ts">
  import { app } from './lib/state/app.svelte';
  import Welcome from './components/Welcome.svelte';
  import Workspace from './components/Workspace.svelte';
  import Toasts from './components/Toasts.svelte';
  import { WEB, PRODUCT } from './lib/flavor';

  const showWelcome = $derived(!WEB && app.ready && (!app.settings.firstRunDone || !app.game) && app.sources.arena2.state !== 'loading');
  const booting = $derived(!app.ready || (WEB && !app.game));
</script>

{#if booting}
  <div class="boot">
    <span class="title">{PRODUCT}</span>
    {#if app.sources.arena2.state === 'error'}<span class="err">{app.sources.arena2.detail}</span>{:else}<span class="muted">{app.loadProgress || 'Loading'}…</span>{/if}
  </div>
{:else if showWelcome}
  <Welcome />
{:else}
  <Workspace />
{/if}
<Toasts />

<style>
  .boot { height: 100%; display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center; }
  .err { color: var(--danger); }
</style>
