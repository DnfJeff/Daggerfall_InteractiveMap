<script lang="ts">
  /** Drag handle between docked areas. `axis` x resizes widths, y resizes heights. */
  let { axis, ondrag, onend, ondouble, label = 'Resize' }: {
    axis: 'x' | 'y';
    ondrag: (delta: number) => void;
    onend?: () => void;
    ondouble?: () => void;
    label?: string;
  } = $props();

  let last = 0;
  let dragging = $state(false);

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    last = axis === 'x' ? e.clientX : e.clientY;
    dragging = true;
    e.preventDefault();
  }
  function move(e: PointerEvent) {
    if (!dragging) return;
    const now = axis === 'x' ? e.clientX : e.clientY;
    if (now !== last) { ondrag(now - last); last = now; }
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    onend?.();
  }
  function key(e: KeyboardEvent) {
    const step = e.shiftKey ? 40 : 12;
    if ((axis === 'x' && e.key === 'ArrowLeft') || (axis === 'y' && e.key === 'ArrowUp')) ondrag(-step);
    else if ((axis === 'x' && e.key === 'ArrowRight') || (axis === 'y' && e.key === 'ArrowDown')) ondrag(step);
    else return;
    e.preventDefault();
    onend?.();
  }
</script>

<!-- A focusable separator is an interactive ARIA widget (arrow keys resize). -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="split {axis}"
  class:dragging
  role="separator"
  aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
  aria-label={label}
  tabindex="0"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  ondblclick={ondouble}
  onkeydown={key}
></div>

<style>
  .split { position: relative; flex: none; z-index: 8; background: var(--line-soft); touch-action: none; }
  .split.x { width: 1px; cursor: col-resize; }
  .split.y { height: 1px; cursor: row-resize; }
  /* Generous invisible hit area. */
  .split::after { content: ''; position: absolute; }
  .split.x::after { inset: 0 -4px; }
  .split.y::after { inset: -4px 0; }
  .split:hover, .split.dragging, .split:focus-visible { background: var(--gold-dim); outline: none; }
</style>
