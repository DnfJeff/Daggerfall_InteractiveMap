<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import { filesFromDrop } from '../lib/df/save';

  /** Window-wide drop target for .dfc playthroughs and Daggerfall save folders. */
  let depth = $state(0);
  const active = $derived(depth > 0);

  function isFiles(e: DragEvent) { return [...(e.dataTransfer?.types ?? [])].includes('Files'); }
  function enter(e: DragEvent) { if (!isFiles(e)) return; e.preventDefault(); depth++; }
  function leave(e: DragEvent) { if (!isFiles(e)) return; depth = Math.max(0, depth - 1); }
  function over(e: DragEvent) { if (isFiles(e)) e.preventDefault(); }
  async function drop(e: DragEvent) {
    if (!isFiles(e) || !e.dataTransfer) return;
    e.preventDefault();
    depth = 0;
    await app.handleFiles(await filesFromDrop(e.dataTransfer));
  }
</script>

<svelte:window ondragenter={enter} ondragleave={leave} ondragover={over} ondrop={drop} />

{#if active}
  <div class="drop">
    <div class="box">
      <strong>Drop to open</strong>
      <span>a <b>.dfc</b> playthrough file</span>
      <span>or a Daggerfall <b>save folder</b> (SAVE3, or the whole Saves folder) to capture your character</span>
    </div>
  </div>
{/if}

<style>
  .drop { position: fixed; inset: 0; z-index: 90; background: rgba(10, 10, 14, 0.7); display: grid; place-items: center; pointer-events: none; }
  .box {
    border: 2px dashed var(--gold-dim); border-radius: 14px; padding: 28px 36px; background: var(--panel);
    display: flex; flex-direction: column; gap: 6px; align-items: center; text-align: center; max-width: 440px;
  }
  .box strong { color: var(--gold); font-size: 18px; }
  .box span { color: var(--muted); }
  .box b { color: var(--text); }
</style>
