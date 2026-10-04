import {existsSync, mkdirSync} from 'node:fs';
import {renderVideo} from '@revideo/renderer';

const chromium = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(existsSync);
const outputs = [
  {outFile: 'launch.mp4', size: {x: 1920, y: 1080}},
  {outFile: 'launch-square.mp4', size: {x: 1080, y: 1080}},
] as const;

const only = process.argv[2];
mkdirSync('out', {recursive: true});

// One at a time: each render is a headless chromium plus an ffmpeg encode.
for (const o of outputs) {
  if (only && !o.outFile.startsWith(only)) continue;
  const render = () =>
    renderVideo({
      projectFile: './src/project.ts',
      settings: {
        outFile: o.outFile,
        outDir: './out',
        workers: 1,
        logProgress: true,
        projectSettings: {size: o.size, exporter: {name: '@revideo/core/wasm'}},
        puppeteer: {
          executablePath: process.env.CHROMIUM ?? chromium,
          args: ['--no-sandbox', '--disable-gpu'],
        },
        viteConfig: {server: {fs: {allow: ['..', '../..']}}},
      },
    });
  // On a fresh node_modules vite re-optimizes its dependencies during the first render,
  // reloads the page, and the render fails once; the second attempt is clean.
  const file = await render().catch(() => render());
  console.log('wrote', file);
}
