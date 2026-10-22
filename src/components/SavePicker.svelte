<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import { formatGameTime, RUNTIME_LABEL } from '../lib/df/save';

  /** Several saves were dropped: pick the one to capture into the playthrough. */
  const p = $derived(app.pendingSaves!);
</script>

<div class="modal-backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) app.pendingSaves = null; }}>
  <div class="modal" role="dialog" aria-label="Choose a save">
    <header><h3>Which save?</h3></header>
    <div class="body">
      <p class="muted small">
        Its character, discoveries, position and notebook are copied into
        {app.activeProfile ? `“${app.activeProfile.name}”` : 'a new playthrough'}. Nothing is uploaded and the save isn't changed.
      </p>
      <div class="list">
        {#each p.saves as s}
          <button class="item" onclick={() => app.captureSave(p.root, s)}>
            <strong>{s.characterName || 'Unnamed'}</strong>
            <span class="muted">{s.saveName} · {s.folder}</span>
            <span class="faint">{formatGameTime(s.gameTime)} · saved {new Date(s.realTime).toLocaleDateString()} · {RUNTIME_LABEL[s.format]}</span>
          </button>
        {/each}
      </div>
    </div>
    <footer><button onclick={() => (app.pendingSaves = null)}>Cancel</button></footer>
  </div>
</div>

<style>
  .small { font-size: 12.5px; }
  .list { display: flex; flex-direction: column; gap: 4px; max-height: 50vh; overflow: auto; }
  .item { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; text-align: left; font-size: 12.5px; }
  .item strong { color: var(--gold); font-size: 13.5px; }
</style>
