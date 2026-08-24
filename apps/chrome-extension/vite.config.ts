import { crx } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';

import manifest from './manifest.json' with { type: 'json' };

export default defineConfig(({ command }) => ({
  plugins: [crx({ manifest })],
  build: {
    assetsInlineLimit: 0,
    emptyOutDir: true,
    outDir: command === 'serve' ? 'dist-dev' : 'dist',
    sourcemap: false,
  },
}));
