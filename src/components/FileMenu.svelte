<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import { WEB, RELEASES_URL } from '../lib/flavor';
  import Icon from './Icon.svelte';

  /** Azgaar-style file handling: work autosaves to the browser; .dfc files are the portable copy. */
  let open = $state(false);
  let dfcInput: HTMLInputElement | undefined = $state();
  let saveDirInput: HTMLInputElement | undefined = $state();

  async function openDfc() {
    open = false;
    if (!(await app.pickDfc())) dfcInput?.click();
  }
  function onDfc(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) app.openDfcFile(f);
    (e.target as HTMLInputElement).value = '';
  }
  function onSaveDir(e: Event) {
    const files = [...((e.target as HTMLInputElement).files ?? [])].map((f) => ({ path: (f as any).webkitRelativePath || f.name, file: f }));
    if (files.length) app.handleFiles(files);
    (e.target as HTMLInputElement).value = '';
  }
  function key(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); app.saveDfc(e.shiftKey); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); openDfc(); }
  }
  const unsaved = $derived(app.unsavedCount);
</script>

<svelte:window onkeydown={key} />

<div class="fm">
  <button class="small trigger" onclick={() => (open = !open)} aria-expanded={open} title="Playthrough file (.dfc)">
    <Icon name="archive" size={15} />
    <span class="nm">{app.dfcName ?? 'File'}</span>
    {#if unsaved}<span class="dot" title={`${unsaved} change${unsaved === 1 ? '' : 's'} not saved to a .dfc file yet`}></span>{/if}
  </button>
  {#if open}
    <div class="menu" role="menu">
      <button role="menuitem" onclick={() => { open = false; app.saveDfc(); }}>
        <span>Save{app.dfcName ? ` to ${app.dfcName}` : ' as .dfc…'}</span><kbd>Ctrl+S</kbd>
      </button>
      <button role="menuitem" onclick={() => { open = false; app.saveDfc(true); }}><span>Save as…</span><kbd>Ctrl+Shift+S</kbd></button>
      <button role="menuitem" onclick={openDfc}><span>Open .dfc…</span><kbd>Ctrl+O</kbd></button>
      <div class="sep"></div>
      <button role="menuitem" onclick={() => { open = false; saveDirInput?.click(); }}><span>Capture my character from a save folder…</span></button>
      <button role="menuitem" onclick={() => { open = false; app.showProfilePicker = true; }}><span>Playthroughs…</span></button>
      <button role="menuitem" onclick={() => { open = false; app.openDock('data'); }}><span>Backups & exports…</span></button>
      {#if WEB && RELEASES_URL}
        <div class="sep"></div>
        <a role="menuitem" class="link" href={RELEASES_URL} target="_blank" rel="noopener">Get the desktop app (reads your game files live) ↗</a>
      {/if}
      <p class="hint">Your work autosaves in this browser. A <b>.dfc</b> file is your portable copy: keep it, move it to another PC, or share it. You can also drop .dfc files and save folders anywhere on the page.</p>
    </div>
  {/if}
  <input bind:this={dfcInput} type="file" accept=".dfc,.json,application/json" hidden onchange={onDfc} />
  <input bind:this={saveDirInput} type="file" webkitdirectory multiple hidden onchange={onSaveDir} />
</div>

<style>
  .fm { position: relative; flex: none; }
  @media (max-width: 639px) {
    .nm { display: none; }
    .menu { position: fixed; top: 48px; right: 6px; width: min(320px, calc(100vw - 12px)); }
  }
  .trigger { display: flex; align-items: center; gap: 6px; max-width: 220px; }
  .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--warn); flex: none; }
  .menu {
    position: absolute; right: 0; top: calc(100% + 6px); z-index: 40; width: 320px; background: var(--panel);
    border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); padding: 4px;
  }
  .menu button, .menu .link {
    display: flex; justify-content: space-between; width: 100%; text-align: left; background: transparent; border: 0;
    padding: 7px 10px; border-radius: 5px; font-size: 13px; color: var(--text); text-decoration: none;
  }
  .menu button:hover, .menu .link:hover { background: var(--panel-3); }
  .link { color: var(--gold) !important; }
  kbd { font-family: var(--mono); font-size: 11px; color: var(--faint); }
  .sep { height: 1px; background: var(--line-soft); margin: 4px 6px; }
  .hint { margin: 6px 10px 6px; font-size: 12px; color: var(--muted); line-height: 1.4; }
  .hint b { color: var(--text); }
</style>
