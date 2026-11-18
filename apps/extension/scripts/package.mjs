/** Zips dist/chrome and dist/edge into release/ for store submission. */
import { zipSync } from 'fflate';
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const outDir = resolve(root, '../../release');
await mkdir(outDir, { recursive: true });

async function collect(dir, base = dir, files = {}) {
  for (const name of await readdir(dir)) {
    const full = resolve(dir, name);
    if ((await stat(full)).isDirectory()) await collect(full, base, files);
    else files[relative(base, full).split(sep).join('/')] = new Uint8Array(await readFile(full));
  }
  return files;
}

for (const browser of ['chrome', 'edge']) {
  const dir = resolve(root, 'dist', browser);
  const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'));
  if (manifest.host_permissions?.some((h) => h.includes('localhost'))) {
    throw new Error(`[package] ${browser} build contains e2e host permissions — run a production build first`);
  }
  const files = await collect(dir);
  const zip = zipSync(files, { level: 9, mtime: new Date('2026-01-01T00:00:00Z') });
  const file = resolve(outDir, `ntm-sentinel-${browser}-${pkg.version}.zip`);
  await writeFile(file, zip);
  console.log(`[package] ${relative(resolve(root, '../..'), file)} (${(zip.length / 1024).toFixed(1)} KB, ${Object.keys(files).length} files)`);
}
