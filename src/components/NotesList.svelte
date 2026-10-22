<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import type { Anchor, AnyRecord } from '../lib/db/model';
  import PlaneBadge from './PlaneBadge.svelte';
  import Icon from './Icon.svelte';

  let { anchor, allowMarker = true }: { anchor: Anchor; allowMarker?: boolean } = $props();
  const items = $derived(app.recordsFor(anchor, ['note', 'marker', 'journal']));

  function edit(r: AnyRecord) {
    app.composer = { kind: r.kind as 'note' | 'marker' | 'journal', anchor: r.anchor, recordId: r.id };
  }
  function title(r: AnyRecord) {
    if (r.kind === 'marker') return r.name;
    if (r.kind === 'journal') return 'Journal · ' + new Date(r.createdAt).toLocaleDateString();
    return null;
  }
</script>

<div class="notes">
  <div class="row head">
    <span class="spacer"></span>
    <button class="small" onclick={() => (app.composer = { kind: 'note', anchor })}><Icon name="plus" size={13} /> Note</button>
    {#if allowMarker}<button class="small" onclick={() => (app.composer = { kind: 'marker', anchor })}><Icon name="pin" size={13} /> Marker</button>{/if}
  </div>
  {#each items as r (r.id)}
    <button class="note" onclick={() => edit(r)} style:border-left-color={app.planeColor(r.plane)}>
      <div class="row">
        {#if title(r)}<strong>{title(r)}</strong>{/if}
        <span class="spacer"></span>
        <PlaneBadge plane={r.plane} />
      </div>
      {#if 'body' in r && r.body}<div class="body">{r.body}</div>{/if}
      {#if 'tags' in r && r.tags.length}<div class="tags">{#each r.tags as t}<span class="chip">#{t}</span>{/each}</div>{/if}
    </button>
  {:else}
    <div class="empty">
      Nothing yet. Notes in the <span style:color="var(--atlas)">Atlas</span> show in every playthrough{app.activeProfile ? '; playthrough notes only in this one' : ''}.
    </div>
  {/each}
  {#if !app.settings.layers.atlas || !app.settings.layers.playthrough}
    <div class="faint small">Some notes are hidden by the {!app.settings.layers.atlas ? 'Atlas' : 'playthrough'} layer toggle.</div>
  {/if}
</div>

<style>
  .notes { display: flex; flex-direction: column; gap: 6px; }
  .head { margin-bottom: 2px; }
  .head button { display: inline-flex; align-items: center; gap: 3px; }
  .note {
    text-align: left; background: var(--panel-2); border: 1px solid var(--line-soft); border-left: 3px solid var(--atlas);
    border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;
  }
  .body { white-space: pre-wrap; font-size: 13px; color: var(--text); max-height: 9.5em; overflow: hidden; }
  .tags { display: flex; gap: 4px; flex-wrap: wrap; }
  .small { font-size: 12px; }
</style>
