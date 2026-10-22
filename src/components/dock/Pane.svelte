<script lang="ts">
  import type { Snippet } from 'svelte';

  /** A docked pane: title bar with collapse, optional actions, scrollable body. */
  let { title, open, ontoggle, actions, children }: {
    title: string;
    open: boolean;
    ontoggle: () => void;
    actions?: Snippet;
    children: Snippet;
  } = $props();
</script>

<div class="pane" class:open>
  <div class="bar">
    <button class="ghost tgl" onclick={ontoggle} aria-expanded={open} title={open ? 'Collapse' : 'Expand'}>
      <span class="chev">▸</span>{title}
    </button>
    <span class="spacer"></span>
    {#if actions}{@render actions()}{/if}
  </div>
  {#if open}<div class="content">{@render children()}</div>{/if}
</div>

<style>
  .pane { display: flex; flex-direction: column; min-height: 0; background: var(--panel); }
  .pane.open { flex: 1; }
  .bar {
    flex: none; display: flex; align-items: center; gap: 4px; height: 32px; padding: 0 6px 0 2px;
    background: #17181d; border-bottom: 1px solid var(--line-soft);
  }
  .tgl {
    display: flex; align-items: center; gap: 6px; padding: 4px 8px; font-size: 11.5px; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted);
  }
  .open .tgl { color: var(--gold); }
  .chev { font-size: 10px; transition: transform 0.12s; }
  .open .chev { transform: rotate(90deg); }
  .content { flex: 1; min-height: 0; overflow: auto; }
</style>
