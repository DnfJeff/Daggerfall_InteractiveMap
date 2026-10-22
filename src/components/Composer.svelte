<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import { ATLAS, MARKER_CATEGORIES, type AnyRecord, type MarkerCategory, type Plane } from '../lib/db/model';
  import { CATEGORY_COLORS, CATEGORY_GLYPH } from '../lib/map/draw';
  import { formatGameTime } from '../lib/df/save';

  const c = app.composer!;
  const existing = c.recordId ? (app.records.find((r) => r.id === c.recordId) as AnyRecord | undefined) : undefined;
  const profile = app.activeProfile;

  const remembered = (() => { try { return localStorage.getItem('dfc.lastPlane'); } catch { return null; } })();
  const defaultPlane: Plane =
    existing?.plane ??
    c.plane ??
    (c.kind === 'journal' ? (profile?.id ?? ATLAS) : remembered === 'play' && profile ? profile.id : ATLAS);

  let plane = $state<Plane>(defaultPlane);
  let name = $state(existing && 'name' in existing ? existing.name : '');
  let title = $state(existing && 'title' in existing ? existing.title : '');
  let body = $state(existing && 'body' in existing ? existing.body : '');
  let tags = $state(existing && 'tags' in existing ? existing.tags.join(', ') : '');
  let category = $state<MarkerCategory>(existing && 'category' in existing ? existing.category : 'landmark');
  let gameTime = $state(
    existing && 'gameTime' in existing ? existing.gameTime ?? '' :
    c.kind === 'journal' && app.boundSave ? formatGameTime(app.boundSave.summary.gameTime) : '',
  );

  const heading = $derived(
    (existing ? 'Edit ' : 'New ') + ({ marker: 'marker', note: 'note', journal: 'journal entry', guide: 'guide' } as const)[c.kind],
  );
  const valid = $derived(c.kind === 'marker' ? name.trim().length > 0 : c.kind === 'guide' ? title.trim().length > 0 : body.trim().length > 0);

  async function save() {
    if (!valid) return;
    const tagList = tags.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
    const base = { id: existing?.id, plane, anchor: c.anchor, kind: c.kind };
    let rec: any;
    if (c.kind === 'marker') rec = { ...base, name: name.trim(), category, body, tags: tagList };
    else if (c.kind === 'note') rec = { ...base, body, tags: tagList };
    else if (c.kind === 'journal') rec = { ...base, body, tags: tagList, gameTime: gameTime || undefined };
    else rec = { ...base, title: title.trim(), body, tags: tagList };
    const saved = await app.upsert(rec);
    try { localStorage.setItem('dfc.lastPlane', plane === ATLAS ? 'atlas' : 'play'); } catch { /* private mode */ }
    if (c.kind === 'marker') app.selection = { t: 'record', id: saved.id };
    app.composer = null;
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') app.composer = null;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
  }
</script>

<svelte:window onkeydown={key} />

<div class="modal-backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) app.composer = null; }}>
  <div class="modal" role="dialog" aria-label={heading}>
    <header>
      <h3>{heading}</h3>
      <span class="spacer"></span>
      <span class="muted small">{app.describeAnchor(c.anchor)}</span>
    </header>
    <div class="body">
      <fieldset class="planes">
        <legend class="title">Where it lives</legend>
        <label class="plane" class:active={plane === ATLAS} style:--c="var(--atlas)">
          <input type="radio" bind:group={plane} value={ATLAS} />
          <span><strong>◆ Atlas</strong><small>True in every playthrough (places, shops, fixed dungeon facts)</small></span>
        </label>
        <label class="plane" class:active={plane !== ATLAS} class:disabled={!profile} style:--c={profile?.color ?? 'var(--play)'}>
          <input type="radio" bind:group={plane} value={profile?.id} disabled={!profile} />
          <span>
            <strong>● {profile ? profile.name : 'This playthrough'}</strong>
            <small>{profile ? 'Only this run (quests, who you met, what you left where)' : 'Open or create a Profile to keep playthrough notes'}</small>
          </span>
        </label>
      </fieldset>

      {#if c.kind === 'marker'}
        <!-- svelte-ignore a11y_autofocus -->
        <label class="col"><span class="title">Name</span><input type="text" bind:value={name} placeholder="The unmarked shack" autofocus /></label>
        <div class="col">
          <span class="title">Category</span>
          <div class="cats">
            {#each MARKER_CATEGORIES as cat}
              <button type="button" class="small cat" class:active={category === cat} onclick={() => (category = cat)}>
                <span style:color={CATEGORY_COLORS[cat]}>{CATEGORY_GLYPH[cat]}</span> {cat}
              </button>
            {/each}
          </div>
        </div>
      {/if}
      {#if c.kind === 'guide'}
        <!-- svelte-ignore a11y_autofocus -->
        <label class="col"><span class="title">Title</span><input type="text" bind:value={title} autofocus /></label>
      {/if}
      <label class="col">
        <span class="title">{c.kind === 'marker' ? 'Note (optional)' : 'Text'}</span>
        <!-- svelte-ignore a11y_autofocus -->
        <textarea bind:value={body} rows={c.kind === 'guide' ? 12 : 5} autofocus={c.kind === 'note' || c.kind === 'journal'}
          placeholder={c.kind === 'guide' ? 'Link places with [[Place Name]].' : '- [ ] checklists work too'}></textarea>
      </label>
      <div class="row wrap">
        <label class="col grow"><span class="title">Tags</span><input type="text" bind:value={tags} placeholder="comma, separated" /></label>
        {#if c.kind === 'journal'}
          <label class="col grow"><span class="title">In-game time</span><input type="text" bind:value={gameTime} placeholder="e.g. 14th of First Seed, 3E 405" /></label>
        {/if}
      </div>
    </div>
    <footer>
      {#if existing}
        <button class="danger" onclick={() => { app.trashRecord(existing.id); app.composer = null; }}>Move to Trash</button>
        <span class="spacer"></span>
      {/if}
      <button onclick={() => (app.composer = null)}>Cancel</button>
      <button class="primary" disabled={!valid} onclick={save}>Save <span class="faint">Ctrl+↵</span></button>
    </footer>
  </div>
</div>

<style>
  .small { font-size: 12px; }
  .planes { border: 0; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .planes legend { margin-bottom: 6px; }
  .plane {
    display: flex; gap: 8px; align-items: flex-start; padding: 9px 10px; border: 1px solid var(--line); border-radius: 8px;
    background: var(--panel-2);
  }
  .plane.active { border-color: var(--c); background: color-mix(in srgb, var(--c) 10%, var(--panel-2)); }
  .plane.disabled { opacity: 0.55; }
  .plane strong { color: var(--c); display: block; }
  .plane small { color: var(--muted); font-size: 12px; line-height: 1.3; display: block; }
  .plane input { margin-top: 3px; accent-color: var(--c); }
  .cats { display: flex; flex-wrap: wrap; gap: 4px; }
  .cat.active { border-color: var(--gold-dim); background: #2f2a16; }
  .grow { flex: 1; min-width: 180px; }
  @media (max-width: 520px) { .planes { grid-template-columns: 1fr; } }
</style>
