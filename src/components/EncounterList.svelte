<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import enemies from '../lib/data/dfu-enemies.json';
  import Sprite from './Sprite.svelte';

  /** Creature odds for one encounter roll, highest first. */
  let { odds, limit = 8 }: { odds: Map<number, number>; limit?: number } = $props();
  const byId = new Map((enemies as { id: number; name: string; level?: number; texture?: number }[]).map((e) => [e.id, e]));
  let expanded = $state(false);
  const rows = $derived([...odds.entries()].sort((a, b) => b[1] - a[1]).map(([id, p]) => ({ e: byId.get(id), id, p })).filter((r) => r.e));
  const shown = $derived(expanded ? rows : rows.slice(0, limit));
</script>

<div class="enc">
  {#each shown as r (r.id)}
    {@const slain = app.kills.get(r.id)?.slain}
    <button class="row-e" class:slain onclick={() => (app.selection = { t: 'creature', id: r.id })} title="Inspect">
      <Sprite archive={r.e!.texture} size={26} />
      <span class="nm">{r.e!.name}</span>
      {#if slain}<span class="tick" title="Slain in this playthrough">✓</span>{/if}
      <span class="bar"><i style:width="{Math.round(r.p * 100)}%"></i></span>
      <span class="pct mono">{r.p >= 0.095 ? Math.round(r.p * 100) : (r.p * 100).toFixed(1)}%</span>
    </button>
  {:else}
    <p class="faint small">No encounter table here.</p>
  {/each}
  {#if rows.length > limit}
    <button class="small ghost more" onclick={() => (expanded = !expanded)}>{expanded ? 'Fewer' : `All ${rows.length}`}</button>
  {/if}
</div>

<style>
  .enc { display: flex; flex-direction: column; gap: 1px; }
  .row-e { display: grid; grid-template-columns: 26px 1fr auto 70px 40px; align-items: center; gap: 8px; padding: 2px 4px; background: transparent; border: 0; text-align: left; border-radius: 4px; font-size: 12.5px; }
  .row-e:hover { background: var(--panel-3); }
  .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .slain .nm { color: var(--muted); }
  .tick { color: var(--ok); font-size: 12px; }
  .bar { height: 5px; background: var(--line-soft); border-radius: 3px; overflow: hidden; grid-column: 4; }
  .bar i { display: block; height: 100%; background: var(--danger); opacity: 0.8; }
  .pct { text-align: right; color: var(--muted); font-size: 11.5px; grid-column: 5; }
  .small { font-size: 12px; }
  .more { align-self: flex-start; }
</style>
