<script lang="ts">
  import { RUNTIME_SAVE_PATH } from '../lib/df/save';
  import SourceRow from './SourceRow.svelte';
  import { WEB, RELEASES_URL } from '../lib/flavor';

  /** The full set of folders, shared by the welcome screen and Preferences. */
  let { compact = false }: { compact?: boolean } = $props();
</script>

{#if WEB}
  <p class="web">
    This map runs entirely in your browser with built-in map data: no game files, no install.
    To bring in your character, drop a Daggerfall save folder anywhere on the page.
    {#if RELEASES_URL}For a live connection to your own install and saves, use the <a href={RELEASES_URL} target="_blank" rel="noopener">desktop app</a>.{/if}
  </p>
{:else}
<SourceRow kind="arena2" label="Game data (ARENA2)"
  hint="The folder with MAPS.BSA and BLOCKS.BSA, wherever your Daggerfall data lives. Choosing its parent works too if ARENA2 sits directly inside." />
{#if !compact}
  <SourceRow kind="dfuSaves" label="Daggerfall Unity saves" optional knownPath={RUNTIME_SAVE_PATH.dfu}
    hint="For Profiles that follow a Daggerfall Unity character: discoveries, notebook, character sheet." />
  <SourceRow kind="dfoSaves" label="Daggerfall Online saves" optional knownPath={RUNTIME_SAVE_PATH.dfo}
    hint="For Profiles that follow a Daggerfall Online character. Kept separate from Unity saves; imported Unity saves inside are recognised." />
  <SourceRow kind="dfu" label="Daggerfall Unity install" optional
    hint="The folder with DaggerfallUnity.exe. Lists installed mods and reads the Basic Roads mod for the roads layer." />
{/if}
{/if}

<style>
  .web { font-size: 13px; color: var(--muted); line-height: 1.5; }
  .web a { color: var(--gold); }
</style>
