<script lang="ts">
  import { app } from '../../lib/state/app.svelte';
  import Inspector from '../Inspector.svelte';
  import MapControls from './MapControls.svelte';
  import Pane from './Pane.svelte';
  import Splitter from './Splitter.svelte';
  import Icon from '../Icon.svelte';

  const L = $derived(app.settings.layout);
  let el: HTMLDivElement;

  function dragSplit(dy: number) {
    const h = el.clientHeight;
    if (!h) return;
    L.rightSplit = Math.min(0.88, Math.max(0.12, L.rightSplit + dy / h));
  }
  const bothOpen = $derived(L.inspectorOpen && L.controlsOpen);
</script>

<div class="rdock" bind:this={el}>
  <div class="slot" style:flex={L.inspectorOpen ? (bothOpen ? `${L.rightSplit} 1 0` : '1 1 0') : '0 0 auto'}>
    <Pane title="Inspector" open={L.inspectorOpen} ontoggle={() => { L.inspectorOpen = !L.inspectorOpen; app.saveLayout(); }}>
      {#snippet actions()}
        {#if app.selection}<button class="ghost icon" title="Clear selection (Esc)" onclick={() => (app.selection = null)}><Icon name="close" size={14} /></button>{/if}
      {/snippet}
      <Inspector />
    </Pane>
  </div>
  {#if bothOpen}
    <Splitter axis="y" label="Resize inspector" ondrag={dragSplit} onend={() => app.saveLayout()} ondouble={() => { L.rightSplit = 0.58; app.saveLayout(); }} />
  {/if}
  <div class="slot" style:flex={L.controlsOpen ? (bothOpen ? `${1 - L.rightSplit} 1 0` : '1 1 0') : '0 0 auto'}>
    <Pane title="Map controls" open={L.controlsOpen} ontoggle={() => { L.controlsOpen = !L.controlsOpen; app.saveLayout(); }}>
      <MapControls />
    </Pane>
  </div>
</div>

<style>
  .rdock { height: 100%; display: flex; flex-direction: column; background: var(--panel); min-width: 0; }
  .slot { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
</style>
