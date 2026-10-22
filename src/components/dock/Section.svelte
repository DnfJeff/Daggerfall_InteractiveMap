<script lang="ts">
  import type { Snippet } from 'svelte';
  import { app } from '../../lib/state/app.svelte';

  /** Collapsible section whose open state is remembered per `id`. */
  let { id, title, defaultOpen = true, meta, actions, children }: {
    id: string;
    title: string;
    defaultOpen?: boolean;
    meta?: string;
    actions?: Snippet;
    children: Snippet;
  } = $props();

  const open = $derived(app.settings.layout.sections[id] ?? defaultOpen);
  function toggle() {
    app.settings.layout.sections[id] = !open;
    app.saveLayout();
  }
</script>

<section class="sec" class:open>
  <div class="head">
    <button class="toggle" onclick={toggle} aria-expanded={open}>
      <span class="chev">▸</span>
      <span class="t">{title}</span>
      {#if meta}<span class="meta">{meta}</span>{/if}
    </button>
    {#if actions && open}<div class="actions">{@render actions()}</div>{/if}
  </div>
  {#if open}<div class="body">{@render children()}</div>{/if}
</section>

<style>
  .sec { border-bottom: 1px solid var(--line-soft); }
  .head { display: flex; align-items: center; gap: 4px; padding-right: 8px; }
  .toggle {
    flex: 1; display: flex; align-items: center; gap: 6px; background: transparent; border: 0; border-radius: 0;
    padding: 8px 10px; text-align: left; min-width: 0;
  }
  .toggle:hover { background: var(--panel-2); }
  .chev { color: var(--faint); font-size: 10px; transition: transform 0.12s; width: 10px; }
  .open .chev { transform: rotate(90deg); }
  .t { color: var(--gold); text-transform: uppercase; letter-spacing: 0.07em; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
  .meta { color: var(--faint); font-size: 12px; margin-left: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .actions { display: flex; gap: 4px; }
  .body { padding: 2px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
</style>
