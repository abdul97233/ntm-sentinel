/**
 * Extension build orchestrator.
 *  1. Vite multi-page build (popup, side panel, DevTools, service worker) -> dist/chrome
 *  2. IIFE builds for each content script (classic scripts, no imports)
 *  3. Icons copied, manifest generated per browser
 *  4. dist/edge produced from the same bundle with the Edge manifest
 *
 * Flags: --e2e (adds localhost host access for Playwright), --dev (allows local backend)
 * Env:   NTM_API_URL (origin of the optional backend; empty = cloud features unconfigured)
 */
import { build } from 'vite';
import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const e2e = args.has('--e2e');
const dev = args.has('--dev') || e2e;
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

let apiUrl = process.env.NTM_API_URL ?? '';
let apiOrigin = '';
if (apiUrl) {
  const u = new URL(apiUrl);
  if (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) {
    throw new Error('NTM_API_URL must be https (or localhost for development)');
  }
  apiOrigin = u.origin;
  apiUrl = u.origin;
} else if (dev) {
  apiUrl = 'http://127.0.0.1:8787';
}

const define = {
  __NTM_API_URL__: JSON.stringify(apiUrl),
  __NTM_VERSION__: JSON.stringify(pkg.version),
  __NTM_E2E__: JSON.stringify(e2e),
};

const chromeDir = resolve(root, 'dist/chrome');
const edgeDir = resolve(root, 'dist/edge');

console.log(`[build] pages + service worker (api: ${apiUrl || 'not configured'})`);
await build({ configFile: resolve(root, 'vite.config.ts'), define, logLevel: 'warn' });

const contentEntries = [
  { entry: 'src/content/scanner.ts', out: 'content-scanner.js' },
  { entry: 'src/content/fingerprint-monitor.ts', out: 'fingerprint-monitor.js' },
];
for (const { entry, out } of contentEntries) {
  console.log(`[build] content script ${out}`);
  await build({
    configFile: false,
    define,
    logLevel: 'warn',
    build: {
      outDir: chromeDir,
      emptyOutDir: false,
      target: 'chrome116',
      minify: true,
      lib: { entry: resolve(root, entry), formats: ['iife'], name: 'NTMContent', fileName: () => out },
      rollupOptions: { output: { extend: true } },
    },
  });
}

await cp(resolve(root, 'public'), chromeDir, { recursive: true });

// Manifest: generated from TypeScript source via a tiny Vite SSR load.
const { createServer } = await import('vite');
const server = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true } });
const { createManifest } = await server.ssrLoadModule(resolve(root, 'src/manifest.ts'));
await server.close();

for (const [browser, dir] of [
  ['chrome', chromeDir],
  ['edge', edgeDir],
]) {
  if (browser === 'edge') {
    await rm(edgeDir, { recursive: true, force: true });
    await mkdir(edgeDir, { recursive: true });
    await cp(chromeDir, edgeDir, { recursive: true });
  }
  const manifest = createManifest({ browser, version: pkg.version, apiOrigin: apiOrigin || (dev ? '' : ''), e2e, dev });
  await writeFile(resolve(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

for (const f of ['manifest.json', 'background.js', 'content-scanner.js', 'src/popup/index.html', 'src/sidepanel/index.html']) {
  if (!existsSync(resolve(chromeDir, f))) throw new Error(`[build] missing output: ${f}`);
}
console.log(`[build] done -> dist/chrome, dist/edge${e2e ? ' (e2e)' : ''}`);
