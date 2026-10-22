<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import type { JournalRecord } from '../lib/db/model';
  import { norm } from '../lib/map/search';
  import { formatGameTime } from '../lib/df/save';
  import PlaneBadge from './PlaneBadge.svelte';
  import Icon from './Icon.svelte';

  let q = $state('');
  let tag = $state('');
  let quick = $state('');

  const profile = $derived(app.activeProfile);
  const entries = $derived(
    app.liveRecords
      .filter((r): r is JournalRecord => r.kind === 'journal' && (r.plane === profile?.id || (!profile && r.plane === 'atlas')))
      .filter((r) => !q || norm(r.body + ' ' + app.describeAnchor(r.anchor)).includes(norm(q)))
      .filter((r) => !tag || r.tags.includes(tag))
      .sort((a, b) => b.createdAt - a.createdAt),
  );
  const tags = $derived([...new Set(app.liveRecords.filter((r): r is JournalRecord => r.kind === 'journal').flatMap((r) => r.tags))].sort());
  const notebook = $derived(
    (app.boundSave?.notebook ?? []).filter((e) => !q || norm(e.header + ' ' + e.lines.join(' ')).includes(norm(q))).slice().reverse(),
  );

  async function addQuick() {
    if (!quick.trim()) return;
    await app.upsert({
      kind: 'journal',
      plane: profile?.id ?? 'atlas',
      anchor: null,
      body: quick.trim(),
      tags: [],
      gameTime: app.boundSave ? formatGameTime(app.boundSave.summary.gameTime) : undefined,
    } as any);
    quick = '';
  }

  /** Make "in <Place>:" in game notebook headers clickable when the place exists. */
  function placeOf(header: string) {
    const m = /\bin (.+?)$/.exec(header);
    if (!m || !app.game) return null;
    return app.game.maps.locations.find((l) => l.name === m[1]) ?? null;
  }
</script>

<div class="page">
  <header class="row wrap">
    {#if profile}<span class="muted">{profile.name}</span>{:else}<span class="warn small">No profile open: entries go to the Atlas</span>{/if}
    <span class="spacer"></span>
    <input type="search" placeholder="Search entries…" bind:value={q} />
    {#if tags.length}
      <select bind:value={tag}><option value="">All tags</option>{#each tags as t}<option value={t}>#{t}</option>{/each}</select>
    {/if}
  </header>

  <div class="cols" class:single={!app.boundSave}>
    <section>
      <div class="quick">
        <textarea bind:value={quick} rows="2" placeholder="Quick entry… (Ctrl+Enter to add)" onkeydown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addQuick(); }}></textarea>
        <div class="row">
          {#if app.boundSave}<span class="faint small">Stamped with your save's in-game time</span>{/if}
          <span class="spacer"></span>
          <button class="small" onclick={() => (app.composer = { kind: 'journal', anchor: null })}>Full entry…</button>
          <button class="small primary" disabled={!quick.trim()} onclick={addQuick}>Add</button>
        </div>
      </div>
      {#each entries as e (e.id)}
        <article class="entry">
          <div class="row meta">
            <span>{new Date(e.createdAt).toLocaleString()}</span>
            {#if e.gameTime}<span class="game">· {e.gameTime}</span>{/if}
            <span class="spacer"></span>
            <PlaneBadge plane={e.plane} />
            <button class="icon ghost" title="Edit" onclick={() => (app.composer = { kind: 'journal', anchor: e.anchor, recordId: e.id })}><Icon name="note" size={14} /></button>
          </div>
          {#if e.anchor}<button class="link" onclick={() => app.goToAnchor(e.anchor!)}><Icon name="pin" size={12} /> {app.describeAnchor(e.anchor)}</button>{/if}
          <div class="body">{e.body}</div>
          {#if e.tags.length}<div class="row wrap">{#each e.tags as t}<button class="chip" onclick={() => (tag = t)}>#{t}</button>{/each}</div>{/if}
        </article>
      {:else}
        <p class="empty">No entries yet. Right-click any place on the map to write an entry attached to it.</p>
      {/each}
    </section>

    {#if app.boundSave}
      <section class="game-log">
        <div class="title">The game's notebook · {app.boundSave.summary.characterName} <span class="faint">(read-only)</span></div>
        {#each notebook as n}
          {@const place = placeOf(n.header)}
          <article class="entry game-entry">
            <div class="meta">
              {#if place}{n.header.replace(/ in .+$/, ' in ')}<button class="link inline" onclick={() => app.goToLocation(place)}>{place.name}</button>{:else}{n.header}{/if}
            </div>
            <div class="body">{n.lines.join(' ')}</div>
          </article>
        {:else}
          <p class="empty">The bound save's notebook is empty.</p>
        {/each}
      </section>
    {/if}
  </div>
</div>

<style>
  .page { position: absolute; inset: 0; overflow: auto; padding: 12px 16px; }
  header { margin-bottom: 12px; gap: 8px; }
  .small { font-size: 12.5px; }
  .warn { color: var(--warn); }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }
  .cols.single { grid-template-columns: minmax(0, 760px); }
  @media (max-width: 1000px) { .cols { grid-template-columns: 1fr; } }
  section { display: flex; flex-direction: column; gap: 8px; }
  .quick { display: flex; flex-direction: column; gap: 6px; background: var(--panel-2); border: 1px solid var(--line-soft); padding: 10px; border-radius: 8px; }
  .quick textarea { min-height: 52px; }
  .entry { background: var(--panel-2); border: 1px solid var(--line-soft); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 5px; }
  .meta { font-size: 12px; color: var(--muted); }
  .game { color: var(--gold-dim); }
  .body { white-space: pre-wrap; }
  .link { background: none; border: 0; padding: 0; color: var(--gold); font-size: 12.5px; display: inline-flex; align-items: center; gap: 4px; align-self: flex-start; }
  .link:hover { text-decoration: underline; background: none; }
  .inline { display: inline; font-size: inherit; }
  .game-entry { background: #1e1d18; border-color: #3a3524; }
  .game-entry .body { font-family: Georgia, 'Times New Roman', serif; color: #e6dcc0; }
</style>
