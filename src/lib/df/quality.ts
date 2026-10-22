/** Shop quality bands with the flavour text the game shows on entering (per UESP). */
export function qualityBand(q: number): { band: string; text: string } {
  if (q <= 3) return { band: 'Poor', text: 'Rusty relics lie scattered about' };
  if (q <= 7) return { band: 'Modest', text: 'Sturdy shelves, cobbled together' };
  if (q <= 13) return { band: 'Average', text: 'Better appointed than many' };
  if (q <= 17) return { band: 'Good', text: 'Incense and soft music' };
  return { band: 'Finest', text: 'The finest goods in the land' };
}
