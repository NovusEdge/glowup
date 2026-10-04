import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, renameSync} from 'node:fs';
import {renderVideo} from '@revideo/renderer';

const chromium = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(existsSync);
const outputs = [
  {outFile: 'launch.mp4', size: {x: 1920, y: 1080}, project: './src/project.ts'},
  {outFile: 'launch-square.mp4', size: {x: 1080, y: 1080}, project: './src/project.ts'},
  // Only rendered by name: `pnpm render style-stills`.
  {outFile: 'style-stills.mp4', size: {x: 1920, y: 1080}, project: './src/stills.ts', byName: true},
] as const;

const only = process.argv[2];
mkdirSync('out', {recursive: true});

// One at a time: each render is a headless chromium plus an ffmpeg encode.
for (const o of outputs) {
  if (only ? !o.outFile.startsWith(only) : 'byName' in o) continue;
  const render = () =>
    renderVideo({
      projectFile: o.project,
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
  // The encoder leaves sample_aspect_ratio unset; say 1:1 so no player guesses. A remux, no re-encode.
  const tmp = `${file}.sar.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-c', 'copy', '-bsf:v', 'h264_metadata=sample_aspect_ratio=1/1', tmp]);
  renameSync(tmp, file);
  console.log('wrote', file);
}
