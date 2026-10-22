<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../../lib/state/app.svelte';
  import { REGION_NAMES } from '../../lib/df/constants';
  import { worldLayers } from '../../lib/map/layers';

  let { onpick }: { onpick: (region: number) => void } = $props();

  const TOP = 12, H = 160, W = 320; // map area inside TRAV0I00.IMG
  let wrap: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let hover = $state<{ region: number; x: number; y: number } | null>(null);
  let rect = { x: 0, y: 0, s: 1 };
  const masks = new Map<number, HTMLCanvasElement>();

  const g = $derived(app.game!);
  const layers = $derived(worldLayers(g));
  const counts = $derived.by(() => {
    const c = new Map<number, number>();
    for (const l of g.maps.locations) if (app.locationVisible(l)) c.set(l.region, (c.get(l.region) ?? 0) + 1);
    return c;
  });

  function mask(region: number) {
    let m = masks.get(region);
    if (m) return m;
    m = document.createElement('canvas');
    m.width = W; m.height = H;
    const ctx = m.getContext('2d')!;
    const id = ctx.createImageData(W, H);
    const p = g.regionPicker!.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (p[(y + TOP) * W + x] === region + 128) {
        const o = (y * W + x) * 4;
        id.data[o] = 242; id.data[o + 1] = 213; id.data[o + 2] = 91; id.data[o + 3] = 95;
      }
    }
    ctx.putImageData(id, 0, 0);
    masks.set(region, m);
    return m;
  }

  function draw() {
    if (!canvas || !wrap) return;
    const dpr = devicePixelRatio || 1;
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    canvas.width = cw * dpr; canvas.height = ch * dpr;
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0c0d10';
    ctx.fillRect(0, 0, cw, ch);
    const s = Math.min(cw / W, ch / H);
    rect = { x: (cw - W * s) / 2, y: (ch - H * s) / 2, s };
    if (layers.overview) ctx.drawImage(layers.overview, 0, TOP, W, H, rect.x, rect.y, W * s, H * s);
    else ctx.drawImage(layers.base, rect.x, rect.y, W * s, H * s);
    if (hover && g.regionPicker) ctx.drawImage(mask(hover.region), rect.x, rect.y, W * s, H * s);
  }

  function regionAt(ev: MouseEvent) {
    const b = canvas.getBoundingClientRect();
    const x = Math.floor((ev.clientX - b.left - rect.x) / rect.s);
    const y = Math.floor((ev.clientY - b.top - rect.y) / rect.s);
    if (!g.regionPicker || x < 0 || y < 0 || x >= W || y >= H) return null;
    const v = g.regionPicker.data[(y + TOP) * W + x];
    return v >= 128 && v < 128 + 62 ? { region: v - 128, x: ev.clientX - b.left, y: ev.clientY - b.top } : null;
  }

  function move(ev: MouseEvent) {
    const h = regionAt(ev);
    if (h?.region !== hover?.region) { hover = h; draw(); }
    else if (h) hover = h;
  }

  function click(ev: MouseEvent) {
    const h = regionAt(ev);
    if (!h) return;
    app.selection = { t: 'region', region: h.region };
    onpick(h.region);
  }

  onMount(() => {
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    draw();
    return () => ro.disconnect();
  });
</script>

<div class="ov" bind:this={wrap}>
  <canvas bind:this={canvas} onmousemove={move} onmouseleave={() => { hover = null; draw(); }} onclick={click} class:pointer={!!hover}></canvas>
  {#if hover}
    <div class="tip" style:left="{hover.x + 14}px" style:top="{hover.y + 10}px">
      <strong>{REGION_NAMES[hover.region]}</strong>
      <span>{(counts.get(hover.region) ?? 0).toLocaleString()} places · click to open</span>
    </div>
  {/if}
  <div class="hint">Pick a region, or search above. Scroll on the region map to zoom; it pans freely across borders.</div>
</div>

<style>
  .ov { position: absolute; inset: 0; }
  canvas { display: block; image-rendering: pixelated; }
  .pointer { cursor: pointer; }
  .tip {
    position: absolute; pointer-events: none; background: rgba(14, 15, 18, 0.92); border: 1px solid var(--line);
    border-radius: 6px; padding: 6px 10px; display: flex; flex-direction: column; font-size: 12.5px;
  }
  .tip strong { color: var(--gold); }
  .tip span { color: var(--muted); }
  .hint { position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); color: var(--muted); font-size: 12.5px; background: rgba(14,15,18,0.75); padding: 4px 12px; border-radius: 999px; white-space: nowrap; }
</style>
