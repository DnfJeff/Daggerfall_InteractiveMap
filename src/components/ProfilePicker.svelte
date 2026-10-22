<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import type { Profile, SaveBinding } from '../lib/db/model';
  import { formatGameTime, RUNTIME_LABEL, type SaveRuntime, type SaveSummary } from '../lib/df/save';

  let creating = $state(false);
  let editing = $state<Profile | null>(null);
  let name = $state('');
  let runtime = $state<SaveRuntime>('dfu');
  let bindMode = $state<'none' | 'character' | 'pinned'>('character');
  let bindChar = $state(''); // "<id or name>"
  let bindFolder = $state('');
  let thumbs = $state<Record<string, string | null>>({});
  let confirmDelete = $state<string | null>(null);

  const runtimes = $derived((['dfu', 'dfo'] as SaveRuntime[]).filter((r) => app.saves.some((s) => s.runtime === r)));
  const pool = $derived(app.saves.filter((s) => s.runtime === runtime));
  /** One entry per character: DFO characters are identified by id, DFU ones by name. */
  const characters = $derived.by(() => {
    const seen = new Map<string, SaveSummary>();
    for (const s of pool) {
      const key = s.characterId ?? `name:${s.characterName}`;
      if (!seen.has(key)) seen.set(key, s);
    }
    return [...seen.entries()].map(([key, s]) => ({ key, s, count: pool.filter((x) => (x.characterId ?? `name:${x.characterName}`) === key).length }));
  });
  const sorted = $derived([...app.profiles].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt));
  const stats = (id: string) => {
    const rs = app.liveRecords.filter((r) => r.plane === id);
    return {
      markers: rs.filter((r) => r.kind === 'marker').length,
      notes: rs.filter((r) => r.kind === 'note' || r.kind === 'journal').length,
      kills: rs.filter((r) => r.kind === 'kill').reduce((n, r) => n + ((r as any).count || ((r as any).slain ? 1 : 0)), 0),
    };
  };

  $effect(() => {
    for (const p of app.profiles) {
      const s = app.resolveBinding(p.binding);
      if (s && !(s.id in thumbs)) {
        thumbs[s.id] = null;
        app.saveThumbnail(s).then((u) => (thumbs[s.id] = u));
      }
    }
  });

  function setRuntime(r: SaveRuntime) {
    runtime = r;
    bindChar = characters[0]?.key ?? '';
    bindFolder = pool[0]?.folder ?? '';
  }
  function startCreate() {
    editing = null;
    creating = true;
    name = '';
    bindMode = app.saves.length ? 'character' : 'none';
    setRuntime(runtimes[0] ?? 'dfu');
  }
  function startEdit(p: Profile) {
    editing = p;
    creating = true;
    name = p.name;
    bindMode = p.binding?.mode ?? 'none';
    runtime = p.binding?.runtime ?? runtimes[0] ?? 'dfu';
    bindChar = p.binding?.characterId ?? (p.binding?.characterName ? `name:${p.binding.characterName}` : characters[0]?.key ?? '');
    bindFolder = p.binding?.folder ?? pool[0]?.folder ?? '';
  }
  function binding(): SaveBinding | null {
    if (bindMode === 'character' && bindChar) {
      const c = characters.find((x) => x.key === bindChar);
      return { mode: 'character', runtime, characterName: c?.s.characterName, characterId: c?.s.characterId ?? undefined };
    }
    if (bindMode === 'pinned' && bindFolder) return { mode: 'pinned', runtime, folder: bindFolder };
    return null;
  }
  async function submit() {
    if (editing) await app.updateProfile(editing.id, { name: name.trim() || editing.name, binding: binding() });
    else await app.createProfile(name, binding());
    creating = false;
    app.showProfilePicker = false;
  }
  async function open(id: string | null) {
    await app.openProfile(id);
    app.showProfilePicker = false;
  }
  function describe(p: Profile, s: SaveSummary | null) {
    const b = p.binding;
    if (!b) return 'No save bound';
    const game = RUNTIME_LABEL[b.runtime ?? 'dfu'];
    if (b.mode === 'character') return `Follows ${b.characterName} (${game})${s ? ` · ${s.folder}` : ' · no save found'}`;
    return `Pinned to ${game} ${b.folder}${s ? '' : ' (missing)'}`;
  }
</script>

<div class="modal-backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) app.showProfilePicker = false; }}>
  <div class="modal wide" role="dialog" aria-label="Profiles">
    <header>
      <h3>{creating ? (editing ? `Edit “${editing.name}”` : 'New playthrough') : 'Load a playthrough'}</h3>
      <span class="spacer"></span>
      <button class="ghost small" onclick={() => (app.showProfilePicker = false)}>✕</button>
    </header>

    {#if !creating}
      <div class="body">
        <div class="slots">
          {#each sorted as p (p.id)}
            {@const s = app.resolveBinding(p.binding)}
            {@const st = stats(p.id)}
            <div class="slot" class:active={p.id === app.settings.activeProfileId} style:--c={p.color}>
              <button class="main" onclick={() => open(p.id)}>
                <div class="pic">
                  {#if s && thumbs[s.id]}<img src={thumbs[s.id]} alt="" />{:else}<span>{p.name.slice(0, 1).toUpperCase()}</span>{/if}
                </div>
                <div class="info">
                  <strong>{p.name}</strong>
                  <span class="muted">{describe(p, s)}</span>
                  {#if s}<span class="faint">{formatGameTime(s.gameTime)}</span>{/if}
                  <span class="faint">{st.markers} markers · {st.notes} notes · {st.kills} kills · opened {new Date(p.lastOpenedAt).toLocaleDateString()}</span>
                </div>
              </button>
              <div class="side">
                <button class="small ghost" onclick={() => startEdit(p)}>Edit</button>
                {#if confirmDelete === p.id}
                  <button class="small danger" onclick={() => { app.deleteProfile(p.id); confirmDelete = null; }}>Confirm</button>
                {:else}
                  <button class="small ghost" onclick={() => (confirmDelete = p.id)} title="Delete (a snapshot is taken first)">Delete</button>
                {/if}
              </div>
            </div>
          {:else}
            <p class="muted">No playthroughs yet. A Profile is a playthrough's notebook: markers, notes, journal, reveals and bestiary progress for one run.</p>
          {/each}
        </div>
      </div>
      <footer>
        <button onclick={() => open(null)} disabled={!app.settings.activeProfileId}>Atlas only (no profile)</button>
        <span class="spacer"></span>
        <button class="primary" onclick={startCreate}>New playthrough…</button>
      </footer>
    {:else}
      <div class="body">
        <label class="col"><span class="title">Name</span><input type="text" bind:value={name} placeholder="Breton spellsword, 2026" /></label>
        <div class="col">
          <span class="title">Bind to a save (optional, read-only)</span>
          {#if !app.saves.length}
            <p class="muted small">Optional. To bring in a character, drop its save folder on the page (or File → Capture my character) after creating the playthrough. Its discoveries, position and notebook are copied in and travel with your .dfc file.</p>
          {:else}
            {#if runtimes.length > 1}
              <div class="seg">
                {#each runtimes as r}<button class="small" class:on={runtime === r} onclick={() => setRuntime(r)}>{RUNTIME_LABEL[r]}</button>{/each}
              </div>
            {:else}
              <span class="faint small">{RUNTIME_LABEL[runtime]} saves</span>
            {/if}
            <label class="row"><input type="radio" bind:group={bindMode} value="character" /> Follow a character's newest save</label>
            {#if bindMode === 'character'}
              <select bind:value={bindChar}>
                {#each characters as c}<option value={c.key}>{c.s.characterName} · {c.count} save{c.count === 1 ? '' : 's'}{c.s.characterId ? '' : ' (matched by name)'}</option>{/each}
              </select>
            {/if}
            <label class="row"><input type="radio" bind:group={bindMode} value="pinned" /> Pin one save folder</label>
            {#if bindMode === 'pinned'}
              <select bind:value={bindFolder}>
                {#each pool as s}<option value={s.folder}>{s.folder} · {s.characterName} · {s.saveName}</option>{/each}
              </select>
            {/if}
            <label class="row"><input type="radio" bind:group={bindMode} value="none" /> No save</label>
            <p class="faint small">Several profiles may share a save. The companion never writes to your saves.</p>
          {/if}
        </div>
      </div>
      <footer>
        <button onclick={() => (creating = false)}>Back</button>
        <button class="primary" onclick={submit}>{editing ? 'Save' : 'Create and open'}</button>
      </footer>
    {/if}
  </div>
</div>

<style>
  .wide { width: min(680px, calc(100vw - 32px)); }
  .small { font-size: 12.5px; }
  .slots { display: flex; flex-direction: column; gap: 8px; }
  .slot { display: flex; border: 1px solid var(--line); border-left: 4px solid var(--c); border-radius: 8px; background: var(--panel-2); }
  .slot.active { box-shadow: 0 0 0 1px var(--c) inset; }
  .main { flex: 1; display: flex; gap: 12px; text-align: left; background: transparent; border: 0; padding: 10px; }
  .pic { width: 84px; height: 52px; border-radius: 5px; overflow: hidden; background: var(--panel-3); display: grid; place-items: center; flex: none; }
  .pic img { width: 100%; height: 100%; object-fit: cover; }
  .pic span { font-size: 22px; color: var(--c); font-weight: 700; }
  .info { display: flex; flex-direction: column; font-size: 12.5px; }
  .info strong { font-size: 14px; color: var(--c); }
  .side { display: flex; flex-direction: column; justify-content: center; padding: 6px; gap: 2px; }
  .seg { display: flex; gap: 4px; }
  .seg .on { border-color: var(--gold-dim); color: var(--gold); background: #2f2a16; }
</style>
