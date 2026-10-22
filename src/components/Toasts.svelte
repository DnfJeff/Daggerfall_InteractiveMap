<script lang="ts">
  import { app } from '../lib/state/app.svelte';
</script>

<div class="toasts" aria-live="polite">
  {#each app.toasts as t (t.id)}
    <div class="toast {t.tone}">{t.text}</div>
  {/each}
</div>

<style>
  .toasts { position: fixed; bottom: 44px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 6px; z-index: 80; pointer-events: none; }
  .toast {
    background: var(--panel-2); border: 1px solid var(--line); border-left: 3px solid var(--muted);
    padding: 8px 14px; border-radius: 6px; box-shadow: var(--shadow); max-width: 520px; font-size: 13px;
    animation: rise 0.18s ease-out;
  }
  .ok { border-left-color: var(--ok); }
  .warn { border-left-color: var(--warn); }
  .error { border-left-color: var(--danger); }
  @keyframes rise { from { transform: translateY(6px); opacity: 0; } }
</style>
