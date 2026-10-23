<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/state/app.svelte';
  import {
    buildBundle, bundleFileName, deleteSnapshot, downloadText, listSnapshots,
    recordsToMarkdown, restoreSnapshot, type ExportScope, type Snapshot,
  } from '../lib/db/backup';
  import { ATLAS } from '../lib/db/model';
  import SourceRow from './SourceRow.svelte';
  import PlaneBadge from './PlaneBadge.svelte';

  let snapshots = $state<Snapshot[]>([]);
  let manualLabel = $state('');
  let confirmRestore = $state<string | null>(null);
  let exportProfiles = $state<string[]>([]);
  let confirmEmpty = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();

  const world = $derived(app.game?.fingerprint ?? null);
  async function reloadSnaps() { snapshots = await listSnapshots(); }
  onMount(() => { reloadSnaps(); app.refreshStorage(); });

  const fmtBytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
  const counts = $derived({
    atlas: app.liveRecords.filter((r) => r.plane === ATLAS && r.kind !== 'reveal').length,
    profiles: app.profiles.length,
    records: app.liveRecords.length,
    trash: app.trash.length,
  });

  async function snap() {
    await app.snapshot(`Manual${manualLabel.trim() ? `: ${manualLabel.trim()}` : ''}`);
    manualLabel = '';
    await reloadSnaps();
    app.toast('Snapshot saved.', 'ok');
  }
  async function restore(id: string) {
    const res = await restoreSnapshot(id, world, app.settings.backup.keepSnapshots);
    await app.reloadAll();
    await reloadSnaps();
    confirmRestore = null;
    app.toast(`Restored: ${res.added + res.updated} items. The state before restoring was snapshotted too.`, 'ok');
  }

  async function exportScope(scope: ExportScope, label: string) {
    const b = await buildBundle(scope, world, false);
    downloadText(bundleFileName(b, label), JSON.stringify(b, null, 1));
  }
  async function exportMarkdown(plane: string) {
    const recs = app.liveRecords.filter((r) => r.plane === plane);
    const title = plane === ATLAS ? 'Atlas' : app.planeLabel(plane);
    const md = recordsToMarkdown(`Daggerfall Interactive Map: ${title}`, recs, (r) => app.describeAnchor(r.anchor));
    downloadText(`daggerfall-companion_${title.replace(/\W+/g, '-')}.md`, md, 'text/markdown');
  }

  async function pickImport(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) await app.openDfcFile(f);
    (e.target as HTMLInputElement).value = '';
  }

  async function writeNow() {
    try {
      await app.writeBackupToFolder('backup');
      app.toast('Backup written to the folder.', 'ok');
    } catch (e) {
      app.toast((e as Error).message, 'error');
    }
  }
  async function emptyTrash() {
    for (const r of app.trash) await app.purgeRecord(r.id);
    confirmEmpty = false;
  }
  const scopeLabel = (s: ExportScope) => (s.kind === 'all' ? 'Everything' : s.kind === 'atlas' ? 'Atlas only' : `${s.ids.length} profile(s)`);
</script>

<div class="page">
  <p class="muted lead">
    Your Atlas, Profiles and settings live in this browser's database. Game files are never copied, so everything here is small.
    Keep it safe three ways: snapshots inside the browser, exported files, and an optional backup folder on disk.
  </p>

  <div class="grid">
    <section class="card col">
      <div class="title">Storage</div>
      <dl class="kv">
        <dt>Persistent</dt>
        <dd>{#if app.storage.persisted}<span class="ok">Yes: the browser won't clear it on its own</span>
          {:else if app.desktop}<span class="ok">Desktop app: kept in the data folder beside the program</span>
          {:else}<span class="warn">No: the browser may clear it under storage pressure</span>{/if}</dd>
        <dt>Used</dt><dd>{fmtBytes(app.storage.usage)}{app.storage.quota ? ` of ${fmtBytes(app.storage.quota)}` : ''}</dd>
        <dt>Atlas items</dt><dd>{counts.atlas}</dd>
        <dt>Profiles</dt><dd>{counts.profiles}</dd>
        <dt>All items</dt><dd>{counts.records}</dd>
      </dl>
      {#if !app.storage.persisted && !app.desktop}
        {#if app.installPrompt}
          <button class="primary" onclick={async () => { if (await app.installApp()) await app.requestPersistence(); }}>Install as an app (grants persistence)</button>
        {/if}
        <button class={app.installPrompt ? '' : 'primary'} onclick={() => app.requestPersistence()}>Ask the browser for persistence</button>
        <p class="faint small">
          Chrome and Edge only grant this to sites they trust, mostly installed apps.
          {#if !app.installPrompt && !app.installed}Install from the address bar's install icon (or ⋮ → Cast, save and share → Install page as app); with the desktop launcher, launch it once in a normal browser window to see that option.{/if}
          Until then, a backup folder below keeps you safe.
        </p>
      {/if}
      <p class="faint small">Clearing site data for this page in your browser deletes everything not exported.</p>
    </section>

    <section class="card col">
      <div class="title">Export</div>
      <div class="col">
        <button onclick={() => exportScope({ kind: 'all' }, 'everything')}>Everything (Atlas, all profiles, settings)</button>
        <button onclick={() => exportScope({ kind: 'atlas' }, 'atlas')}>Atlas only: share it, or carry it to a new machine</button>
      </div>
      {#if app.profiles.length}
        <div class="col profiles">
          {#each app.profiles as p}
            <label class="row"><input type="checkbox" value={p.id} bind:group={exportProfiles} /><span style:color={p.color}>●</span> {p.name}</label>
          {/each}
          <button disabled={!exportProfiles.length} onclick={() => exportScope({ kind: 'profiles', ids: exportProfiles }, exportProfiles.length === 1 ? app.planeLabel(exportProfiles[0]) : 'profiles')}>
            Export selected profile{exportProfiles.length === 1 ? '' : 's'}
          </button>
        </div>
      {/if}
      <div class="title sub">Readable copy (Markdown)</div>
      <div class="row wrap">
        <button class="small" onclick={() => exportMarkdown(ATLAS)}>Atlas</button>
        {#each app.profiles as p}<button class="small" onclick={() => exportMarkdown(p.id)}>{p.name}</button>{/each}
      </div>
    </section>

    <section class="card col">
      <div class="title">Import</div>
      <input bind:this={fileInput} type="file" accept=".dfc,.json,application/json" hidden onchange={pickImport} />
      <button onclick={() => fileInput?.click()}>Open a .dfc or export file…</button>
      <p class="faint small">Opens .dfc playthrough files and older .json exports, with a preview first. You can also drop them anywhere on the page.</p>
    </section>

    <section class="card col">
      <div class="title">Backup folder</div>
      <SourceRow kind="backup" label="Folder on disk" optional hint="e.g. a synced Documents folder. Backups are plain JSON you can re-import." />
      <button disabled={app.sources.backup.state !== 'ok'} onclick={writeNow}>Write a backup there now</button>
      <label class="row small">
        <input type="checkbox" bind:checked={app.settings.backup.writeToFolder} disabled={app.sources.backup.state !== 'ok'} onchange={() => app.saveSettings()} />
        Also write every snapshot to this folder
      </label>
    </section>
  </div>

  <section class="card col wide">
    <div class="row wrap">
      <div class="title">Snapshots</div>
      <span class="spacer"></span>
      <label class="row small">Auto-snapshot when opened, at most every
        <input type="number" min="0" max="168" bind:value={app.settings.backup.autoSnapshotHours} onchange={() => app.saveSettings()} class="num" /> h
      </label>
      <label class="row small">keep
        <input type="number" min="3" max="200" bind:value={app.settings.backup.keepSnapshots} onchange={() => app.saveSettings()} class="num" /> automatic
      </label>
    </div>
    <div class="row">
      <input type="text" bind:value={manualLabel} placeholder="Label (optional): before the Mantellan Crux" class="grow" />
      <button class="primary" onclick={snap}>Take snapshot</button>
    </div>
    <p class="faint small">Snapshots are also taken automatically before imports, restores and deleting a profile. Manual ones are never pruned.</p>
    <table>
      <thead><tr><th>When</th><th>Why</th><th>Contents</th><th></th></tr></thead>
      <tbody>
        {#each snapshots as s (s.id)}
          <tr>
            <td>{new Date(s.at).toLocaleString()}</td>
            <td>{s.reason}</td>
            <td class="muted">{s.counts.profiles} profiles · {s.counts.records} items</td>
            <td class="actions">
              {#if confirmRestore === s.id}
                <button class="small danger" onclick={() => restore(s.id)}>Replace current data</button>
                <button class="small" onclick={() => (confirmRestore = null)}>Cancel</button>
              {:else}
                <button class="small" onclick={() => (confirmRestore = s.id)}>Restore</button>
                <button class="small" onclick={() => downloadText(bundleFileName(s.bundle, 'snapshot'), JSON.stringify(s.bundle, null, 1))}>Download</button>
                <button class="small ghost" onclick={async () => { await deleteSnapshot(s.id); reloadSnaps(); }}>Delete</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr><td colspan="4" class="empty">No snapshots yet.</td></tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section class="card col wide">
    <div class="row">
      <div class="title">Trash</div>
      <span class="muted small">{counts.trash} item{counts.trash === 1 ? '' : 's'}</span>
      <span class="spacer"></span>
      {#if counts.trash}
        {#if confirmEmpty}
          <button class="small danger" onclick={emptyTrash}>Delete {counts.trash} forever</button>
          <button class="small" onclick={() => (confirmEmpty = false)}>Cancel</button>
        {:else}
          <button class="small" onclick={() => (confirmEmpty = true)}>Empty trash</button>
        {/if}
      {/if}
    </div>
    {#each app.trash.slice(0, 100) as r (r.id)}
      <div class="row trash-row">
        <PlaneBadge plane={r.plane} />
        <span>{'name' in r ? r.name : 'title' in r ? r.title : r.kind}</span>
        <span class="muted small ellip">{'body' in r ? r.body.split('\n')[0] : ''}</span>
        <span class="spacer"></span>
        <span class="faint small">{app.describeAnchor(r.anchor)} · deleted {new Date(r.deletedAt!).toLocaleDateString()}</span>
        <button class="small" onclick={() => app.restoreRecord(r.id)}>Restore</button>
      </div>
    {:else}
      <p class="empty">Deleted notes and markers wait here until you empty the trash.</p>
    {/each}
  </section>
</div>

<style>
  .page { position: absolute; inset: 0; overflow: auto; padding: 12px 16px 30px; display: flex; flex-direction: column; gap: 12px; }
  .lead { margin: 0; max-width: 820px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); gap: 12px; align-items: start; }
  .small { font-size: 12.5px; }
  .ok { color: var(--ok); }
  .warn { color: var(--warn); }
  .sub { margin-top: 6px; }
  .profiles { border-top: 1px solid var(--line-soft); padding-top: 8px; gap: 4px; }
  .num { width: 64px; }
  .grow { flex: 1; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: var(--muted); font-weight: 500; padding: 4px 6px; border-bottom: 1px solid var(--line-soft); }
  td { padding: 6px; border-bottom: 1px solid var(--line-soft); vertical-align: middle; }
  .actions { text-align: right; white-space: nowrap; }
  .actions button { margin-left: 4px; }
  .trash-row { padding: 5px 0; border-bottom: 1px solid var(--line-soft); }
  .ellip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 320px; }
</style>
