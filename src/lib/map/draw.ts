import type { MarkerCategory } from '../db/model';

export const CATEGORY_COLORS: Record<MarkerCategory, string> = {
  landmark: '#c9b27c',
  town: '#e3b490',
  dungeon: '#d7773a',
  quest: '#f2d55b',
  danger: '#e2685a',
  shop: '#e07b3c',
  custom: '#9aa5ce',
};

export const CATEGORY_GLYPH: Record<MarkerCategory, string> = {
  landmark: '◆', town: '⌂', dungeon: '▼', quest: '!', danger: '✖', shop: '$', custom: '•',
};

/** Pin with category glyph; the ring colour says which plane it belongs to. */
export function drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, cat: MarkerCategory, ring: string, scale = 1, active = false) {
  const r = 8 * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-r * 0.62, -r * 1.25);
  ctx.arc(0, -r * 1.75, r, Math.PI * 0.78, Math.PI * 0.22);
  ctx.closePath();
  ctx.fillStyle = '#16171c';
  ctx.fill();
  ctx.lineWidth = active ? 3 : 2;
  ctx.strokeStyle = ring;
  ctx.stroke();
  ctx.fillStyle = CATEGORY_COLORS[cat];
  ctx.font = `bold ${Math.round(10 * scale)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(CATEGORY_GLYPH[cat], 0, -r * 1.72);
  ctx.restore();
}
