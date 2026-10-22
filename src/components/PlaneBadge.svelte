<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import { ATLAS, type Plane } from '../lib/db/model';
  let { plane }: { plane: Plane } = $props();
  const strong = $derived(app.settings.display.planeStyle === 'strong');
</script>

<span
  class="plane-badge"
  class:strong
  style:color={app.planeColor(plane)}
  title={plane === ATLAS ? 'Atlas: true in every playthrough' : 'Belongs to this playthrough only'}
>
  {plane === ATLAS ? '◆ Atlas' : `● ${app.planeLabel(plane)}`}
</span>

<style>
  .strong { background: color-mix(in srgb, currentColor 18%, transparent); }
</style>
