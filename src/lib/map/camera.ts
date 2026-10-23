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

/**
 * Shared pointer/wheel handling for a canvas driven by a Camera.
 * Mouse: drag to pan, wheel to zoom, click, double-click, right-click, hover.
 * Touch: one finger pans, two fingers pinch-zoom (and pan), tap, double-tap, long-press for the
 * context menu. Hover is never synthesised from touch, so tooltips don't get stuck on phones.
 */
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
  const rel = (ev: { clientX: number; clientY: number }) => {
    const r = el.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top] as const;
  };

  // ---- touch state ----
  const touches = new Map<number, { x: number; y: number }>();
  let single: { x: number; y: number; sx: number; sy: number; moved: boolean; consumed: boolean } | null = null;
  let pinch: { dist: number; mx: number; my: number } | null = null;
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let lastTap = { t: 0, x: 0, y: 0 };
  let lastTouchAt = 0;
  const clearPress = () => { if (pressTimer) clearTimeout(pressTimer); pressTimer = null; };
  const pinchState = () => {
    const [a, b] = [...touches.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  const touchDown = (ev: PointerEvent) => {
    el.setPointerCapture(ev.pointerId);
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    lastTouchAt = Date.now();
    if (touches.size === 1) {
      single = { x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY, moved: false, consumed: false };
      clearPress();
      pressTimer = setTimeout(() => {
        if (single && !single.moved && touches.size === 1) {
          single.consumed = true;
          const [sx, sy] = rel({ clientX: single.x, clientY: single.y });
          handlers.onContext?.(sx, sy, ev);
        }
      }, 520);
    } else if (touches.size === 2) {
      clearPress();
      if (single) single.consumed = true; // a pinch is never a tap
      pinch = pinchState();
    }
  };
  const touchMove = (ev: PointerEvent) => {
    if (!touches.has(ev.pointerId)) return;
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (touches.size >= 2 && pinch) {
      const now = pinchState();
      const r = el.getBoundingClientRect();
      if (pinch.dist > 0) cam.zoomAt(now.mx - r.left, now.my - r.top, now.dist / pinch.dist);
      cam.panBy(now.mx - pinch.mx, now.my - pinch.my);
      pinch = now;
      return;
    }
    if (!single) return;
    const dx = ev.clientX - single.x, dy = ev.clientY - single.y;
    if (single.moved || Math.hypot(ev.clientX - single.sx, ev.clientY - single.sy) > 8) {
      single.moved = true;
      clearPress();
      cam.panBy(dx, dy);
      single.x = ev.clientX;
      single.y = ev.clientY;
    }
  };
  const touchUp = (ev: PointerEvent) => {
    if (!touches.has(ev.pointerId)) return;
    touches.delete(ev.pointerId);
    lastTouchAt = Date.now();
    clearPress();
    if (touches.size === 1) {
      // Pinch ended with one finger still down: keep panning from where it is, without a jump.
      const [rest] = [...touches.values()];
      pinch = null;
      single = { x: rest.x, y: rest.y, sx: rest.x, sy: rest.y, moved: true, consumed: true };
      return;
    }
    if (touches.size > 0) return;
    pinch = null;
    const s = single;
    single = null;
    if (!s || s.moved || s.consumed || ev.type === 'pointercancel') return;
    const [sx, sy] = rel(ev);
    const now = Date.now();
    if (now - lastTap.t < 320 && Math.hypot(ev.clientX - lastTap.x, ev.clientY - lastTap.y) < 30) {
      lastTap = { t: 0, x: 0, y: 0 };
      handlers.onDouble?.(sx, sy);
    } else {
      lastTap = { t: now, x: ev.clientX, y: ev.clientY };
      handlers.onClick?.(sx, sy, ev);
    }
  };

  // ---- mouse and pen ----
  const down = (ev: PointerEvent) => {
    if (ev.pointerType === 'touch') return touchDown(ev);
    if (ev.button !== 0) return;
    el.setPointerCapture(ev.pointerId);
    drag = { x: ev.clientX, y: ev.clientY, moved: false, id: ev.pointerId };
  };
  const move = (ev: PointerEvent) => {
    if (ev.pointerType === 'touch') return touchMove(ev);
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
    if (ev.pointerType === 'touch') return touchUp(ev);
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
  // Browsers also synthesise dblclick / contextmenu from touch; touch is handled above.
  const fromTouch = () => Date.now() - lastTouchAt < 900;
  const dbl = (ev: MouseEvent) => { if (fromTouch()) return; const [sx, sy] = rel(ev); handlers.onDouble?.(sx, sy); };
  const ctx = (ev: MouseEvent) => { ev.preventDefault(); if (fromTouch()) return; const [sx, sy] = rel(ev); handlers.onContext?.(sx, sy, ev); };
  const leave = (ev: PointerEvent) => { if (ev.pointerType !== 'touch') handlers.onLeave?.(); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('dblclick', dbl);
  el.addEventListener('contextmenu', ctx);
  el.addEventListener('pointerleave', leave);
  return () => {
    clearPress();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('wheel', wheel);
    el.removeEventListener('dblclick', dbl);
    el.removeEventListener('contextmenu', ctx);
    el.removeEventListener('pointerleave', leave);
  };
}
