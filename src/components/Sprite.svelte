<script lang="ts">
  import { app } from '../lib/state/app.svelte';
  import { toRgba } from '../lib/df/images';

  let { archive, size = 56 }: { archive?: number; size?: number } = $props();
  let canvas: HTMLCanvasElement | undefined = $state();
  let missing = $state(false);

  $effect(() => {
    const g = app.game;
    const c = canvas;
    if (!g || !c || archive === undefined || !g.artPal) { missing = true; return; }
    missing = false;
    g.sprite(archive).then((img) => {
      if (!img || !g.artPal) { missing = true; return; }
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d')!.putImageData(toRgba(img, g.artPal, [0]), 0, 0);
    });
  });
</script>

<div class="sprite" style:width="{size}px" style:height="{size}px">
  <canvas bind:this={canvas} class:hide={missing}></canvas>
  {#if missing}<span class="faint">?</span>{/if}
</div>

<style>
  .sprite { display: grid; place-items: center; background: radial-gradient(circle, #2c2d37, #1b1c22); border-radius: 6px; flex: none; overflow: hidden; }
  canvas { max-width: 100%; max-height: 100%; image-rendering: pixelated; }
  .hide { display: none; }
</style>
