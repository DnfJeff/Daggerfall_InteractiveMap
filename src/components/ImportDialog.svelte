<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import { importBundle } from '../lib/db/backup';

  /** Opening a .dfc (or older .json export): preview, then replace or merge. Driven by app.pendingImport. */
  const p = $derived(app.pendingImport!);
  const b = $derived(p.bundle);
  // A full .dfc (everything) defaults to "open" (replace); partial exports default to merge.
  let mode = $state<'merge' | 'replace'>(app.pendingImport?.bundle.scope.kind === 'all' ? 'replace' : 'merge');
  let asCopies = $state(false);
  let includeSettings = $state(true);
  let busy = $state(false);

  const preview = $derived.by(() => {
    const kinds: Record<string, number> = {};
    for (const r of b.records) if (!r.deletedAt) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
    const existing = new Set(app.profiles.map((x) => x.id));
    return {
      kinds,
      clashes: b.profiles.filter((x) => existing.has(x.id)).length,
      worldMatch: !b.world || !app.game?.fingerprint || b.world === app.game.fingerprint,
    };
  });
  const LABEL: Record<string, string> = { marker: 'markers', note: 'notes', journal: 'journal entries', guide: 'guides', kill: 'kills', spot: 'spots', status: 'dungeon states', reveal: 'reveals' };

  async function go() {
    busy = true;
    await app.snapshot(`Before opening ${p.fileName}`);
    const res = await importBundle(b, { mode, asCopies, includeSettings: includeSettings && b.scope.kind === 'all' });
    await app.reloadAll();
    // Opening a whole file means "this is my file now": later saves go back to it.
    if (mode === 'replace' && b.scope.kind === 'all') {
      app.dfcSavedAt = Date.now();
      const first = b.profiles.slice().sort((x, y) => y.lastOpenedAt - x.lastOpenedAt)[0];
      if (first && !app.settings.activeProfileId) await app.openProfile(first.id);
    } else {
      app.dfcHandle = null;
      app.dfcName = null;
    }
    app.toast(`${mode === 'replace' ? 'Opened' : 'Merged'} ${p.fileName}: ${res.added + res.updated} items, ${res.profiles} playthrough${res.profiles === 1 ? '' : 's'}.`, 'ok');
    app.pendingImport = null;
    busy = false;
  }
  function cancel() {
    app.pendingImport = null;
    if (app.dfcHandle && app.dfcName === p.fileName) { app.dfcHandle = null; app.dfcName = null; }
  }
</script>

<div class="modal-backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) cancel(); }}>
  <div class="modal" role="dialog" aria-label="Open playthrough file">
    <header><h3>Open {p.fileName}</h3></header>
    <div class="body">
      <dl class="kv small">
        <dt>Playthroughs</dt><dd>{b.profiles.map((x) => x.name).join(', ') || '— (Atlas only)'}</dd>
        <dt>Contains</dt><dd>{Object.entries(preview.kinds).map(([k, n]) => `${n} ${LABEL[k] ?? k}`).join(', ') || 'nothing yet'}</dd>
        <dt>Saved</dt><dd>{new Date(b.exportedAt).toLocaleString()} · app {b.app}</dd>
      </dl>
      {#if !preview.worldMatch}<p class="warn small">Made with different game data (mods or another version). Notes on places may not line up.</p>{/if}
      <label class="row"><input type="radio" bind:group={mode} value="replace" /> Open: replace what's in this browser with the file</label>
      <label class="row"><input type="radio" bind:group={mode} value="merge" /> Merge: add it, keeping the newer copy of each item</label>
      {#if mode === 'merge' && b.profiles.length}<label class="row sub"><input type="checkbox" bind:checked={asCopies} /> As new copies{preview.clashes ? ` (${preview.clashes} already here)` : ''}</label>{/if}
      {#if b.scope.kind === 'all' && b.settings}<label class="row sub"><input type="checkbox" bind:checked={includeSettings} /> Use its settings too</label>{/if}
      <p class="faint small">What's here now is snapshotted first (Data & backups → Snapshots), so this can be undone.</p>
    </div>
    <footer>
      <button onclick={cancel}>Cancel</button>
      <button class="primary" disabled={busy} onclick={go}>{mode === 'replace' ? 'Open' : 'Merge'}</button>
    </footer>
  </div>
</div>

<style>
  .small { font-size: 12.5px; }
  .warn { color: var(--warn); }
  .sub { margin-left: 22px; color: var(--muted); }
</style>
