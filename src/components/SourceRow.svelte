<script lang="ts">
  import { app, SAVE_SOURCE_RUNTIME, type SourceKind } from '../lib/state/app.svelte';

  /**
   * One folder the user points the app at. Browsers can't look inside AppData (or anywhere) on their
   * own, so for folders with a well-known location we show the path to paste into the picker.
   */
  let { kind, label, hint, optional = false, knownPath }: {
    kind: SourceKind; label: string; hint: string; optional?: boolean; knownPath?: string;
  } = $props();
  const s = $derived(app.sources[kind]);
  let input: HTMLInputElement | undefined = $state();
  let copied = $state(false);
  const canFallback = $derived(kind === 'arena2' || !!SAVE_SOURCE_RUNTIME[kind]);

  function onFiles(e: Event) {
    const files = [...((e.target as HTMLInputElement).files ?? [])];
    app.useFileList(kind, files);
  }
  async function copyPath() {
    if (!knownPath) return;
    try {
      await navigator.clipboard.writeText(knownPath);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch { /* clipboard blocked; the path is visible anyway */ }
  }
</script>

<div class="src">
  <div class="head row">
    <span class="dot {s.state}" aria-hidden="true"></span>
    <strong>{label}</strong>
    {#if optional}<span class="chip">optional</span>{/if}
    <span class="spacer"></span>
    {#if app.fsAccess}
      {#if s.state === 'needs-permission'}
        <button class="small primary" onclick={() => app.reconnect(kind)}>Reconnect “{s.name}”</button>
      {/if}
      {#if s.state === 'ok'}
        <button class="small" onclick={() => app.refresh(kind)} title="Re-read this folder">Refresh</button>
      {/if}
      <button class="small" onclick={() => app.pick(kind)}>{s.name ? 'Change…' : 'Choose folder…'}</button>
      {#if s.name}<button class="small ghost" onclick={() => app.forget(kind)} title="Forget this folder">✕</button>{/if}
    {:else if canFallback}
      <input bind:this={input} type="file" webkitdirectory multiple hidden onchange={onFiles} />
      <button class="small" onclick={() => input?.click()}>Choose folder…</button>
    {/if}
  </div>
  <div class="hint muted">{hint}</div>
  {#if knownPath && s.state !== 'ok'}
    <div class="known">
      <span class="faint">Usually</span>
      <code>{knownPath}</code>
      <button class="small ghost" onclick={copyPath} title="Copy, then paste into the folder picker's address bar">{copied ? 'Copied' : 'Copy'}</button>
    </div>
  {/if}
  {#if s.name || s.detail}
    <div class="status {s.state}">
      {#if s.name}<span class="mono">{s.name}</span>{/if}
      {#if s.detail}<span>— {s.detail}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .src { padding: 12px 0; border-bottom: 1px solid var(--line-soft); }
  .src:last-child { border-bottom: 0; }
  .head { flex-wrap: wrap; row-gap: 6px; }
  .hint { font-size: 12.5px; margin: 3px 0 0 18px; }
  .known { display: flex; align-items: center; gap: 6px; margin: 5px 0 0 18px; font-size: 12px; flex-wrap: wrap; }
  .known code { font-family: var(--mono); font-size: 11.5px; background: var(--bg); border: 1px solid var(--line-soft); border-radius: 4px; padding: 1px 6px; }
  .status { font-size: 12.5px; margin: 5px 0 0 18px; display: flex; gap: 6px; flex-wrap: wrap; }
  .status.ok { color: var(--ok); }
  .status.error { color: var(--danger); }
  .status.needs-permission { color: var(--warn); }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--line); flex: none; }
  .dot.ok { background: var(--ok); }
  .dot.loading { background: var(--gold); animation: pulse 1s infinite; }
  .dot.error { background: var(--danger); }
  .dot.needs-permission { background: var(--warn); }
  @keyframes pulse { 50% { opacity: 0.3; } }
</style>
