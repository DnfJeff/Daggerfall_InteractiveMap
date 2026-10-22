import type { DockTab } from '../../lib/state/settings';

export const DOCK_TABS: { key: DockTab; label: string; icon: string }[] = [
  { key: 'journal', label: 'Journal', icon: 'book' },
  { key: 'bestiary', label: 'Bestiary', icon: 'skull' },
  { key: 'character', label: 'Character', icon: 'person' },
  { key: 'guides', label: 'Guides', icon: 'scroll' },
  { key: 'data', label: 'Data & backups', icon: 'archive' },
  { key: 'prefs', label: 'Preferences', icon: 'gear' },
];
