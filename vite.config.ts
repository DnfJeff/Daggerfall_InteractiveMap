import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readdirSync, statSync, createReadStream, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Development-only: when DFC_DEV_ARENA2 / DFC_DEV_SAVES / DFC_DEV_DFO_SAVES / DFC_DEV_DFU point at folders, serve them under
 * /__dev/<root>/ so the app can be exercised without the browser folder picker.
 * Never part of a production build.
 */
function devGameData(): Plugin {
  const roots: Record<string, string | undefined> = {
    arena2: process.env.DFC_DEV_ARENA2,
    saves: process.env.DFC_DEV_SAVES,
    dfu: process.env.DFC_DEV_DFU,
    dfosaves: process.env.DFC_DEV_DFO_SAVES,
  };
  return {
    name: 'dfc-dev-game-data',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev', (req, res, next) => {
        const [, root, ...rest] = decodeURIComponent((req.url ?? '').split('?')[0]).split('/');
        const base = roots[root];
        if (!base || !existsSync(base)) { res.statusCode = 404; return res.end(); }
        const target = resolve(base, ...rest);
        if (!target.startsWith(resolve(base))) { res.statusCode = 403; return res.end(); }
        if (!existsSync(target)) return next();
        const st = statSync(target);
        if (st.isDirectory()) {
          res.setHeader('content-type', 'application/json');
          return res.end(JSON.stringify(readdirSync(target).map((n) => ({ name: n, dir: statSync(join(target, n)).isDirectory() }))));
        }
        res.setHeader('content-length', String(st.size));
        createReadStream(target).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), devGameData()],
  // Relative base so the built app works from any folder or static host.
  base: './',
  server: { port: 5178, strictPort: true },
});
