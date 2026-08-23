import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const buildDirectory = join(import.meta.dirname, '..', 'dist');
const manifest = JSON.parse(
  await readFile(join(buildDirectory, 'manifest.json'), 'utf8'),
);
const serviceWorkerPath = join(
  buildDirectory,
  manifest.background?.service_worker ?? '',
);
const sidePanelPath = join(
  buildDirectory,
  manifest.side_panel?.default_path ?? '',
);

await Promise.all([access(serviceWorkerPath), access(sidePanelPath)]);

const serviceWorkerLoader = await readFile(serviceWorkerPath, 'utf8');
if (
  /from\s+['"]https?:\/\/|import\s+['"]https?:\/\//u.test(serviceWorkerLoader)
) {
  throw new Error('A build contém importação remota no service worker.');
}

for (const match of serviceWorkerLoader.matchAll(
  /import\s+['"](\.\.?\/[^'"]+)['"]/gu,
)) {
  const importedPath = resolve(dirname(serviceWorkerPath), match[1]);
  await access(importedPath);
}
