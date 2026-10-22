// Build flavors. The same app ships as:
//  - web:      the hosted interactive map (GitHub Pages). Built-in map data, no game files, no folder
//              access; playthroughs live in the browser and in .dfc files.
//  - local:    the desktop/portable build. Built-in data by default, or your own ARENA2 and live saves.
export const WEB = import.meta.env.VITE_FLAVOR === 'web';

/** Public repository (CI injects VITE_REPO_URL; forks get their own links). */
export const REPO_URL: string = import.meta.env.VITE_REPO_URL || 'https://github.com/DnfJeff/Daggerfall_InteractiveMap';
export const RELEASES_URL = REPO_URL ? `${REPO_URL}/releases/latest` : '';

/** Where built-in (baked) map data is served from, relative to the page. */
export const BUILTIN_DATA = './data/';

export const PRODUCT = 'Daggerfall Interactive Map';
