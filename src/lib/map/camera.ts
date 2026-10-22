/** 2D camera: (x, y) is the world point at the viewport centre, z is screen pixels per world unit. */
export class Camera {
  x = 0;
  y = 0;
  z = 1;
  w = 1; // viewport CSS size
  h = 1;
  minZ = 0.5;
  maxZ = 256;
  private anim: number | null = null;
  onChange: () => void = () => {};

  toScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x) * this.z + this.w / 2, (wy - this.y) * this.z + this.h / 2];
  }
  toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.w / 2) / this.z + this.x, (sy - this.h / 2) / this.z + this.y];
  }
  bounds() {
    const [x0, y0] = this.toWorld(0, 0);
    const [x1, y1] = this.toWorld(this.w, this.h);
    return { x0, y0, x1, y1 };
  }
  clampZ(z: number) { return Math.min(this.maxZ, Math.max(this.minZ, z)); }

  zoomAt(sx: number, sy: number, factor: number) {
    this.stop();
    const [wx, wy] = this.toWorld(sx, sy);
    this.z = this.clampZ(this.z * factor);
    const [nx, ny] = this.toWorld(sx, sy);
    this.x += wx - nx;
    this.y += wy - ny;
    this.onChange();
  }
  panBy(dx: number, dy: number) {
    this.stop();
    this.x -= dx / this.z;
    this.y -= dy / this.z;
    this.onChange();
  }
  fit(x0: number, y0: number, x1: number, y1: number, pad = 0.9) {
    const z = this.clampZ(Math.min((this.w * pad) / Math.max(1e-6, x1 - x0), (this.h * pad) / Math.max(1e-6, y1 - y0)));
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z };
  }
  set(t: { x: number; y: number; z: number }) {
    this.stop();
    this.x = t.x; this.y = t.y; this.z = this.clampZ(t.z);
    this.onChange();
  }

  /** Smooth flight that zooms out and back in for long hops (van Wijk-lite). */
  flyTo(t: { x: number; y: number; z: number }, ms = 650) {
    this.stop();
    const from = { x: this.x, y: this.y, z: this.z };
    const to = { ...t, z: this.clampZ(t.z) };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const span = Math.max(this.w / from.z, this.w / to.z);
    const hop = dist > span * 0.8 ? Math.min(from.z, to.z, this.w / (dist * 1.6)) : Math.min(from.z, to.z);
    const start = performance.now();
    const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
    const step = (now: number) => {
      const u = Math.min(1, (now - start) / ms);
      const e = ease(u);
      this.x = from.x + (to.x - from.x) * e;
      this.y = from.y + (to.y - from.y) * e;
      // Interpolate zoom in log space, dipping to `hop` midway.
      const lz0 = Math.log(from.z), lz1 = Math.log(to.z), lh = Math.log(hop);
      const lin = lz0 + (lz1 - lz0) * e;
      const dip = Math.min(0, lh - Math.min(lz0, lz1)) * Math.sin(Math.PI * e);
      this.z = Math.exp(lin + dip);
      this.onChange();
      this.anim = u < 1 ? requestAnimationFrame(step) : null;
    };
    this.anim = requestAnimationFrame(step);
  }
  stop() {
    if (this.anim !== null) cancelAnimationFrame(this.anim);
    this.anim = null;
  }
}

/** Shared pointer/wheel handling for a canvas driven by a Camera. */
export function attachPanZoom(
  el: HTMLElement,
  cam: Camera,
  handlers: {
    onHover?: (sx: number, sy: number) => void;
    onClick?: (sx: number, sy: number, ev: PointerEvent) => void;
    onDouble?: (sx: number, sy: number) => void;
    onContext?: (sx: number, sy: number, ev: MouseEvent) => void;
    onLeave?: () => void;
  },
) {
  let drag: { x: number; y: number; moved: boolean; id: number } | null = null;
  const rel = (ev: MouseEvent) => {
    const r = el.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top] as const;
  };
  const down = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    el.setPointerCapture(ev.pointerId);
    drag = { x: ev.clientX, y: ev.clientY, moved: false, id: ev.pointerId };
  };
  const move = (ev: PointerEvent) => {
    const [sx, sy] = rel(ev);
    if (drag) {
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (drag.moved || Math.hypot(dx, dy) > 4) {
        drag.moved = true;
        cam.panBy(dx, dy);
        drag.x = ev.clientX;
        drag.y = ev.clientY;
        el.style.cursor = 'grabbing';
      }
      return;
    }
    handlers.onHover?.(sx, sy);
  };
  const up = (ev: PointerEvent) => {
    if (!drag) return;
    const wasDrag = drag.moved;
    drag = null;
    el.style.cursor = '';
    if (!wasDrag) { const [sx, sy] = rel(ev); handlers.onClick?.(sx, sy, ev); }
  };
  const wheel = (ev: WheelEvent) => {
    ev.preventDefault();
    const [sx, sy] = rel(ev);
    const delta = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY;
    cam.zoomAt(sx, sy, Math.pow(1.0018, -delta));
  };
  const dbl = (ev: MouseEvent) => { const [sx, sy] = rel(ev); handlers.onDouble?.(sx, sy); };
  const ctx = (ev: MouseEvent) => { ev.preventDefault(); const [sx, sy] = rel(ev); handlers.onContext?.(sx, sy, ev); };
  const leave = () => handlers.onLeave?.();
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('dblclick', dbl);
  el.addEventListener('contextmenu', ctx);
  el.addEventListener('pointerleave', leave);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('wheel', wheel);
    el.removeEventListener('dblclick', dbl);
    el.removeEventListener('contextmenu', ctx);
    el.removeEventListener('pointerleave', leave);
  };
}
