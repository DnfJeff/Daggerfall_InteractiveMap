<script lang="ts">
  export interface MenuItem { label: string; action: () => void; disabled?: boolean; tone?: 'danger'; hint?: string }
  let { x, y, title, items, onclose }: { x: number; y: number; title?: string; items: (MenuItem | '-')[]; onclose: () => void } = $props();
  let el: HTMLDivElement | undefined = $state();

  $effect(() => {
    const close = (e: Event) => { if (el && !el.contains(e.target as Node)) onclose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onclose(); };
    setTimeout(() => { addEventListener('pointerdown', close); addEventListener('keydown', esc); });
    return () => { removeEventListener('pointerdown', close); removeEventListener('keydown', esc); };
  });

  // Keep the menu inside its container.
  const style = $derived.by(() => {
    const parent = el?.parentElement;
    const w = 230, h = 36 + items.length * 30;
    const maxX = (parent?.clientWidth ?? innerWidth) - w - 6;
    const maxY = (parent?.clientHeight ?? innerHeight) - h - 6;
    return `left:${Math.max(6, Math.min(x, maxX))}px;top:${Math.max(6, Math.min(y, maxY))}px`;
  });
</script>

<div class="menu" bind:this={el} style={style} role="menu">
  {#if title}<div class="head">{title}</div>{/if}
  {#each items as it}
    {#if it === '-'}<div class="sep"></div>
    {:else}
      <button role="menuitem" class:danger={it.tone === 'danger'} disabled={it.disabled} onclick={() => { onclose(); it.action(); }}>
        <span>{it.label}</span>{#if it.hint}<span class="hint">{it.hint}</span>{/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  .menu {
    position: absolute; z-index: 40; min-width: 210px; max-width: 280px; background: var(--panel);
    border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); padding: 4px;
  }
  .head { padding: 6px 10px 4px; color: var(--gold); font-weight: 600; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { display: flex; width: 100%; text-align: left; background: transparent; border: 0; padding: 6px 10px; border-radius: 5px; font-size: 13px; gap: 10px; }
  button:hover:not(:disabled) { background: var(--panel-3); }
  .hint { margin-left: auto; color: var(--faint); font-size: 12px; }
  .danger { color: #f2a094; }
  .sep { height: 1px; background: var(--line-soft); margin: 4px 6px; }
</style>
